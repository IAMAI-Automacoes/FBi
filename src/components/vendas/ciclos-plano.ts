/* Definição dos ciclos de cobrança.

   NENHUM valor monetário aqui. Preço é lido do Stripe por lookup_key
   (`easyfeed_mensal` / `easyfeed_semestral` / `easyfeed_anual`) pela edge
   function `get-prices` — ver `hooks/use-precos.ts`. Trocar preço = script
   `scripts/stripe/trocar-preco.ts`, sem deploy. O client nunca envia price ID:
   o checkout recebe só o ciclo e resolve o price no servidor. */

import type { PrecoPublico } from '@/lib/queries/stripe'

export type Ciclo = 'mensal' | 'semestral' | 'anual'

export interface DefinicaoCiclo {
  id: Ciclo
  rotulo: string
  /** Texto da cobrança real, dado o total formatado. */
  descricaoCobranca: (total: string) => string
}

export const CICLOS: DefinicaoCiclo[] = [
  { id: 'mensal', rotulo: 'Mensal', descricaoCobranca: () => 'Cobrado mensalmente' },
  {
    id: 'semestral',
    rotulo: 'Semestral',
    descricaoCobranca: (t) => `${t} cobrados a cada 6 meses`,
  },
  { id: 'anual', rotulo: 'Anual', descricaoCobranca: (t) => `${t} cobrados uma vez por ano` },
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

export function buscarCiclo(id: Ciclo): DefinicaoCiclo {
  // Os três ids são cobertos por CICLOS; o fallback existe só para satisfazer o tipo.
  return CICLOS.find((c) => c.id === id) ?? CICLOS[0]
}

/** Ciclo + preço vindo do Stripe, já formatado para a tela. */
export interface PlanoCiclo extends DefinicaoCiclo {
  /** "147" — número grande do card (sem "R$", que vai separado). */
  mensalEquivalente: string
  /** "R$ 1.764" — total de cada renovação. */
  totalCobrado: string
  descricao: string
  descontoPercentual: number | null
}

const fmtInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const fmtDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 19700 → "197"; 19790 → "197,90". Centavos zerados somem: preço de vitrine. */
export function formatarReais(centavos: number): string {
  return centavos % 100 === 0
    ? fmtInteiro.format(centavos / 100)
    : fmtDecimal.format(centavos / 100)
}

export function montarPlano(p: PrecoPublico): PlanoCiclo {
  const def = buscarCiclo(p.ciclo)
  const total = `R$ ${formatarReais(p.total_centavos)}`
  return {
    ...def,
    mensalEquivalente: formatarReais(p.mensal_equivalente_centavos),
    totalCobrado: total,
    descricao: def.descricaoCobranca(total),
    descontoPercentual: p.desconto_percentual,
  }
}
