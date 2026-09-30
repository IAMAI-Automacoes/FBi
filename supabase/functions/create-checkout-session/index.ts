/**
 * create-checkout-session — abre o Stripe Checkout (modo subscription).
 *
 * Duas portas, uma função:
 *   - LANDING (sem conta): chamada com a chave anon. O pagamento vem antes da
 *     conta; a sessão volta para `/cadastro?sessao={CHECKOUT_SESSION_ID}` e o
 *     vínculo com a conta é feito depois por `vincular-compra`, que confere
 *     tudo no Stripe. Nada que o client mande aqui vira vínculo.
 *   - APP (conta sem plano, /assinatura): chamada com o JWT do usuário. O
 *     servidor grava `restaurante_id` na metadata da sessão e da assinatura —
 *     é dado de origem confiável (veio do JWT), então o webhook vincula sozinho.
 *
 * O client só diz o CICLO. O price é resolvido aqui pelo lookup_key; price ID
 * nunca transita pelo navegador e nunca fica fixo em código.
 *
 * Deploy: `supabase functions deploy create-checkout-session --no-verify-jwt`
 * (a função valida o JWT por conta própria quando ele existe).
 */
import { z } from 'npm:zod@4.3.6'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'
import Stripe, { stripe, LOOKUP_KEYS, PRODUCT_CODE, type Ciclo } from '../_shared/stripe/cliente.ts'
import { registrarCheckoutSession, upsertCliente } from '../_shared/stripe/sincronizar.ts'
import { siteUrl } from '../_shared/stripe/config.ts'

const Entrada = z.object({
  ciclo: z.enum(['mensal', 'semestral', 'anual']),
  /** Só na landing: pré-preenche o e-mail no Checkout. Opcional. */
  email: z.string().trim().email().max(254).optional(),
  /** Gerada pelo client (uuid) e reenviada no retry do MESMO clique: o Stripe
      devolve a mesma sessão em vez de criar duas. */
  chave_idempotencia: z.string().uuid().optional(),
  /** Código de indicação (`afiliados.codigo`): digitado pelo comprador ou
      preenchido pelo link `?ref=`. Validado aqui; inválido é erro, não
      silêncio — quem digitou espera que conte. */
  codigo_afiliado: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]{2,30}$/))
    .optional(),
})

const ROTULO: Record<Ciclo, string> = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }

async function priceDoCiclo(ciclo: Ciclo): Promise<Stripe.Price> {
  const lista = await stripe().prices.list({ lookup_keys: [LOOKUP_KEYS[ciclo]], active: true, limit: 1 })
  const price = lista.data[0]
  if (!price) throw new Error(`Nenhum price ativo com lookup_key ${LOOKUP_KEYS[ciclo]}`)
  return price
}

interface Comprador {
  restaurante_id: number
  auth_user_id: string
  email: string | null
  nome: string | null
  stripe_customer_id: string | null
}

/** JWT de usuário → restaurante. Chave anon (ou nada) → null = landing. */
// deno-lint-ignore no-explicit-any
async function identificarComprador(req: Request, admin: any): Promise<Comprador | null | 'demo'> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const jwt = auth.replace('Bearer ', '')
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) return null // chave anon: não é um usuário
  if (await ehSessaoDemo(admin, jwt)) return 'demo'

  const { data: rest } = await admin
    .from('restaurantes')
    .select('id, stripe_customer_id, nome_restaurante')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  if (!rest?.id) return null

  // O Customer pode já existir pelo espelho mesmo sem estar em `restaurantes`.
  let customerId: string | null = rest.stripe_customer_id ?? null
  if (!customerId) {
    const { data: cli } = await admin
      .from('stripe_clientes')
      .select('stripe_customer_id')
      .eq('restaurante_id', rest.id)
      .maybeSingle()
    customerId = cli?.stripe_customer_id ?? null
  }

  return {
    restaurante_id: Number(rest.id),
    auth_user_id: data.user.id,
    email: data.user.email ?? null,
    nome: rest.nome_restaurante ?? null,
    stripe_customer_id: customerId,
  }
}

/** Parâmetros que podem ser recusados conforme a configuração da conta
    (marca no Checkout exige upload; consentimento exige URL de termos no
    Dashboard). Se o Stripe recusar um deles, a sessão é recriada sem ele —
    perder o logo é aceitável, perder a venda não. */
const OPCIONAIS = ['branding_settings', 'consent_collection'] as const

async function criarSessao(
  params: Stripe.Checkout.SessionCreateParams,
  chave: string,
): Promise<Stripe.Checkout.Session> {
  let tentativa = { ...params }
  for (let i = 0; i <= OPCIONAIS.length; i++) {
    try {
      return await stripe().checkout.sessions.create(tentativa, { idempotencyKey: `${chave}-${i}` })
    } catch (e) {
      const erro = e as Stripe.errors.StripeError
      const param = (erro as { param?: string }).param ?? ''
      const opcional = OPCIONAIS.find((o) => param.startsWith(o))
      if (erro.type === 'StripeInvalidRequestError' && opcional && opcional in tentativa) {
        console.warn(`[create-checkout-session] ${opcional} recusado (${erro.message}); recriando sem ele`)
        const { [opcional]: _removido, ...resto } = tentativa
        tentativa = resto
        continue
      }
      throw e
    }
  }
  throw new Error('não foi possível criar a sessão')
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    const entrada = Entrada.safeParse(await req.json().catch(() => ({})))
    if (!entrada.success) return json({ error: 'Dados inválidos', detalhes: entrada.error.issues }, 400)
    const { ciclo, email, chave_idempotencia, codigo_afiliado } = entrada.data

    const admin = clienteAdmin()
    const comprador = await identificarComprador(req, admin)
    if (comprador === 'demo') return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)

    // Afiliado: o código é resolvido para o id AQUI; a metadata que segue
    // para o Stripe (e volta pelo webhook) nunca carrega texto do cliente.
    let afiliado: { id: string; codigo: string } | null = null
    if (codigo_afiliado) {
      const { data: af } = await admin
        .from('afiliados')
        .select('id, codigo')
        .eq('codigo', codigo_afiliado)
        .eq('ativo', true)
        .maybeSingle()
      if (!af) return json({ error: 'Código de indicação inválido.', codigo_afiliado_invalido: true }, 400)
      afiliado = { id: af.id, codigo: af.codigo }
    }

    const site = await siteUrl(admin)
    const price = await priceDoCiclo(ciclo)
    const chave = chave_idempotencia ?? crypto.randomUUID()

    const metadata: Record<string, string> = { product_code: PRODUCT_CODE, ciclo }
    if (comprador) {
      metadata.restaurante_id = String(comprador.restaurante_id)
      metadata.auth_user_id = comprador.auth_user_id
    }
    if (afiliado) {
      metadata.afiliado_id = afiliado.id
      metadata.afiliado_codigo = afiliado.codigo
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      // Cupons/códigos promocionais criados no Dashboard — desconto sem novo Price.
      allow_promotion_codes: true,
      locale: 'pt-BR',
      billing_address_collection: 'auto',
      metadata,
      subscription_data: {
        metadata,
        description: `EasyFeed — plano ${ROTULO[ciclo].toLowerCase()}`,
      },
      // Referência interna: restaurante (logado) ou a própria chave (landing).
      client_reference_id: comprador ? `restaurante_${comprador.restaurante_id}` : `landing_${chave}`,
      success_url: comprador
        ? `${site}/checkout/sucesso?sessao={CHECKOUT_SESSION_ID}`
        : `${site}/cadastro?sessao={CHECKOUT_SESSION_ID}`,
      cancel_url: comprador ? `${site}/assinatura` : `${site}/vendas#planos`,
      // Marca por sessão (API atual permite). Fica só com nome e cor: logo por
      // sessão exige arquivo enviado ao Stripe — ver docs/stripe/README.md.
      branding_settings: {
        display_name: 'EasyFeed',
        button_color: '#2563EB',
        border_style: 'rounded',
      },
      custom_text: {
        submit: { message: 'Assinatura do EasyFeed. Cancele quando quiser pelo painel.' },
      },
      consent_collection: { terms_of_service: 'required' },
    }

    if (comprador) {
      // Usuário logado: Customer nosso, com metadata desde o nascimento.
      let customerId = comprador.stripe_customer_id
      if (!customerId) {
        const cliente = await stripe().customers.create(
          {
            email: comprador.email ?? undefined,
            name: comprador.nome ?? undefined,
            preferred_locales: ['pt-BR'],
            metadata: { ...metadata },
          },
          { idempotencyKey: `customer-${comprador.restaurante_id}` },
        )
        customerId = cliente.id
        await upsertCliente(admin, cliente, { restaurante_id: comprador.restaurante_id })
      }
      params.customer = customerId
      params.customer_update = { name: 'auto', address: 'auto' }
    } else if (email) {
      params.customer_email = email
    }

    const sessao = await criarSessao(params, chave)

    // Espelho: `criada`. O webhook muda para `paga`; `vincular-compra` para
    // `vinculada`. Best-effort — se falhar, o webhook cria a linha depois.
    try {
      await registrarCheckoutSession(admin, sessao, 'criada')
    } catch (e) {
      console.warn('[create-checkout-session] espelho não gravado:', (e as Error).message)
    }

    if (!sessao.url) throw new Error('Stripe não devolveu a URL do Checkout')
    return json({ url: sessao.url, sessao_id: sessao.id })
  } catch (e) {
    const erro = e as Stripe.errors.StripeError & { type?: string }
    // Log sem dados do cliente: só o tipo e a mensagem do Stripe.
    console.error('[create-checkout-session]', erro.type ?? 'Error', erro.message)
    const publica =
      erro.type === 'StripeInvalidRequestError'
        ? 'Não foi possível iniciar o pagamento. Verifique os dados e tente novamente.'
        : 'Não foi possível iniciar o pagamento agora. Tente de novo em instantes.'
    return json({ error: publica }, 500)
  }
})
