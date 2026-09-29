/**
 * stripe-webhook — recebe os eventos do Stripe e mantém o espelho.
 *
 * Segurança: assinatura conferida com `constructEventAsync` (Deno não tem o
 * crypto síncrono do Node) e o segredo `STRIPE_WEBHOOK_SECRET`. Sem assinatura
 * válida a requisição morre em 400 antes de tocar o banco.
 *
 * Idempotência: `stripe_eventos_webhook.event_id` é chave primária. Evento já
 * processado com sucesso → 200 sem fazer nada. Evento em `erro` → reprocessa
 * (o Stripe reenvia por até 3 dias). Evento `processando` em paralelo → 500,
 * para o Stripe tentar de novo mais tarde, quando o primeiro tiver terminado.
 *
 * Ordem: nunca confia no objeto que veio no evento para o estado da
 * assinatura — relê no Stripe (`sincronizarAssinatura`). Um `updated` atrasado
 * não desfaz um `deleted`.
 *
 * Deploy: `supabase functions deploy stripe-webhook --no-verify-jwt`
 * (o Stripe não manda JWT; a autenticação é a assinatura do evento).
 */
import { json } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import Stripe, { stripe, cryptoProvider, PRODUCT_CODE } from '../_shared/stripe/cliente.ts'
import {
  marcarCustomerNoStripe,
  registrarCheckoutSession,
  sincronizarAssinatura,
  upsertCliente,
} from '../_shared/stripe/sincronizar.ts'
import { notificarFatura } from '../_shared/stripe/emails.ts'

// deno-lint-ignore no-explicit-any
type Db = any

function idDe(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/** Outro produto da IAMAI na mesma conta? Ignora. Sem metadata = legado
    criado à mão no Dashboard: trata como EasyFeed. */
function ehDoEasyFeed(metadata: Stripe.Metadata | null | undefined): boolean {
  const code = metadata?.product_code
  return !code || code === PRODUCT_CODE
}

// ── Reserva de idempotência ──────────────────────────────────────────────
type Reserva = 'nova' | 'duplicada' | 'em_andamento'

async function reservar(db: Db, evento: Stripe.Event): Promise<Reserva> {
  const { error } = await db.from('stripe_eventos_webhook').insert({
    event_id: evento.id,
    tipo: evento.type,
    api_version: evento.api_version ?? null,
    status: 'processando',
  })
  if (!error) return 'nova'
  if (String(error.code) !== '23505') throw new Error(`log de eventos: ${error.message}`)

  const { data } = await db
    .from('stripe_eventos_webhook')
    .select('status')
    .eq('event_id', evento.id)
    .maybeSingle()
  if (data?.status === 'ok') return 'duplicada'
  if (data?.status === 'processando') return 'em_andamento'
  // 'erro': reabre para reprocessar
  await db
    .from('stripe_eventos_webhook')
    .update({ status: 'processando', erro: null })
    .eq('event_id', evento.id)
  return 'nova'
}

async function concluir(db: Db, eventId: string, erro?: string) {
  await db
    .from('stripe_eventos_webhook')
    .update({
      status: erro ? 'erro' : 'ok',
      erro: erro ? erro.slice(0, 500) : null,
      processado_em: new Date().toISOString(),
    })
    .eq('event_id', eventId)
}

// ── Handlers ─────────────────────────────────────────────────────────────

async function aoConcluirCheckout(db: Db, sessao: Stripe.Checkout.Session) {
  if (sessao.mode !== 'subscription') return
  if (!ehDoEasyFeed(sessao.metadata)) return

  const paga = sessao.payment_status === 'paid' || sessao.payment_status === 'no_payment_required'
  await registrarCheckoutSession(db, sessao, paga ? 'paga' : 'criada')

  const customerId = idDe(sessao.customer)
  const restauranteId = sessao.metadata?.restaurante_id ? Number(sessao.metadata.restaurante_id) : null
  const email = sessao.customer_details?.email ?? sessao.customer_email ?? null

  if (customerId) {
    await upsertCliente(db, customerId, { email, restaurante_id: restauranteId })
    await marcarCustomerNoStripe(customerId, {
      ...(restauranteId ? { restaurante_id: String(restauranteId) } : {}),
      ...(sessao.metadata?.auth_user_id ? { auth_user_id: sessao.metadata.auth_user_id } : {}),
    })
  }

  const subId = idDe(sessao.subscription)
  if (subId) {
    await sincronizarAssinatura(db, subId, restauranteId)
  }

  // Compra feita por usuário logado: o vínculo é do servidor (metadata veio
  // do JWT). Marca a sessão como vinculada para ela não poder ser "usada" de
  // novo por `vincular-compra`.
  if (restauranteId && paga) {
    await db
      .from('stripe_checkout_sessions')
      .update({
        restaurante_id_vinculado: restauranteId,
        vinculada_em: new Date().toISOString(),
        status: 'vinculada',
      })
      .eq('stripe_session_id', sessao.id)
      .is('restaurante_id_vinculado', null)
  }
}

async function aoMudarAssinatura(db: Db, sub: Stripe.Subscription) {
  if (!ehDoEasyFeed(sub.metadata)) return
  await sincronizarAssinatura(db, sub.id)
}

async function aoMudarFatura(db: Db, tipo: string, fatura: Stripe.Invoice) {
  // Desde a API basil `invoice.subscription` virou `invoice.parent.subscription_details`.
  const subId = idDe(fatura.parent?.subscription_details?.subscription)
  if (!subId) return
  if (tipo !== 'invoice.finalized') {
    // paid / payment_failed / payment_action_required mudam status e período.
    await sincronizarAssinatura(db, subId)
  }
  // Gancho de e-mails próprios (marca EasyFeed) e, no futuro, NFS-e.
  await notificarFatura(db, tipo, fatura)
}

async function processar(db: Db, evento: Stripe.Event) {
  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await aoConcluirCheckout(db, evento.data.object as Stripe.Checkout.Session)
      break

    case 'checkout.session.expired': {
      const s = evento.data.object as Stripe.Checkout.Session
      await db
        .from('stripe_checkout_sessions')
        .update({ status: 'expirada' })
        .eq('stripe_session_id', s.id)
        .in('status', ['criada'])
      break
    }

    case 'checkout.session.async_payment_failed':
      // Boleto/Pix não pago no prazo: a assinatura nasce `incomplete` e o
      // Stripe a expira sozinho; nada a fazer além de registrar.
      console.info('[stripe-webhook] pagamento assíncrono falhou:', (evento.data.object as Stripe.Checkout.Session).id)
      break

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await aoMudarAssinatura(db, evento.data.object as Stripe.Subscription)
      break

    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
    case 'invoice.finalized':
      await aoMudarFatura(db, evento.type, evento.data.object as Stripe.Invoice)
      break

    // Preço mudou: nada a gravar — `get-prices` lê o Stripe ao vivo (cache de
    // 5 min). Fica aqui só para o log mostrar que chegou.
    case 'price.created':
    case 'price.updated':
    case 'product.updated':
      console.info('[stripe-webhook] catálogo alterado:', evento.type)
      break

    default:
      // Assinado e válido, mas não nos interessa. 200 mesmo assim: 4xx/5xx
      // faria o Stripe reenviar para sempre.
      break
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const segredo = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!segredo) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET não configurada')
    return json({ error: 'webhook não configurado' }, 500)
  }

  const assinatura = req.headers.get('stripe-signature')
  if (!assinatura) return json({ error: 'sem assinatura' }, 400)

  // O corpo precisa ser lido CRU: qualquer reserialização quebra a assinatura.
  const corpo = await req.text()

  let evento: Stripe.Event
  try {
    evento = await stripe().webhooks.constructEventAsync(corpo, assinatura, segredo, undefined, cryptoProvider())
  } catch (e) {
    console.warn('[stripe-webhook] assinatura inválida:', (e as Error).message)
    return json({ error: 'assinatura inválida' }, 400)
  }

  const db = clienteAdmin()

  let reserva: Reserva
  try {
    reserva = await reservar(db, evento)
  } catch (e) {
    console.error('[stripe-webhook] reserva falhou:', (e as Error).message)
    return json({ error: 'log indisponível' }, 500)
  }
  if (reserva === 'duplicada') return json({ recebido: true, duplicado: true })
  if (reserva === 'em_andamento') return json({ error: 'evento em processamento' }, 500)

  try {
    await processar(db, evento)
    await concluir(db, evento.id)
    return json({ recebido: true })
  } catch (e) {
    const msg = (e as Error).message
    // Log sem payload: o event_id abre o evento inteiro no Dashboard.
    console.error(`[stripe-webhook] ${evento.type} ${evento.id} falhou:`, msg)
    await concluir(db, evento.id, msg)
    return json({ error: 'falha ao processar' }, 500)
  }
})
