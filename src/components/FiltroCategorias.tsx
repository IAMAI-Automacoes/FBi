import { useState } from 'react'
import { Check, Tags, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { cn } from '@/lib/utils'

interface FiltroCategoriasProps {
  /** Categorias que o restaurante de fato tem (só essas aparecem na lista). */
  disponiveis: string[]
  selecionadas: string[]
  onChange: (categorias: string[]) => void
  className?: string
}

/**
 * Filtro de categorias em popover (não em pílulas soltas nem em <select>
 * nativo) — escala pras 14 categorias possíveis sem virar bagunça, e mostra
 * ícone+cor de cada uma (via `estiloCategoria`). Usado idêntico em
 * /feedbacks e /insights.
 */
export function FiltroCategorias({
  disponiveis,
  selecionadas,
  onChange,
  className,
}: FiltroCategoriasProps) {
  const [aberto, setAberto] = useState(false)

  if (disponiveis.length === 0) return null

  const toggle = (cat: string) => {
    onChange(
      selecionadas.includes(cat)
        ? selecionadas.filter((c) => c !== cat)
        : [...selecionadas, cat],
    )
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 bg-white shadow-sm border-gray-200 font-normal justify-start max-w-[200px]',
            className,
          )}
        >
          <Tags className="mr-2 h-4 w-4 text-gray-400 shrink-0" />
          <span className="truncate">
            {selecionadas.length === 0
              ? 'Categoria'
              : selecionadas.length === 1
                ? selecionadas[0]
                : `${selecionadas.length} categorias`}
          </span>
          {selecionadas.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar categorias"
              onClick={(e) => {
                e.stopPropagation()
                onChange([])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange([])
                }
              }}
              className="ml-2 -mr-1 shrink-0 rounded-sm p-0.5 hover:bg-gray-100 text-gray-500"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="max-h-72 overflow-y-auto p-1">
          {disponiveis.map((cat) => {
            const estilo = estiloCategoria(cat)
            const Icon = estilo.icon
            const ativo = selecionadas.includes(cat)
            return (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left hover:bg-gray-100 transition-colors',
                  ativo && 'bg-gray-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0',
                    estilo.corSolida,
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate text-gray-700">{cat}</span>
                {ativo && <Check className="h-4 w-4 text-[#1D4ED8] shrink-0" />}
              </button>
            )
          })}
        </div>
        {selecionadas.length > 0 && (
          <div className="border-t p-2 flex justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
