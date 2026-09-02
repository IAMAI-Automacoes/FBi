import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { Button } from '@/components/ui/button'
import { Pencil, CalendarDays, Trash2, Link2, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { estiloPrioridade } from '@/lib/prioridade'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FeedbacksRelacionadosPopover } from '@/components/insights/FeedbacksRelacionadosPopover'
import { vincularFeedbacksDaAcao } from '@/lib/queries/acoes'
import { useToast } from '@/hooks/use-toast'

interface DetalhesAcaoPanelProps {
  // Mesma linha de `acoes_operacionais` que o TaskCard recebe.
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any
  onClose: () => void
  onEditar: () => void
  /** Exclui a ação. Sem isso, o botão de excluir não aparece. */
  onExcluir?: () => void
}

/**
 * Painel lateral só de leitura (plano completo + prazo + responsável) — não
 * modal: `modal={false}` + `semOverlay` (mesmo padrão do chat de IA em
 * `ChatFab.tsx`) deixa o resto do quadro clicável com o painel aberto, sem
 * fundo escurecido. Fecha só pelo X ou pelo botão Editar (que abre o popup
 * de edição de verdade), não ao clicar fora — mesma escolha do ChatFab.
 *
 * ## A ordem da leitura
 *
 * Prioridade e categoria lado a lado no topo, depois título, plano,
 * responsável e prazo lado a lado, feedbacks e por fim as ações. É a ordem do
 * que a pessoa pergunta ao abrir: o quanto isto urge e do que trata, o que é,
 * como resolver, quem faz e até quando.
 *
 * Responsável e prazo ficam na mesma linha porque são a mesma pergunta — quem
 * entrega e quando —, e separá-los em dois blocos empurrava o plano para longe
 * sem ganhar nada.
 */
export function DetalhesAcaoPanel({ task, onClose, onEditar, onExcluir }: DetalhesAcaoPanelProps) {
  const dataExibida = task.prazo
    ? format(parseISO(task.prazo), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null
  const isCompleted = task.status === 'CONCLUIDO'
  const acaoId = Number(task.id)

  /**
   * "Buscar feedbacks relacionados".
   *
   * Uma ação pode terminar sem vínculo nenhum: o título estava vago quando ela
   * nasceu, ou não havia feedback livre naquele momento. Sem vínculo, a ação
   * avança de status e NINGUÉM é avisado — o motor de retorno acha o
   * destinatário justamente por `feedback_acao`.
   *
   * Mora aqui, e não mais no popup de edição, porque é aqui que a falta
   * aparece: a pessoa abre os detalhes, vê a lista de feedbacks vazia, e o
   * botão de resolver isso está na mesma linha do problema.
   *
   * `apenasVinculo`: categoria e prioridade já estão decididas: a IA não mexe.
   */
  const [buscando, setBuscando] = useState(false)
  const { toast } = useToast()

  const buscarFeedbacks = async () => {
    setBuscando(true)
    try {
      const res = await vincularFeedbacksDaAcao(acaoId)
      const n = res?.feedbacks_vinculados ?? 0
      toast(
        n > 0
          ? {
              title: `${n} feedback${n > 1 ? 's' : ''} ligado${n > 1 ? 's' : ''}`,
              description: 'Quem escreveu vai ser avisado quando esta ação avançar de status.',
            }
          : {
              title: 'Nenhum feedback novo',
              description:
                res?.motivo_sem_vinculo ??
                'Não há feedback livre que esta ação resolva. Detalhar o plano ajuda a IA a reconhecê-los.',
            },
      )
    } catch {
      toast({
        title: 'Não consegui buscar agora',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    } finally {
      setBuscando(false)
    }
  }

  const estiloCat = estiloCategoria(task.categoria)
  const IconeCat = estiloCat.icon

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} modal={false}>
      <SheetContent
        semOverlay
        className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Editar mora no CABEÇALHO, ao lado do X, e não mais no rodapé.
            É uma ação sobre o item inteiro — o mesmo lugar onde o olho já
            procura os controles da janela — e assim ela fica na diagonal
            oposta à de excluir, que é a distância máxima entre a ação que se
            usa toda hora e a que não tem volta. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onEditar}
              variant="ghost"
              size="icon"
              aria-label="Editar ação"
              className="absolute right-11 top-2.5 z-10 h-9 w-9 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <Pencil className="h-[18px] w-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Editar ação</TooltipContent>
        </Tooltip>

        <SheetHeader className="p-5 border-b bg-white shrink-0 space-y-2.5 text-left">
          {/* Prioridade e categoria na MESMA linha: são os dois rótulos que
              respondem "o quanto urge" e "do que trata", lidos de relance
              antes do título. A categoria usa a pílula da paleta, idêntica à
              do card e à do feedback — `pr-3` no fim reserva espaço para o X
              de fechar do Sheet, que fica no canto superior direito. */}
          <div className="flex flex-wrap items-center gap-2 pr-20">
            <span
              className={cn(
                'inline-flex w-fit text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                isCompleted ? 'bg-green-100 text-green-700' : estiloPrioridade(task.prioridade).corSolida,
              )}
            >
              {isCompleted ? 'CONCLUÍDO' : estiloPrioridade(task.prioridade).label}
            </span>

            {task.categoria && (
              <span
                className={cn(
                  'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  isCompleted
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : cn(estiloCat.corFundo, estiloCat.corTexto, estiloCat.corBorda),
                )}
              >
                <IconeCat className="h-3 w-3" />
                {task.categoria}
              </span>
            )}
          </div>

          <SheetTitle className="text-lg font-bold leading-snug">{task.titulo_acao}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes da ação</SheetDescription>
        </SheetHeader>

        {/* `space-y-6` no lugar do 5: o par responsável/prazo precisa respirar
            longe do plano, senão parece rodapé dele. O plano em si sobe para
            perto do título com `pt-1` — os dois formam a mesma leitura ("o que
            é" e "como resolver"), e o espaço padrão do container os separava
            mais do que a relação entre eles justifica. */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1 space-y-6">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Plano de ação
            </p>
            {task.plano_detalhado ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {task.plano_detalhado}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Nenhum plano detalhado ainda.</p>
            )}
          </div>

          {/* `min-w-0` nas duas colunas: sem isso um nome comprido de
              responsável recusa encolher e empurra o prazo para fora. */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                Responsável
              </p>
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="w-8 h-8 border border-border shrink-0">
                  <AvatarFallback
                    className={cn(
                      'text-xs font-semibold',
                      corAvatar(task.responsavel).bg,
                      corAvatar(task.responsavel).text,
                    )}
                  >
                    {getIniciais(task.responsavel || 'Sem responsável', 2)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-gray-800 truncate">
                  {task.responsavel || 'Sem responsável'}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                Prazo
              </p>
              <p className="flex items-center gap-1.5 text-sm text-gray-800 min-w-0">
                <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="truncate">{dataExibida ?? 'Sem prazo definido'}</span>
              </p>
            </div>
          </div>

          {/* Mesma telinha dos insights: abre por cima com os pontos, o
              sentimento de cada um e a mensagem original expansível. Navegar
              para outra página só para ler três frases era caro demais — e a
              lista vem de `feedback_acao`, não do insight de origem, porque a
              ação acumula pontos que o insight nunca teve. */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Feedbacks relacionados
            </p>
            <div className="space-y-2">
              <FeedbacksRelacionadosPopover
                origem={{ tipo: 'acao', id: acaoId }}
                rotulo="Ver os feedbacks desta ação"
              />

              {/* Só em ação que NÃO veio de insight: essa já herdou os vínculos
                  do insight de origem, e concluída não precisa mais avisar
                  ninguém. */}
              {!task.insight_id && !isCompleted && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={buscarFeedbacks}
                  disabled={buscando}
                  className="h-8 gap-1.5 px-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  {buscando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  {buscando ? 'Procurando…' : 'Procurar mais feedbacks'}
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Sobra só excluir no rodapé, sozinha e no canto oposto ao lápis.
            Ação sem volta não divide faixa com nenhuma outra: não existe
            clique vizinho para errar. */}
        {onExcluir && (
          <SheetFooter className="p-4 border-t bg-white shrink-0 flex-row items-center justify-start sm:justify-start sm:space-x-0">
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir ação"
                      className="h-11 w-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-[27px] w-[27px]" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Excluir ação</TooltipContent>
              </Tooltip>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir esta ação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os feedbacks ligados a ela voltam para novos insights. Não dá para desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onExcluir}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
