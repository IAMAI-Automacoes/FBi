/**
 * create-portal-session — abre o Customer Portal do Stripe para o dono.
 *
 * No portal ele troca de ciclo, atualiza o cartão, vê faturas e cancela. A
 * CONFIGURAÇÃO do portal (headline, links de termos/privacidade, quais prices
 * aparecem na troca de ciclo) é própria do EasyFeed e vive no Stripe, criada
 * pelo script `scripts/stripe/configurar-portal.ts`; o id fica em
 * `STRIPE_PORTAL_CONFIGURATION_ID`. Sem esse id, o Stripe usa a configuração
 * padrão da conta (que seria a da IAMAI, genérica).
 *
 * Troca de ciclo depois de uma troca de PREÇO continua funcionando porque o
 * script de troca de preço re-sincroniza a lista de prices da configuração
 * (o portal aponta para price IDs explícitos, não para lookup_keys).
 *
 * Deploy: `supabase functions deploy create-portal-session` (JWT obrigatório).
 */
import { z } from 'npm:zod@4.3.6'
import { json, preflight } from '../_shared/cors.ts'
import { autenticarRestaurante, clienteAdmin } from '../_shared/auth.ts'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'
import Stripe, { stripe } from '../_shared/stripe/cliente.ts'

const Entrada = z.object({
  /** Atalho direto para uma ação do portal. Sem isso abre a página inicial. */
  fluxo: z.enum(['atualizar_cartao', 'trocar_plano', 'cancelar']).optional(),
})

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const entrada = Entrada.safeParse(await req.json().catch(() => ({})))
    if (!entrada.success) return json({ error: 'Dados inválidos' }, 400)

    const admin = clienteAdmin()
    const auth = await autenticarRestaurante(req, admin, 'id, auth_user_id, assinatura_status, stripe_customer_id, stripe_subscription_id')
    if (auth.ok === false) return json({ error: auth.erro }, auth.status)
    const jwt = req.headers.get('Authorization')!.replace('Bearer ', '')
    if (await ehSessaoDemo(admin, jwt)) return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)

    const rest = auth.restaurante.linha
    let customerId: string | null = rest.stripe_customer_id ?? null
    if (!customerId) {
      const { data: cli } = await admin
        .from('stripe_clientes')
        .select('stripe_customer_id')
        .eq('restaurante_id', auth.restaurante.id)
        .maybeSingle()
      customerId = cli?.stripe_customer_id ?? null
    }
    if (!customerId) {
      return json({ error: 'Sua conta ainda não tem uma assinatura pelo Stripe.', sem_cliente: true }, 400)
    }

    const site = Deno.env.get('SITE_URL')?.replace(/\/+$/, '')
    if (!site) throw new Error('SITE_URL não configurada')

    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${site}/minha-conta`,
      locale: 'pt-BR',
    }
    const configuracao = Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID')
    if (configuracao) params.configuration = configuracao

    const subId: string | null = rest.stripe_subscription_id ?? null
    switch (entrada.data.fluxo) {
      case 'atualizar_cartao':
        params.flow_data = { type: 'payment_method_update' }
        break
      case 'trocar_plano':
        if (subId) params.flow_data = { type: 'subscription_update', subscription_update: { subscription: subId } }
        break
      case 'cancelar':
        if (subId) params.flow_data = { type: 'subscription_cancel', subscription_cancel: { subscription: subId } }
        break
    }

    const sessao = await stripe().billingPortal.sessions.create(params)
    return json({ url: sessao.url })
  } catch (e) {
    console.error('[create-portal-session]', (e as Error).message)
    return json({ error: 'Não foi possível abrir o portal agora. Tente de novo em instantes.' }, 500)
  }
})
