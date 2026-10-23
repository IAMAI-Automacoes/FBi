/**
 * Comissão do vendedor pelo split do Asaas (fase 2, decisão de 20/10/2026).
 *
 * Em cada evento de uma cobrança de quem foi indicado por um vendedor, o
 * webhook chama `garantirComissao`: calcula a comissão daquela cobrança pela
 * regra do software (`afiliado_config`) sobre a mensalidade LÍQUIDA — o que o
 * Asaas entregou, menos os nossos custos (`comissao_custos`), decisão do Caio
 * em 21/10/2026 —, põe o split na cobrança do Asaas
 * (`PUT /payments/{id}`) e grava/atualiza a linha em `cobranca_comissoes`.
 * O Asaas manda o dinheiro para a conta Asaas do vendedor quando a cobrança é
 * recebida, e desfaz sozinho em estorno.
 *
 * Erro do Asaas aqui NÃO derruba o evento: a cobrança e o acesso seguem, e a
 * comissão fica com status `erro` para o admin ver (pagar à mão, se preciso).
 * Muitos erros seguidos fariam o Asaas pausar a fila do webhook inteira.
 *
 * O Asaas aceita mudar o split com a cobrança em aberto e, no cartão
 * confirmado, até 1 dia útil antes do crédito (sem antecipação). Recebida sem
 * split = já era: fica `erro` para pagar à mão.
 */
import { ErroAsaas, type ClienteAsaas } from './cliente.ts'
import { espelharPagamento } from './espelho.ts'
import {
  baseDaComissaoPorMes,
  centavos,
  comissaoDoPagamento,
  corpoDoPut,
  pagamentoEstornado,
  reais,
  regraDoInfluenciador,
  statusDoSplit,
  type CustosDaComissao,
  type RegraDeComissao,
} from './regras.ts'

// deno-lint-ignore no-explicit-any
type Db = any

const REGRA_PADRAO: RegraDeComissao = { entradaPct: 100, recorrentePct: 15, recorrenteMeses: 12 }
const FINAIS = new Set(['repassado', 'pago_manual', 'estornado'])
const RECEBIDA = new Set(['RECEIVED', 'RECEIVED_IN_CASH'])

// deno-lint-ignore no-explicit-any
export async function garantirComissao(db: Db, cli: ClienteAsaas, a: any, pag: any): Promise<void> {
  if (!a?.afiliado_id || !pag?.id) return
  const chave = { conta_id: cli.contaId, asaas_payment_id: String(pag.id) }
  const { data: atual, error: errAtual } = await db.from('cobranca_comissoes').select('*').match(chave).maybeSingle()
  if (errAtual) throw new Error(`cobranca_comissoes: ${errAtual.message}`)

  const marcar = async (status: string) => {
    const { error } = await db.from('cobranca_comissoes').update({ status, atualizado_em: new Date().toISOString() }).match(chave)
    if (error) throw new Error(`cobranca_comissoes: ${error.message}`)
  }
  if (pag.deleted) {
    if (atual && !FINAIS.has(atual.status)) await marcar('cancelado')
    return
  }
  if (pagamentoEstornado(pag.status)) {
    if (atual && atual.status !== 'pago_manual' && atual.status !== 'estornado') await marcar('estornado')
    return
  }
  if (atual && FINAIS.has(atual.status)) return

  // Só vendedor e influenciador ganham comissão; a conta EasyFeed que indica ganha desconto.
  const { data: af, error: errAf } = await db
    .from('afiliados')
    .select('id, restaurante_id, asaas_wallet_id, eh_influenciador, comissao_valor, comissao_meses')
    .eq('id', a.afiliado_id)
    .maybeSingle()
  if (errAf) throw new Error(`afiliados: ${errAf.message}`)
  if (!af || af.restaurante_id != null) return

  await espelharParcelasAnteriores(db, cli, a, pag)

  const { data: linhasMeses, error: errMeses } = await db.rpc('cobranca_meses_do_pagamento', {
    p_conta_id: chave.conta_id,
    p_asaas_payment_id: chave.asaas_payment_id,
  })
  if (errMeses) throw new Error(`cobranca_meses_do_pagamento: ${errMeses.message}`)
  const meses = Array.isArray(linhasMeses) ? linhasMeses[0] : linhasMeses
  if (!meses?.de) return

  const area = a.area === 'rh' ? 'rh' : 'restaurante'
  const { data: cfg } = await db
    .from('afiliado_config')
    .select('comissao_entrada_pct, comissao_recorrente_pct, comissao_recorrente_meses')
    .eq('area', area)
    .maybeSingle()
  // O influenciador tem a % dele (Admin → Influenciadores); o vendedor, a do software.
  const regra: RegraDeComissao = af.eh_influenciador
    ? regraDoInfluenciador(Number(af.comissao_valor), Number(af.comissao_meses))
    : cfg
    ? {
        entradaPct: Number(cfg.comissao_entrada_pct) || 0,
        recorrentePct: Number(cfg.comissao_recorrente_pct) || 0,
        recorrenteMeses: Number(cfg.comissao_recorrente_meses) || 0,
      }
    : REGRA_PADRAO

  // Os nossos custos (Admin → Vendedores) saem antes: a comissão é sobre o que sobra.
  const { data: listaCustos, error: errCustos } = await db
    .from('comissao_custos')
    .select('tipo, valor')
    .eq('area', area)
    .eq('ativo', true)
  if (errCustos) throw new Error(`comissao_custos: ${errCustos.message}`)
  const custos: CustosDaComissao = { fixoCentavosPorMes: 0, pct: 0 }
  for (const c of listaCustos ?? []) {
    if (c.tipo === 'porcentagem') custos.pct += Number(c.valor) || 0
    else custos.fixoCentavosPorMes += centavos(Number(c.valor) || 0)
  }

  const de = Number(meses.de)
  const ate = Number(meses.ate)
  const liquido = centavos(pag.netValue ?? pag.value ?? 0)
  const base = baseDaComissaoPorMes(liquido, ate - de + 1, custos)
  const valor = comissaoDoPagamento({ de, ate, liquidoCentavos: liquido, custos, regra })
  if (valor <= 0 && !atual) return // esta cobrança não tem comissão

  const wallet: string | null = af.asaas_wallet_id ?? null
  const splits: Array<{ walletId?: string; fixedValue?: number; status?: string }> = Array.isArray(pag.split) ? pag.split : []
  const item = wallet ? splits.find((s) => s.walletId === wallet) : undefined
  // O Asaas nem sempre devolve o split no GET: se já pusemos este mesmo valor, confia no registro.
  const jaPosto = !!atual && atual.status === 'agendado' && atual.wallet_id === wallet && atual.valor_centavos === valor && !Array.isArray(pag.split)

  let status: string
  let erro: string | null = null
  if (!wallet) {
    status = 'sem_carteira'
  } else if (item && centavos(item.fixedValue ?? 0) === valor) {
    status = statusDoSplit(item.status)
  } else if (jaPosto) {
    status = 'agendado'
  } else if (RECEBIDA.has(String(pag.status)) && item?.status !== 'BLOCKED_BY_VALUE_DIVERGENCE') {
    status = 'erro'
    erro = item
      ? `A cobrança foi recebida com split de R$ ${reais(centavos(item.fixedValue ?? 0)).toFixed(2)}, mas o certo é R$ ${reais(valor).toFixed(2)}. Acertar à mão.`
      : 'A cobrança foi recebida sem o split. Pagar a comissão à mão.'
  } else {
    // Em aberto, vencida, cartão confirmado ou split bloqueado por divergência
    // (o Asaas dá 2 dias úteis para acertar, mesmo recebida): põe ou troca o split.
    const split = valor > 0
      ? [{ walletId: wallet, fixedValue: reais(valor), externalReference: `comissao:${chave.asaas_payment_id}`, description: 'Comissão EasyFeed' }]
      : []
    try {
      await cli.put(`/payments/${pag.id}`, corpoDoPut(pag, { split }))
      status = valor > 0 ? 'agendado' : 'cancelado'
    } catch (e) {
      status = 'erro'
      erro = (e instanceof ErroAsaas ? e.message : (e as Error).message).slice(0, 500)
      console.error(`[comissao] split da cobrança ${pag.id}:`, erro)
    }
  }

  const { error } = await db.from('cobranca_comissoes').upsert(
    {
      ...chave,
      assinatura_id: a.id ?? null,
      restaurante_id: a.restaurante_id ?? null,
      afiliado_id: af.id,
      wallet_id: wallet,
      mes_de: de,
      mes_ate: ate,
      base_mes_centavos: base,
      valor_centavos: valor,
      status,
      erro,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'conta_id,asaas_payment_id' },
  )
  if (error) throw new Error(`cobranca_comissoes: ${error.message}`)
}

/**
 * Parcelado: as parcelas nascem juntas e os eventos chegam fora de ordem. O
 * mês de cada parcela vem das anteriores no banco (`cobranca_meses_do_pagamento`):
 * sem elas, a parcela 2 contaria como mês 1 e sairia sem comissão. Faltando
 * alguma, espelha todas pelo Asaas antes de calcular.
 */
// deno-lint-ignore no-explicit-any
async function espelharParcelasAnteriores(db: Db, cli: ClienteAsaas, a: any, pag: any): Promise<void> {
  const numero = Number(pag.installmentNumber) || 0
  if (!pag.installment || numero <= 1 || !a?.id) return
  const { count, error } = await db
    .from('cobranca_pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('assinatura_id', a.id)
    .lt('numero_parcela', numero)
  if (error) throw new Error(`cobranca_pagamentos: ${error.message}`)
  if ((count ?? 0) >= numero - 1) return
  const lista = await cli.get(`/payments?installment=${encodeURIComponent(String(pag.installment))}&limit=100`)
  for (const p of lista?.data ?? []) {
    if (Number(p.installmentNumber) < numero) await espelharPagamento(db, cli.contaId, a, p)
  }
}
