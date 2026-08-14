import { useState, useMemo, useEffect } from 'react'
import { RefreshCw, Settings2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { sugerirAcoesManualmente } from '@/lib/queries/acoes'
import type { Insight } from '@/lib/tipos/insight'
import { useAuth } from '@/hooks/use-auth'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useToast } from '@/hooks/use-toast'

// Opções de gatilho da geração automática: de 5 em 5, mínimo 5, máximo 15
const FEEDBACK_OPTIONS = [5, 10, 15]

export default function Insights() {
  const [filterPriority, setFilterPriority] = useState<string>('Todos')
  const [filterCategory, setFilterCategory] = useState<string>('Todas')

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
        const linhas = data as Insight[]
        setInsights(linhas)
        const cats = Array.from(
          new Set(linhas.map((i) => i.categoria).filter(Boolean)),
        ) as string[]
        setCategories(cats)
      }
    } catch (e: any) {
      toast({ title: 'Erro ao buscar insights', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // Sincroniza o valor da engrenagem com a fonte única de config (contexto)
  useEffect(() => {
    const atual = (configInsights as any)?.feedbacks_por_analise
    const valor = FEEDBACK_OPTIONS.includes(atual) ? atual : 5
    setFeedbacksPorAnalise(valor)
    setSavedFeedbacksPorAnalise(valor)
  }, [configInsights])

  const handleSalvarConfig = async () => {
    if (!usuario?.restaurante_id) return
    // Defesa: garante valor dentro de [5, 15] em passos de 5
    const valor = FEEDBACK_OPTIONS.includes(feedbacksPorAnalise) ? feedbacksPorAnalise : 5
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
      const catMatch = filterCategory === 'Todas' || i.categoria === filterCategory
      return prioMatch && catMatch
    })
  }, [insights, filterPriority, filterCategory])

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
      colors: 'text-[#EF4444]',
      activeClass: 'border-[#EF4444] bg-red-50/50',
    },
    {
      label: 'Importante',
      value: 'IMPORTANTE',
      colors: 'text-[#F59E0B]',
      activeClass: 'border-[#F59E0B] bg-orange-50/50',
    },
    {
      label: 'Observação',
      value: 'OBSERVAÇÃO',
      colors: 'text-[#6B7280]',
      activeClass: 'border-[#6B7280] bg-gray-50',
    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 bg-[#F9FAFB] min-h-[calc(100vh-4rem)] font-inter">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            Insights da IA
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Análises automáticas dos feedbacks dos seus clientes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={generating}
                className="w-full sm:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white font-medium shadow-sm transition-all"
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
                className="order-first shrink-0 border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-sm"
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
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Analisar automaticamente a cada:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {FEEDBACK_OPTIONS.map((opt) => {
                    const isActive = feedbacksPorAnalise === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setFeedbacksPorAnalise(opt)}
                        className={cn(
                          'flex flex-col items-center justify-center rounded-xl border-2 py-4 transition-all outline-none',
                          isActive
                            ? 'border-[#1D4ED8] bg-blue-50/60 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                        )}
                      >
                        <span
                          className={cn(
                            'text-2xl font-bold',
                            isActive ? 'text-[#1D4ED8]' : 'text-gray-900',
                          )}
                        >
                          {opt}
                        </span>
                        <span
                          className={cn(
                            'text-xs mt-0.5',
                            isActive ? 'text-[#1D4ED8]' : 'text-gray-500',
                          )}
                        >
                          feedbacks
                        </span>
                      </button>
                    )
                  })}
                </div>
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

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 px-2 py-1.5 rounded-full border border-gray-200 w-full sm:w-auto overflow-x-auto">
          {priorities.map((p) => {
            const isActive = filterPriority === p.value
            return (
              <button
                key={p.value}
                onClick={() => setFilterPriority(p.value)}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-full transition-all border outline-none whitespace-nowrap',
                  p.colors,
                  isActive ? p.activeClass : 'border-transparent hover:bg-gray-100',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[220px] bg-white h-10 shadow-sm rounded-lg border-gray-200">
            <SelectValue placeholder="Filtrar Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todas Categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
