/* Definição dos ciclos de cobrança.
   VALORES PLACEHOLDER — trocar pelos preços reais antes de publicar, e manter
   em sincronia com os prices criados no Stripe (os `price_id` ficam na tabela
   `integracao_config`, resolvidos no servidor pela Edge Function
   `criar-checkout-session`; o client nunca envia price_id). */

export type Ciclo = 'mensal' | 'semestral' | 'anual'

export interface PlanoCiclo {
  id: Ciclo
  rotulo: string
  /** Valor mensal equivalente, em reais. É o número grande do card. */
  mensalEquivalente: number
  /** Valor total efetivamente cobrado a cada renovação. */
  totalCobrado: number
  /** Texto que descreve a cobrança real. */
  descricaoCobranca: string
  /** Desconto em relação ao mensal. `null` no próprio mensal. */
  descontoPercentual: number | null
}

export const CICLOS: PlanoCiclo[] = [
  {
    id: 'mensal',
    rotulo: 'Mensal',
    mensalEquivalente: 197,
    totalCobrado: 197,
    descricaoCobranca: 'Cobrado mensalmente',
    descontoPercentual: null,
  },
  {
    id: 'semestral',
    rotulo: 'Semestral',
    mensalEquivalente: 167,
    totalCobrado: 1002,
    descricaoCobranca: 'R$ 1.002 cobrados a cada 6 meses',
    descontoPercentual: 15,
  },
  {
    id: 'anual',
    rotulo: 'Anual',
    mensalEquivalente: 147,
    totalCobrado: 1764,
    descricaoCobranca: 'R$ 1.764 cobrados uma vez por ano',
    descontoPercentual: 25,
  },
]

export const RECURSOS_INCLUSOS = [
  'Feedbacks ilimitados',
  'Insights e ações gerados por IA',
  'Relatórios em PDF com resumo executivo',
  'QR codes ilimitados e personalizáveis',
  'Avaliação individual por garçom',
  'Assistente de IA com os dados da sua casa',
  'Usuários da equipe com permissões',
  'Suporte por WhatsApp',
]

export function ehCiclo(valor: string | null): valor is Ciclo {
  return valor === 'mensal' || valor === 'semestral' || valor === 'anual'
}

export function buscarCiclo(id: Ciclo): PlanoCiclo {
  // Os três ids são cobertos por CICLOS; o fallback existe só para satisfazer o tipo.
  return CICLOS.find((c) => c.id === id) ?? CICLOS[0]
}
