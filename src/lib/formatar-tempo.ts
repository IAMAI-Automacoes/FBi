import { format, isSameDay, subDays, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Data/hora de um feedback, com a regra: HOJE mostra a hora exata; ONTEM
 * mostra "há X horas"; qualquer coisa mais antiga mostra a data + dia da
 * semana. Usada em toda tela que lista feedbacks (Visão Geral e /feedbacks),
 * pra elas nunca mostrarem formatos diferentes pro mesmo dado.
 */
export function formatarDataFeedback(dataISO: string | Date): string {
  const data = typeof dataISO === 'string' ? new Date(dataISO) : dataISO
  const agora = new Date()

  if (isSameDay(data, agora)) {
    return format(data, 'HH:mm', { locale: ptBR })
  }
  if (isSameDay(data, subDays(agora, 1))) {
    return formatDistanceToNow(data, { addSuffix: true, locale: ptBR })
  }
  return format(data, "d 'de' MMM, EEEE", { locale: ptBR })
}
