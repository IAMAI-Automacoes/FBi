/**
 * criar-cobranca — abre o pagamento de um plano no Asaas para o usuário logado.
 *
 * Cria (ou reaproveita) o cliente no Asaas e a assinatura recorrente ou o
 * parcelamento, com o NOSSO id em `externalReference`, e devolve a URL da
 * fatura do Asaas (`invoiceUrl`), onde a pessoa põe o cartão. O cartão nunca
 * passa por nós. Quem libera o acesso é o `asaas-webhook`, quando o pagamento
 * é confirmado.
 *
 * Corpo: { ciclo: 'mensal'|'semestral'|'anual', modalidade: 'recorrente'|'parcelado',
 *          cpf_cnpj: string, termos_versao: string }
 * Resposta: { url, pedido } ou erro com { error, ja_assinante?, regularizar_url? }.
 *
 * Travas (a regra é nunca cobrar duas vezes):
 *   - recorrente ativa → já assinante;
 *   - recorrente atrasada → devolve a fatura em aberto para regularizar (nunca
 *     assina de novo);
 *   - parcelado pago com mais de 30 dias pela frente → ainda não renova;
 *   - pedido igual aguardando há menos de 24 h → devolve a mesma fatura;
 *     pedido diferente aguardando → é removido no Asaas antes do novo.
 *
 * Preço sempre de `planos_precos` (área da conta), nunca do cliente. Desconto
 * guardado de cupom entra na 1ª cobrança (ver POLITICA_DESCONTOS).
 */
import { autenticarRestaurante, clienteAdmin } from '../_shared/auth.ts'
import { json, preflight } from '../_shared/cors.ts'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'
import { siteUrl } from '../_shared/config.ts'
import { asaas, contaDasVendasNovas, ErroAsaas, removerNoAsaas, type ClienteAsaas } from '../_shared/asaas/cliente.ts'
import { espelharPagamento } from '../_shared/asaas/espelho.ts'
import {
  CICLO_ASAAS,
  comDescontoDoCupom,
  documentoValido,
  ehCiclo,
  ehModalidade,
  hojeSaoPaulo,
  reais,
  type Ciclo,
  type Desconto,
  type Modalidade,
} from '../_shared/asaas/regras.ts'

// deno-lint-ignore no-explicit-any
type Db = any

const DIA_MS = 86_400_000
const ROTULO: Record<Ciclo, string> = { mensal: 'mensal', semestral: 'semestral', anual: 'anual' }
const ERRO_GENERICO = 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const db = clienteAdmin()
  try {
    const auth = await autenticarRestaurante(
      req,
      db,
      'id, auth_user_id, assinatura_status, area, nome_restaurante, email, excluida_em',
    )
    if (auth.ok === false) return json({ error: auth.erro }, auth.status)
    const rest = auth.restaurante
    if (rest.linha.excluida_em) return json({ error: 'Conta excluída.' }, 403)
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (await ehSessaoDemo(db, jwt)) return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)

    // ── Entrada ──
    const corpo = await req.json().catch(() => ({}))
    const ciclo = corpo.ciclo
    const modalidade = corpo.modalidade ?? 'recorrente'
    if (!ehCiclo(ciclo) || !ehModalidade(modalidade)) return json({ error: 'Plano inválido.' }, 400)
    if (modalidade === 'parcelado' && ciclo === 'mensal') return json({ error: 'O mensal não é parcelado.' }, 400)
    const documento = documentoValido(corpo.cpf_cnpj)
    if (!documento) return json({ error: 'CPF ou CNPJ inválido. Confira os números.' }, 400)
    const termos = String(corpo.termos_versao ?? '').trim().slice(0, 20)
    if (!termos) return json({ error: 'É preciso aceitar os termos para continuar.' }, 400)

    const area = rest.linha.area === 'rh' ? 'rh' : 'restaurante'

    // ── Preço (do banco, nunca do cliente) ──
    const { data: preco } = await db
      .from('planos_precos')
      .select('total_centavos, parcelas_max, total_parcelado_centavos')
      .eq('area', area)
      .eq('ciclo', ciclo)
      .eq('ativo', true)
      .maybeSingle()
    if (!preco?.total_centavos) return json({ error: 'Este plano não está disponível agora.' }, 409)
    const parcelas = modalidade === 'parcelado' ? Number(preco.parcelas_max) || null : null
    if (modalidade === 'parcelado' && !parcelas) return json({ error: 'Este plano não pode ser parcelado.' }, 400)
    // O parcelado tem o próprio total (com o acréscimo da taxa do cartão
    // parcelado, que vai para o cliente); sem ele, é o mesmo do à vista.
    const total = modalidade === 'parcelado' && Number(preco.total_parcelado_centavos) > 0
      ? Number(preco.total_parcelado_centavos)
      : Number(preco.total_centavos)

    // ── Travas ──
    const trava = await conferirTravas(db, rest.id, ciclo, modalidade)
    if (trava) return trava

    // ── Conta do Asaas, cliente e descontos ──
    const contaId = await contaDasVendasNovas(db)
    const cli = asaas(contaId)
    const customerId = await garantirCliente(db, cli, rest, documento)

    const { data: indicacao } = await db
      .from('indicacoes')
      .select('afiliado_id')
      .eq('indicado_restaurante_id', rest.id)
      .maybeSingle()

    const { data: cupomUso } = await db
      .from('cupons_usos')
      .select('id, porcentagem_desconto, valor_desconto')
      .eq('restaurante_id', rest.id)
      .is('aplicado_em', null)
      .or('porcentagem_desconto.gt.0,valor_desconto.gt.0')
      .order('usado_em', { ascending: true })
      .limit(1)
      .maybeSingle()
    const desconto: Desconto | null = cupomUso
      ? Number(cupomUso.porcentagem_desconto) > 0
        ? { tipo: 'porcentagem', valor: Number(cupomUso.porcentagem_desconto) }
        : { tipo: 'valor', valor: Number(cupomUso.valor_desconto) }
      : null
    const primeira = comDescontoDoCupom(total, desconto)

    // ── O pedido nasce antes, para o id ir como externalReference ──
    const pedido = crypto.randomUUID()
    const { data: linha, error: errIns } = await db
      .from('cobranca_assinaturas')
      .insert({
        id: pedido,
        conta_id: contaId,
        restaurante_id: rest.id,
        area,
        modalidade,
        ciclo,
        parcelas,
        asaas_customer_id: customerId,
        status: 'aguardando',
        valor_centavos: total,
        primeira_cobranca_centavos: primeira,
        afiliado_id: indicacao?.afiliado_id ?? null,
        cupom_uso_id: cupomUso?.id ?? null,
        termos_versao: termos,
      })
      .select('*')
      .single()
    if (errIns) throw new Error(`cobranca_assinaturas: ${errIns.message}`)

    // Volta automática depois de pagar: para o site de onde a pessoa veio
    // (no sandbox, também localhost); se o Asaas recusar, tenta o SITE_URL.
    const site = await siteUrl(db)
    const voltas = [...new Set([origemDeRetorno(req, site, cli.ambiente), site])]
      .map((o) => ({ successUrl: `${o}/checkout/sucesso?pedido=${pedido}`, autoRedirect: true }))
    const descricao = `EasyFeed — plano ${ROTULO[ciclo]}${parcelas ? ` em ${parcelas}x` : ''}`

    let asaasId: string | null = null
    try {
      // deno-lint-ignore no-explicit-any
      let pagamento: any
      if (modalidade === 'recorrente') {
        const sub = await comCallback(voltas, (cb) =>
          cli.post('/subscriptions', {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            value: reais(total),
            nextDueDate: hojeSaoPaulo(),
            cycle: CICLO_ASAAS[ciclo],
            description: descricao,
            externalReference: pedido,
            ...(cb ? { callback: cb } : {}),
          }))
        asaasId = String(sub.id)
        pagamento = await primeiraCobranca(cli, asaasId)
        // Cupom: só a 1ª cobrança sai com desconto; a assinatura segue cheia.
        if (primeira !== total) pagamento = await cli.put(`/payments/${pagamento.id}`, { value: reais(primeira) })
      } else {
        pagamento = await comCallback(voltas, (cb) =>
          cli.post('/payments', {
            customer: customerId,
            billingType: 'CREDIT_CARD',
            installmentCount: parcelas,
            totalValue: reais(primeira),
            dueDate: hojeSaoPaulo(),
            description: descricao,
            externalReference: pedido,
            ...(cb ? { callback: cb } : {}),
          }))
        asaasId = String(pagamento.installment ?? '')
        if (!asaasId) throw new Error('Asaas não devolveu o id do parcelamento')
      }

      await db.from('cobranca_assinaturas').update({ asaas_id: asaasId, atualizada_em: new Date().toISOString() }).eq('id', pedido)
      await espelharPagamento(db, contaId, { ...linha, asaas_id: asaasId }, pagamento, { cupom_uso_id: cupomUso?.id ?? null })

      if (!pagamento.invoiceUrl) throw new Error('Asaas não devolveu a URL da fatura')
      return json({ url: pagamento.invoiceUrl, pedido })
    } catch (e) {
      // Desfaz o que deu para criar: nada pode ficar cobrando sem pedido.
      if (asaasId) {
        const caminho = modalidade === 'recorrente' ? `/subscriptions/${asaasId}` : `/installments/${asaasId}`
        await removerNoAsaas(cli, caminho).catch((x) => console.error('[criar-cobranca] desfazer no Asaas', (x as Error).message))
      }
      await db.from('cobranca_pagamentos').delete().eq('assinatura_id', pedido)
      await db.from('cobranca_assinaturas').delete().eq('id', pedido)
      throw e
    }
  } catch (e) {
    console.error('[criar-cobranca]', (e as Error).message)
    if (e instanceof ErroAsaas && e.status === 400 && e.erros[0]?.description) {
      return json({ error: e.erros[0].description }, 400)
    }
    return json({ error: ERRO_GENERICO }, 502)
  }
})

/** null = pode seguir; senão a resposta a devolver. */
async function conferirTravas(db: Db, restauranteId: number, ciclo: Ciclo, modalidade: Modalidade): Promise<Response | null> {
  const { data: abertas } = await db
    .from('cobranca_assinaturas')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .in('status', ['aguardando', 'ativa', 'atrasada'])
    .order('criada_em', { ascending: false })

  for (const a of abertas ?? []) {
    if (a.modalidade === 'recorrente' && a.status === 'ativa') {
      return json({ error: 'Sua assinatura já está ativa.', ja_assinante: true }, 409)
    }
    if (a.modalidade === 'recorrente' && a.status === 'atrasada') {
      const { data: aberta } = await db
        .from('cobranca_pagamentos')
        .select('invoice_url')
        .eq('assinatura_id', a.id)
        .eq('status', 'OVERDUE')
        .order('vencimento', { ascending: true })
        .limit(1)
        .maybeSingle()
      return json({
        error: 'Há uma mensalidade em aberto. Pague a fatura para regularizar a assinatura.',
        regularizar_url: aberta?.invoice_url ?? null,
      }, 409)
    }
    if (a.modalidade === 'parcelado' && a.status === 'ativa' && a.periodo_fim
        && new Date(a.periodo_fim).getTime() - Date.now() > 30 * DIA_MS) {
      const ate = new Date(a.periodo_fim).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      return json({ error: `Seu plano está pago até ${ate}. A renovação abre 30 dias antes.`, ja_assinante: true }, 409)
    }
  }

  for (const a of abertas ?? []) {
    if (a.status !== 'aguardando') continue
    const recente = Date.now() - new Date(a.criada_em).getTime() < DIA_MS
    if (recente && a.ciclo === ciclo && a.modalidade === modalidade && a.asaas_id) {
      const { data: pendente } = await db
        .from('cobranca_pagamentos')
        .select('invoice_url')
        .eq('assinatura_id', a.id)
        .eq('status', 'PENDING')
        .limit(1)
        .maybeSingle()
      if (pendente?.invoice_url) return json({ url: pendente.invoice_url, pedido: a.id })
    }
    // Outro pedido em aberto: some no Asaas antes de abrir o novo.
    if (a.asaas_id) {
      const caminho = a.modalidade === 'recorrente' ? `/subscriptions/${a.asaas_id}` : `/installments/${a.asaas_id}`
      await removerNoAsaas(asaas(a.conta_id), caminho)
    }
    await db.from('cobranca_assinaturas').update({ status: 'expirada', atualizada_em: new Date().toISOString() }).eq('id', a.id)
  }
  return null
}

/** Cliente do Asaas desta conta EasyFeed: reaproveita ou cria. */
async function garantirCliente(
  db: Db,
  cli: ClienteAsaas,
  // deno-lint-ignore no-explicit-any
  rest: { id: number; email: string; linha: any },
  documento: string,
): Promise<string> {
  const { data: existente } = await db
    .from('cobranca_clientes')
    .select('asaas_customer_id, cpf_cnpj')
    .eq('conta_id', cli.contaId)
    .eq('restaurante_id', rest.id)
    .maybeSingle()
  if (existente) {
    if (existente.cpf_cnpj !== documento) {
      await cli.put(`/customers/${existente.asaas_customer_id}`, { cpfCnpj: documento })
      await db.from('cobranca_clientes').update({ cpf_cnpj: documento })
        .eq('conta_id', cli.contaId).eq('restaurante_id', rest.id)
    }
    return existente.asaas_customer_id
  }

  const nome = String(rest.linha.nome_restaurante ?? '').trim() || rest.email || `Conta ${rest.id}`
  const criado = await cli.post('/customers', {
    name: nome.slice(0, 100),
    cpfCnpj: documento,
    email: rest.email || undefined,
    externalReference: String(rest.id),
  })
  const { error } = await db.from('cobranca_clientes').insert({
    conta_id: cli.contaId,
    restaurante_id: rest.id,
    asaas_customer_id: String(criado.id),
    cpf_cnpj: documento,
  })
  if (error) {
    // Duas abas ao mesmo tempo: fica o que gravou primeiro.
    const { data: outro } = await db
      .from('cobranca_clientes')
      .select('asaas_customer_id')
      .eq('conta_id', cli.contaId)
      .eq('restaurante_id', rest.id)
      .maybeSingle()
    if (outro?.asaas_customer_id) return outro.asaas_customer_id
    throw new Error(`cobranca_clientes: ${error.message}`)
  }
  return String(criado.id)
}

/**
 * De onde a pessoa veio (header `Origin`), se for um endereço nosso: o
 * SITE_URL sempre; localhost só no sandbox (teste local). Senão, o SITE_URL.
 */
function origemDeRetorno(req: Request, site: string, ambiente: 'sandbox' | 'producao'): string {
  const origem = (req.headers.get('Origin') ?? '').replace(/\/+$/, '')
  if (origem === site) return origem
  if (ambiente === 'sandbox' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) return origem
  return site
}

/**
 * Cria com o `callback` (volta automática para o site depois de pagar),
 * tentando cada endereço em ordem. O Asaas só aceita o domínio cadastrado na
 * conta (Minha Conta → Informações → Site); se recusar todos, cria sem volta
 * automática e a pessoa volta ao app por conta própria.
 * Recusa com 400 não cria nada, então repetir o POST é seguro.
 */
type Volta = { successUrl: string; autoRedirect: boolean }
async function comCallback<T>(voltas: Volta[], criar: (cb: Volta | null) => Promise<T>): Promise<T> {
  for (const volta of voltas) {
    try {
      return await criar(volta)
    } catch (e) {
      if (e instanceof ErroAsaas && e.status === 400 && /callback|dom[ií]nio|successUrl|url|site/i.test(e.message)) {
        console.warn(`[criar-cobranca] volta ${new URL(volta.successUrl).origin} recusada:`, e.message)
        continue
      }
      throw e
    }
  }
  console.warn('[criar-cobranca] nenhuma volta aceita: criando sem redirecionamento')
  return await criar(null)
}

/** A 1ª cobrança de uma assinatura recém-criada. */
async function primeiraCobranca(cli: ClienteAsaas, subId: string) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lista = await cli.get(`/subscriptions/${subId}/payments`)
    const primeira = (lista?.data ?? []).sort((a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate))[0]
    if (primeira) return primeira
    await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error('A assinatura foi criada sem a 1ª cobrança')
}
