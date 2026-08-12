import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
import { CalendarDays, Search, Folder, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { buscarFeedbacks, buscarCategoriasAtivas, FiltrosFeedback } from '@/lib/queries/feedbacks'
import { rotuloSentimento } from '@/lib/sentimento'
import { useAuth } from '@/hooks/use-auth'


export default function Feedbacks() {
  const { toast } = useToast()
  const { usuario } = useAuth()

  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [totalFeedbacks, setTotalFeedbacks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])

  const [filtros, setFiltros] = useState<FiltrosFeedback>({
    periodo: '7d',
    sentimento: 'all',
    categorias: [],
    busca: '',
    ordenacao: 'recent',
  })
  const [offset, setOffset] = useState(0)
  const LIMIT = 10

  useEffect(() => {
    buscarCategoriasAtivas(usuario?.restaurante_id ?? undefined, filtros.periodo)
      .then(setCategoriasDisponiveis)
      .catch(console.error)
  }, [usuario?.restaurante_id, filtros.periodo])

  const carregarFeedbacks = useCallback(
    async (isLoadMore = false) => {
      try {
        setLoading(true)
        const currentOffset = isLoadMore ? offset + LIMIT : 0
        const { feedbacks: newFbs, total } = await buscarFeedbacks(filtros, LIMIT, currentOffset)

        setFeedbacks((prev) => (isLoadMore ? [...prev, ...newFbs] : newFbs))
        setTotalFeedbacks(total)
        setOffset(currentOffset)
      } catch (err) {
        toast({
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar os feedbacks.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [filtros, offset, toast],
  )

  useEffect(() => {
    const timeoutId = setTimeout(() => carregarFeedbacks(false), 300)
    return () => clearTimeout(timeoutId)
  }, [filtros, carregarFeedbacks])

  const toggleCategoria = (cat: string) => {
    setFiltros((prev) => ({
      ...prev,
      categorias: prev.categorias.includes(cat)
        ? prev.categorias.filter((c) => c !== cat)
        : [...prev.categorias, cat],
    }))
  }

  const dataToDisplay = feedbacks
  const datas = filtros.datas ?? []
  const setDatas = (novas: Date[] | undefined) =>
    setFiltros((prev) => ({ ...prev, datas: novas && novas.length > 0 ? novas : undefined }))

  return (
    <div className="mx-auto max-w-[1050px] pb-12 animate-fade-in-up">
      <div className="flex flex-col xl:flex-row gap-3 mb-6 items-start xl:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <Select
            value={filtros.periodo}
            disabled={datas.length > 0}
            onValueChange={(val: any) => setFiltros((prev) => ({ ...prev, periodo: val }))}
          >
            <SelectTrigger
              className={cn(
                'w-[150px] h-10 bg-white shadow-sm border-gray-200',
                datas.length > 0 && 'opacity-50',
              )}
              title={datas.length > 0 ? 'Limpe as datas para usar o período' : undefined}
            >
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>

          {/* Calendário: escolhe um ou mais dias específicos. Quando há dias
              marcados, eles têm precedência sobre o período acima. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-10 bg-white shadow-sm border-gray-200 font-normal justify-start',
                  datas.length === 0 && 'text-muted-foreground',
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {datas.length === 0
                  ? 'Escolher datas'
                  : datas.length === 1
                    ? format(datas[0], "d 'de' MMM", { locale: ptBR })
                    : `${datas.length} dias selecionados`}
                {datas.length > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Limpar datas"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDatas(undefined)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        setDatas(undefined)
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
              <Calendar
                mode="multiple"
                selected={datas}
                onSelect={setDatas}
                locale={ptBR}
                disabled={{ after: new Date() }}
              />
              {datas.length > 0 && (
                <div className="flex items-center justify-between border-t p-2">
                  <span className="text-xs text-muted-foreground pl-1">
                    {datas.length} {datas.length === 1 ? 'dia' : 'dias'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDatas(undefined)}
                  >
                    Limpar
                  </Button>
                </div>
              )}
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
              <SelectItem value="neutro">Positivo / Negativo</SelectItem>
            </SelectContent>
          </Select>

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

        <div className="flex items-center shrink-0 w-full xl:w-auto mt-2 xl:mt-0">
          <Select
            value={filtros.ordenacao}
            onValueChange={(val: any) => setFiltros((prev) => ({ ...prev, ordenacao: val }))}
          >
            <SelectTrigger className="w-full xl:w-[150px] h-10 border xl:border-0 bg-white xl:bg-transparent shadow-sm xl:shadow-none hover:bg-gray-50 font-medium text-gray-600 focus:ring-0">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chips de categorias */}
      {categoriasDisponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-400 shrink-0">Categoria:</span>
          {categoriasDisponiveis.map((cat) => {
            const ativo = filtros.categorias.includes(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCategoria(cat)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border transition-all',
                  ativo
                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800',
                )}
              >
                {cat}
                {ativo && <X className="h-3 w-3 opacity-80" />}
              </button>
            )
          })}
          {filtros.categorias.length > 0 && (
            <button
              onClick={() => setFiltros((prev) => ({ ...prev, categorias: [] }))}
              className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2 ml-1"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {loading && feedbacks.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-[20px] border border-[#E5E7EB] rounded-[12px] bg-white shadow-subtle flex flex-col sm:flex-row gap-4 sm:gap-6"
            >
              <div className="w-full sm:w-[90px] shrink-0">
                <Skeleton className="h-4 w-16" />
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
          dataToDisplay.map((fb) => {
            const isPos = fb.sentimento?.toUpperCase() === 'POSITIVO'
            const isNeg = fb.sentimento?.toUpperCase() === 'NEGATIVO'
            return (
              <div
                key={fb.id}
                className="p-[20px] border border-[#E5E7EB] rounded-[12px] bg-white shadow-subtle flex flex-col sm:flex-row gap-4 sm:gap-6 hover:shadow-elevation transition-all duration-200"
              >
                <div className="w-full sm:w-[90px] flex sm:flex-col items-center justify-start sm:justify-start pt-1 gap-2 shrink-0 border-b sm:border-b-0 pb-3 sm:pb-0 border-gray-100">
                  <div
                    className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      isPos ? 'bg-success' : isNeg ? 'bg-destructive' : 'bg-warning',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-bold tracking-wide text-center leading-tight',
                      isPos ? 'text-success' : isNeg ? 'text-destructive' : 'text-warning',
                    )}
                  >
                    {rotuloSentimento(fb.sentimento).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-[15px] text-[#1F2937] leading-relaxed font-normal">
                      {fb.texto_original}
                    </p>
                    <span className="text-[12px] text-[#9CA3AF] whitespace-nowrap shrink-0 pt-0.5">
                      {formatDistanceToNow(new Date(fb.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  {(fb.categorias ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(fb.categorias as string[]).map((cat) => (
                        <span
                          key={cat}
                          className="bg-[#EFF6FF] text-[#1D4ED8] px-2 py-0.5 rounded-md font-medium text-[11px] tracking-wide"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {totalFeedbacks > feedbacks.length && !loading && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => carregarFeedbacks(true)}
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
