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
 * nativo) — escala pras 14 categorias sem virar bagunça, e mostra ícone + cor
 * de cada uma (via `estiloCategoria`). Usado idêntico em /feedbacks e /insights.
 *
 * ## Mostra as 14 SEMPRE, não só as que têm dado
 *
 * Antes a lista vinha de `buscarCategoriasAtivas`, que só devolvia as
 * categorias já vistas em algum feedback — 10 das 14 neste restaurante. As
 * outras quatro simplesmente não existiam na tela, e não havia como saber se
 * era porque ninguém reclamou de Higiene ou porque o filtro estava quebrado.
 *
 * Com a contagem ao lado, a ausência vira informação: "Higiene 0" diz que a
 * categoria existe e está zerada. As zeradas ficam esmaecidas e não clicáveis —
 * filtrar por elas só devolveria lista vazia.
 *
 * A ordem coloca as que têm dado primeiro (preservando a ordem oficial entre
 * elas) e as zeradas no fim. Assim o que importa fica no topo sem que a posição
 * de uma categoria dance a cada mudança de filtro.
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

  const comDado = CATEGORIAS_FEEDBACK.filter((c) => (contagens[c] ?? 0) > 0)
  const zeradas = CATEGORIAS_FEEDBACK.filter((c) => (contagens[c] ?? 0) === 0)
  const ordenadas = [...comDado, ...zeradas]

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
          {ordenadas.map((cat) => {
            const estilo = estiloCategoria(cat)
            const Icon = estilo.icon
            const ativo = selecionadas.includes(cat)
            const total = contagens[cat] ?? 0
            const vazia = total === 0

            return (
              <button
                key={cat}
                onClick={() => !vazia && toggle(cat)}
                disabled={vazia}
                title={vazia ? `Nenhum ${rotuloItens.replace(/s$/, '')} nesta categoria` : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left transition-colors',
                  vazia ? 'opacity-45 cursor-default' : 'hover:bg-gray-100',
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
                <span
                  className={cn(
                    'shrink-0 w-7 text-right text-xs tabular-nums',
                    vazia ? 'text-gray-400' : 'font-medium text-gray-500',
                  )}
                >
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
