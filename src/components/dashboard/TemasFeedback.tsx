import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { buscarTemas, type TemaFeedback, type SentimentoFiltro } from '@/lib/queries/temas'
import { cn } from '@/lib/utils'
import { Check, AlertTriangle, Lightbulb, MessagesSquare, Minus } from 'lucide-react'

const SENTIMENTOS: { key: SentimentoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'negativo', label: 'Negativos' },
  { key: 'positivo', label: 'Positivos' },
  { key: 'neutro', label: 'Neutros' },
  { key: 'sugestao', label: 'Sugestões' },
]

type Tom = 'atencao' | 'positivo' | 'sugestao' | 'neutro'

// Mesmas cores dos cartões de feedback (src/lib/sentimento.ts): sugestão
// azul-céu, neutro cinza — o amarelo fica só para o misto.
const TONS: Record<Tom, { fundo: string; bolinha: string; numero: string; titulo: string; Icone: typeof Check }> = {
  atencao: { fundo: 'bg-red-100', bolinha: 'bg-red-500', numero: 'bg-red-600', titulo: 'text-red-600', Icone: AlertTriangle },
  positivo: { fundo: 'bg-emerald-100', bolinha: 'bg-emerald-500', numero: 'bg-emerald-600', titulo: 'text-emerald-600', Icone: Check },
  sugestao: { fundo: 'bg-sky-100', bolinha: 'bg-sky-500', numero: 'bg-sky-600', titulo: 'text-sky-600', Icone: Lightbulb },
  neutro: { fundo: 'bg-slate-100', bolinha: 'bg-slate-400', numero: 'bg-slate-500', titulo: 'text-slate-500', Icone: Minus },
}

/**
 * Os quatro grupos, na ordem em que aparecem. Em "Todos", pontos de atenção e
 * positivos aparecem sempre; sugestões e neutros só quando há algum, para a
 * tela não encher de listas vazias.
 */
const GRUPOS: Array<{
  filtro: Exclude<SentimentoFiltro, 'todos'>
  tipo: string
  tom: Tom
  titulo: string
  vazio: string
  sempre: boolean
}> = [
  { filtro: 'negativo', tipo: 'reclamacao', tom: 'atencao', titulo: 'Pontos de Atenção', vazio: 'Nenhum ponto de atenção neste período', sempre: true },
  { filtro: 'positivo', tipo: 'elogio', tom: 'positivo', titulo: 'Sentimentos Positivos', vazio: 'Nenhum tema positivo neste período', sempre: true },
  { filtro: 'sugestao', tipo: 'sugestao', tom: 'sugestao', titulo: 'Sugestões', vazio: 'Nenhuma sugestão neste período', sempre: false },
  { filtro: 'neutro', tipo: 'neutro', tom: 'neutro', titulo: 'Comentários Neutros', vazio: 'Nenhum comentário neutro neste período', sempre: false },
]

function TemaPill({ tema, tom }: { tema: TemaFeedback; tom: Tom }) {
  const cor = TONS[tom]
  // Só existe pra rótulo cortado — clicar alterna pra mostrar inteiro. Se o
  // rótulo nem precisava cortar, o clique simplesmente não muda nada visível.
  const [expandido, setExpandido] = useState(false)
  return (
    <div
      className={cn('flex items-center gap-2.5 rounded-full pl-2 pr-2 py-1.5 cursor-pointer', cor.fundo)}
      onClick={() => setExpandido((v) => !v)}
      title={expandido ? 'Clique para recolher' : 'Clique para ver o rótulo inteiro'}
    >
      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0', cor.bolinha)}>
        <cor.Icone className="h-3 w-3" strokeWidth={tom === 'positivo' ? 3 : 2.5} />
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
          cor.numero,
        )}
      >
        {tema.quantidade}
      </span>
    </div>
  )
}

/**
 * "O que os clientes estão comentando": os feedbacks semelhantes já agrupados em
 * temas (pela IA, no momento que chegam), por tipo: pontos de atenção,
 * positivos, sugestões e neutros. As abas controlam só a exibição (a busca
 * sempre traz tudo, então trocar de aba não recarrega). A JANELA DE TEMPO vem
 * da página, pelo prop `dias`. Atualiza sozinho por Realtime — sem recarregar
 * a página.
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

  // Em "Todos": os grupos fixos e os que têm algum tema; numa aba: só aquele grupo.
  const grupos = GRUPOS
    .map((g) => ({ ...g, temas: temas.filter((t) => t.tipo === g.tipo) }))
    .filter((g) => (sentimento === 'todos' ? g.sempre || g.temas.length > 0 : g.filtro === sentimento))
  const nadaAgrupado = grupos.every((g) => g.temas.length === 0)

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

        {/* Filtro de sentimento — segmentado, discreto. Com cinco abas, quebra
            linha em tela estreita em vez de empurrar a página para o lado. */}
        <div className="inline-flex flex-wrap rounded-lg bg-muted/60 p-0.5 text-xs">
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
          <div className={cn('grid gap-x-8 gap-y-6 p-5', grupos.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
            {grupos.map((g) => (
              <div key={g.filtro}>
                <p className={cn('text-xs font-bold uppercase tracking-wide mb-3', TONS[g.tom].titulo)}>{g.titulo}</p>
                <div className="flex flex-col gap-2">
                  {g.temas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{g.vazio}</p>
                  ) : (
                    g.temas.map((t) => <TemaPill key={t.id} tema={t} tom={g.tom} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
