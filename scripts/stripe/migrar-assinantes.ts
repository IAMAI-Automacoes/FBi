/**
 * migrar-assinantes.ts — move assinantes de um Price antigo para o atual.
 *
 *   deno run -A scripts/stripe/migrar-assinantes.ts --de=price_ANTIGO --para=easyfeed_anual [--proration=none] [--dry-run] [--sim]
 *
 * Depois de `trocar-preco.ts`, quem já assinava CONTINUA no price antigo
 * (grandfathering). Este script é a outra opção: migrar para o novo.
 *
 * `--proration` (padrão `none`) decide COMO a diferença é cobrada:
 *   none              o preço novo vale a partir da PRÓXIMA renovação; nada é
 *                     cobrado nem creditado agora. É o que se espera de um
 *                     reajuste: o cliente foi avisado, e paga o novo valor no
 *                     próximo ciclo. Recomendado para aumento de preço.
 *   create_prorations cobra/credita a diferença proporcional ao que resta do
 *                     ciclo, na próxima fatura. Faz sentido em REDUÇÃO de
 *                     preço (o cliente ganha crédito) ou upgrade de recurso.
 *   always_invoice    igual ao anterior, mas emite e cobra a fatura AGORA.
 *
 * Avisar antes: reajuste sem aviso gera chargeback e cancelamento. Envie
 * e-mail com ≥30 dias de antecedência (cite valor antigo, novo e data do
 * primeiro ciclo cobrado no novo valor) e só então rode este script — ele
 * também grava `metadata.migrado_em` em cada assinatura, para auditoria.
 *
 * `--sim` é obrigatório para executar de verdade (fora do dry-run).
 */
import { ajuda, args, brl, cicloDoPrice, priceAtual, stripe, type Ciclo, LOOKUP_KEY_POR_CICLO } from './_comum.ts'

const a = args()
if (a.help || !a.de || !a.para) {
  ajuda(`uso: migrar-assinantes.ts --de=price_... --para=<lookup_key|price_...> [--proration=none|create_prorations|always_invoice] [--dry-run] [--sim]`)
}

const dry = Boolean(a['dry-run']) || !a.sim
const proration = (a.proration ?? 'none') as 'none' | 'create_prorations' | 'always_invoice'
if (!['none', 'create_prorations', 'always_invoice'].includes(proration)) {
  console.error('proration inválido')
  Deno.exit(1)
}

const s = stripe()

const antigo = await s.prices.retrieve(a.de)
let novoId = a.para
if (!novoId.startsWith('price_')) {
  const ciclo = (Object.keys(LOOKUP_KEY_POR_CICLO) as Ciclo[]).find((c) => LOOKUP_KEY_POR_CICLO[c] === novoId)
  if (!ciclo) {
    console.error(`--para precisa ser um price_... ou um lookup_key (${Object.values(LOOKUP_KEY_POR_CICLO).join(', ')})`)
    Deno.exit(1)
  }
  const p = await priceAtual(s, ciclo)
  if (!p) {
    console.error(`nenhum price ativo para ${novoId}`)
    Deno.exit(1)
  }
  novoId = p.id
}
const novo = await s.prices.retrieve(novoId)

// Segurança: só migra dentro do mesmo ciclo. Mudar ciclo mexe em período e
// âncora de cobrança — isso é troca de plano, não reajuste.
const cAntigo = cicloDoPrice({ id: antigo.id, lookup_key: antigo.lookup_key, recurring: antigo.recurring, metadata: antigo.metadata })
const cNovo = cicloDoPrice({ id: novo.id, lookup_key: novo.lookup_key, recurring: novo.recurring, metadata: novo.metadata })
if (cAntigo !== cNovo) {
  console.error(`ciclos diferentes (${cAntigo} → ${cNovo}); este script só faz reajuste dentro do mesmo ciclo`)
  Deno.exit(1)
}

console.log(`\n${antigo.id} (${brl(antigo.unit_amount)}) → ${novo.id} (${brl(novo.unit_amount)}), proration=${proration}`)

let total = 0
let migradas = 0
for await (const sub of s.subscriptions.list({ price: antigo.id, status: 'active', limit: 100 })) {
  total++
  const item = sub.items.data.find((i) => i.price.id === antigo.id)
  if (!item) continue
  const fim = item.current_period_end ? new Date(item.current_period_end * 1000).toLocaleDateString('pt-BR') : '?'
  console.log(`  ${sub.id} cliente=${typeof sub.customer === 'string' ? sub.customer : sub.customer.id} renova=${fim}`)
  if (dry) continue
  await s.subscriptions.update(
    sub.id,
    {
      items: [{ id: item.id, price: novo.id }],
      proration_behavior: proration,
      metadata: { ...sub.metadata, migrado_em: new Date().toISOString(), migrado_de: antigo.id },
    },
    { idempotencyKey: `migrar-${sub.id}-${antigo.id}-${novo.id}` },
  )
  migradas++
}

console.log(`\n${total} assinatura(s) no price antigo; ${dry ? 'nenhuma alterada (dry-run / sem --sim)' : `${migradas} migrada(s)`}.`)
if (!dry) console.log('O webhook customer.subscription.updated atualiza o espelho no banco.')
