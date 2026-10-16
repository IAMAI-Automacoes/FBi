import { supabase } from '@/lib/supabase/client'
import type { Ciclo } from '@/components/vendas/ciclos-plano'

/* Cobrança — camada que as telas de compra usam.

   Pagamento pelo Asaas: `criarCheckout` chama a função `criar-cobranca`, que
   cria a assinatura (ou o parcelamento) e devolve a URL da fatura do Asaas,
   onde a pessoa põe o cartão. Quem libera o acesso é o webhook. Os preços vêm
   da tabela `planos_precos`. */

const MESES: Record<Ciclo, number> = { mensal: 1, semestral: 6, anual: 12 }

export interface PrecoPublico {
  ciclo: Ciclo
  /** Total cobrado a cada ciclo, em centavos. */
  total_centavos: number
  /** Total ÷ meses do ciclo, arredondado. */
  mensal_equivalente_centavos: number
  /** Economia sobre o mensal (inteiro), ou null no mensal / sem economia. */
  desconto_percentual: number | null
  /** Em quantas vezes dá para parcelar no cartão; null = não parcela. */
  parcelas_max: number | null
  /** Total do parcelado (com o acréscimo do cartão parcelado), em centavos. */
  total_parcelado_centavos: number | null
}

/** Converte as linhas de `planos_precos` no formato da tela. O desconto é
    calculado dos valores reais — nenhum número fixo. */
export function montarPrecosPublicos(
  linhas: { ciclo: string; total_centavos: number; parcelas_max?: number | null; total_parcelado_centavos?: number | null }[],
): PrecoPublico[] {
  const linha = (c: Ciclo) => linhas.find((l) => l.ciclo === c)
  const total = (c: Ciclo) => linha(c)?.total_centavos
  const baseMensal = total('mensal') ?? null
  const saida: PrecoPublico[] = []
  for (const ciclo of ['mensal', 'semestral', 'anual'] as Ciclo[]) {
    const t = total(ciclo)
    if (typeof t !== 'number') continue
    const mensalEq = Math.round(t / MESES[ciclo])
    let desconto: number | null = null
    if (ciclo !== 'mensal' && baseMensal && baseMensal > 0) {
      desconto = Math.round((1 - mensalEq / baseMensal) * 100)
      if (desconto <= 0) desconto = null
    }
    const parcelas = linha(ciclo)?.parcelas_max
    const totalParcelado = linha(ciclo)?.total_parcelado_centavos
    saida.push({
      ciclo,
      total_centavos: t,
      mensal_equivalente_centavos: mensalEq,
      desconto_percentual: desconto,
      parcelas_max: typeof parcelas === 'number' && parcelas > 1 ? parcelas : null,
      total_parcelado_centavos: typeof totalParcelado === 'number' && totalParcelado > 0 ? totalParcelado : t,
    })
  }
  return saida
}

/** Preços atuais do software (`restaurante` na landing; a área da conta logada). */
export async function buscarPrecos(area: 'restaurante' | 'rh' = 'restaurante'): Promise<PrecoPublico[]> {
  const { data, error } = await supabase
    .from('planos_precos')
    .select('ciclo, total_centavos, parcelas_max, total_parcelado_centavos')
    .eq('area', area)
    .eq('ativo', true)
  if (error) throw new Error('Não foi possível carregar os preços.')
  return montarPrecosPublicos(
    (data ?? []) as { ciclo: string; total_centavos: number; parcelas_max: number | null; total_parcelado_centavos: number | null }[],
  )
}

/** Erro tipado da cobrança: carrega o corpo para a tela decidir o que fazer. */
export class ErroCobranca extends Error {
  constructor(
    mensagem: string,
    public readonly corpo: Record<string, unknown> | null = null,
  ) {
    super(mensagem)
    this.name = 'ErroCobranca'
  }
}

export type Modalidade = 'recorrente' | 'parcelado'

/** Versão dos termos aceitos na tela de pagamento (vai gravada no pedido). */
export const TERMOS_VERSAO = '0.1.0'

/** Abre o pagamento do plano no Asaas e devolve a URL da fatura.
    Recusas vêm como `ErroCobranca`, com o corpo: `ja_assinante` (já paga) ou
    `regularizar_url` (tem fatura vencida — pagar essa, nunca assinar de novo). */
export async function criarCheckout(
  ciclo: Ciclo,
  opcoes: { modalidade: Modalidade; cpfCnpj: string },
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('criar-cobranca', {
    body: { ciclo, modalidade: opcoes.modalidade, cpf_cnpj: opcoes.cpfCnpj, termos_versao: TERMOS_VERSAO },
  })
  if (error) {
    // invoke() só devolve "non-2xx"; a mensagem real vem no corpo da resposta
    let corpo: Record<string, unknown> | null = null
    try {
      corpo = await (error as { context?: Response }).context?.json?.()
    } catch {
      /* sem corpo legível */
    }
    const mensagem = typeof corpo?.error === 'string' ? corpo.error : 'Não foi possível abrir o pagamento.'
    throw new ErroCobranca(mensagem, corpo)
  }
  if (!data?.url) throw new ErroCobranca('Não foi possível abrir o pagamento.', data ?? null)
  return String(data.url)
}

/** Fatura vencida da assinatura (inadimplente): o caminho é pagar esta, nunca
    assinar de novo. Null se não houver. */
export async function buscarFaturaEmAberto(): Promise<string | null> {
  const { data } = await supabase
    .from('cobranca_pagamentos')
    .select('invoice_url')
    .eq('status', 'OVERDUE')
    .not('invoice_url', 'is', null)
    .order('vencimento', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.invoice_url ?? null
}

/** CPF/CNPJ já usado em um pagamento anterior desta conta (para preencher). */
export async function buscarDocumentoSalvo(): Promise<string | null> {
  const { data } = await supabase.from('cobranca_clientes').select('cpf_cnpj').limit(1).maybeSingle()
  return data?.cpf_cnpj ?? null
}
