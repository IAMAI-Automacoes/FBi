/**
 * configurar-portal.ts — configuração PRÓPRIA do Customer Portal do EasyFeed.
 *
 *   criar:      deno run -A scripts/stripe/configurar-portal.ts --criar --site=https://easyfeed.com.br
 *   atualizar:  deno run -A scripts/stripe/configurar-portal.ts --id=bpc_... --site=https://easyfeed.com.br
 *   opções:     --headline="..." --termos=<url> --privacidade=<url> [--dry-run]
 *
 * O portal tem configurações por CONTA; a padrão seria a da IAMAI. Esta é a do
 * EasyFeed: headline, links de termos/privacidade, e o que o cliente pode
 * fazer (trocar ciclo entre os três prices atuais, atualizar cartão, cancelar
 * no fim do período, ver faturas). O id impresso no fim vai na secret
 * `STRIPE_PORTAL_CONFIGURATION_ID` da edge function `create-portal-session`.
 *
 * `trocar-preco.ts` chama `sincronizarPortal` para manter a lista de prices.
 */
import { ajuda, args, CICLOS, pricesAtuais, produtoEasyFeed, sincronizarPortal, stripe } from './_comum.ts'

const a = args()
if (a.help || (!a.criar && !a.id)) {
  ajuda(`uso: configurar-portal.ts (--criar | --id=bpc_...) --site=https://easyfeed.com.br [--headline=...] [--termos=url] [--privacidade=url] [--dry-run]`)
}

const dry = Boolean(a['dry-run'])
const site = (a.site ?? Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '')
if (!site) {
  console.error('informe --site=https://... (ou SITE_URL)')
  Deno.exit(1)
}
const termos = a.termos ?? `${site}/termos`
const privacidade = a.privacidade ?? `${site}/privacidade`
const headline = a.headline ?? 'EasyFeed — gerencie sua assinatura'

const s = stripe()
const produto = await produtoEasyFeed(s)
if (!produto) {
  console.error('Product do EasyFeed não encontrado. Rode bootstrap.ts primeiro.')
  Deno.exit(1)
}
const atuais = await pricesAtuais(s)
const ids = CICLOS.map((c) => atuais[c]?.id).filter((x): x is string => Boolean(x))
if (ids.length === 0) {
  console.error('nenhum price ativo; rode bootstrap.ts')
  Deno.exit(1)
}

const params = {
  business_profile: {
    headline,
    terms_of_service_url: termos,
    privacy_policy_url: privacidade,
  },
  default_return_url: `${site}/minha-conta`,
  features: {
    customer_update: {
      enabled: true,
      allowed_updates: ['email', 'name', 'address', 'phone', 'tax_id'] as const,
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      // Mantém acesso até o fim do período pago — mesma regra do botão do painel.
      mode: 'at_period_end' as const,
      proration_behavior: 'none' as const,
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'customer_service', 'too_complex', 'low_quality', 'other'] as const,
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'] as const,
      products: [{ product: produto.id, prices: ids }],
      proration_behavior: 'always_invoice' as const,
    },
  },
  metadata: { product_code: 'easyfeed' },
}

console.log(JSON.stringify(params, null, 2))
if (dry) {
  console.log('\n(dry-run: nada foi alterado)')
  Deno.exit(0)
}

if (a.criar) {
  const cfg = await s.billingPortal.configurations.create(params)
  console.log(`\n✓ Configuração criada: ${cfg.id}`)
  console.log(`  supabase secrets set STRIPE_PORTAL_CONFIGURATION_ID=${cfg.id}`)
} else {
  await s.billingPortal.configurations.update(a.id!, params)
  await sincronizarPortal(s, a.id!, false)
  console.log(`\n✓ Configuração ${a.id} atualizada`)
}
