import { cn } from '@/lib/utils'

/**
 * Bolinha amarela de "falta preencher", com um anel que pulsa. Amarelo e não
 * vermelho: vermelho no app é erro, exclusão e mensagem não lida; aqui é só
 * pendência.
 */
export function PontoPendente({ titulo, className }: { titulo: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)} title={titulo}>
      <span className="sr-only">{titulo}</span>
      <span
        aria-hidden
        className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping"
      />
      <span aria-hidden className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
    </span>
  )
}
