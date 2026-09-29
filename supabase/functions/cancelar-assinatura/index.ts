import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'
import { stripe } from '../_shared/stripe/cliente.ts'
import { sincronizarAssinatura } from '../_shared/stripe/sincronizar.ts'

// Cancela a assinatura do restaurante do usuário logado. O dono não pode mexer
// nos campos de assinatura (trigger bloqueia), então isso roda com service_role.
//
// Duas famílias de assinatura:
//   - STRIPE (`stripe_subscription_id` preenchido): o cancelamento é pedido ao
//     Stripe com `cancel_at_period_end: true` — o cliente mantém acesso até o
//     fim do período pago, o Stripe não cobra mais, e o webhook
//     (`customer.subscription.updated` agora, `deleted` no fim do período)
//     atualiza o espelho e `restaurantes`. Cancelar só no nosso banco deixaria
//     o Stripe cobrando um cliente que acha que cancelou.
//   - LEGADO (cupom de acesso, liberação manual): regra antiga — se ainda tem
//     data futura, mantém acesso até lá (o job de expiração encerra na data);
//     se é infinita ou já vencida, encerra na hora.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const jwt = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    // Na demonstração a assinatura é a da conta de verdade do vendedor.
    if (await ehSessaoDemo(admin, jwt)) return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)

    const { data: rest, error: restErr } = await admin
      .from('restaurantes')
      .select('id, assinatura_status, assinatura_expira_em, stripe_subscription_id')
      .eq('auth_user_id', userData.user.id)
      .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)

    if (rest.assinatura_status !== 'ativa' && rest.assinatura_status !== 'inadimplente') {
      return json({ error: 'Você não tem uma assinatura ativa para cancelar.' }, 400)
    }

    // ── Stripe ──
    if (rest.stripe_subscription_id) {
      const sub = await stripe().subscriptions.update(rest.stripe_subscription_id, {
        cancel_at_period_end: true,
        cancellation_details: { comment: 'Cancelado pelo cliente no painel EasyFeed' },
      })
      // Não espera o webhook: atualiza o espelho e `restaurantes` agora, para a
      // tela refletir na hora. O webhook, quando chegar, é idempotente.
      await sincronizarAssinatura(admin, sub.id, Number(rest.id))
      const fim = sub.items.data[0]?.current_period_end
      return json({ modo: 'agendado', acesso_ate: fim ? new Date(fim * 1000).toISOString() : null })
    }

    // ── Legado ──
    const agora = new Date()
    const expira = rest.assinatura_expira_em ? new Date(rest.assinatura_expira_em) : null
    const temAcessoFuturo = expira !== null && expira.getTime() > agora.getTime()

    if (temAcessoFuturo) {
      await admin
        .from('restaurantes')
        .update({ assinatura_cancelada_em: agora.toISOString() })
        .eq('id', rest.id)
      return json({ modo: 'agendado', acesso_ate: rest.assinatura_expira_em })
    }

    await admin
      .from('restaurantes')
      .update({ assinatura_status: 'cancelada', assinatura_cancelada_em: agora.toISOString() })
      .eq('id', rest.id)
    return json({ modo: 'encerrada' })
  } catch (err) {
    console.error('[cancelar-assinatura]', (err as Error).message)
    return json({ error: 'Não foi possível cancelar agora. Tente de novo em instantes.' }, 500)
  }
})
