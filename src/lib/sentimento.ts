import type { CSSProperties } from 'react'

/**
 * Sentimento na interface.
 *
 * MENSAGEM ORIGINAL (feedbacks_originais.sentimento, vindo do n8n): pode ser
 * 'positivo' | 'negativo' | 'positivo e negativo' (misto) | 'neutro'.
 * PEDAÇOS SEPARADOS (feedbacks_restaurante.sentimento): só 'positivo' |
 * 'negativo' | 'neutro' (se tem os dois, o n8n divide em dois pedaços).
 *
 * Cores: positivo=verde, negativo=vermelho, neutro=CINZA, misto (positivo e
 * negativo)=AMARELO.
 */
export type TipoSentimento = 'positivo' | 'negativo' | 'misto' | 'neutro'

export function tipoSentimento(valor?: string | null): TipoSentimento {
  const v = (valor || '').toLowerCase().trim()
  if (v === 'positivo' || v === 'positive') return 'positivo'
  if (v === 'negativo' || v === 'negative') return 'negativo'
  if (v === 'positivo e negativo' || v === 'positivo/negativo' || v === 'misto' || v === 'mixed')
    return 'misto'
  return 'neutro'
}

export function rotuloSentimento(valor?: string | null): string {
  switch (tipoSentimento(valor)) {
    case 'positivo':
      return 'Positivo'
    case 'negativo':
      return 'Negativo'
    case 'misto':
      return 'Positivo e negativo'
    default:
      return 'Neutro'
  }
}

export const CORES_SENTIMENTO: Record<
  TipoSentimento,
  { badge: string; texto: string; dot: string; dotStyle?: CSSProperties }
> = {
  positivo: { badge: 'bg-emerald-200 text-emerald-800 border-emerald-300', texto: 'text-emerald-600', dot: 'bg-emerald-500' },
  negativo: { badge: 'bg-rose-200 text-rose-800 border-rose-300', texto: 'text-rose-600', dot: 'bg-rose-500' },
  neutro:   { badge: 'bg-slate-200 text-slate-700 border-slate-300', texto: 'text-slate-500', dot: 'bg-slate-400' },
  misto:    { badge: 'bg-amber-200 text-amber-800 border-amber-300', texto: 'text-amber-600', dot: 'bg-amber-400' },
}

export function coresSentimento(valor?: string | null) {
  return CORES_SENTIMENTO[tipoSentimento(valor)]
}
