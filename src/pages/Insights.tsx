import { useState, useMemo, useEffect, useRef } from 'react'
import { RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoletaNumerica } from '@/components/RoletaNumerica'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { InsightCard } from '@/components/insights/InsightCard'
import { FiltroCategorias } from '@/components/FiltroCategorias'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { sugerirAcoesManualmente } from '@/lib/queries/acoes'
import { buscarCategoriasAtivas } from '@/lib/queries/feedbacks'
import { PRIORIDADES } from '@/lib/prioridade'
import type { Insight } from '@/lib/tipos/insight'
import { useAuth } from '@/hooks/use-auth'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useHeaderExtra } from '@/hooks/use-header-extra'
import { useToast } from '@/hooks/use-toast'

// Faixa aceita pro gatilho da geração automática (slider — qualquer valor no
// meio, não só 3 opções fixas).
const FEEDBACKS_MIN = 3
const FEEDBACKS_MAX = 30
const FEEDBACKS_PADRAO = 10

export default function Insights() {
  const [filterPriority, setFilterPriority] = useState<string>('Todos')
  const [filterCategories, setFilterCategories] = useState<string[]>([])

  const [insights, setInsights] = useState<Insight[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  /** Id do insight cuja ação está sendo gerada pela IA (trava só aquele botão). */
  const [criandoAcaoId, setCriandoAcaoId] = useState<string | null>(null)

  // Configuração da geração automática (feedbacks acumulados que disparam análise)
  const [configOpen, setConfigOpen] = useState(false)
  const [feedbacksPorAnalise, setFeedbacksPorAnalise] = useState(5)
  const [savedFeedbacksPorAnalise, setSavedFeedbacksPorAnalise] = useState(5)
  const [savingConfig, setSavingConfig] = useState(false)

  const { usuario } = useAuth()
  const { mascote, configInsights, refetch: refetchConfig } = useRestauranteConfig()
  const { setExtra } = useHeaderExtra()
  const { toast } = useToast()

  const fetchInsights = async () => {
    if (!usuario?.restaurante_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('ativo', true)
        .eq('restaurante_id', usuario.restaurante_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        setInsights(data as Insight[])
      }
    } catch (e: any) {
      toast({ title: 'Erro ao buscar insights', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // Sincroniza o valor da engrenagem com a fonte única de config (contexto)
  useEffect(() => {
    const atual = Number((configInsights as any)?.feedbacks_por_analise)
    const valor = Number.isFinite(atual)
      ? Math.min(Math.max(Math.round(atual), FEEDBACKS_MIN), FEEDBACKS_MAX)
      : FEEDBACKS_PADRAO
    setFeedbacksPorAnalise(valor)
    setSavedFeedbacksPorAnalise(valor)
  }, [configInsights])

  const handleSalvarConfig = async () => {
    if (!usuario?.restaurante_id) return
    // Defesa: garante valor dentro da faixa aceita pelo slider
    const valor = Math.min(Math.max(Math.round(feedbacksPorAnalise), FEEDBACKS_MIN), FEEDBACKS_MAX)
    setSavingConfig(true)
    try {
      // Lê o jsonb atual para preservar as outras chaves
      const { data: cfg } = await supabase
        .from('restaurantes')
        .select('config_insights')
        .eq('id', usuario.restaurante_id)
        .single()

      const merged = { ...((cfg?.config_insights as any) || {}), feedbacks_por_analise: valor }

      const { error } = await supabase
        .from('restaurantes')
        .update({ config_insights: merged })
        .eq('id', usuario.restaurante_id)

      if (error) throw error

      setSavedFeedbacksPorAnalise(valor)
      setConfigOpen(false)
      refetchConfig() // propaga para o restante do site (MascotTab etc.)
      toast({
        title: 'Configuração salva',
        description: `A análise automática será disparada a cada ${valor} novos feedbacks.`,
      })
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' })
    } finally {
      setSavingConfig(false)
    }
  }

  useEffect(() => {
    if (usuario === undefined) return // auth ainda carregando

    if (usuario?.restaurante_id) {
      fetchInsights()
    } else {
      // Sem restaurante vinculado: nada a buscar, encerra o loading
      setInsights([])
      setLoading(false)
    }
  }, [usuario])

  // Mesma fonte de categorias que a página de Feedbacks (todas que o
  // restaurante já usou, sem filtro de período) — pra o filtro ser
  // literalmente idêntico nas duas telas, não só parecido visualmente.
  useEffect(() => {
    buscarCategoriasAtivas(usuario?.restaurante_id ?? undefined)
      .then(setCategories)
      .catch(console.error)
  }, [usuario?.restaurante_id])

  const handleGerarInsights = async () => {
    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('gerar-insights', {
        body: { force: true },
      })

      if (error) throw error

      const analisados = data?.feedbacks_analisados ?? 0

      switch (data?.status) {
        case 'sucesso':
          toast({
            title: 'Análise concluída!',
            description: `${data.insights_gerados} novos insights gerados a partir de ${analisados} feedbacks.`,
          })
          break
        case 'sem_feedbacks':
          toast({
            title: 'Nenhum feedback encontrado',
            description: 'Ainda não há feedbacks registrados para analisar.',
            variant: 'destructive',
          })
          break
        case 'insuficiente':
          toast({
            title: 'Feedbacks insuficientes',
            description: `É necessário um mínimo de ${data?.minimo_necessario ?? 3} feedbacks para gerar insights. No momento há ${analisados}.`,
            variant: 'destructive',
          })
          break
        default:
          toast({
            title: 'Análise concluída sem novidades',
            description: `${analisados} feedbacks analisados. Nenhum padrão novo encontrado no momento.`,
          })
      }
      fetchInsights()
    } catch (e: any) {
      toast({ title: 'Erro ao gerar insights', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  /**
   * "Criar Ação" não abre mais formulário: pede para a IA montar a ação a
   * partir deste insight. Ela nasce com status SUGERIDA, e o dono confirma ou
   * rejeita em Ações › Sugestões da IA.
   */
  const handleCriarAcao = async (insight: Insight) => {
    if (!usuario?.restaurante_id) return
    setCriandoAcaoId(insight.id)
    try {
      await sugerirAcoesManualmente(usuario.restaurante_id, insight.id)
      toast({
        title: 'Ação sugerida pela IA',
        description: 'Abra Ações › Sugestões da IA para confirmar ou rejeitar.',
      })
    } catch (e: any) {
      toast({ title: 'Erro ao gerar ação', description: e.message, variant: 'destructive' })
    } finally {
      setCriandoAcaoId(null)
    }
  }

  /**
   * Manda o insight para o chat principal (ChatFab), que carrega os feedbacks
   * de origem e mantém o contexto em todas as mensagens. Antes isso abria um
   * painel separado cujo código de contexto nunca rodava.
   */
  const handleAiChat = (insight: Insight) => {
    document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { insight } }))
  }

  const handleDeleteInsight = async (id: string) => {
    try {
      const { error } = await supabase.from('insights').delete().eq('id', id)
      if (error) throw error
      setInsights((prev) => prev.filter((i) => i.id !== id))
      toast({ title: 'Insight excluído', description: 'O insight foi removido com sucesso.' })
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' })
    }
  }

  const filteredInsights = useMemo(() => {
    return insights.filter((i) => {
      const prioMatch =
        filterPriority === 'Todos' ||
        i.prioridade === filterPriority ||
        (filterPriority === 'OBSERVAÇÃO' && i.prioridade === 'OBSERVACAO')
      const catMatch = filterCategories.length === 0 || filterCategories.includes(i.categoria ?? '')
      return prioMatch && catMatch
    })
  }, [insights, filterPriority, filterCategories])

  // Ao trocar prioridade ou categoria, a lista volta pro topo sozinha.
  const topoRef = useRef<HTMLDivElement>(null)
  const primeiraRenderRef = useRef(true)
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false
      return
    }
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [filterPriority, filterCategories])

  // Mesma cor de cada prioridade usada nos cards de insight (ver `@/lib/prioridade`)
  // — "Todos" é o único que não é uma prioridade real, fica com o azul do app.
  const priorities = [
    {
      label: 'Todos',
      value: 'Todos',
      colors: 'text-[#1D4ED8]',
      activeClass: 'border-[#1D4ED8] bg-blue-50/50',
    },
    {
      label: 'Urgente',
      value: 'URGENTE',
      colors: PRIORIDADES.URGENTE.corTexto,
      activeClass: cn(PRIORIDADES.URGENTE.corBorda, PRIORIDADES.URGENTE.corFundo),
    },
    {
      label: 'Importante',
      value: 'IMPORTANTE',
      colors: PRIORIDADES.IMPORTANTE.corTexto,
      activeClass: cn(PRIORIDADES.IMPORTANTE.corBorda, PRIORIDADES.IMPORTANTE.corFundo),
    },
    {
      label: 'Observação',
      value: 'OBSERVAÇÃO',
      colors: PRIORIDADES.OBSERVACAO.corTexto,
      activeClass: cn(PRIORIDADES.OBSERVACAO.corBorda, PRIORIDADES.OBSERVACAO.corFundo),
    },
  ]

  // Vive dentro do <header> fixo do topo (via `useHeaderExtra`), não na
  // página — um bloco fixo só, sem costura entre cabeçalho e barra de
  // filtros onde a lista rolando pudesse vazar por cima.
  const barraFiltros = (
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-white px-3 py-2.5 rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 px-2 py-1.5 rounded-full border border-gray-200 overflow-x-auto">
              {priorities.map((p) => {
                const isActive = filterPriority === p.value
                return (
                  <button
                    key={p.value}
                    onClick={() => setFilterPriority(p.value)}
                    className={cn(
                      'px-4 py-1.5 text-sm font-bold rounded-full transition-all border outline-none whitespace-nowrap',
                      p.colors,
                      isActive ? p.activeClass : 'border-transparent hover:bg-gray-100',
                    )}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>

            <FiltroCategorias
              disponiveis={categories}
              selecionadas={filterCategories}
              onChange={setFilterCategories}
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={generating}
                  className="w-full lg:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white font-medium shadow-sm transition-all"
                >
                  <RefreshCw className={cn('w-4 h-4 mr-2', generating && 'animate-spin')} />
                  {generating ? 'Analisando dados...' : 'Gerar insights agora'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Gerar insights agora?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O {mascote.nome} analisará todos os feedbacks recentes e gerará novos insights
                    operacionais. Os insights anteriores serão substituídos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleGerarInsights}
                    className="bg-[#1D4ED8] hover:bg-blue-800 text-white"
                  >
                    Gerar agora
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
              open={configOpen}
              onOpenChange={(open) => {
                setConfigOpen(open)
                if (open) setFeedbacksPorAnalise(savedFeedbacksPorAnalise)
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title="Configurar geração automática"
                  className="shrink-0 border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-sm"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Geração automática de insights</AlertDialogTitle>
                  <AlertDialogDescription>
                    Defina quantos novos feedbacks acumulados disparam uma análise automática do Chef
                    Pepê. Você sempre pode gerar insights manualmente a qualquer momento.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="py-2">
                  <p className="text-sm font-medium text-gray-700 mb-2 text-center">
                    Analisar automaticamente a cada:
                  </p>
                  <RoletaNumerica
                    min={FEEDBACKS_MIN}
                    max={FEEDBACKS_MAX}
                    value={feedbacksPorAnalise}
                    onChange={setFeedbacksPorAnalise}
                    className="mx-auto w-24"
                  />
                  <p className="text-xs text-gray-400 text-center -mt-1">feedbacks</p>
                  <p className="text-xs text-gray-400 mt-3">
                    Valores menores geram insights com mais frequência; valores maiores aguardam mais
                    dados antes de analisar.
                  </p>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={savingConfig}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      handleSalvarConfig()
                    }}
                    disabled={savingConfig}
                    className="bg-[#1D4ED8] hover:bg-blue-800 text-white"
                  >
                    {savingConfig ? 'Salvando...' : 'Salvar'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
  }, [
    filterPriority,
    filterCategories,
    categories,
    generating,
    configOpen,
    feedbacksPorAnalise,
    savingConfig,
    mascote,
  ])

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 px-3 md:px-4 pt-2 pb-4 md:pb-6 space-y-4 bg-[#F9FAFB] min-h-[calc(100vh-4rem)] font-inter">
      <div ref={topoRef} />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:gap-4">
          {filteredInsights.length > 0 ? (
            filteredInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                criandoAcao={criandoAcaoId === insight.id}
                onCreateTask={() => handleCriarAcao(insight)}
                onAiChat={() => handleAiChat(insight)}
                onDelete={() => handleDeleteInsight(insight.id)}
              />
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-gray-500 bg-white rounded-xl border border-dashed">
              <p className="text-lg font-medium">Nenhum insight encontrado</p>
              <p className="text-sm mt-1">
                Tente ajustar os filtros ou clique em "Gerar insights agora".
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
