/**
 * Espelha objetos do Stripe nas tabelas `stripe_*` e projeta o resultado em
 * `restaurantes` (via `aplicar_assinatura_stripe`).
 *
 * Regra de ouro: quem chama já validou a origem (webhook com assinatura
 * conferida, ou consulta direta ao Stripe com a chave secreta). Nada aqui
 * confia em dado que veio do navegador.
 *
 * Sempre RE-LÊ a assinatura no Stripe em vez de usar o objeto do evento:
 * eventos chegam fora de ordem (um `updated` antigo pode chegar depois do
 * `deleted`), e o objeto atual é a única verdade. Custa uma chamada por
 * evento; vale a robustez.
 */
import type { Stripe } from './cliente.ts'
import { stripe, PRODUCT_CODE } from './cliente.ts'
import { cicloDoPrice, isoDe } from './mapeamento.ts'

// O client do Supabase não é tipado neste projeto (ver auth.ts).
// deno-lint-ignore no-explicit-any
type Db = any

function idDe(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/** Garante a linha do Customer. Não sobrescreve `restaurante_id` já gravado. */
export async function upsertCliente(
  db: Db,
  cliente: Stripe.Customer | Stripe.DeletedCustomer | string,
  extras: { restaurante_id?: number | null; email?: string | null } = {},
): Promise<string> {
  const id = typeof cliente === 'string' ? cliente : cliente.id
  const objeto = typeof cliente === 'string' ? null : cliente
  const email = extras.email ?? (objeto && !objeto.deleted ? objeto.email : null) ?? null
  const nome = objeto && !objeto.deleted ? objeto.name ?? null : null

  const { data: existente } = await db
    .from('stripe_clientes')
    .select('id, restaurante_id')
    .eq('stripe_customer_id', id)
    .maybeSingle()

  const linha: Record<string, unknown> = {
    stripe_customer_id: id,
    product_code: PRODUCT_CODE,
  }
  if (email) linha.email = email
  if (nome) linha.nome = nome
  if (extras.restaurante_id != null) linha.restaurante_id = extras.restaurante_id

  if (existente) {
    const { error } = await db.from('stripe_clientes').update(linha).eq('stripe_customer_id', id)
    if (error) throw new Error(`stripe_clientes update: ${error.message}`)
  } else {
    const { error } = await db.from('stripe_clientes').insert(linha)
    if (error && String(error.code) !== '23505') throw new Error(`stripe_clientes insert: ${error.message}`)
  }
  return id
}

/** Marca o Customer no Stripe com product_code e o restaurante (best-effort:
    metadata é conveniência de auditoria, não fonte da verdade). */
export async function marcarCustomerNoStripe(
  customerId: string,
  metadata: Record<string, string>,
): Promise<void> {
  try {
    await stripe().customers.update(customerId, {
      metadata: { product_code: PRODUCT_CODE, ...metadata },
    })
  } catch (e) {
    console.warn('[stripe] metadata do customer não atualizada:', (e as Error).message)
  }
}

export interface AssinaturaSincronizada {
  stripe_subscription_id: string
  stripe_customer_id: string
  restaurante_id: number | null
  status: string
  ciclo: string | null
}

/**
 * Busca a assinatura atual no Stripe e grava o espelho. Devolve a linha
 * gravada. `restauranteId` (quando conhecido pelo chamador — vínculo recém
 * confirmado ou metadata definida pelo servidor) é aplicado; caso contrário
 * preserva o que já estava no banco.
 */
export async function sincronizarAssinatura(
  db: Db,
  subscriptionId: string,
  restauranteId?: number | null,
): Promise<AssinaturaSincronizada> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'latest_invoice'],
  })

  const customerId = idDe(sub.customer)
  if (!customerId) throw new Error(`assinatura ${sub.id} sem customer`)
  await upsertCliente(db, customerId)

  const item = sub.items.data[0]
  const price = item?.price ?? null
  const ciclo = price
    ? cicloDoPrice({
        id: price.id,
        lookup_key: price.lookup_key,
        recurring: price.recurring,
        metadata: price.metadata,
      })
    : null

  // Metadata gravada pelo servidor em `subscription_data.metadata` na criação
  // da sessão — só existe quando a compra veio de um usuário logado.
  const restauranteDaMetadata = sub.metadata?.restaurante_id
    ? Number(sub.metadata.restaurante_id)
    : null
  // Afiliado que indicou (validado pelo servidor na criação da sessão).
  const afiliadoId = sub.metadata?.afiliado_id && /^[0-9a-f-]{36}$/.test(sub.metadata.afiliado_id)
    ? sub.metadata.afiliado_id
    : null

  const { data: existente } = await db
    .from('stripe_assinaturas')
    .select('restaurante_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()

  const restaurante_id =
    restauranteId ?? existente?.restaurante_id ?? (Number.isFinite(restauranteDaMetadata) ? restauranteDaMetadata : null)

  const invoice =
    sub.latest_invoice && typeof sub.latest_invoice !== 'string' ? sub.latest_invoice : null

  const linha = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    restaurante_id,
    status: sub.status,
    ciclo,
    stripe_price_id: price?.id ?? null,
    price_lookup_key: price?.lookup_key ?? null,
    // Desde a API basil o período mora no item, não na assinatura.
    current_period_start: isoDe(item?.current_period_start),
    current_period_end: isoDe(item?.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    cancel_at: isoDe(sub.cancel_at),
    canceled_at: isoDe(sub.canceled_at),
    ended_at: isoDe(sub.ended_at),
    trial_end: isoDe(sub.trial_end),
    ultimo_invoice_id: invoice?.id ?? idDe(sub.latest_invoice as string | null),
    ultimo_invoice_status: invoice?.status ?? null,
    product_code: sub.metadata?.product_code ?? PRODUCT_CODE,
    metadata: sub.metadata ?? {},
    ...(afiliadoId ? { afiliado_id: afiliadoId } : {}),
  }

  const { error } = await db
    .from('stripe_assinaturas')
    .upsert(linha, { onConflict: 'stripe_subscription_id' })
  if (error) throw new Error(`stripe_assinaturas upsert: ${error.message}`)

  if (restaurante_id != null) {
    await upsertCliente(db, customerId, { restaurante_id })
    await projetarNoRestaurante(db, restaurante_id)
  }

  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    restaurante_id,
    status: sub.status,
    ciclo,
  }
}

/** Recalcula as colunas de assinatura do restaurante (função SQL). */
export async function projetarNoRestaurante(db: Db, restauranteId: number): Promise<void> {
  const { error } = await db.rpc('aplicar_assinatura_stripe', { p_restaurante_id: restauranteId })
  if (error) throw new Error(`aplicar_assinatura_stripe: ${error.message}`)
}

/** Grava/atualiza a sessão de checkout no espelho. */
export async function registrarCheckoutSession(
  db: Db,
  sessao: Stripe.Checkout.Session,
  status: 'criada' | 'paga' | 'vinculada' | 'expirada',
): Promise<void> {
  // Nunca regride: um `checkout.session.completed` que chega DEPOIS de a
  // conta já ter sido vinculada não pode reabrir a sessão para novo vínculo.
  const { data: atual } = await db
    .from('stripe_checkout_sessions')
    .select('status')
    .eq('stripe_session_id', sessao.id)
    .maybeSingle()
  if (atual?.status === 'vinculada') status = 'vinculada'

  const linha: Record<string, unknown> = {
    stripe_session_id: sessao.id,
    stripe_customer_id: idDe(sessao.customer),
    stripe_subscription_id: idDe(sessao.subscription),
    email_pagador: sessao.customer_details?.email ?? sessao.customer_email ?? null,
    ciclo: sessao.metadata?.ciclo ?? null,
    restaurante_id_origem: sessao.metadata?.restaurante_id ? Number(sessao.metadata.restaurante_id) : null,
    status,
  }
  const { error } = await db
    .from('stripe_checkout_sessions')
    .upsert(linha, { onConflict: 'stripe_session_id' })
  if (error) throw new Error(`stripe_checkout_sessions upsert: ${error.message}`)
}

/**
 * Espelha uma fatura em `stripe_faturas`. Devolve o id da linha.
 *
 * `restaurante_id` vem da assinatura já espelhada (que por sua vez vem do
 * vínculo confirmado); uma fatura de assinatura ainda sem dono fica com
 * restaurante nulo e é corrigida na próxima sincronização.
 */
export async function sincronizarFatura(db: Db, fatura: Stripe.Invoice): Promise<string> {
  const subId = idDe(fatura.parent?.subscription_details?.subscription)
  let restauranteId: number | null = null
  if (subId) {
    const { data: ass } = await db
      .from('stripe_assinaturas')
      .select('restaurante_id')
      .eq('stripe_subscription_id', subId)
      .maybeSingle()
    restauranteId = ass?.restaurante_id ?? null
  }

  // Desde a API basil a cobrança mora em `payments`; o charge é a origem das
  // transferências de comissão.
  const pagamento = fatura.payments?.data?.find((p) => p.status === 'paid') ?? fatura.payments?.data?.[0]
  const chargeId = idDe(pagamento?.payment?.charge as string | { id: string } | null | undefined)

  const linha = {
    stripe_invoice_id: fatura.id,
    stripe_subscription_id: subId,
    stripe_customer_id: idDe(fatura.customer),
    restaurante_id: restauranteId,
    numero: fatura.number ?? null,
    status: fatura.status ?? 'draft',
    billing_reason: fatura.billing_reason ?? null,
    moeda: (fatura.currency ?? 'brl').toLowerCase(),
    total_centavos: fatura.total ?? 0,
    pago_centavos: fatura.amount_paid ?? 0,
    periodo_inicio: isoDe(fatura.period_start),
    periodo_fim: isoDe(fatura.period_end),
    pago_em: isoDe(fatura.status_transitions?.paid_at),
    hosted_invoice_url: fatura.hosted_invoice_url ?? null,
    invoice_pdf: fatura.invoice_pdf ?? null,
    stripe_charge_id: chargeId,
  }

  const { data, error } = await db
    .from('stripe_faturas')
    .upsert(linha, { onConflict: 'stripe_invoice_id' })
    .select('id')
    .single()
  if (error) throw new Error(`stripe_faturas upsert: ${error.message}`)
  return data.id as string
}
