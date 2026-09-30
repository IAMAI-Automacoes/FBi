/**
 * Base dos scripts locais do Stripe (rodam na SUA máquina, com a chave secreta).
 *
 *   deno run -A --env-file=.env.stripe scripts/stripe/<script>.ts ...
 *
 * O `scripts/stripe/deno.json` (nodeModulesDir: none) evita que o Deno procure
 * `npm:stripe` no node_modules do frontend. Se rodar de outra pasta e o erro
 * voltar, passe `--node-modules-dir=none`.
 *
 * Mesma versão de API das edge functions: um price/produto criado aqui é lido
 * lá com o mesmo formato.
 */
import Stripe from 'npm:stripe@22.6.2'
import { parseArgs } from 'jsr:@std/cli@1/parse-args'
import {
  cicloDoPrice,
  LOOKUP_KEY_POR_CICLO,
  validarDescritor,
  type Ciclo,
} from '../../supabase/functions/_shared/stripe/mapeamento.ts'

export { cicloDoPrice, LOOKUP_KEY_POR_CICLO, validarDescritor, type Ciclo, Stripe }

export const API_VERSION = '2026-08-26.dahlia' as const
export const PRODUCT_CODE = 'easyfeed' as const
export const CICLOS: Ciclo[] = ['mensal', 'semestral', 'anual']
export const RECORRENCIA: Record<Ciclo, { interval: 'month' | 'year'; interval_count: number }> = {
  mensal: { interval: 'month', interval_count: 1 },
  semestral: { interval: 'month', interval_count: 6 },
  anual: { interval: 'year', interval_count: 1 },
}

export function args() {
  return parseArgs(Deno.args, {
    boolean: ['dry-run', 'manter-antigo', 'criar', 'help', 'sim'],
    string: ['ciclo', 'valor', 'mensal', 'semestral', 'anual', 'descritor', 'id', 'portal', 'de', 'para', 'proration', 'site', 'termos', 'privacidade', 'headline'],
    alias: { n: 'dry-run', h: 'help' },
  })
}

export function stripe(): Stripe {
  const chave = Deno.env.get('STRIPE_SECRET_KEY')
  if (!chave) {
    console.error('Defina STRIPE_SECRET_KEY (sk_test_... para testar, sk_live_... para valer).')
    Deno.exit(2)
  }
  const modo = chave.startsWith('sk_live') ? 'LIVE' : 'test'
  console.log(`Stripe: modo ${modo}, API ${API_VERSION}`)
  return new Stripe(chave, { apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient() })
}

/** "197", "197,90", "1.002,00", "1002.00" → centavos inteiros. */
export function reaisParaCentavos(v: string): number {
  const limpo = v.trim().replace(/^R\$\s*/i, '')
  const normalizado = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '')
  const n = Number(normalizado)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`valor inválido: "${v}"`)
  return Math.round(n * 100)
}

export function brl(centavos: number | null | undefined): string {
  if (typeof centavos !== 'number') return '—'
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** O Product do EasyFeed, achado pela metadata (nunca por id fixo).
    Usa `list` e não `search`: a busca do Stripe é indexada com atraso de
    alguns segundos, e um produto recém-criado pelo bootstrap não aparecia. */
export async function produtoEasyFeed(s: Stripe): Promise<Stripe.Product | null> {
  for await (const p of s.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.product_code === PRODUCT_CODE) return p
  }
  return null
}

/** Price ATIVO que hoje responde pelo lookup_key do ciclo. */
export async function priceAtual(s: Stripe, ciclo: Ciclo): Promise<Stripe.Price | null> {
  const r = await s.prices.list({ lookup_keys: [LOOKUP_KEY_POR_CICLO[ciclo]], active: true, limit: 1 })
  return r.data[0] ?? null
}

export async function pricesAtuais(s: Stripe): Promise<Record<Ciclo, Stripe.Price | null>> {
  const saida = { mensal: null, semestral: null, anual: null } as Record<Ciclo, Stripe.Price | null>
  for (const c of CICLOS) saida[c] = await priceAtual(s, c)
  return saida
}

/**
 * Re-aponta a configuração do Customer Portal para os prices atuais dos três
 * lookup_keys. O portal lista price IDs explícitos, então toda troca de preço
 * precisa passar por aqui — senão "trocar de plano" no portal oferece o preço
 * antigo (ou nenhum, se o antigo foi desativado).
 */
export async function sincronizarPortal(s: Stripe, configId: string, dryRun: boolean): Promise<void> {
  const produto = await produtoEasyFeed(s)
  if (!produto) throw new Error('Product do EasyFeed não encontrado (rode bootstrap.ts).')
  const atuais = await pricesAtuais(s)
  const ids = CICLOS.map((c) => atuais[c]?.id).filter((x): x is string => Boolean(x))
  console.log(`Portal ${configId}: prices ${ids.join(', ')}`)
  if (dryRun) return
  await s.billingPortal.configurations.update(configId, {
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: [{ product: produto.id, prices: ids }],
        // Trocar de ciclo cobra a diferença na hora (crédito do que sobrou do
        // ciclo atual + novo ciclo), em vez de empurrar para a próxima fatura.
        proration_behavior: 'always_invoice',
      },
    },
  })
}

export function ajuda(texto: string): never {
  console.log(texto)
  Deno.exit(0)
}
