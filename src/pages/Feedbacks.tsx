import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarDays, Search, Folder, X, Tags, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { buscarFeedbacks, buscarCategoriasAtivas, FiltrosFeedback } from '@/lib/queries/feedbacks'
import { FeedbackOriginalCard } from '@/components/FeedbackOriginalCard'
import { DataSegmentada } from '@/components/DataSegmentada'
import { formatarDataFeedback } from '@/lib/formatar-tempo'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { supabase } from '@/lib/supabase/client'

const LIMIT = 10

const PERIODOS: { value: FiltrosFeedback['periodo']; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
]

function rotuloPeriodo(filtros: FiltrosFeedback): string {
  if (filtros.datas) {
    const { from, to } = filtros.datas
    if (!to || isSameDay(from, to)) return format(from, "d 'de' MMM", { locale: ptBR })
    return `${format(from, 'd MMM', { locale: ptBR })} – ${format(to, 'd MMM', { locale: ptBR })}`
  }
  return PERIODOS.find((p) => p.value === filtros.periodo)?.label ?? 'Período'
}

export default function Feedbacks() {
  const { toast } = useToast()
  const { usuario } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [totalFeedbacks, setTotalFeedbacks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])
  const [periodoAberto, setPeriodoAberto] = useState(false)
  const [categoriaAberta, setCategoriaAberta] = useState(false)
  /** Preenchido quando a página foi aberta a partir de um insight ou de uma ação. */
  const [filtroInsight, setFiltroInsight] = useState<{ id: string; titulo: string } | null>(null)

  const [filtros, setFiltros] = useState<FiltrosFeedback>({
    periodo: '7d',
    sentimento: 'all',
    categorias: [],
    busca: '',
    ordenacao: 'recent',
  })
  const [offset, setOffset] = useState(0)

  const definirInicio = (data: Date | undefined) => {
    if (!data) return
    setFiltros((prev) => {
      const to = prev.datas?.to
      return { ...prev, datas: { from: data, to: to && to < data ? data : to } }
    })
  }
  const definirFim = (data: Date | undefined) => {
    if (!data) return
    setFiltros((prev) => {
      const from = prev.datas?.from ?? data
      return { ...prev, datas: { from: from > data ? data : from, to: data } }
    })
  }

  // /feedbacks?insight_id=... → mostra só os feedbacks que geraram o insight.
  const insightIdParam = searchParams.get('insight_id')
  useEffect(() => {
    if (!insightIdParam) {
      setFiltroInsight(null)
      return
    }
    let vivo = true
    void (async () => {
      const { data, error } = await supabase
        .from('insights')
        .select('id, titulo, feedback_ids')
        .eq('id', insightIdParam)
        .single()

      if (!vivo) return
      if (error || !data) {
        toast({ title: 'Insight não encontrado', variant: 'destructive' })
        setSearchParams({})
        return
      }

      setFiltroInsight({ id: data.id, titulo: data.titulo ?? 'Insight' })
      // `periodo: 'all'` é essencial: o padrão de 7 dias esconderia os
      // feedbacks mais antigos que originaram o insight.
      setFiltros((prev) => ({ ...prev, periodo: 'all', ids: data.feedback_ids ?? [] }))
    })()
    return () => { vivo = false }
  }, [insightIdParam, toast, setSearchParams])

  const limparFiltroInsight = () => {
    setFiltroInsight(null)
    setFiltros((prev) => ({ ...prev, ids: undefined, periodo: '7d' }))
    setSearchParams({})
  }

  useEffect(() => {
    buscarCategoriasAtivas(usuario?.restaurante_id ?? undefined, filtros.periodo)
      .then(setCategoriasDisponiveis)
      .catch(console.error)
  }, [usuario?.restaurante_id, filtros.periodo])

  // Recarrega do zero — dispara sempre que os filtros mudam. NÃO depende de
  // `offset`: se dependesse, "Carregar mais" (que muda o offset) faria este
  // efeito rodar de novo e resetar a lista pro início — era o bug do botão
  // "carrega mais e depois some".
  const carregarDoZero = useCallback(async () => {
    try {
      setLoading(true)
      const { feedbacks: newFbs, total } = await buscarFeedbacks(filtros, LIMIT, 0)
      setFeedbacks(newFbs)
      setTotalFeedbacks(total)
      setOffset(0)
    } catch (err) {
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar os feedbacks.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [filtros, toast])

  useEffect(() => {
    const timeoutId = setTimeout(() => carregarDoZero(), 300)
    return () => clearTimeout(timeoutId)
  }, [filtros, carregarDoZero])

  // Tempo real: novo feedback recarrega a lista sozinho.
  useRealtimeReload(
    ['feedbacks_originais', 'feedbacks_restaurante'],
    usuario?.restaurante_id ?? null,
    () => carregarDoZero(),
  )

  // "Carregar mais" — função separada de propósito (ver comentário acima).
  const carregarMais = async () => {
    try {
      setLoading(true)
      const proximoOffset = offset + LIMIT
      const { feedbacks: newFbs, total } = await buscarFeedbacks(filtros, LIMIT, proximoOffset)
      setFeedbacks((prev) => [...prev, ...newFbs])
      setTotalFeedbacks(total)
      setOffset(proximoOffset)
    } catch (err) {
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar mais feedbacks.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleCategoria = (cat: string) => {
    setFiltros((prev) => ({
      ...prev,
      categorias: prev.categorias.includes(cat)
        ? prev.categorias.filter((c) => c !== cat)
        : [...prev.categorias, cat],
    }))
  }

  const dataToDisplay = feedbacks

  const escolherPreset = (periodo: FiltrosFeedback['periodo']) => {
    setFiltros((prev) => ({ ...prev, periodo, datas: undefined }))
    setPeriodoAberto(false)
  }

  const escolherIntervalo = (range: DateRange | undefined) => {
    setFiltros((prev) => ({
      ...prev,
      datas: range?.from ? { from: range.from, to: range.to } : undefined,
    }))
  }

  return (
    <div className="mx-auto max-w-[1050px] pb-12 animate-fade-in-up">
      {filtroInsight && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm text-blue-900">
            Filtrando pelos feedbacks que geraram o insight{' '}
            <strong className="font-semibold">"{filtroInsight.titulo}"</strong>
          </span>
          <button
            onClick={limparFiltroInsight}
            title="Limpar filtro"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-blue-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-3 mb-6 items-start xl:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Período: atalhos (7/30/90 dias, tudo) + calendário de intervalo, num controle só */}
          <Popover open={periodoAberto} onOpenChange={setPeriodoAberto}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 bg-white shadow-sm border-gray-200 font-normal justify-start"
              >
                <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
                {rotuloPeriodo(filtros)}
                {filtros.datas && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Limpar intervalo"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFiltros((prev) => ({ ...prev, datas: undefined }))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        setFiltros((prev) => ({ ...prev, datas: undefined }))
                      }
                    }}
                    className="ml-2 -mr-1 rounded-sm p-0.5 hover:bg-gray-100 text-gray-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex flex-col">
                <div className="flex flex-col sm:flex-row">
                  <div className="flex sm:flex-col gap-0.5 p-2 sm:border-r border-b sm:border-b-0">
                    {PERIODOS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => escolherPreset(p.value)}
                        className={cn(
                          'text-left text-sm px-3 py-2 rounded-md whitespace-nowrap hover:bg-gray-100 transition-colors',
                          !filtros.datas && filtros.periodo === p.value
                            ? 'bg-[#EFF6FF] text-[#1D4ED8] font-medium'
                            : 'text-gray-700',
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <Calendar
                      mode="range"
                      selected={filtros.datas}
                      onSelect={escolherIntervalo}
                      locale={ptBR}
                      disabled={{ after: new Date() }}
                      endMonth={new Date()}
                    />
                  </div>
                </div>
                {/* Fileira só do tamanho do conteúdo — o campo "De" acaba caindo
                    do lado esquerdo (embaixo dos atalhos) e o "até" do lado
                    direito (embaixo do calendário), sem precisar de duas colunas. */}
                <div className="border-t p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Datas selecionadas</p>
                  <div className="flex items-center gap-2 w-fit">
                    <DataSegmentada
                      value={filtros.datas?.from}
                      onChange={definirInicio}
                      maxDate={new Date()}
                    />
                    <span className="text-xs text-muted-foreground shrink-0">até</span>
                    <DataSegmentada
                      value={filtros.datas?.to}
                      onChange={definirFim}
                      maxDate={new Date()}
                    />
                  </div>
                  {filtros.datas && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setFiltros((prev) => ({ ...prev, datas: undefined }))}
                      >
                        Limpar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Select
            value={filtros.sentimento}
            onValueChange={(val) => setFiltros((prev) => ({ ...prev, sentimento: val }))}
          >
            <SelectTrigger className="w-[190px] h-10 bg-white shadow-sm border-gray-200">
              <SelectValue placeholder="Todos Sentimentos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Sentimentos</SelectItem>
              <SelectItem value="positivo">Positivo</SelectItem>
              <SelectItem value="negativo">Negativo</SelectItem>
              <SelectItem value="positivo e negativo">Positivo e negativo</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filtros.ordenacao}
            onValueChange={(val: any) => setFiltros((prev) => ({ ...prev, ordenacao: val }))}
          >
            <SelectTrigger className="w-[150px] h-10 bg-white shadow-sm border-gray-200">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
            </SelectContent>
          </Select>

          {categoriasDisponiveis.length > 0 && (
            <Popover open={categoriaAberta} onOpenChange={setCategoriaAberta}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 bg-white shadow-sm border-gray-200 font-normal justify-start max-w-[200px]"
                >
                  <Tags className="mr-2 h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">
                    {filtros.categorias.length === 0
                      ? 'Categoria'
                      : filtros.categorias.length === 1
                        ? filtros.categorias[0]
                        : `${filtros.categorias.length} categorias`}
                  </span>
                  {filtros.categorias.length > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Limpar categorias"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFiltros((prev) => ({ ...prev, categorias: [] }))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          setFiltros((prev) => ({ ...prev, categorias: [] }))
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
                  {categoriasDisponiveis.map((cat) => {
                    const estilo = estiloCategoria(cat)
                    const Icon = estilo.icon
                    const ativo = filtros.categorias.includes(cat)
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategoria(cat)}
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
                {filtros.categorias.length > 0 && (
                  <div className="border-t p-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setFiltros((prev) => ({ ...prev, categorias: [] }))}
                    >
                      Limpar
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9 h-10 bg-white w-full shadow-sm border-gray-200"
              placeholder="Buscar nos feedbacks..."
              value={filtros.busca}
              onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading && feedbacks.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-[20px] border border-[#E5E7EB] rounded-[12px] bg-white shadow-subtle flex flex-col sm:flex-row gap-4 sm:gap-6"
            >
              <div className="w-full sm:w-[152px] shrink-0">
                <Skeleton className="h-6 w-full rounded-full" />
              </div>
              <div className="flex-1 space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
            </div>
          ))
        ) : dataToDisplay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white border border-dashed rounded-xl">
            <Folder className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Nenhum feedback encontrado</h3>
            <p className="text-sm mt-1">
              Ajuste os filtros ou aguarde novas avaliações de clientes.
            </p>
          </div>
        ) : (
          dataToDisplay.map((fb) => (
            <div
              key={fb.id}
              className="p-[20px] border border-[#E5E7EB] rounded-[12px] bg-white shadow-subtle hover:shadow-elevation transition-all duration-200"
            >
              <FeedbackOriginalCard
                texto={fb.texto_original}
                sentimento={fb.sentimento}
                categorias={fb.categorias ?? []}
                quando={formatarDataFeedback(fb.created_at)}
              />
            </div>
          ))
        )}
      </div>

      {totalFeedbacks > feedbacks.length && !loading && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={carregarMais}
            className="h-[44px] rounded-[8px] px-6 font-semibold shadow-sm hover:bg-gray-50 text-gray-700 bg-white border-gray-200"
          >
            Carregar mais feedbacks
          </Button>
        </div>
      )}
      {loading && feedbacks.length > 0 && (
        <div className="mt-8 flex justify-center">
          <span className="text-sm text-gray-500 animate-pulse">Carregando...</span>
        </div>
      )}
    </div>
  )
}
