import { useState, useMemo, useEffect, useRef } from 'react'
import { Sparkles, Loader2, Settings2, Pin } from 'lucide-react'
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
  const [showOnlyPinned, setShowOnlyPinned] = useState(false)

  const [insights, setInsights] = useState<Insight[]>([])
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
      // `insight_feedback(count)` é a MESMA fonte que a telinha lista, então o
      // número do card não tem como divergir do que aparece dentro dela.
      // `deletado_em` filtra o que o dono excluiu — insight nunca é apagado do
      // banco, só marcado.
      const { data, error } = await supabase
        .from('insights')
        .select('*, insight_feedback(count)')
        .eq('ativo', true)
        .is('deletado_em', null)
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

  // A contagem por categoria sai dos insights que ja estao em memoria — nao ha
  // consulta a fazer. Conta sobre a lista aplicando os OUTROS filtros
  // (prioridade, fixados) mas nao o de categoria: senao, ao escolher uma, todas
  // as demais mostrariam zero e o filtro deixaria de informar.
  const contagemCategorias = useMemo(() => {
    const conta: Record<string, number> = {}
    for (const i of insights) {
      const prioMatch =
        filterPriority === 'Todos' ||
        i.prioridade === filterPriority ||
        (filterPriority === 'OBSERVAÇÃO' && i.prioridade === 'OBSERVACAO')
      const pinMatch = !showOnlyPinned || !!i.fixado
      if (!prioMatch || !pinMatch) continue
      const c = i.categoria
      if (c) conta[c] = (conta[c] ?? 0) + 1
    }
    return conta
  }, [insights, filterPriority, showOnlyPinned])

  const handleGerarInsights = async () => {
    if (!usuario?.restaurante_id) return
    setGenerating(true)
    try {
      // A limpeza dos não-fixados saiu daqui de propósito. Era um DELETE
      // disparado pelo NAVEGADOR, o que tinha dois problemas: apagava a origem
      // de toda ação nascida daqueles insights (FK ON DELETE SET NULL), e
      // rodava fora da transação da geração — se a IA falhasse em seguida, os
      // insights antigos já tinham ido embora e a tela ficava vazia.
      //
      // Agora `gerar-insights` desativa e libera os pontos como primeiro passo
      // da própria invocação.
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
  /**
   * O insight VIRA a ação: sai da lista e leva os feedbacks junto.
   *
   * Antes esta função não recarregava nada — o card continuava na tela com o
   * botão reativado, então clicar duas vezes criava duas ações do mesmo
   * insight. Agora some da lista assim que a ação nasce; o `fetchInsights()`
   * no fim confirma contra o banco (e traz o card de volta se algo falhou).
   */
  const handleCriarAcao = async (insight: Insight) => {
    if (!usuario?.restaurante_id) return
    setCriandoAcaoId(insight.id)
    try {
      await sugerirAcoesManualmente(usuario.restaurante_id, insight.id)
      setInsights((prev) => prev.filter((i) => i.id !== insight.id))
      toast({
        title: 'Ação criada',
        description: 'O insight virou ação e os feedbacks dele foram junto. Veja em Ações.',
      })
    } catch (e: any) {
      toast({ title: 'Erro ao gerar ação', description: e.message, variant: 'destructive' })
    } finally {
      setCriandoAcaoId(null)
      fetchInsights()
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

  /**
   * Exclusão é MARCAÇÃO, não DELETE.
   *
   * O `delete()` que existia aqui causava dano silencioso: `acoes_operacionais
   * .insight_id` é ON DELETE SET NULL, então apagar um insight apagava também a
   * origem de toda ação que tinha nascido dele. Medido antes da correção: 33
   * ações, zero com `insight_id`.
   *
   * Marcar dispara o trigger que devolve os pontos ao pool de análise.
   */
  const handleDeleteInsight = async (id: string) => {
    try {
      const agora = new Date().toISOString()
      const { error } = await supabase
        .from('insights')
        .update({
          deletado_em: agora,
          desativado_em: agora,
          ativo: false,
          motivo_encerramento: 'excluido',
        })
        .eq('id', id)
      if (error) throw error
      setInsights((prev) => prev.filter((i) => i.id !== id))
      toast({
        title: 'Insight excluído',
        description: 'Os feedbacks dele voltaram a ficar disponíveis para análise.',
      })
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' })
    }
  }

  /** Otimista, com rollback em erro — mesmo padrão de `handlePin` em
   *  TaskBoard.tsx (fixar ação no topo da coluna). */
  const handleTogglePin = async (id: string, fixado: boolean) => {
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, fixado } : i)))
    try {
      const { error } = await supabase.from('insights').update({ fixado }).eq('id', id)
      if (error) throw error
    } catch (e: any) {
      setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, fixado: !fixado } : i)))
      toast({ title: 'Erro ao fixar', description: e.message, variant: 'destructive' })
    }
  }

  const filteredInsights = useMemo(() => {
    return insights
      .filter((i) => {
        const prioMatch =
          filterPriority === 'Todos' ||
          i.prioridade === filterPriority ||
          (filterPriority === 'OBSERVAÇÃO' && i.prioridade === 'OBSERVACAO')
        const catMatch = filterCategories.length === 0 || filterCategories.includes(i.categoria ?? '')
        const pinMatch = !showOnlyPinned || !!i.fixado
        return prioMatch && catMatch && pinMatch
      })
      // Fixados sempre no topo — sort é estável, então dentro de cada grupo
      // (fixado / não fixado) a ordem por data (`created_at desc`) do fetch
      // original se mantém.
      .sort((a, b) => Number(!!b.fixado) - Number(!!a.fixado))
  }, [insights, filterPriority, filterCategories, showOnlyPinned])

  // Ao trocar prioridade ou categoria, a lista volta pro topo sozinha.
  const topoRef = useRef<HTMLDivElement>(null)
  const primeiraRenderRef = useRef(true)
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false
      return
    }
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [filterPriority, filterCategories, showOnlyPinned])

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
              contagens={contagemCategorias}
              rotuloItens="insights"
              selecionadas={filterCategories}
              onChange={setFilterCategories}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowOnlyPinned((v) => !v)}
              aria-pressed={showOnlyPinned}
              title={showOnlyPinned ? 'Mostrando só os fixados' : 'Mostrar só os fixados'}
              className={cn(
                'h-10 shrink-0 shadow-sm font-normal gap-1.5',
                showOnlyPinned
                  ? 'border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-50 hover:text-amber-600'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              <Pin className={cn('h-4 w-4', showOnlyPinned && 'fill-current')} />
              Fixados
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={generating}
                  className="w-full lg:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white font-medium shadow-sm transition-all"
                >
                  {generating ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {generating ? 'Analisando...' : 'Gerar insights agora'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Gerar insights agora?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os fixados são mantidos; os demais, substituídos.
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
              {/* Uma pergunta só, e o número é a resposta — por isso a roleta é
                  o centro da caixa e não um controle perdido embaixo de dois
                  parágrafos. A explicação de "menor gera mais vezes" saiu: a
                  própria frase ao redor do número já diz o que ele faz, e a
                  pessoa que abre isto veio justamente para mexer nele.

                  `max-w-[340px]`: a caixa tem uma linha de texto e um seletor;
                  na largura padrão de 440px sobrava vazio dos dois lados do
                  número, que é o que fazia parecer um formulário inacabado. */}
              <AlertDialogContent className="max-w-[340px] gap-4">
                <AlertDialogHeader>
                  <AlertDialogTitle>Gerar insights automaticamente</AlertDialogTitle>
                  <AlertDialogDescription className="sr-only">
                    Escolha de quantos em quantos feedbacks a análise roda sozinha.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col items-center gap-1 py-1">
                  <p className="text-[13px] text-gray-500">a cada</p>
                  <RoletaNumerica
                    min={FEEDBACKS_MIN}
                    max={FEEDBACKS_MAX}
                    value={feedbacksPorAnalise}
                    onChange={setFeedbacksPorAnalise}
                    className="w-24"
                  />
                  <p className="text-[13px] text-gray-500">novos feedbacks</p>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={savingConfig}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      handleSalvarConfig()
                    }}
                    disabled={savingConfig}
                    className="bg-gray-900 text-white hover:bg-gray-800"
                  >
                    {savingConfig ? 'Salvando…' : 'Salvar'}
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
    showOnlyPinned,
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
                onPin={(fixado) => handleTogglePin(insight.id, fixado)}
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
