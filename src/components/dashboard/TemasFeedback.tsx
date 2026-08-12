import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { buscarTemas, type TemaFeedback, type SentimentoFiltro } from '@/lib/queries/temas'
import { cn } from '@/lib/utils'
import { MessagesSquare } from 'lucide-react'

const SENTIMENTOS: { key: SentimentoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'positivo', label: 'Positivos' },
  { key: 'negativo', label: 'Negativos' },
]

const PERIODOS = [
  { dias: 7, label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 0, label: 'Todo o período' },
]

// Indicador de sentimento discreto (um pontinho), pra não poluir.
const dotCor: Record<string, string> = {
  elogio: 'bg-emerald-500',
  reclamacao: 'bg-rose-500',
  neutro: 'bg-amber-400',
}

/**
 * "O que os clientes estão comentando": os feedbacks semelhantes já agrupados em
 * temas (pela IA, no momento que chegam), em lista, do mais falado pro menos.
 * Filtros de sentimento e período. Atualiza sozinho por Realtime — sem recarregar.
 */
export function TemasFeedback({ restauranteId }: { restauranteId: number | null }) {
  const [temas, setTemas] = useState<TemaFeedback[]>([])
  const [sentimento, setSentimento] = useState<SentimentoFiltro>('todos')
  const [dias, setDias] = useState(30)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    try { setTemas(await buscarTemas(restauranteId, dias, sentimento)) } catch { /* silencioso */ }
    setCarregado(true)
  }, [restauranteId, dias, sentimento])

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

  return (
    <Card className="shadow-subtle">
      <CardHeader className="p-5 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base font-semibold">O que os clientes estão comentando</CardTitle>
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.dias} value={String(p.dias)} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        ) : temas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessagesSquare className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Nada agrupado neste filtro ainda</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {temas.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                <span
                  className={cn('h-2 w-2 rounded-full shrink-0', dotCor[t.tipo] ?? dotCor.neutro)}
                  title={t.tipo === 'elogio' ? 'Positivo' : t.tipo === 'reclamacao' ? 'Negativo' : 'Neutro'}
                />
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{t.rotulo}</span>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {t.quantidade}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
