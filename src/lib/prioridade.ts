/**
 * Cor PADRÃO de cada prioridade — usada nos cards de insight, no filtro de
 * status da pág. Insights e nos cards de Ações, pra nunca ter uma cor
 * diferente pro mesmo status em telas diferentes.
 *
 * Duas variantes de fundo: `corFundo` (clara, pra selo/pílula sobre fundo
 * branco) e `corSolida` (cheia, pra selo tipo etiqueta nos cards de Ações).
 */
export type Prioridade = 'URGENTE' | 'IMPORTANTE' | 'OBSERVACAO' | 'ELOGIO'

export interface EstiloPrioridade {
  corTexto: string
  corFundo: string
  corBorda: string
  corSolida: string
  label: string
}

const ESTILOS: Record<Prioridade, EstiloPrioridade> = {
  URGENTE: {
    corTexto: 'text-[#EF4444]',
    corFundo: 'bg-red-100',
    corBorda: 'border-[#EF4444]',
    corSolida: 'bg-[#EF4444] text-white',
    label: 'URGENTE',
  },
  IMPORTANTE: {
    corTexto: 'text-[#F59E0B]',
    corFundo: 'bg-amber-100',
    corBorda: 'border-[#F59E0B]',
    corSolida: 'bg-[#F59E0B] text-white',
    label: 'IMPORTANTE',
  },
  OBSERVACAO: {
    corTexto: 'text-[#6B7280]',
    corFundo: 'bg-gray-200',
    corBorda: 'border-[#9CA3AF]',
    corSolida: 'bg-[#6B7280] text-white',
    label: 'OBSERVAÇÃO',
  },
  // "Observação" que é elogio — não existe como prioridade própria no banco
  // (ver `ehElogio()` em InsightCard.tsx), só usada nos cards de insight.
  // Rótulo PRÓPRIO ("ELOGIO", não "OBSERVAÇÃO") de propósito: duas cores pro
  // mesmo texto parecia bug — com nomes diferentes, cada cor tem seu rótulo.
  ELOGIO: {
    corTexto: 'text-[#22C55E]',
    corFundo: 'bg-green-100',
    corBorda: 'border-[#22C55E]',
    corSolida: 'bg-[#22C55E] text-white',
    label: 'ELOGIO',
  },
}

/**
 * Estilo pela prioridade. Aceita variações de grafia (OBSERVACAO sem
 * acento, "NORMAL" das ações antigas) — tudo que não é URGENTE/IMPORTANTE
 * cai em OBSERVACAO.
 */
export function estiloPrioridade(prioridade?: string | null): EstiloPrioridade {
  const v = (prioridade || '').toUpperCase().trim()
  if (v === 'URGENTE') return ESTILOS.URGENTE
  if (v === 'IMPORTANTE') return ESTILOS.IMPORTANTE
  return ESTILOS.OBSERVACAO
}

export { ESTILOS as PRIORIDADES }
