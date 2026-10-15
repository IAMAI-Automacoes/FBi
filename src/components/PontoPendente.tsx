import { cn } from '@/lib/utils'

/**
 * Bolinha amarela de "falta preencher". Amarelo e não vermelho: vermelho no
 * app é erro, exclusão e mensagem não lida; aqui é só pendência.
 *
 * Com `numero` vira o selo de notificação (avatar); sem, é o ponto ao lado de
 * um rótulo. `suave` troca o anel que se expande por um piscar lento — para
 * quando há vários na mesma tela e o anel cansaria a vista.
 */
export function PontoPendente({
  numero,
  titulo,
  suave = false,
  className,
}: {
  numero?: number
  titulo: string
  suave?: boolean
  className?: string
}) {
  const comNumero = numero != null
  return (
    <span className={cn('relative inline-flex shrink-0', className)} title={titulo}>
      <span className="sr-only">{titulo}</span>
      {!suave && (
        <span
          aria-hidden
          className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative inline-flex items-center justify-center rounded-full bg-amber-400',
          comNumero
            ? 'h-[17px] min-w-[17px] px-1 text-[10px] font-bold leading-none text-amber-950 ring-2 ring-white'
            : 'h-2.5 w-2.5',
          suave && 'motion-safe:animate-pulse',
        )}
      >
        {comNumero && (numero > 9 ? '9+' : numero)}
      </span>
    </span>
  )
}
