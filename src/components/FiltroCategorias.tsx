import { useState } from 'react'
import { Check, Tags, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CATEGORIAS_FEEDBACK, estiloCategoria } from '@/lib/categorias-feedback'
import { cn } from '@/lib/utils'

interface FiltroCategoriasProps {
  /**
   * Quantos itens cada categoria tem NO PERÍODO/FILTRO ativo. Categoria que não
   * aparece aqui é tratada como zero.
   */
  contagens: Record<string, number>
  selecionadas: string[]
  onChange: (categorias: string[]) => void
  /** Palavra contada, para o título ("feedbacks" / "insights"). */
  rotuloItens?: string
  className?: string
}

/**
 * Filtro de categorias em popover (não em pílulas soltas nem em `<select>`
 * nativo) — escala sem virar bagunça, e mostra ícone + cor de cada categoria
 * (via `estiloCategoria`). Usado idêntico em /feedbacks e /insights.
 *
 * Só aparecem as categorias que TÊM item no período/filtro ativo. Oferecer uma
 * categoria vazia é oferecer um clique que só devolve lista vazia; e a lista
 * encolher quando o dono aperta o período é a resposta certa — ela descreve o
 * que existe ali, não o catálogo inteiro de 14.
 *
 * O número à direita é a contagem daquela categoria no mesmo recorte.
 */
export function FiltroCategorias({
  contagens,
  selecionadas,
  onChange,
  rotuloItens = 'feedbacks',
  className,
}: FiltroCategoriasProps) {
  const [aberto, setAberto] = useState(false)

  const toggle = (cat: string) => {
    onChange(
      selecionadas.includes(cat)
        ? selecionadas.filter((c) => c !== cat)
        : [...selecionadas, cat],
    )
  }

  // Ordem oficial da paleta, mantendo só o que tem item. Ordenar por contagem
  // faria a posição de cada categoria dançar a cada troca de período.
  const visiveis = CATEGORIAS_FEEDBACK.filter((c) => (contagens[c] ?? 0) > 0)

  // Sem nenhuma categoria no recorte, o filtro não tem o que oferecer.
  if (visiveis.length === 0) return null

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
      <PopoverContent className="w-72 p-0" align="start">
        <div className="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Categoria
          <span className="float-right normal-case tracking-normal">{rotuloItens}</span>
        </div>
        <div className="max-h-80 overflow-y-auto p-1 pt-0">
          {visiveis.map((cat) => {
            const estilo = estiloCategoria(cat)
            const Icon = estilo.icon
            const ativo = selecionadas.includes(cat)
            const total = contagens[cat] ?? 0

            return (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left transition-colors hover:bg-gray-100',
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
                {/* `tabular-nums` alinha os números na vertical mesmo com
                    larguras diferentes (1 vs 48). */}
                <span className="shrink-0 w-7 text-right text-xs font-semibold tabular-nums text-gray-900">
                  {total}
                </span>
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
