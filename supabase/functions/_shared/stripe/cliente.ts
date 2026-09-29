/**
 * Cliente Stripe das edge functions (Deno).
 *
 * Um único lugar decide a versão da API e o transporte. Versão FIXA: o SDK
 * 22.6.2 foi gerado para `2026-08-26.dahlia`, e fixar aqui garante que uma
 * mudança de versão padrão da conta no Dashboard não altere o formato dos
 * objetos que este código lê (ex.: `current_period_end` mora no item da
 * assinatura desde a `2025-03-31.basil`, não mais na assinatura).
 *
 * Segredos só via `Deno.env` — nunca chegam ao bundle do frontend.
 */
import Stripe from 'npm:stripe@22.6.2'

export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const

/** Marca de produto em toda entidade criada (Customer, Subscription,
    Checkout Session, Product). Hoje só existe EasyFeed; a marca é o que
    permite, mais tarde, outro produto na mesma conta Stripe da IAMAI. */
export const PRODUCT_CODE = 'easyfeed' as const

export type Ciclo = 'mensal' | 'semestral' | 'anual'

export const CICLOS: readonly Ciclo[] = ['mensal', 'semestral', 'anual'] as const

/** lookup_keys são a ÚNICA referência de preço no código. O price ID por trás
    de cada uma muda a cada troca de preço (script `trocar-preco.ts`). */
export const LOOKUP_KEYS: Record<Ciclo, string> = {
  mensal: 'easyfeed_mensal',
  semestral: 'easyfeed_semestral',
  anual: 'easyfeed_anual',
}

export function ehCiclo(v: unknown): v is Ciclo {
  return v === 'mensal' || v === 'semestral' || v === 'anual'
}

let instancia: Stripe | null = null

/** Lança se `STRIPE_SECRET_KEY` não estiver configurada — melhor falhar alto
    na primeira chamada do que criar sessões com chave vazia. */
export function stripe(): Stripe {
  if (instancia) return instancia
  const chave = Deno.env.get('STRIPE_SECRET_KEY')
  if (!chave) throw new Error('STRIPE_SECRET_KEY não configurada')
  instancia = new Stripe(chave, {
    apiVersion: STRIPE_API_VERSION,
    // Deno não tem o módulo `http` do Node: o SDK precisa do transporte fetch.
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    appInfo: { name: 'EasyFeed', version: '1.0.0' },
  })
  return instancia
}

/** Provider de crypto para `webhooks.constructEventAsync` no Deno (SubtleCrypto). */
export function cryptoProvider() {
  return Stripe.createSubtleCryptoProvider()
}

export type { Stripe }
export default Stripe
