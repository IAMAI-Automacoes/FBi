import type { CSSProperties } from 'react'

/**
 * Sentimento na interface.
 *
 * MENSAGEM ORIGINAL (feedbacks_originais.sentimento, vindo do n8n): pode ser
 * 'positivo' | 'negativo' | 'positivo e negativo' (misto) | 'neutro'.
 * PEDAÇOS SEPARADOS (feedbacks_restaurante.sentimento): só 'positivo' |
 * 'negativo' | 'neutro' (se tem os dois, o n8n divide em dois pedaços).
 *
 * Cores: positivo=verde, negativo=vermelho, neutro=AMARELO, misto=verde+vermelho.
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

/** Split verde|vermelho para o "misto" (as duas cores juntas). */
const SPLIT_MISTO: CSSProperties = { background: 'linear-gradient(90deg,#10b981 50%,#f43f5e 50%)' }

export const CORES_SENTIMENTO: Record<
  TipoSentimento,
  { badge: string; texto: string; dot: string; dotStyle?: CSSProperties }
> = {
  positivo: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', texto: 'text-emerald-600', dot: 'bg-emerald-500' },
  negativo: { badge: 'bg-rose-50 text-rose-700 border-rose-200', texto: 'text-rose-600', dot: 'bg-rose-500' },
  neutro:   { badge: 'bg-amber-50 text-amber-700 border-amber-200', texto: 'text-amber-600', dot: 'bg-amber-400' },
  misto:    { badge: 'bg-slate-50 text-slate-700 border-slate-200', texto: 'text-slate-700', dot: '', dotStyle: SPLIT_MISTO },
}

export function coresSentimento(valor?: string | null) {
  return CORES_SENTIMENTO[tipoSentimento(valor)]
}
