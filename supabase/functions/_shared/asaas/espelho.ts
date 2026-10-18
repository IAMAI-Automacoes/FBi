/**
 * Espelho das cobranças do Asaas no banco (`cobranca_assinaturas` e
 * `cobranca_pagamentos`), e o encerramento das cobranças de uma conta.
 */
import { asaas, removerNoAsaas } from './cliente.ts'
import { centavos } from './regras.ts'

// deno-lint-ignore no-explicit-any
type Db = any
// deno-lint-ignore no-explicit-any
type PagamentoAsaas = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A nossa assinatura (ou parcelamento) de um pagamento do Asaas: pelo id da
    assinatura/parcelamento e, se não achar, pelo `externalReference`. */
export async function acharAssinatura(db: Db, contaId: string, pag: PagamentoAsaas) {
  for (const asaasId of [pag?.subscription, pag?.installment]) {
    if (!asaasId) continue
    const { data } = await db
      .from('cobranca_assinaturas')
      .select('*')
      .eq('conta_id', contaId)
      .eq('asaas_id', String(asaasId))
      .maybeSingle()
    if (data) return data
  }
  const ref = String(pag?.externalReference ?? '')
  if (UUID.test(ref)) {
    const { data } = await db.from('cobranca_assinaturas').select('*').eq('conta_id', contaId).eq('id', ref).maybeSingle()
    if (data) return data
  }
  return null
}

const dataComHora = (d: unknown): string | null => (d ? `${String(d).slice(0, 10)}T12:00:00-03:00` : null)

/** Grava (ou atualiza) um pagamento do Asaas. `extra` só entra quando vem:
    um evento atrasado não apaga o cupom ou o bônus já ligado ao pagamento. */
export async function espelharPagamento(
  db: Db,
  contaId: string,
  // deno-lint-ignore no-explicit-any
  assinatura: any | null,
  pag: PagamentoAsaas,
  extra: { cupom_uso_id?: string | null; premio_id?: string | null } = {},
) {
  const linha: Record<string, unknown> = {
    conta_id: contaId,
    asaas_payment_id: String(pag.id),
    assinatura_id: assinatura?.id ?? null,
    restaurante_id: assinatura?.restaurante_id ?? null,
    numero_parcela: pag.installmentNumber ?? null,
    // Cobrança removida no Asaas (assinatura cancelada, pedido trocado).
    status: pag.deleted ? 'DELETED' : String(pag.status ?? 'PENDING'),
    valor_centavos: centavos(pag.value ?? 0),
    liquido_centavos: pag.netValue != null ? centavos(pag.netValue) : null,
    vencimento: pag.dueDate ?? null,
    pago_em: dataComHora(pag.paymentDate ?? pag.confirmedDate ?? pag.clientPaymentDate),
    credito_em: pag.creditDate ?? pag.estimatedCreditDate ?? null,
    invoice_url: pag.invoiceUrl ?? null,
    atualizado_em: new Date().toISOString(),
  }
  if (extra.cupom_uso_id !== undefined) linha.cupom_uso_id = extra.cupom_uso_id
  if (extra.premio_id !== undefined) linha.premio_id = extra.premio_id
  const { data, error } = await db
    .from('cobranca_pagamentos')
    .upsert(linha, { onConflict: 'conta_id,asaas_payment_id' })
    .select('*')
    .single()
  if (error) throw new Error(`cobranca_pagamentos: ${error.message}`)
  return data
}

/**
 * Encerra no Asaas tudo o que ainda pode cobrar a conta (para excluir a conta).
 *   - recorrente aguardando, ativa ou atrasada: remove a assinatura;
 *   - parcelado aguardando: remove o parcelamento (nada foi pago);
 *   - parcelado ativo: é pré-pago, as parcelas já estão no cartão — nada a fazer.
 * Lança se o Asaas falhar: quem chama NÃO deve seguir com a exclusão.
 */
export async function encerrarCobrancas(db: Db, restauranteId: number): Promise<number> {
  const { data: linhas, error } = await db
    .from('cobranca_assinaturas')
    .select('id, conta_id, modalidade, status, asaas_id')
    .eq('restaurante_id', restauranteId)
    .in('status', ['aguardando', 'ativa', 'atrasada'])
  if (error) throw new Error(`cobranca_assinaturas: ${error.message}`)

  let encerradas = 0
  for (const l of linhas ?? []) {
    if (l.modalidade === 'parcelado' && l.status !== 'aguardando') continue
    if (l.asaas_id) {
      const caminho = l.modalidade === 'recorrente' ? `/subscriptions/${l.asaas_id}` : `/installments/${l.asaas_id}`
      await removerNoAsaas(asaas(l.conta_id), caminho)
    }
    const agora = new Date().toISOString()
    await db
      .from('cobranca_assinaturas')
      .update({ status: l.status === 'aguardando' ? 'expirada' : 'cancelada', cancelada_em: agora, atualizada_em: agora })
      .eq('id', l.id)
    encerradas++
  }
  return encerradas
}
