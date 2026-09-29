/**
 * consultar-compra — estado de uma Checkout Session, para a tela de cadastro
 * pós-pagamento pré-preencher o e-mail e mostrar "pagamento confirmado".
 *
 * Pública (sem JWT): quem chega em `/cadastro?sessao=cs_...` ainda não tem
 * conta. O `cs_...` é a prova de posse — só o navegador que concluiu o
 * Checkout recebe esse id (é longo e imprevisível). Mesmo assim, a resposta é
 * mínima: e-mail do pagador, ciclo e estado. Nada de valores, nem IDs de
 * customer/subscription.
 *
 * Esta função NÃO vincula nada. O vínculo é em `vincular-compra`, com JWT.
 *
 * Deploy: `supabase functions deploy consultar-compra --no-verify-jwt`
 */
import { z } from 'npm:zod@4.3.6'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { stripe, PRODUCT_CODE } from '../_shared/stripe/cliente.ts'

const Entrada = z.object({
  sessao_id: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,}$/),
})

export type EstadoCompra = 'paga' | 'pendente' | 'vinculada' | 'expirada' | 'nao_encontrada'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const entrada = Entrada.safeParse(await req.json().catch(() => ({})))
  if (!entrada.success) return json({ estado: 'nao_encontrada' satisfies EstadoCompra }, 200)
  const { sessao_id } = entrada.data

  try {
    const db = clienteAdmin()
    const { data: espelho } = await db
      .from('stripe_checkout_sessions')
      .select('status, email_pagador, ciclo')
      .eq('stripe_session_id', sessao_id)
      .maybeSingle()

    if (espelho?.status === 'vinculada') {
      return json({ estado: 'vinculada' satisfies EstadoCompra, email: espelho.email_pagador, ciclo: espelho.ciclo })
    }

    let sessao
    try {
      sessao = await stripe().checkout.sessions.retrieve(sessao_id)
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) {
        return json({ estado: 'nao_encontrada' satisfies EstadoCompra })
      }
      throw e
    }

    if (sessao.mode !== 'subscription') return json({ estado: 'nao_encontrada' satisfies EstadoCompra })
    const code = sessao.metadata?.product_code
    if (code && code !== PRODUCT_CODE) return json({ estado: 'nao_encontrada' satisfies EstadoCompra })

    const email = sessao.customer_details?.email ?? sessao.customer_email ?? null
    const ciclo = sessao.metadata?.ciclo ?? espelho?.ciclo ?? null

    let estado: EstadoCompra
    if (sessao.status === 'expired') estado = 'expirada'
    else if (
      sessao.status === 'complete' &&
      (sessao.payment_status === 'paid' || sessao.payment_status === 'no_payment_required')
    ) {
      estado = 'paga'
    } else estado = 'pendente'

    return json({ estado, email, ciclo })
  } catch (e) {
    console.error('[consultar-compra]', (e as Error).message)
    return json({ error: 'Não foi possível consultar o pagamento agora.' }, 500)
  }
})
