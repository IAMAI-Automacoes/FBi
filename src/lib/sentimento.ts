/**
 * Rótulo de exibição do sentimento de um feedback.
 *
 * No banco, "neutro" NÃO quer dizer "morno": é a avaliação que trouxe ao mesmo
 * tempo um ponto positivo E um negativo. Por isso, na interface, ela aparece
 * como "Positivo / Negativo" — o valor guardado continua sendo `neutro`.
 */
export function rotuloSentimento(valor?: string | null): string {
  switch ((valor || '').toLowerCase()) {
    case 'positivo':
    case 'positive':
      return 'Positivo'
    case 'negativo':
    case 'negative':
      return 'Negativo'
    case 'sugestão':
    case 'sugestao':
    case 'suggestion':
      return 'Sugestão'
    case 'neutro':
    case 'neutral':
      return 'Positivo / Negativo'
    default:
      return valor || 'Positivo / Negativo'
  }
}
