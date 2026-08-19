import { useState } from 'react'
import { cn } from '@/lib/utils'
import { coresSentimento, rotuloSentimento } from '@/lib/sentimento'
import { estiloCategoria } from '@/lib/categorias-feedback'

interface FeedbackOriginalCardProps {
  texto: string
  sentimento?: string | null
  /** Categorias dos feedbacks SEPARADOS ligados a essa mensagem original (não a mensagem em si). */
  categorias: string[]
  /** Data/hora já formatada (ex.: "há 2h", "12 ago"). */
  quando: string
  /** Corta a citação em 2 linhas (clicável pra ver inteira) — usado no resumo da Visão Geral, não na página cheia de Feedbacks. */
  truncar?: boolean
}

/**
 * Um feedback original (a mensagem inteira do cliente), com o selo de
 * sentimento e as categorias — mesmo visual em Visão Geral ("Últimos
 * Feedbacks") e na página /feedbacks, pra nunca desalinhar ou divergir.
 *
 * O selo fica numa coluna de largura FIXA (cabe "Positivo e negativo" inteiro
 * numa linha só) pra a citação sempre começar na mesma vertical, não importa
 * o tamanho do rótulo do sentimento daquele feedback.
 */
export function FeedbackOriginalCard({
  texto,
  sentimento,
  categorias,
  quando,
  truncar = false,
}: FeedbackOriginalCardProps) {
  const cor = coresSentimento(sentimento)
  // Só existe pra cortar em 2 linhas — clicar alterna pra mostrar inteiro. Se
  // o texto nem precisava cortar, o clique simplesmente não muda nada visível.
  const [expandido, setExpandido] = useState(false)
  const cortado = truncar && !expandido

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
      <div className="sm:w-[152px] shrink-0">
        <span
          className={cn(
            'flex w-full items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
            cor.badge,
          )}
        >
          {rotuloSentimento(sentimento)}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              'text-[15px] text-foreground leading-relaxed',
              truncar && 'text-sm cursor-pointer',
              cortado && 'line-clamp-2',
            )}
            onClick={truncar ? () => setExpandido((v) => !v) : undefined}
            title={truncar ? (cortado ? 'Clique para ver o feedback inteiro' : 'Clique para recolher') : undefined}
          >
            "{texto}"
          </p>
          <span className="text-[12px] text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
            {quando}
          </span>
        </div>
        {categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((cat) => {
              const estilo = estiloCategoria(cat)
              const Icon = estilo.icon
              return (
                <span
                  key={cat}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    estilo.corFundo,
                    estilo.corTexto,
                    estilo.corBorda,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cat}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
