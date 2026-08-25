import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FeedbackOriginalCard } from '@/components/FeedbackOriginalCard'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { coresSentimento, rotuloSentimento } from '@/lib/sentimento'
import { formatarDataFeedback } from '@/lib/formatar-tempo'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface FeedbackOriginalRow {
  id: string
  texto_original: string | null
  sentimento: string | null
  categorias: string[] | null
  created_at: string | null
}

interface FeedbackSeparadoRow {
  id: number
  texto_original: string | null
  resumo: string | null
  categoria: string | null
  sentimento: string | null
}

interface FeedbacksRelacionadosPopoverProps {
  insightId: string
  feedbackIds: string[]
  totalFeedbacks: number
}

/**
 * "Telinha" com os feedbacks por trás de um insight: as mensagens originais
 * inteiras (`feedback_ids`) e os pontos separados que a IA de fato usou pra
 * gerar este insight — os dois juntos, sem precisar navegar pra /feedbacks só
 * pra ver do que se trata. Os separados não vêm de um array na própria linha
 * do insight: são achados buscando `feedbacks_restaurante` cujo
 * `usado_por_insight_id` aponta pra este insight — coluna mantida por trigger
 * no banco (`trg_insights_marcar_feedbacks`) sempre que o insight nasce com
 * `feedback_ids` preenchido. Busca sob demanda (só ao abrir), não a cada card
 * renderizado na lista.
 */
export function FeedbacksRelacionadosPopover({
  insightId,
  feedbackIds,
  totalFeedbacks,
}: FeedbacksRelacionadosPopoverProps) {
  const [open, setOpen] = useState(false)
  const [carregado, setCarregado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [originais, setOriginais] = useState<FeedbackOriginalRow[]>([])
  const [separados, setSeparados] = useState<FeedbackSeparadoRow[]>([])

  const carregar = async () => {
    if (carregado || carregando) return
    setCarregando(true)
    setErro(null)
    try {
      const [origRes, sepRes] = await Promise.all([
        feedbackIds.length > 0
          ? supabase
              .from('feedbacks_originais_view')
              .select('*')
              .in('id', feedbackIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as FeedbackOriginalRow[], error: null }),
        supabase
          .from('feedbacks_restaurante')
          .select('id, texto_original, resumo, categoria, sentimento')
          .eq('usado_por_insight_id', insightId),
      ])
      if (origRes.error) throw origRes.error
      if (sepRes.error) throw sepRes.error
      setOriginais((origRes.data as FeedbackOriginalRow[]) ?? [])
      setSeparados((sepRes.data as FeedbackSeparadoRow[]) ?? [])
      setCarregado(true)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar feedbacks')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) carregar()
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="text-sm text-blue-600 hover:underline font-medium text-left">
          {totalFeedbacks} feedbacks relacionados →
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[90vw] max-h-[70vh] overflow-y-auto p-0">
        <div className="p-4 space-y-5">
          {carregando && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {erro && <p className="text-sm text-red-500">{erro}</p>}

          {!carregando && !erro && (
            <>
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Mensagens originais ({originais.length})
                </h4>
                {originais.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma mensagem original encontrada.</p>
                ) : (
                  <div className="space-y-3">
                    {originais.map((f) => (
                      <FeedbackOriginalCard
                        key={f.id}
                        texto={f.texto_original ?? ''}
                        sentimento={f.sentimento}
                        categorias={f.categorias ?? []}
                        quando={f.created_at ? formatarDataFeedback(f.created_at) : ''}
                        truncar
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2 border-t pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Pontos usados neste insight ({separados.length})
                </h4>
                {separados.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum ponto separado encontrado.</p>
                ) : (
                  <div className="space-y-2">
                    {separados.map((f) => {
                      const estilo = estiloCategoria(f.categoria)
                      const Icon = estilo.icon
                      const cor = coresSentimento(f.sentimento)
                      return (
                        <div key={f.id} className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-1.5">
                          <p className="text-sm text-gray-700 leading-snug">
                            "{f.texto_original || f.resumo}"
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {f.categoria && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                  estilo.corFundo,
                                  estilo.corTexto,
                                  estilo.corBorda,
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {f.categoria}
                              </span>
                            )}
                            <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', cor.texto)}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', cor.dot)} />
                              {rotuloSentimento(f.sentimento)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          <Link
            to={`/feedbacks?insight_id=${insightId}`}
            className="block text-center text-xs text-blue-600 hover:underline font-medium pt-1"
          >
            Ver na página de feedbacks →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
