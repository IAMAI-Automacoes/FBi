/**
 * Descontos que entram na cobrança além do cupom e dos meses grátis de
 * indicação (fase 2 do Asaas, 20/10/2026):
 *   - o do código do vendedor: quem comprou pelo código ganha `desconto_pct`
 *     nas `desconto_cobrancas` primeiras cobranças (Admin → Vendedores);
 *   - o saldo dos vídeos aprovados (`video_premios.valor_centavos`): abate a
 *     próxima cobrança pelo banco (reservar → confirmar → soltar).
 * Usado por `criar-cobranca` (a compra) e `asaas-webhook` (as renovações).
 */

// deno-lint-ignore no-explicit-any
type Db = any

const FORA_DA_CONTA = ['DELETED', 'REFUNDED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL']

export interface Vendedor {
  id: string
  ativo: boolean
  restaurante_id: number | null
  desconto_pct: number
  desconto_cobrancas: number
}

/** Quem indicou a conta (vendedor ou conta EasyFeed), pela tabela `indicacoes`. */
export async function quemIndicou(db: Db, restauranteId: number): Promise<Vendedor | null> {
  const { data: ind } = await db
    .from('indicacoes')
    .select('afiliado_id')
    .eq('indicado_restaurante_id', restauranteId)
    .maybeSingle()
  if (!ind?.afiliado_id) return null
  const { data: af, error } = await db
    .from('afiliados')
    .select('id, ativo, restaurante_id, desconto_pct, desconto_cobrancas')
    .eq('id', ind.afiliado_id)
    .maybeSingle()
  if (error) throw new Error(`afiliados: ${error.message}`)
  if (!af) return null
  return {
    id: String(af.id),
    ativo: af.ativo === true,
    restaurante_id: af.restaurante_id ?? null,
    desconto_pct: Number(af.desconto_pct) || 0,
    desconto_cobrancas: Number(af.desconto_cobrancas) || 0,
  }
}

/**
 * A % de desconto do código do vendedor nesta cobrança (0 = nenhum). Na compra
 * o código precisa estar ativo; nas renovações o combinado continua até
 * acabarem as `desconto_cobrancas` (contando as que já tiveram o desconto).
 */
export async function descontoDoVendedor(
  db: Db,
  restauranteId: number,
  opcoes: { compra: boolean; excluirPagamento?: string },
): Promise<number> {
  const v = await quemIndicou(db, restauranteId)
  if (!v || v.restaurante_id != null || !(v.desconto_pct > 0)) return 0
  if (opcoes.compra && !v.ativo) return 0
  let q = db
    .from('cobranca_pagamentos')
    .select('id', { count: 'exact', head: true })
    .eq('restaurante_id', restauranteId)
    .gt('desconto_vendedor_centavos', 0)
    .not('status', 'in', `(${FORA_DA_CONTA.join(',')})`)
  if (opcoes.excluirPagamento) q = q.neq('asaas_payment_id', opcoes.excluirPagamento)
  const { count, error } = await q
  if (error) throw new Error(`cobranca_pagamentos: ${error.message}`)
  return (count ?? 0) < v.desconto_cobrancas ? Math.min(v.desconto_pct, 100) : 0
}

/** Reserva o saldo de vídeo que cabe em `maxCentavos` para a cobrança (ou o pedido) `chave`. */
export async function reservarSaldoDoVideo(
  db: Db,
  restauranteId: number,
  chave: string,
  maxCentavos: number,
): Promise<{ centavos: number; repetido: boolean }> {
  if (!(maxCentavos > 0)) return { centavos: 0, repetido: false }
  const { data, error } = await db.rpc('video_reservar_saldo', {
    p_restaurante_id: restauranteId,
    p_chave: chave,
    p_max_centavos: Math.floor(maxCentavos),
  })
  if (error) throw new Error(`video_reservar_saldo: ${error.message}`)
  return { centavos: Math.max(0, Number(data?.centavos) || 0), repetido: data?.repetido === true }
}

/** Pagou: o saldo reservado pela cobrança ou pelo pedido da compra foi usado. */
export async function confirmarSaldoDoVideo(db: Db, pagamentoId: string, pedidoId: string | null) {
  const { error } = await db.rpc('video_confirmar_saldo', { p_pagamento: pagamentoId, p_pedido: pedidoId })
  if (error) throw new Error(`video_confirmar_saldo: ${error.message}`)
}

/** A cobrança (ou o pedido) saiu sem ser paga: o saldo volta. */
export async function soltarSaldoDoVideo(db: Db, chave: string) {
  const { error } = await db.rpc('video_soltar_saldo', { p_chave: chave })
  if (error) throw new Error(`video_soltar_saldo: ${error.message}`)
}
