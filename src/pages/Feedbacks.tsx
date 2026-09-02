import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Folder, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  buscarFeedbacks,
  contarFeedbacksPorCategoria,
  FiltrosFeedback,
} from '@/lib/queries/feedbacks'
import { FeedbackOriginalCard } from '@/components/FeedbackOriginalCard'
import { FiltroCategorias } from '@/components/FiltroCategorias'
import { FiltroPeriodo } from '@/components/FiltroPeriodo'
import { CampoBusca } from '@/components/CampoBusca'
import { formatarDataFeedback } from '@/lib/formatar-tempo'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { useHeaderExtra } from '@/hooks/use-header-extra'
import { supabase } from '@/lib/supabase/client'

const LIMIT = 10


export default function Feedbacks() {
  const { toast } = useToast()
  const { usuario } = useAuth()
  const { setExtra } = useHeaderExtra()
  const [searchParams, setSearchParams] = useSearchParams()

  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [totalFeedbacks, setTotalFeedbacks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [contagemCategorias, setContagemCategorias] = useState<Record<string, number>>({})
  /** Preenchido quando a página foi aberta a partir de um insight ou de uma ação. */
  const [filtroInsight, setFiltroInsight] = useState<{ id: string; titulo: string } | null>(null)

  // Semente inicial dos filtros a partir da URL (ex.: o link "Ver
  // avaliações" do tema crítico em Relatórios manda
  // ?periodo=30d&categoria=Reserva&sentimento=negativo) — lida só uma vez,
  // ao montar; depois disso os filtros vivem normalmente no Select/
  // FiltroCategorias da tela, sem ficar "preso" ao que veio na URL.
  const [filtros, setFiltros] = useState<FiltrosFeedback>(() => {
    const periodoParam = searchParams.get('periodo')
    const periodosValidos: FiltrosFeedback['periodo'][] = ['7d', '30d', '90d', 'all']
    const categoriaParam = searchParams.get('categoria')
    const sentimentoParam = searchParams.get('sentimento')
    return {
      periodo: periodosValidos.includes(periodoParam as FiltrosFeedback['periodo'])
        ? (periodoParam as FiltrosFeedback['periodo'])
        : '7d',
      sentimento: sentimentoParam || 'all',
      categorias: categoriaParam ? [categoriaParam] : [],
      busca: '',
      ordenacao: 'recent',
    }
  })
  const [offset, setOffset] = useState(0)

  // Ao trocar um filtro (não a busca por texto, que digita contínuo) a lista
  // volta pro topo sozinha — senão o usuário muda o filtro rolado lá embaixo
  // e não percebe que a lista já atualizou.
  const topoRef = useRef<HTMLDivElement>(null)
  const primeiraRenderRef = useRef(true)
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false
      return
    }
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.periodo, filtros.sentimento, filtros.ordenacao, filtros.categorias, filtros.datas])

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

  // A contagem acompanha o periodo e o sentimento (mas nao a categoria — ver
  // `contarFeedbacksPorCategoria`), entao recalcula quando o filtro muda.
  useEffect(() => {
    contarFeedbacksPorCategoria(filtros, usuario?.restaurante_id ?? undefined)
      .then(setContagemCategorias)
      .catch(console.error)
  }, [filtros, usuario?.restaurante_id])

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

  const dataToDisplay = feedbacks

  // Vive dentro do <header> fixo do topo (via `useHeaderExtra`), não na
  // página — um bloco fixo só, sem costura entre cabeçalho e barra de
  // filtros onde a lista rolando pudesse vazar por cima.
  // Uma linha só: os controles têm larguras próprias (o período pelo texto, os
  // selects fixos, a busca em w-56) e `overflow-x-auto` cuida das telas estreitas.
  // Quebrar em duas linhas empurrava a lista para baixo e escondia os
  // primeiros feedbacks.
  const barraFiltros = (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {/* Período: atalhos (7/30/90 dias, tudo) + calendário de intervalo, num controle só */}
          <FiltroPeriodo
            periodo={filtros.periodo}
            datas={filtros.datas}
            onPeriodo={(periodo) => setFiltros((prev) => ({ ...prev, periodo }))}
            onDatas={(datas) => setFiltros((prev) => ({ ...prev, datas }))}
          />

          <Select
            value={filtros.sentimento}
            onValueChange={(val) => setFiltros((prev) => ({ ...prev, sentimento: val }))}
          >
            <SelectTrigger className="w-[168px] h-10 shrink-0 bg-white shadow-sm border-gray-200">
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
            <SelectTrigger className="w-[136px] h-10 shrink-0 bg-white shadow-sm border-gray-200">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
            </SelectContent>
          </Select>

          <FiltroCategorias
            contagens={contagemCategorias}
            rotuloItens="feedbacks"
            selecionadas={filtros.categorias}
            onChange={(categorias) => setFiltros((prev) => ({ ...prev, categorias }))}
          />

          <CampoBusca
            value={filtros.busca}
            placeholder="Buscar nos feedbacks"
            onChange={(busca) => setFiltros((prev) => ({ ...prev, busca }))}
          />
        </div>
      </div>
  )

  // Precisa de deps de verdade (não pode rodar em todo render): `setExtra`
  // muda o estado do contexto, que re-renderiza este componente (ele também
  // consome `useHeaderExtra`) — sem lista de deps isso vira loop infinito
  // (tela branca por "Maximum update depth exceeded").
  useEffect(() => {
    setExtra(barraFiltros)
    return () => setExtra(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, contagemCategorias])

  return (
    <div className="mx-auto max-w-[1050px] pb-12 animate-fade-in-up">
      <div ref={topoRef} />

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
                // `texto_exibicao` ja resolve a precedencia na view: destacado, senao
                // original, senao os pontos separados costurados. Antes era
                // `destacado || original` aqui, e quando os dois eram nulos (2 dos 71
                // feedbacks) o card recebia null e a pagina inteira caia.
                texto={fb.texto_exibicao}
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
