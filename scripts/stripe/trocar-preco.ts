/**
 * trocar-preco.ts — muda o preço de um ciclo SEM deploy e sem mexer em código.
 *
 *   deno run -A scripts/stripe/trocar-preco.ts --ciclo=anual --valor=1764,00 [--dry-run] [--manter-antigo] [--portal=bpc_...]
 *
 * Por que é assim: no Stripe um Price é IMUTÁVEL (valor, moeda e recorrência
 * não mudam). Trocar preço = criar um Price novo e fazer o lookup_key apontar
 * para ele. Em um comando, atomicamente:
 *
 *   1. cria o Price novo com `lookup_key: easyfeed_<ciclo>` e
 *      `transfer_lookup_key: true` → o Stripe tira a chave do price antigo e
 *      põe no novo na MESMA operação (não existe janela sem chave);
 *   2. desativa o antigo (`active: false`) — ele não pode mais ser vendido,
 *      mas quem já assina nele continua sendo cobrado normalmente
 *      (grandfathering é o padrão; ver migrar-assinantes.ts para migrar);
 *   3. re-aponta a configuração do Customer Portal para os prices atuais,
 *      para "trocar de plano" no portal oferecer o preço novo.
 *
 * A landing (`get-prices`) e o checkout (`create-checkout-session`) leem por
 * lookup_key, então passam a usar o valor novo em até 5 minutos (cache).
 */
import {
  ajuda,
  args,
  brl,
  LOOKUP_KEY_POR_CICLO,
  priceAtual,
  PRODUCT_CODE,
  produtoEasyFeed,
  reaisParaCentavos,
  RECORRENCIA,
  sincronizarPortal,
  stripe,
  type Ciclo,
} from './_comum.ts'

const a = args()
if (a.help || !a.ciclo || !a.valor) {
  ajuda(`uso: trocar-preco.ts --ciclo=<mensal|semestral|anual> --valor=<reais> [--dry-run] [--manter-antigo] [--portal=bpc_...]

  --dry-run        mostra o plano, não altera nada
  --manter-antigo  não desativa o price antigo (segue vendável — raro)
  --portal         id da configuração do Customer Portal a sincronizar
                   (padrão: env STRIPE_PORTAL_CONFIGURATION_ID)`)
}

const ciclo = a.ciclo as Ciclo
if (!(ciclo in LOOKUP_KEY_POR_CICLO)) {
  console.error(`ciclo inválido: ${ciclo}`)
  Deno.exit(1)
}
const dry = Boolean(a['dry-run'])
const novoCentavos = reaisParaCentavos(a.valor)
const portalId = a.portal ?? Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') ?? null

const s = stripe()
const produto = await produtoEasyFeed(s)
if (!produto) {
  console.error('Product do EasyFeed não encontrado. Rode bootstrap.ts primeiro.')
  Deno.exit(1)
}

const antigo = await priceAtual(s, ciclo)
console.log(`\nCiclo ${ciclo} (${LOOKUP_KEY_POR_CICLO[ciclo]})`)
console.log(`  atual: ${antigo ? `${antigo.id} = ${brl(antigo.unit_amount)}` : '(nenhum price ativo)'}`)
console.log(`  novo:  ${brl(novoCentavos)}`)

if (antigo && antigo.unit_amount === novoCentavos && antigo.currency === 'brl') {
  console.log('\nMesmo valor: nada a fazer.')
  Deno.exit(0)
}

if (antigo) {
  const ativos = await s.subscriptions.list({ price: antigo.id, status: 'active', limit: 100 })
  const n = ativos.data.length + (ativos.has_more ? '+' : '')
  console.log(`  assinantes ativos no price atual: ${n} → continuam pagando ${brl(antigo.unit_amount)} (grandfathering)`)
  console.log(`  para migrá-los: migrar-assinantes.ts --de=${antigo.id} --para=${LOOKUP_KEY_POR_CICLO[ciclo]}`)
}

console.log(`\nPlano:`)
console.log(`  1. criar Price ${brl(novoCentavos)} ${RECORRENCIA[ciclo].interval}×${RECORRENCIA[ciclo].interval_count} com lookup_key=${LOOKUP_KEY_POR_CICLO[ciclo]} (transfer_lookup_key)`)
if (antigo && !a['manter-antigo']) console.log(`  2. desativar ${antigo.id}`)
console.log(`  3. ${portalId ? `sincronizar portal ${portalId}` : 'portal NÃO sincronizado (sem --portal / STRIPE_PORTAL_CONFIGURATION_ID)'}`)

if (dry) {
  console.log('\n(dry-run: nada foi alterado)')
  Deno.exit(0)
}

const novo = await s.prices.create(
  {
    product: produto.id,
    currency: 'brl',
    unit_amount: novoCentavos,
    recurring: RECORRENCIA[ciclo],
    lookup_key: LOOKUP_KEY_POR_CICLO[ciclo],
    transfer_lookup_key: true,
    nickname: `EasyFeed ${ciclo} ${brl(novoCentavos)}`,
    metadata: { product_code: PRODUCT_CODE, ciclo, substitui: antigo?.id ?? '' },
  },
  // Repetir o comando com o mesmo valor no mesmo dia não cria dois prices.
  { idempotencyKey: `easyfeed-troca-${ciclo}-${novoCentavos}-${new Date().toISOString().slice(0, 10)}` },
)
console.log(`\n✓ Price novo: ${novo.id}`)

if (antigo && !a['manter-antigo']) {
  await s.prices.update(antigo.id, { active: false })
  console.log(`✓ Price antigo desativado: ${antigo.id}`)
}

if (portalId) {
  await sincronizarPortal(s, portalId, false)
  console.log(`✓ Portal sincronizado`)
}

console.log(`\nA landing passa a mostrar ${brl(novoCentavos)} em até 5 min (cache do get-prices).`)
