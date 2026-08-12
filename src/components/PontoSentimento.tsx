import { cn } from '@/lib/utils'
import { coresSentimento } from '@/lib/sentimento'

/** Bolinha de sentimento: verde (positivo), vermelho (negativo), amarelo
 *  (neutro) e verde+vermelho (misto = "positivo e negativo"). */
export function PontoSentimento({
  sentimento,
  className,
}: {
  sentimento?: string | null
  className?: string
}) {
  const c = coresSentimento(sentimento)
  return (
    <span
      className={cn('inline-block rounded-full shrink-0', c.dot, className)}
      style={c.dotStyle}
    />
  )
}
