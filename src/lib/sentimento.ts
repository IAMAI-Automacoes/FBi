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

/**
 * O n8n às vezes grava o sentimento da mensagem original com variações fora
 * dos 4 valores documentados (ex.: "Positivo e Negativo e Neutro", "...and
 * Neutro") — provavelmente porque o próprio texto tem um ponto neutro/
 * informativo junto com o elogio e a reclamação. Em vez de casar contra uma
 * lista fixa de frases exatas (que quebra a cada variação nova), detecta por
 * substring: se menciona "positivo" E "negativo", é misto — não importa o
 * que mais tenha na frase.
 */
export function tipoSentimento(valor?: string | null): TipoSentimento {
  const v = (valor || '').toLowerCase().trim()
  const temPositivo = v.includes('positivo') || v.includes('positive')
  const temNegativo = v.includes('negativo') || v.includes('negative')
  if (temPositivo && temNegativo) return 'misto'
  if (temPositivo) return 'positivo'
  if (temNegativo) return 'negativo'
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
