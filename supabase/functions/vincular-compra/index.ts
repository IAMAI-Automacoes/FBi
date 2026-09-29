/**
 * vincular-compra — liga uma assinatura PAGA à conta recém-criada.
 *
 * É o único ponto onde "pagou na landing" vira "conta com plano ativo". Tudo
 * é conferido no servidor, contra o Stripe:
 *
 *   1. quem chama tem JWT válido (conta criada) e não é demonstração;
 *   2. a Checkout Session existe no Stripe, é do EasyFeed, está `complete` e
 *      `paid` (ou `no_payment_required`, cupom de 100%);
 *   3. o e-mail da conta é o e-mail que o pagador digitou no Checkout —
 *      quem tem só o link do retorno, mas não o e-mail, não leva a assinatura;
 *   4. a sessão ainda não foi usada: o UPDATE condicional
 *      `where restaurante_id_vinculado is null` é atômico — dois cadastros
 *      correndo com o mesmo session_id, só um passa;
 *   5. a assinatura não pertence a outro restaurante e este restaurante não
 *      tem outra assinatura Stripe ativa (evita dupla cobrança).
 *
 * Modo B (sem `sessao_id`): quem pagou e fechou a aba antes de criar a conta.
 * Procura assinatura pendente pelo e-mail da conta. Só é seguro se o e-mail
 * foi CONFIRMADO de verdade (Supabase Auth com "Confirm email" ligado); com
 * autoconfirm, qualquer um criaria uma conta com o e-mail do pagador e levaria
 * a assinatura. Por isso o modo B exige `STRIPE_VINCULO_POR_EMAIL=true`, que
 * só deve ser ligado junto com a confirmação de e-mail.
 *
 * Deploy: `supabase functions deploy vincular-compra` (JWT obrigatório).
 */
import { z } from 'npm:zod@4.3.6'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'
import { stripe, PRODUCT_CODE } from '../_shared/stripe/cliente.ts'
import { mesmoEmail } from '../_shared/stripe/mapeamento.ts'
import {
  marcarCustomerNoStripe,
  registrarCheckoutSession,
  sincronizarAssinatura,
  upsertCliente,
} from '../_shared/stripe/sincronizar.ts'

const Entrada = z.object({
  sessao_id: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,}$/).optional(),
})

// deno-lint-ignore no-explicit-any
type Db = any

function idDe(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

interface Conta {
  restaurante_id: number
  auth_user_id: string
  email: string
  email_confirmado: boolean
  assinatura_status: string | null
  stripe_subscription_id: string | null
}

async function contaDoJwt(req: Request, db: Db): Promise<Conta | { erro: string; status: number }> {
  const auth = req.headers.get('Authorization')
  if (!auth) return { erro: 'Autenticação obrigatória', status: 401 }
  const jwt = auth.replace('Bearer ', '')
  const { data, error } = await db.auth.getUser(jwt)
  if (error || !data?.user?.email) return { erro: 'Sessão inválida', status: 401 }
  if (await ehSessaoDemo(db, jwt)) return { erro: MENSAGEM_BLOQUEADO_NA_DEMO, status: 403 }

  const { data: rest } = await db
    .from('restaurantes')
    .select('id, assinatura_status, stripe_subscription_id')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  if (!rest?.id) return { erro: 'Restaurante não encontrado', status: 403 }

  return {
    restaurante_id: Number(rest.id),
    auth_user_id: data.user.id,
    email: data.user.email,
    email_confirmado: Boolean(data.user.email_confirmed_at),
    assinatura_status: rest.assinatura_status ?? null,
    stripe_subscription_id: rest.stripe_subscription_id ?? null,
  }
}

/** Garante que ligar ESTA assinatura a ESTE restaurante não cria conflito. */
async function conferirConflitos(db: Db, conta: Conta, subId: string): Promise<string | null> {
  const { data: existente } = await db
    .from('stripe_assinaturas')
    .select('restaurante_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle()
  if (existente?.restaurante_id && existente.restaurante_id !== conta.restaurante_id) {
    return 'Esta compra já está ligada a outra conta.'
  }
  if (
    conta.assinatura_status === 'ativa' &&
    conta.stripe_subscription_id &&
    conta.stripe_subscription_id !== subId
  ) {
    return 'Sua conta já tem uma assinatura ativa. Fale com o suporte para ajustar.'
  }
  return null
}

async function efetivarVinculo(db: Db, conta: Conta, customerId: string, subId: string) {
  await upsertCliente(db, customerId, { restaurante_id: conta.restaurante_id, email: conta.email })
  await marcarCustomerNoStripe(customerId, {
    restaurante_id: String(conta.restaurante_id),
    auth_user_id: conta.auth_user_id,
  })
  try {
    await stripe().subscriptions.update(subId, {
      metadata: { product_code: PRODUCT_CODE, restaurante_id: String(conta.restaurante_id), auth_user_id: conta.auth_user_id },
    })
  } catch (e) {
    console.warn('[vincular-compra] metadata da assinatura não atualizada:', (e as Error).message)
  }
  return await sincronizarAssinatura(db, subId, conta.restaurante_id)
}

// ── Modo A: com session_id ───────────────────────────────────────────────
async function vincularPorSessao(db: Db, conta: Conta, sessaoId: string) {
  let sessao
  try {
    sessao = await stripe().checkout.sessions.retrieve(sessaoId)
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return json({ error: 'Pagamento não encontrado.' }, 404)
    throw e
  }

  if (sessao.mode !== 'subscription') return json({ error: 'Pagamento não encontrado.' }, 404)
  const code = sessao.metadata?.product_code
  if (code && code !== PRODUCT_CODE) return json({ error: 'Pagamento não encontrado.' }, 404)

  const paga =
    sessao.status === 'complete' &&
    (sessao.payment_status === 'paid' || sessao.payment_status === 'no_payment_required')
  if (sessao.status === 'expired') return json({ error: 'Esta sessão de pagamento expirou.' }, 410)
  if (!paga) return json({ error: 'O pagamento ainda não foi confirmado.', pendente: true }, 409)

  const emailPagador = sessao.customer_details?.email ?? sessao.customer_email ?? null
  if (!mesmoEmail(emailPagador, conta.email)) {
    // Não revela o e-mail do pagador.
    return json({ error: 'Crie a conta com o mesmo e-mail usado no pagamento.', email_diferente: true }, 403)
  }

  const subId = idDe(sessao.subscription)
  const customerId = idDe(sessao.customer)
  if (!subId || !customerId) return json({ error: 'Pagamento sem assinatura associada.' }, 409)

  const conflito = await conferirConflitos(db, conta, subId)
  if (conflito) return json({ error: conflito }, 409)

  // Garante a linha (webhook pode não ter chegado) e reserva atomicamente.
  await registrarCheckoutSession(db, sessao, 'paga')
  const { data: reservada } = await db
    .from('stripe_checkout_sessions')
    .update({
      restaurante_id_vinculado: conta.restaurante_id,
      vinculada_em: new Date().toISOString(),
      status: 'vinculada',
    })
    .eq('stripe_session_id', sessao.id)
    .is('restaurante_id_vinculado', null)
    .select('id')

  if (!reservada?.length) {
    const { data: atual } = await db
      .from('stripe_checkout_sessions')
      .select('restaurante_id_vinculado')
      .eq('stripe_session_id', sessao.id)
      .maybeSingle()
    if (atual?.restaurante_id_vinculado === conta.restaurante_id) {
      // Mesma conta repetindo (recarregou a página): idempotente.
      const r = await sincronizarAssinatura(db, subId, conta.restaurante_id)
      return json({ ok: true, ja_vinculada: true, status: r.status, ciclo: r.ciclo })
    }
    return json({ error: 'Este pagamento já foi usado em outra conta.' }, 409)
  }

  const r = await efetivarVinculo(db, conta, customerId, subId)
  return json({ ok: true, status: r.status, ciclo: r.ciclo })
}

// ── Modo B: pelo e-mail confirmado ───────────────────────────────────────
async function vincularPorEmail(db: Db, conta: Conta) {
  if (Deno.env.get('STRIPE_VINCULO_POR_EMAIL') !== 'true') {
    return json({ error: 'Abra o link do e-mail de confirmação do pagamento para ligar sua compra.' }, 400)
  }
  if (!conta.email_confirmado) return json({ error: 'Confirme seu e-mail antes de ligar a compra.' }, 403)

  const { data: cliente } = await db
    .from('stripe_clientes')
    .select('stripe_customer_id')
    .ilike('email', conta.email.replace(/[%_]/g, '\\$&'))
    .is('restaurante_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!cliente) return json({ error: 'Nenhum pagamento pendente para este e-mail.' }, 404)

  const { data: pendentes } = await db
    .from('stripe_assinaturas')
    .select('stripe_subscription_id')
    .eq('stripe_customer_id', cliente.stripe_customer_id)
    .is('restaurante_id', null)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
  const subId: string | undefined = pendentes?.[0]?.stripe_subscription_id
  if (!subId) return json({ error: 'Nenhum pagamento pendente para este e-mail.' }, 404)

  const conflito = await conferirConflitos(db, conta, subId)
  if (conflito) return json({ error: conflito }, 409)

  // Reserva atômica na assinatura (não há sessão em mãos).
  const { data: reservada } = await db
    .from('stripe_assinaturas')
    .update({ restaurante_id: conta.restaurante_id })
    .eq('stripe_subscription_id', subId)
    .is('restaurante_id', null)
    .select('id')
  if (!reservada?.length) return json({ error: 'Este pagamento já foi usado em outra conta.' }, 409)

  await db
    .from('stripe_checkout_sessions')
    .update({ restaurante_id_vinculado: conta.restaurante_id, vinculada_em: new Date().toISOString(), status: 'vinculada' })
    .eq('stripe_subscription_id', subId)
    .is('restaurante_id_vinculado', null)

  const r = await efetivarVinculo(db, conta, cliente.stripe_customer_id, subId)
  return json({ ok: true, status: r.status, ciclo: r.ciclo })
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const entrada = Entrada.safeParse(await req.json().catch(() => ({})))
    if (!entrada.success) return json({ error: 'Dados inválidos' }, 400)

    const db = clienteAdmin()
    const conta = await contaDoJwt(req, db)
    if ('erro' in conta) return json({ error: conta.erro }, conta.status)

    return entrada.data.sessao_id
      ? await vincularPorSessao(db, conta, entrada.data.sessao_id)
      : await vincularPorEmail(db, conta)
  } catch (e) {
    console.error('[vincular-compra]', (e as Error).message)
    return json({ error: 'Não foi possível ligar o pagamento à conta agora. Tente de novo em instantes.' }, 500)
  }
})
