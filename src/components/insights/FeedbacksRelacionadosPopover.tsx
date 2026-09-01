import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { coresSentimento, rotuloSentimento } from '@/lib/sentimento'
import { formatarDataFeedback } from '@/lib/formatar-tempo'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * Um ponto separado ligado ao insight, já com a mensagem original de onde veio.
 *
 * O PostgREST devolve o embed aninhado; achatamos para esta forma no carregar
 * para o JSX não ficar navegando `feedbacks_restaurante.feedbacks_originais`.
 */
interface PontoLigado {
  id: number
  texto: string
  categoria: string | null
  sentimento: string | null
  criadoEm: string | null
  /** A mensagem inteira do cliente. Fica escondida atrás do "ver mensagem". */
  original: { id: string; texto: string; quando: string } | null
}

interface FeedbacksRelacionadosPopoverProps {
  /**
   * De onde vêm os pontos. Insight lê `insight_feedback`; ação lê
   * `feedback_acao` — a ação não pode herdar a lista do insight de origem
   * porque ela ganha pontos que o insight nunca teve (a re-varredura ao criar,
   * e todo feedback novo que o `vincular-feedback` gruda nela depois).
   */
  origem: { tipo: 'insight'; id: string } | { tipo: 'acao'; id: number }
  /** Já calculado por quem chama. `undefined` = descobre ao abrir. */
  totalFeedbacks?: number
  /** Texto do gatilho. Sem isso, monta "N feedbacks relacionados". */
  rotulo?: string
  className?: string
}

/**
 * A telinha dos feedbacks por trás de um insight.
 *
 * ## Por que lista PONTOS e não mensagens
 *
 * Uma mensagem de WhatsApp costuma tratar de vários assuntos ("demorou 50 min,
 * o prato veio frio, mas o ambiente é bonito") e o n8n a quebra em pontos, um
 * por assunto. O insight é sobre UM assunto, então o que ele realmente usou são
 * os pontos — mostrar a mensagem inteira sugeriria que o insight trata de tudo
 * que está escrito nela.
 *
 * ## Por que o número sempre bate
 *
 * A contagem do card e esta lista saem da MESMA tabela (`insight_feedback`).
 * Antes o card contava mensagens originais e a telinha listava pontos, que são
 * quantidades diferentes por natureza — daí o número nunca fechar.
 *
 * A mensagem original continua acessível, mas dentro do ponto: é contexto de
 * quem falou, não um item à parte da lista.
 */
export function FeedbacksRelacionadosPopover({
  origem,
  totalFeedbacks,
  rotulo,
  className,
}: FeedbacksRelacionadosPopoverProps) {
  const [open, setOpen] = useState(false)
  const [carregado, setCarregado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pontos, setPontos] = useState<PontoLigado[]>([])
  const [expandido, setExpandido] = useState<number | null>(null)

  const carregar = async () => {
    if (carregado || carregando) return
    setCarregando(true)
    setErro(null)
    try {
      // As duas tabelas de vínculo têm a mesma forma (uma coluna apontando para
      // `feedbacks_restaurante`), então muda só de onde ler e por qual coluna
      // filtrar — o resto do achatamento e do JSX serve aos dois.
      const tabela = origem.tipo === 'insight' ? 'insight_feedback' : 'feedback_acao'
      const coluna = origem.tipo === 'insight' ? 'insight_id' : 'acao_id'

      const { data, error } = await supabase
        .from(tabela)
        .select(
          `feedback_restaurante_id,
           feedbacks_restaurante!inner(
             id, texto_original, resumo, categoria, sentimento, created_at,
             feedbacks_originais(id, texto_original, created_at)
           )`,
        )
        .eq(coluna, origem.id)
      if (error) throw error

      const lista: PontoLigado[] = (data ?? []).map((linha) => {
        // deno-lint-ignore no-explicit-any -- shape do embed aninhado do PostgREST
        const fr = (linha as any).feedbacks_restaurante
        const fo = fr?.feedbacks_originais
        return {
          id: fr?.id,
          texto: fr?.texto_original || fr?.resumo || '',
          categoria: fr?.categoria ?? null,
          sentimento: fr?.sentimento ?? null,
          criadoEm: fr?.created_at ?? null,
          original: fo
            ? {
                id: fo.id,
                texto: fo.texto_original ?? '',
                quando: fo.created_at ? formatarDataFeedback(fo.created_at) : '',
              }
            : null,
        }
      })

      setPontos(lista)
      setCarregado(true)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar feedbacks')
    } finally {
      setCarregando(false)
    }
  }

  const clientesDistintos = new Set(pontos.map((p) => p.original?.id).filter(Boolean)).size

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) carregar()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'text-sm text-blue-600 hover:underline font-medium text-left',
            className,
          )}
        >
          {rotulo ??
            `${totalFeedbacks ?? ''} ${
              totalFeedbacks === 1 ? 'feedback relacionado' : 'feedbacks relacionados'
            }`.trim()}{' '}
          →
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[27rem] max-w-[92vw] max-h-[70vh] overflow-y-auto p-0">
        <div className="p-4 space-y-3">
          {carregando && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {erro && <p className="text-sm text-red-500">{erro}</p>}

          {!carregando && !erro && (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                {pontos.length} {pontos.length === 1 ? 'ponto' : 'pontos'}
                {clientesDistintos > 0 && (
                  <span className="font-medium normal-case tracking-normal">
                    {' '}
                    · {clientesDistintos} {clientesDistintos === 1 ? 'cliente' : 'clientes'}
                  </span>
                )}
              </h4>

              {pontos.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {origem.tipo === 'insight'
                    ? 'Este insight foi gerado antes do vínculo com os feedbacks de origem. Gere os insights novamente para poder rastreá-los.'
                    : 'Nenhum feedback ligado a esta ação ainda. Use "Buscar feedbacks relacionados" ao editá-la.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {pontos.map((p) => {
                    const estilo = estiloCategoria(p.categoria)
                    const Icon = estilo.icon
                    const cor = coresSentimento(p.sentimento)
                    const aberto = expandido === p.id
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-1.5"
                      >
                        <p className="text-sm text-gray-700 leading-snug">"{p.texto}"</p>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {p.categoria && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                estilo.corFundo,
                                estilo.corTexto,
                                estilo.corBorda,
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              {p.categoria}
                            </span>
                          )}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[11px] font-medium',
                              cor.texto,
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', cor.dot)} />
                            {rotuloSentimento(p.sentimento)}
                          </span>
                          {p.criadoEm && (
                            <span className="text-[11px] text-gray-400">
                              {formatarDataFeedback(p.criadoEm)}
                            </span>
                          )}
                        </div>

                        {/* A mensagem completa fica AQUI DENTRO, e não como item
                            solto da lista: ela é o contexto deste ponto, não um
                            feedback a mais para contar. */}
                        {p.original && (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() => setExpandido(aberto ? null : p.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
                            >
                              <ChevronDown
                                className={cn('h-3 w-3 transition-transform', aberto && 'rotate-180')}
                              />
                              {aberto ? 'ocultar mensagem completa' : 'ver mensagem completa'}
                            </button>
                            {aberto && (
                              <p className="mt-1.5 rounded-md border border-gray-200 bg-white p-2 text-[13px] italic leading-relaxed text-gray-600">
                                "{p.original.texto}"
                                <span className="ml-1 not-italic text-[11px] text-gray-400">
                                  — {p.original.quando}
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* A pagina de feedbacks filtra por insight; sem um, nao ha para
              onde mandar — a acao criada a mao cai nesse caso. */}
          {origem.tipo === 'insight' && (
            <Link
              to={`/feedbacks?insight_id=${origem.id}`}
              className="block pt-1 text-center text-xs font-medium text-blue-600 hover:underline"
            >
              Ver na página de feedbacks →
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
