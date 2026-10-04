import type { CSSProperties } from 'react'

/**
 * Sentimento na interface.
 *
 * MENSAGEM ORIGINAL (feedbacks_originais.sentimento, vindo do n8n): pode ser
 * 'Positivo' | 'Negativo' | 'Positivo e Negativo' (misto) | 'Neutro' | 'Sugestão'.
 * PEDAÇOS SEPARADOS (feedbacks_restaurante.sentimento): 'Positivo' |
 * 'Negativo' | 'Neutro' | 'Sugestão' (se tem os dois, o n8n divide em dois
 * pedaços). Linhas antigas vêm em minúscula.
 *
 * Neutro não gera insight; Sugestão gera, como ponto a melhorar (regra do
 * backend em supabase/functions/_shared/sentimento.ts).
 *
 * Cores: positivo=verde, negativo=vermelho, neutro=CINZA, misto (positivo e
 * negativo)=AMARELO, sugestão=AZUL-CÉU.
 */
export type TipoSentimento = 'positivo' | 'negativo' | 'misto' | 'neutro' | 'sugestao'

/** Sem acento e em minúscula: "Sugestão" e "sugestao" são a mesma coisa. */
function normalizar(valor?: string | null): string {
  return (valor || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function ehSugestao(valor?: string | null): boolean {
  return normalizar(valor).includes('sugest')
}

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
  const v = normalizar(valor)
  const temPositivo = v.includes('positivo') || v.includes('positive')
  const temNegativo = v.includes('negativo') || v.includes('negative')
  if (temPositivo && temNegativo) return 'misto'
  if (temPositivo) return 'positivo'
  if (temNegativo) return 'negativo'
  if (v.includes('sugest')) return 'sugestao'
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
    case 'sugestao':
      return 'Sugestão'
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
  sugestao: { badge: 'bg-sky-200 text-sky-800 border-sky-300', texto: 'text-sky-600', dot: 'bg-sky-500' },
}

export function coresSentimento(valor?: string | null) {
  return CORES_SENTIMENTO[tipoSentimento(valor)]
}
