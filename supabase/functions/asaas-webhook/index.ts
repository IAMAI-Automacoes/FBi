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
import { garantirComissao } from '../_shared/asaas/comissao.ts'
import { confirmarSaldoDoVideo, descontoDoCodigo, reservarSaldoDoVideo, soltarSaldoDoVideo } from '../_shared/asaas/descontos.ts'
import {
  centavos,
  contaValida,
  corpoDoPut,
  espacoParaSaldo,
  pagamentoAtrasado,
  pagamentoEstornado,
  pagamentoPago,
  periodoFimParcelado,
  periodoFimRecorrente,
  tokenIgual,
  valorComMesesGratis,
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

  // Renovação de recorrente ainda em aberto: entra o mês grátis de indicação
  // OU o desconto do código mais o saldo dos vídeos (não acumulam com o mês
  // grátis: esperam a cobrança seguinte).
  if (evento.event === 'PAYMENT_CREATED' && a.modalidade === 'recorrente' && pag.status === 'PENDING' && !pag.deleted) {
    const comBonus = await aplicarBonus(db, cli, a, pag)
    pag = comBonus.pag
    if (!pag.deleted) pag = await aplicarSaldoEVendedor(db, cli, a, pag, comBonus.usou)
  }

  const linha = await espelharPagamento(db, contaId, a, pag)

  // Cobrança removida ou estornada sem ser paga: os bônus e o saldo de vídeo
  // que estavam nela voltam (o mês grátis que nós removemos já foi marcado usado).
  if (pag.deleted || pagamentoEstornado(pag.status)) {
    await soltarBonus(db, pag.id)
    await soltarSaldoDoVideo(db, String(pag.id))
  }

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
      await soltarSaldoDoVideo(db, String(a.id))
    }
    // Só a recorrente vira inadimplente. Parcela atrasada do parcelado não
    // tira o período já liberado (o cartão do cliente segue sendo cobrado).
    else if (a.modalidade === 'recorrente' && a.status === 'ativa') {
      await db.from('cobranca_assinaturas').update({ status: 'atrasada', atualizada_em: agora() }).eq('id', a.id)
    }
  } else if (pagamentoEstornado(pag.status)) {
    await aoEstornar(db, cli, a, pag)
  }

  // Comissão do vendedor (split). Erro do Asaas fica registrado e não derruba o evento.
  await garantirComissao(db, cli, a, pag)

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
  // Meses grátis de indicação e saldo de vídeo abatidos nesta cobrança: usados.
  await confirmarBonus(db, pag.id)
  await confirmarSaldoDoVideo(db, String(pag.id), String(a.id))

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

/**
 * Meses grátis de indicação nesta renovação ("proteção de caixa", regra do
 * Raver em 17/10/2026). O banco confere o indicado de cada bônus da fila e
 * reserva os que valem (`indicacao_reservar_bonus`): no mensal, 1 por mês, de
 * indicado ativo (o de quem cancelou é descartado); no semestral/anual, os de
 * indicado ativo que já pagou o mínimo de meses. Cada um abate 1 mensalidade.
 * Coberta a cobrança inteira (o mensal com 1 bônus), ela sai do Asaas — que
 * não aceita cobrança abaixo de R$ 5 — e o período anda como se tivesse sido
 * paga. O bônus é marcado usado ANTES de a cobrança sair: se o Asaas falhar,
 * ele volta para a fila; nunca sai um mês grátis sem gastar um bônus.
 */
// deno-lint-ignore no-explicit-any
async function aplicarBonus(db: Db, cli: ClienteAsaas, a: any, pag: any): Promise<{ pag: any; usou: boolean }> {
  if (!a.restaurante_id) return { pag, usou: false }

  // A 1ª cobrança é da compra (o cupom cuida dela); o bônus é para renovações.
  const { count: pagas } = await db
    .from('cobranca_pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('assinatura_id', a.id)
    .in('status', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
  if (!pagas) return { pag, usou: false }

  const { data: r, error } = await db.rpc('indicacao_reservar_bonus', {
    p_restaurante_id: a.restaurante_id,
    p_ciclo: a.ciclo,
    p_pagamento: String(pag.id),
  })
  if (error) throw new Error(`indicacao_reservar_bonus: ${error.message}`)
  // Cada bônus vale a % de uma mensalidade com que nasceu (`bonus_pct`, padrão 100).
  const meses = r?.pct != null ? Number(r.pct) / 100 : Number(r?.meses ?? 0)
  if (!(meses > 0)) return { pag, usou: false }
  // Evento repetido: o abatimento já foi feito.
  if (r?.repetido) return { pag, usou: true }

  const atual = centavos(pag.value)
  const novo = valorComMesesGratis(atual, a.valor_centavos, a.ciclo as Ciclo, meses)
  if (novo >= atual) {
    await soltarBonus(db, pag.id)
    return { pag, usou: false }
  }

  if (novo > 0) {
    try {
      return { pag: await cli.put(`/payments/${pag.id}`, corpoDoPut(pag, { valorCentavos: novo })), usou: true }
    } catch (e) {
      await soltarBonus(db, pag.id).catch(() => {})
      throw e
    }
  }

  // A cobrança inteira é grátis.
  await confirmarBonus(db, pag.id)
  try {
    await removerNoAsaas(cli, `/payments/${pag.id}`)
  } catch (e) {
    // A cobrança continua: o bônus volta para a fila.
    await db
      .from('indicacao_premios')
      .update({ status: 'pendente', aplicado_em: null, aplicado_por: null, aplicado_pagamento: null, reservado_pagamento: null })
      .eq('aplicado_pagamento', String(pag.id))
      .eq('aplicado_por', 'asaas')
    throw e
  }
  await andarPeriodo(db, a, pag)
  return { pag: { ...pag, deleted: true }, usou: true }
}

async function confirmarBonus(db: Db, pagamentoId: unknown) {
  const { error } = await db.rpc('indicacao_confirmar_bonus', { p_pagamento: String(pagamentoId) })
  if (error) throw new Error(`indicacao_confirmar_bonus: ${error.message}`)
}

async function soltarBonus(db: Db, pagamentoId: unknown) {
  const { error } = await db.rpc('indicacao_soltar_bonus', { p_pagamento: String(pagamentoId) })
  if (error) throw new Error(`indicacao_soltar_bonus: ${error.message}`)
}

/**
 * Saldo dos vídeos aprovados e desconto do código (vendedor, influenciador ou
 * restaurante) nesta renovação (a compra já sai com eles de `criar-cobranca`).
 * Os dois somam entre si, mas não com o mês grátis de indicação (`comBonus`):
 * nessa cobrança ficam zerados e esperam a seguinte — o desconto do código não
 * gasta uma das suas cobranças, e o saldo do vídeo continua guardado.
 * Uma vez só por cobrança: as colunas `desconto_vendedor_centavos` e
 * `saldo_video_centavos` preenchidas = já foi feito (evento repetido).
 */
// deno-lint-ignore no-explicit-any
async function aplicarSaldoEVendedor(db: Db, cli: ClienteAsaas, a: any, pag: any, comBonus: boolean): Promise<any> {
  if (!a.restaurante_id) return pag
  // A linha da cobrança existe antes da reserva (a reserva solta as de cobrança que não está em aberto).
  const linha = await espelharPagamento(db, cli.contaId, a, pag)
  if (linha.desconto_vendedor_centavos != null || linha.saldo_video_centavos != null) return pag
  if (comBonus) {
    await espelharPagamento(db, cli.contaId, a, pag, { desconto_vendedor_centavos: 0, saldo_video_centavos: 0 })
    return pag
  }

  const { count: pagas } = await db
    .from('cobranca_pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('assinatura_id', a.id)
    .in('status', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
  if (!pagas) return pag

  const atual = centavos(pag.value)
  let novo = atual
  const pct = await descontoDoCodigo(db, a.restaurante_id, { compra: false, excluirPagamento: String(pag.id) })
  if (pct > 0) novo = Math.max(500, atual - Math.round((Number(a.valor_centavos) * pct) / 100))
  const descontoVendedor = atual - novo

  const saldo = await reservarSaldoDoVideo(db, a.restaurante_id, String(pag.id), espacoParaSaldo(novo))
  if (!saldo.repetido) novo -= saldo.centavos

  // Marca antes de mudar no Asaas: se a função morrer depois do PUT, o evento
  // repetido não desconta de novo.
  await espelharPagamento(db, cli.contaId, a, pag, {
    desconto_vendedor_centavos: descontoVendedor,
    saldo_video_centavos: saldo.repetido ? 0 : saldo.centavos,
  })
  if (novo >= atual) return pag
  try {
    return await cli.put(`/payments/${pag.id}`, corpoDoPut(pag, { valorCentavos: novo }))
  } catch (e) {
    await espelharPagamento(db, cli.contaId, a, pag, { desconto_vendedor_centavos: null, saldo_video_centavos: null }).catch(() => {})
    await soltarSaldoDoVideo(db, String(pag.id)).catch(() => {})
    throw e
  }
}

/** Mês grátis: o período da assinatura anda como se a cobrança tivesse sido paga. */
// deno-lint-ignore no-explicit-any
async function andarPeriodo(db: Db, a: any, pag: any) {
  const candidato = periodoFimRecorrente(String(pag.dueDate).slice(0, 10), a.ciclo as Ciclo)
  if (a.periodo_fim && new Date(candidato) <= new Date(a.periodo_fim)) return
  const { error } = await db
    .from('cobranca_assinaturas')
    .update({ periodo_fim: candidato, atualizada_em: agora() })
    .eq('id', a.id)
  if (error) throw new Error(`cobranca_assinaturas: ${error.message}`)
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
    if (a.status === 'aguardando') await soltarSaldoDoVideo(db, String(a.id))
  }
  if (a.restaurante_id) await aplicar(db, a.restaurante_id)
}

async function aplicar(db: Db, restauranteId: number) {
  const { error } = await db.rpc('cobranca_aplicar', { p_restaurante_id: restauranteId })
  if (error) throw new Error(`cobranca_aplicar: ${error.message}`)
}

const agora = () => new Date().toISOString()
