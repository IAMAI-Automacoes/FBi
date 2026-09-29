/**
 * bootstrap.ts — cria (uma vez) o Product do EasyFeed e os três Prices.
 *
 *   deno run -A scripts/stripe/bootstrap.ts --mensal=197 --semestral=1002 --anual=1764 [--descritor=EASYFEED] [--dry-run]
 *
 * Idempotente: se o Product já existe (metadata product_code=easyfeed) e um
 * lookup_key já tem price ativo, pula. Os VALORES são só o ponto de partida —
 * para mudar depois use `trocar-preco.ts`; nunca edite código.
 *
 * O descritor da fatura de cartão (`statement_descriptor` do Product) é o que
 * aparece junto do prefixo curto da conta ("IAMAI* EASYFEED"). Regras do
 * Stripe: até 22 caracteres, ao menos uma letra, sem < > \ " ', vira
 * maiúsculas, acentos são removidos. Ver docs/stripe/README.md.
 */
import {
  ajuda,
  args,
  brl,
  CICLOS,
  LOOKUP_KEY_POR_CICLO,
  priceAtual,
  PRODUCT_CODE,
  produtoEasyFeed,
  reaisParaCentavos,
  RECORRENCIA,
  stripe,
  validarDescritor,
} from './_comum.ts'

const a = args()
if (a.help) {
  ajuda(`uso: bootstrap.ts --mensal=197 --semestral=1002 --anual=1764 [--descritor=EASYFEED] [--dry-run]`)
}

const dry = Boolean(a['dry-run'])
const descritorBruto = a.descritor ?? 'EASYFEED'
const descritor = validarDescritor(descritorBruto)
if (!descritor.ok) {
  console.error(`Descritor "${descritorBruto}" inválido: ${descritor.motivo}`)
  Deno.exit(1)
}

const s = stripe()

let produto = await produtoEasyFeed(s)
if (produto) {
  console.log(`Product já existe: ${produto.id} (${produto.name})`)
} else {
  console.log(`Criar Product "EasyFeed" com statement_descriptor=${descritor.normalizado}`)
  if (!dry) {
    produto = await s.products.create(
      {
        name: 'EasyFeed',
        description: 'Plataforma de feedback para restaurantes: QR code, WhatsApp e insights de IA.',
        statement_descriptor: descritor.normalizado,
        metadata: { product_code: PRODUCT_CODE },
      },
      { idempotencyKey: `easyfeed-product-v1` },
    )
    console.log(`  → ${produto.id}`)
  }
}

for (const ciclo of CICLOS) {
  const valor = a[ciclo]
  const existente = await priceAtual(s, ciclo)
  if (existente) {
    console.log(`${ciclo}: já existe ${existente.id} = ${brl(existente.unit_amount)} (lookup_key ${existente.lookup_key})`)
    continue
  }
  if (!valor) {
    console.log(`${ciclo}: sem --${ciclo}=<valor>, pulando`)
    continue
  }
  const centavos = reaisParaCentavos(valor)
  console.log(`${ciclo}: criar price ${brl(centavos)} (${LOOKUP_KEY_POR_CICLO[ciclo]})`)
  if (dry || !produto) continue
  const price = await s.prices.create(
    {
      product: produto.id,
      currency: 'brl',
      unit_amount: centavos,
      recurring: RECORRENCIA[ciclo],
      lookup_key: LOOKUP_KEY_POR_CICLO[ciclo],
      transfer_lookup_key: true,
      nickname: `EasyFeed ${ciclo}`,
      metadata: { product_code: PRODUCT_CODE, ciclo },
    },
    { idempotencyKey: `easyfeed-price-${ciclo}-${centavos}-v1` },
  )
  console.log(`  → ${price.id}`)
}

console.log(dry ? '\n(dry-run: nada foi criado)' : '\nPronto. Próximo passo: configurar-portal.ts --criar')
