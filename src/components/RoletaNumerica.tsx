import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

interface RoletaNumericaProps {
  min: number
  max: number
  value: number
  onChange: (valor: number) => void
  className?: string
}

const ALTURA_ITEM = 56

/**
 * Seletor numérico em roleta vertical — mesma lógica do picker de hora/minuto
 * dos alarmes do celular: rola (ou clica num número da lista) pra escolher,
 * o valor no centro fica grande e em negrito, os vizinhos ficam pequenos e
 * apagados.
 */
export function RoletaNumerica({ min, max, value, onChange, className }: RoletaNumericaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const numeros = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max])
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Centraliza no valor inicial ao montar — como o popup remonta este
  // componente toda vez que abre, isso já cobre "abrir de novo com o valor
  // salvo" sem precisar re-sincronizar depois (o que brigaria com o scroll
  // do usuário).
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = (value - min) * ALTURA_ITEM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScroll = () => {
    const el = ref.current
    if (!el) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // Só confirma o valor quando o scroll para (debounce) — enquanto rola
    // rápido, o número central troca só visualmente.
    timeoutRef.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ALTURA_ITEM)
      const novo = min + Math.min(Math.max(idx, 0), numeros.length - 1)
      if (novo !== value) onChange(novo)
    }, 80)
  }

  const irPara = (n: number) => {
    ref.current?.scrollTo({ top: (n - min) * ALTURA_ITEM, behavior: 'smooth' })
  }

  return (
    <div className={cn('relative select-none', className)}>
      {/* Faixa central que marca onde o número escolhido fica. */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 border-y border-gray-200"
        style={{ height: ALTURA_ITEM }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="sem-barra overflow-y-scroll snap-y snap-mandatory"
        style={{ height: ALTURA_ITEM * 3, paddingTop: ALTURA_ITEM, paddingBottom: ALTURA_ITEM }}
      >
        {numeros.map((n) => {
          const ativo = n === value
          return (
            <div
              key={n}
              onClick={() => irPara(n)}
              className="flex items-center justify-center snap-center cursor-pointer"
              style={{ height: ALTURA_ITEM }}
            >
              <span
                className={cn(
                  'tabular-nums transition-all',
                  ativo ? 'text-4xl font-bold text-gray-900' : 'text-lg font-medium text-gray-300',
                )}
              >
                {n}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
