/**
 * Repasses de uma fatura paga: livro-razão + transferência automática (Connect).
 *
 * Fluxo (chamado pelo webhook em `invoice.paid`):
 *   1. `gerar_repasses_da_fatura` (SQL) cria as linhas em `stripe_repasses`:
 *      comissão do afiliado sobre o valor pago e, sobre o que sobra, cada
 *      linha ativa de `divisao_receita` (sócios/empresa). Idempotente.
 *   2. Para as linhas com `metodo = 'stripe_connect'` (afiliado com conta
 *      Connect ativa), cria a transferência no Stripe usando a cobrança da
 *      fatura como origem (`source_transaction`): o dinheiro só sai quando o
 *      pagamento daquela fatura estiver disponível, e nunca de outro saldo.
 *   3. Linhas `pix` ficam `pendente` para o admin pagar pela conta da empresa
 *      e marcar como pago no painel.
 *
 * Idempotência da transferência: `idempotencyKey = repasse-<id>` e o
 * `stripe_transfer_id` gravado na linha. Reprocessar o evento não transfere
 * duas vezes.
 */
import { stripe, PRODUCT_CODE } from './cliente.ts'

// deno-lint-ignore no-explicit-any
type Db = any

export interface ResultadoRepasses {
  criados: number
  transferidos: number
  falhas: number
}

export async function processarRepasses(db: Db, faturaId: string): Promise<ResultadoRepasses> {
  const { data: criados, error } = await db.rpc('gerar_repasses_da_fatura', { p_fatura_id: faturaId })
  if (error) throw new Error(`gerar_repasses_da_fatura: ${error.message}`)

  const { data: fatura } = await db
    .from('stripe_faturas')
    .select('id, stripe_invoice_id, stripe_charge_id, moeda, restaurante_id')
    .eq('id', faturaId)
    .maybeSingle()

  const { data: pendentes } = await db
    .from('stripe_repasses')
    .select('id, valor_centavos, afiliado_id, afiliados(stripe_account_id, stripe_connect_status)')
    .eq('fatura_id', faturaId)
    .eq('metodo', 'stripe_connect')
    .eq('status', 'pendente')
    .is('stripe_transfer_id', null)

  let transferidos = 0
  let falhas = 0

  for (const r of pendentes ?? []) {
    const conta: string | null = r.afiliados?.stripe_account_id ?? null
    if (!conta || r.afiliados?.stripe_connect_status !== 'ativo') {
      // Conta sumiu ou ficou restrita entre o cálculo e agora: vira Pix manual.
      await db.from('stripe_repasses').update({ metodo: 'pix' }).eq('id', r.id)
      continue
    }
    try {
      const transfer = await stripe().transfers.create(
        {
          amount: r.valor_centavos,
          currency: fatura?.moeda ?? 'brl',
          destination: conta,
          // Só transfere do dinheiro DESTA cobrança. Sem isso, um estorno da
          // fatura deixaria a comissão paga com saldo de outro cliente.
          ...(fatura?.stripe_charge_id ? { source_transaction: fatura.stripe_charge_id } : {}),
          transfer_group: fatura?.stripe_invoice_id ?? undefined,
          description: `Comissão EasyFeed — fatura ${fatura?.stripe_invoice_id ?? faturaId}`,
          metadata: {
            product_code: PRODUCT_CODE,
            repasse_id: r.id,
            fatura_id: faturaId,
            afiliado_id: r.afiliado_id,
          },
        },
        { idempotencyKey: `repasse-${r.id}` },
      )
      await db
        .from('stripe_repasses')
        .update({
          status: 'pago',
          stripe_transfer_id: transfer.id,
          pago_em: new Date().toISOString(),
          pago_por: 'stripe',
          erro: null,
        })
        .eq('id', r.id)
      transferidos++
    } catch (e) {
      const msg = (e as Error).message
      // Fica `falhou` com o motivo; o admin vê no painel e pode pagar por Pix
      // (mudando o método) ou tentar de novo depois de resolver a conta.
      await db.from('stripe_repasses').update({ status: 'falhou', erro: msg.slice(0, 500) }).eq('id', r.id)
      console.error('[repasses] transferência falhou:', r.id, msg)
      falhas++
    }
  }

  return { criados: Number(criados ?? 0), transferidos, falhas }
}
