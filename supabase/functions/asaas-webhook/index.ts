/**
 * asaas-webhook — recebe os eventos do Asaas e mantém o espelho e o acesso.
 *
 * Endereço (um por conta do Asaas): `.../functions/v1/asaas-webhook?conta=mei`.
 * Segurança: o header `asaas-access-token` tem que bater (em tempo constante)
 * com o secret `ASAAS_CONTA_<ID>_WEBHOOK_TOKEN` DAQUELA conta.
 *
 * Idempotência: `cobranca_eventos_webhook (conta_id, event_id)`. Evento já
 * processado → 200 sem fazer nada; em erro → reprocessa; "processando" em
 * paralelo → 409 (o Asaas tenta de novo); travado há mais de 10 min → assume.
 *
 * Ordem: a ordem de chegada NÃO é garantida. Nunca confia no objeto do evento
 * para o estado: relê o pagamento no Asaas, e as datas só andam para a frente.
 * Quem decide o acesso é `cobranca_aplicar`, que olha todas as cobranças.
 *
 * Atenção: depois de várias falhas seguidas o Asaas PAUSA a fila do webhook.
 * Se isso acontecer, conferir os logs desta função e reativar a fila no painel
 * do Asaas (Integrações → Webhooks).
 *
 * Deploy: `supabase functions deploy asaas-webhook --no-verify-jwt`
 * (o Asaas não manda JWT; a autenticação é o token).
 */
import { clienteAdmin } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { asaas, ErroAsaas, removerNoAsaas, type ClienteAsaas } from '../_shared/asaas/cliente.ts'
import { acharAssinatura, espelharPagamento } from '../_shared/asaas/espelho.ts'
import {
  centavos,
  comBonusDeIndicacao,
  contaValida,
  pagamentoAtrasado,
  pagamentoEstornado,
  pagamentoPago,
  periodoFimParcelado,
  periodoFimRecorrente,
  reais,
  tokenIgual,
  type Ciclo,
} from '../_shared/asaas/regras.ts'

// deno-lint-ignore no-explicit-any
type Db = any
// deno-lint-ignore no-explicit-any
type Evento = { id: string; event: string; payment?: any; subscription?: any }

/** Muito acima do limite de execução de uma edge function. */
const PROCESSANDO_TRAVADO_MS = 10 * 60 * 1000

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const contaId = new URL(req.url).searchParams.get('conta') ?? ''
  if (!contaValida(contaId)) return json({ error: 'conta inválida' }, 400)
  const esperado = Deno.env.get(`ASAAS_CONTA_${contaId.toUpperCase()}_WEBHOOK_TOKEN`)
  if (!tokenIgual(req.headers.get('asaas-access-token'), esperado)) return json({ error: 'não autorizado' }, 401)

  const evento = (await req.json().catch(() => null)) as Evento | null
  if (!evento?.id || !evento?.event) return json({ error: 'evento inválido' }, 400)

  const db = clienteAdmin()
  const reserva = await reservar(db, contaId, evento)
  if (reserva === 'duplicada') return json({ ok: true, duplicado: true })
  if (reserva === 'em_andamento') return json({ error: 'em processamento' }, 409)

  try {
    await processar(db, contaId, evento)
    await concluir(db, contaId, evento.id)
    return json({ ok: true })
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[asaas-webhook] ${evento.event} ${evento.id}:`, msg)
    await concluir(db, contaId, evento.id, msg)
    return json({ error: 'falha ao processar' }, 500)
  }
})

// ── Reserva de idempotência ──────────────────────────────────────────────
type Reserva = 'nova' | 'duplicada' | 'em_andamento'

async function reservar(db: Db, contaId: string, evento: Evento): Promise<Reserva> {
  const { error } = await db.from('cobranca_eventos_webhook').insert({
    conta_id: contaId,
    event_id: evento.id,
    tipo: evento.event,
    status: 'processando',
    payload: evento,
  })
  if (!error) return 'nova'
  if (String(error.code) !== '23505') throw new Error(`log de eventos: ${error.message}`)

  const { data } = await db
    .from('cobranca_eventos_webhook')
    .select('status, recebido_em, processado_em')
    .eq('conta_id', contaId)
    .eq('event_id', evento.id)
    .maybeSingle()
  if (data?.status === 'ok') return 'duplicada'
  if (data?.status === 'processando') {
    // Execução que morreu no meio deixaria o evento preso; passado o limite,
    // assume (processar é idempotente: relê o Asaas).
    const desde = Date.parse(data.processado_em ?? data.recebido_em ?? '')
    if (Number.isFinite(desde) && Date.now() - desde < PROCESSANDO_TRAVADO_MS) return 'em_andamento'
    let assumir = db
      .from('cobranca_eventos_webhook')
      .update({ processado_em: new Date().toISOString() })
      .eq('conta_id', contaId)
      .eq('event_id', evento.id)
      .eq('status', 'processando')
    assumir = data.processado_em ? assumir.eq('processado_em', data.processado_em) : assumir.is('processado_em', null)
    const { data: assumido } = await assumir.select('event_id')
    return assumido?.length ? 'nova' : 'em_andamento'
  }
  // 'erro': reabre para reprocessar.
  await db
    .from('cobranca_eventos_webhook')
    .update({ status: 'processando', erro: null, processado_em: new Date().toISOString() })
    .eq('conta_id', contaId)
    .eq('event_id', evento.id)
  return 'nova'
}

async function concluir(db: Db, contaId: string, eventId: string, erro?: string) {
  await db
    .from('cobranca_eventos_webhook')
    .update({ status: erro ? 'erro' : 'ok', erro: erro ? erro.slice(0, 500) : null, processado_em: new Date().toISOString() })
    .eq('conta_id', contaId)
    .eq('event_id', eventId)
}

// ── Eventos ──────────────────────────────────────────────────────────────

async function processar(db: Db, contaId: string, evento: Evento) {
  const { data: conta } = await db.from('contas_cobranca').select('id').eq('id', contaId).maybeSingle()
  if (!conta) throw new Error(`conta ${contaId} não existe em contas_cobranca`)

  if (evento.event.startsWith('PAYMENT_') && evento.payment?.id) {
    await aoMudarPagamento(db, contaId, evento)
  } else if (evento.event.startsWith('SUBSCRIPTION_') && evento.subscription?.id) {
    await aoMudarAssinatura(db, contaId, evento.event, String(evento.subscription.id))
  }
  // Outros eventos (CHECKOUT_*, TRANSFER_*, …) não interessam nesta fase.
}

async function aoMudarPagamento(db: Db, contaId: string, evento: Evento) {
  const cli = asaas(contaId)
  // deno-lint-ignore no-explicit-any
  let pag: any
  try {
    pag = await cli.get(`/payments/${evento.payment.id}`)
  } catch (e) {
    // Removido no Asaas: fica o que veio no evento, marcado como removido.
    if (e instanceof ErroAsaas && e.status === 404) pag = { ...evento.payment, deleted: true }
    else throw e
  }
  if (evento.event === 'PAYMENT_DELETED') pag = { ...pag, deleted: true }

  const a = await acharAssinatura(db, contaId, pag)
  if (!a) {
    // Cobrança criada à mão no painel do Asaas, ou de outro produto.
    console.warn(`[asaas-webhook] pagamento ${pag.id} sem pedido nosso (ignorado)`)
    return
  }

  // Renovação de recorrente ainda em aberto: bônus de indicação entra nela.
  let premioId: string | null | undefined
  if (evento.event === 'PAYMENT_CREATED' && a.modalidade === 'recorrente' && pag.status === 'PENDING' && !pag.deleted) {
    const r = await aplicarBonus(db, cli, a, pag)
    pag = r.pag
    premioId = r.premioId
  }

  const linha = await espelharPagamento(db, contaId, a, pag, premioId ? { premio_id: premioId } : {})

  if (pagamentoPago(pag.status) && !pag.deleted) {
    await aoPagar(db, a, linha, pag)
  } else if (pagamentoAtrasado(pag.status) && !pag.deleted) {
    if (a.status === 'aguardando') {
      // A fatura da compra venceu sem pagamento: o pedido morre aqui, senão o
      // Asaas seguiria mandando faturas de uma assinatura que nunca começou.
      // Voltando ao site, a pessoa abre um pedido novo.
      const caminho = a.modalidade === 'recorrente' ? `/subscriptions/${a.asaas_id}` : `/installments/${a.asaas_id}`
      if (a.asaas_id) await removerNoAsaas(cli, caminho)
      await db.from('cobranca_assinaturas').update({ status: 'expirada', atualizada_em: agora() }).eq('id', a.id)
    }
    // Só a recorrente vira inadimplente. Parcela atrasada do parcelado não
    // tira o período já liberado (o cartão do cliente segue sendo cobrado).
    else if (a.modalidade === 'recorrente' && a.status === 'ativa') {
      await db.from('cobranca_assinaturas').update({ status: 'atrasada', atualizada_em: agora() }).eq('id', a.id)
    }
  } else if (pagamentoEstornado(pag.status)) {
    await aoEstornar(db, cli, a, pag)
  }

  if (a.restaurante_id) await aplicar(db, a.restaurante_id)
}

// deno-lint-ignore no-explicit-any
async function aoPagar(db: Db, a: any, linha: any, pag: any) {
  const ciclo = a.ciclo as Ciclo
  let periodoFim: string | null = a.periodo_fim

  if (a.modalidade === 'recorrente') {
    const candidato = periodoFimRecorrente(String(pag.dueDate).slice(0, 10), ciclo)
    // Só anda para a frente: um evento antigo não encurta o período.
    if (!periodoFim || new Date(candidato) > new Date(periodoFim)) periodoFim = candidato
  } else if (!periodoFim) {
    // Parcelado: a 1ª parcela paga libera o período inteiro, somado ao que
    // ainda resta de um parcelado anterior (renovação antecipada).
    const { data: r } = await db
      .from('restaurantes')
      .select('assinatura_expira_em, assinatura_origem')
      .eq('id', a.restaurante_id)
      .maybeSingle()
    const atual = r?.assinatura_origem === 'asaas_parcelado' ? r.assinatura_expira_em : null
    periodoFim = periodoFimParcelado(atual, ciclo)
  }

  // Cancelada ou encerrada continua assim (o período pago vale até o fim);
  // as demais viram ativa — inclusive o pedido que expirou e foi pago depois.
  const status = a.status === 'cancelada' || a.status === 'encerrada' ? a.status : 'ativa'
  await db.from('cobranca_assinaturas').update({ status, periodo_fim: periodoFim, atualizada_em: agora() }).eq('id', a.id)

  if (status === 'ativa' && a.modalidade === 'recorrente' && a.restaurante_id) {
    const { data: outras } = await db
      .from('cobranca_assinaturas')
      .select('id, asaas_id')
      .eq('restaurante_id', a.restaurante_id)
      .eq('modalidade', 'recorrente')
      .in('status', ['ativa', 'atrasada'])
      .neq('id', a.id)
    if (outras?.length) {
      // Não dá para desfazer o pagamento aqui: alerta para o suporte estornar uma.
      console.error(`[asaas-webhook] ASSINATURA DUPLICADA restaurante=${a.restaurante_id} nova=${a.asaas_id} outras=${outras.map((o: { asaas_id: string }) => o.asaas_id).join(',')}`)
    }
  }

  // Descontos consumidos (uma vez só).
  if (linha.cupom_uso_id) {
    await db.from('cupons_usos').update({ aplicado_em: agora(), aplicado_pagamento: String(pag.id) })
      .eq('id', linha.cupom_uso_id).is('aplicado_em', null)
  }
  if (linha.premio_id) {
    await db.from('indicacao_premios').update({ status: 'aplicado', aplicado_em: agora(), aplicado_por: 'asaas' })
      .eq('id', linha.premio_id).eq('status', 'pendente')
  }

  // Indicações: 1ª mensalidade e, no 2º mês pago, o benefício de quem indicou.
  if (a.restaurante_id) {
    const { error } = await db.rpc('indicacao_registrar_pagamento', { p_restaurante_id: a.restaurante_id })
    if (error) throw new Error(`indicacao_registrar_pagamento: ${error.message}`)
  }
}

/** Estorno ou chargeback: o contrato acaba ali. Na recorrente, a assinatura
    também é removida no Asaas — não se segue cobrando quem foi reembolsado. */
// deno-lint-ignore no-explicit-any
async function aoEstornar(db: Db, cli: ClienteAsaas, a: any, pag: any) {
  if (a.status === 'encerrada') return
  if (a.modalidade === 'recorrente' && a.asaas_id && a.status !== 'cancelada') {
    await removerNoAsaas(cli, `/subscriptions/${a.asaas_id}`)
  }
  console.warn(`[asaas-webhook] estorno ${pag.status} pagamento=${pag.id} assinatura=${a.id}: acesso revogado`)
  await db
    .from('cobranca_assinaturas')
    .update({ status: 'encerrada', periodo_fim: agora(), cancelada_em: a.cancelada_em ?? agora(), atualizada_em: agora() })
    .eq('id', a.id)
}

/** Bônus de indicação pendente → abate de uma mensalidade nesta renovação. */
// deno-lint-ignore no-explicit-any
async function aplicarBonus(db: Db, cli: ClienteAsaas, a: any, pag: any): Promise<{ pag: any; premioId?: string }> {
  if (!a.restaurante_id) return { pag }

  // A 1ª cobrança é da compra (o cupom cuida dela); o bônus é para renovações.
  const { count: pagas } = await db
    .from('cobranca_pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('assinatura_id', a.id)
    .in('status', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
  if (!pagas) return { pag }

  // Esta cobrança já recebeu um bônus (evento repetido).
  const { data: ja } = await db
    .from('cobranca_pagamentos')
    .select('premio_id')
    .eq('conta_id', a.conta_id)
    .eq('asaas_payment_id', String(pag.id))
    .maybeSingle()
  if (ja?.premio_id) return { pag }

  // O bônus pendente mais antigo que ainda não está preso a outra cobrança.
  const { data: presos } = await db
    .from('cobranca_pagamentos')
    .select('premio_id')
    .eq('restaurante_id', a.restaurante_id)
    .not('premio_id', 'is', null)
    .not('status', 'in', '(DELETED,REFUNDED)')
  const ocupados = new Set((presos ?? []).map((p: { premio_id: string }) => p.premio_id))
  const { data: pendentes } = await db
    .from('indicacao_premios')
    .select('id, porcentagem')
    .eq('restaurante_id', a.restaurante_id)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
  const premio = (pendentes ?? []).find((p: { id: string }) => !ocupados.has(p.id))
  if (!premio) return { pag }

  const atual = centavos(pag.value)
  const novo = comBonusDeIndicacao(atual, a.valor_centavos, a.ciclo as Ciclo, Number(premio.porcentagem) || 0)
  if (novo >= atual) return { pag }
  const atualizado = await cli.put(`/payments/${pag.id}`, { value: reais(novo) })
  return { pag: atualizado, premioId: premio.id }
}

async function aoMudarAssinatura(db: Db, contaId: string, tipo: string, subId: string) {
  if (tipo !== 'SUBSCRIPTION_DELETED' && tipo !== 'SUBSCRIPTION_INACTIVATED') return
  const { data: a } = await db
    .from('cobranca_assinaturas')
    .select('*')
    .eq('conta_id', contaId)
    .eq('asaas_id', subId)
    .maybeSingle()
  if (!a) return
  if (['aguardando', 'ativa', 'atrasada'].includes(a.status)) {
    // Removida no Asaas: o acesso vai até o fim do período já pago.
    await db
      .from('cobranca_assinaturas')
      .update({
        status: a.status === 'aguardando' ? 'expirada' : 'cancelada',
        cancelada_em: a.cancelada_em ?? agora(),
        atualizada_em: agora(),
      })
      .eq('id', a.id)
  }
  if (a.restaurante_id) await aplicar(db, a.restaurante_id)
}

async function aplicar(db: Db, restauranteId: number) {
  const { error } = await db.rpc('cobranca_aplicar', { p_restaurante_id: restauranteId })
  if (error) throw new Error(`cobranca_aplicar: ${error.message}`)
}

const agora = () => new Date().toISOString()
