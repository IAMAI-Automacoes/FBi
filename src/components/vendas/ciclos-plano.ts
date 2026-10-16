/* Definição dos ciclos de cobrança.

   NENHUM valor monetário aqui. Preço é lido da tabela `planos_precos` (um
   por software e ciclo, editável pelo admin) — ver `hooks/use-precos.ts`.
   O client nunca envia valor: o pagamento recebe só o ciclo. */

import type { PrecoPublico } from '@/lib/queries/cobranca'

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

/** O que o plano entrega na versão RH (mesmos planos e valores, por enquanto). */
export const RECURSOS_DO_RH = [
  'Feedbacks ilimitados da equipe',
  'Anonimato escolhido por quem responde',
  'Insights e ações gerados por IA',
  'Relatórios em PDF e planilha',
  'Pedido de feedback automático',
  'Aviso na hora para relato grave',
  'Assistente de IA com os dados da sua empresa',
  'Suporte por WhatsApp',
]

/** A lista de recursos da versão da conta. */
export const recursosDaArea = (area: unknown): string[] => (area === 'rh' ? RECURSOS_DO_RH : RECURSOS_INCLUSOS)

export function ehCiclo(valor: string | null): valor is Ciclo {
  return valor === 'mensal' || valor === 'semestral' || valor === 'anual'
}

export function buscarCiclo(id: Ciclo): DefinicaoCiclo {
  // Os três ids são cobertos por CICLOS; o fallback existe só para satisfazer o tipo.
  return CICLOS.find((c) => c.id === id) ?? CICLOS[0]
}

/** Ciclo + preço vindo do banco, já formatado para a tela. */
export interface PlanoCiclo extends DefinicaoCiclo {
  /** "147" — número grande do card (sem "R$", que vai separado). */
  mensalEquivalente: string
  /** "R$ 1.764" — total de cada renovação. */
  totalCobrado: string
  descricao: string
  descontoPercentual: number | null
  /** Parcelado no cartão: em quantas vezes (null = não parcela). */
  parcelas: number | null
  /** "148,50" — valor de cada parcela, sem "R$". */
  valorParcela: string | null
  /** "R$ 1.782" — total do parcelado (com o acréscimo do cartão parcelado). */
  totalParcelado: string | null
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
    parcelas: p.parcelas_max,
    valorParcela: p.parcelas_max
      ? formatarReais(Math.round((p.total_parcelado_centavos ?? p.total_centavos) / p.parcelas_max))
      : null,
    totalParcelado: p.parcelas_max ? `R$ ${formatarReais(p.total_parcelado_centavos ?? p.total_centavos)}` : null,
  }
}
