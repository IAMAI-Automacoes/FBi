import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { buscarTemas, type TemaFeedback, type SentimentoFiltro } from '@/lib/queries/temas'
import { cn } from '@/lib/utils'
import { Check, AlertTriangle, MessagesSquare } from 'lucide-react'

const SENTIMENTOS: { key: SentimentoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'negativo', label: 'Negativos' },
  { key: 'positivo', label: 'Positivos' },
]

function TemaPill({ tema, tom }: { tema: TemaFeedback; tom: 'positivo' | 'atencao' }) {
  const isPositivo = tom === 'positivo'
  // Só existe pra rótulo cortado — clicar alterna pra mostrar inteiro. Se o
  // rótulo nem precisava cortar, o clique simplesmente não muda nada visível.
  const [expandido, setExpandido] = useState(false)
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-full pl-2 pr-2 py-1.5 cursor-pointer',
        isPositivo ? 'bg-emerald-100' : 'bg-red-100',
      )}
      onClick={() => setExpandido((v) => !v)}
      title={expandido ? 'Clique para recolher' : 'Clique para ver o rótulo inteiro'}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0',
          isPositivo ? 'bg-emerald-500' : 'bg-red-500',
        )}
      >
        {isPositivo
          ? <Check className="h-3 w-3" strokeWidth={3} />
          : <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground/90',
          expandido ? 'whitespace-normal break-words' : 'truncate',
        )}
      >
        {tema.rotulo}
      </span>
      <span
        className={cn(
          'shrink-0 min-w-[26px] text-center rounded-full text-white text-xs font-bold px-2 py-0.5 tabular-nums',
          isPositivo ? 'bg-emerald-600' : 'bg-red-600',
        )}
      >
        {tema.quantidade}
      </span>
    </div>
  )
}

/**
 * "O que os clientes estão comentando": os feedbacks semelhantes já agrupados em
 * temas (pela IA, no momento que chegam), em duas colunas por sentimento
 * (positivos / pontos de atenção). Temas neutros não entram aqui — continuam
 * contados normalmente no resto do dashboard, só não aparecem nesta lista.
 * As abas Todos/Positivos/Negativos controlam só a exibição (a busca sempre
 * traz tudo, então trocar de aba não recarrega). A JANELA DE TEMPO vem da
 * página, pelo prop `dias`. Atualiza sozinho por Realtime — sem recarregar a
 * página.
 */
export function TemasFeedback({
  restauranteId,
  dias,
}: {
  restauranteId: number | null
  /** Janela em dias, vinda do filtro da PÁGINA. */
  dias: number
}) {
  const [temas, setTemas] = useState<TemaFeedback[]>([])
  const [sentimento, setSentimento] = useState<SentimentoFiltro>('todos')
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    try { setTemas(await buscarTemas(restauranteId, dias, 'todos')) } catch { /* silencioso */ }
    setCarregado(true)
  }, [restauranteId, dias])

  useEffect(() => { carregar() }, [carregar])

  // Realtime: qualquer mudança nos temas deste restaurante recarrega a lista.
  useEffect(() => {
    if (!restauranteId) return
    const ch = supabase
      .channel(`temas-${restauranteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_temas', filter: `restaurante_id=eq.${restauranteId}` },
        () => carregar(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restauranteId, carregar])

  const positivos = temas.filter((t) => t.tipo === 'elogio')
  const negativos = temas.filter((t) => t.tipo === 'reclamacao')

  const mostrarPositivos = sentimento === 'todos' || sentimento === 'positivo'
  const mostrarNegativos = sentimento === 'todos' || sentimento === 'negativo'
  const nadaAgrupado = positivos.length === 0 && negativos.length === 0

  return (
    <Card className="shadow-subtle">
      <CardHeader className="p-5 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Sem seletor de período próprio: o da página manda em tudo.
              Dois controles de data na mesma tela deixavam este bloco falando
              de 30 dias enquanto os números acima falavam de 7, sem nada
              dizendo que eram recortes diferentes. */}
          <CardTitle className="text-base font-semibold">O que os clientes estão comentando</CardTitle>
        </div>

        {/* Filtro de sentimento — segmentado, discreto */}
        <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs">
          {SENTIMENTOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSentimento(s.key)}
              className={cn(
                'px-3 py-1 rounded-md font-medium transition-colors',
                sentimento === s.key
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {!carregado ? (
          <p className="text-sm text-muted-foreground px-5 py-10 text-center">Carregando…</p>
        ) : nadaAgrupado ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessagesSquare className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Nada agrupado neste filtro ainda</p>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-x-8 gap-y-6 p-5',
              mostrarPositivos && mostrarNegativos ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
            )}
          >
            {mostrarNegativos && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-3">
                  Pontos de Atenção
                </p>
                <div className="flex flex-col gap-2">
                  {negativos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum ponto de atenção neste período</p>
                  ) : (
                    negativos.map((t) => <TemaPill key={t.id} tema={t} tom="atencao" />)
                  )}
                </div>
              </div>
            )}

            {mostrarPositivos && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-3">
                  Sentimentos Positivos
                </p>
                <div className="flex flex-col gap-2">
                  {positivos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum tema positivo neste período</p>
                  ) : (
                    positivos.map((t) => <TemaPill key={t.id} tema={t} tom="positivo" />)
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
