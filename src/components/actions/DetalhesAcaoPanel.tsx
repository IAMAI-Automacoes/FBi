import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { Button } from '@/components/ui/button'
import { Pencil, CalendarDays, Trash2 } from 'lucide-react'
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
        <SheetHeader className="p-5 border-b bg-white shrink-0 space-y-2.5 text-left">
          {/* Prioridade e categoria na MESMA linha: são os dois rótulos que
              respondem "o quanto urge" e "do que trata", lidos de relance
              antes do título. A categoria usa a pílula da paleta, idêntica à
              do card e à do feedback — `pr-3` no fim reserva espaço para o X
              de fechar do Sheet, que fica no canto superior direito. */}
          <div className="flex flex-wrap items-center gap-2 pr-8">
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
            <FeedbacksRelacionadosPopover
              origem={{ tipo: 'acao', id: Number(task.id) }}
              rotulo="Ver os feedbacks desta ação"
            />
          </div>
        </div>
        {/* Editar é a ação esperada aqui, então leva o peso visual — mas em
            `outline`, não no azul cheio: o painel é de leitura, e um botão
            primário sólido no rodapé faz a tela inteira parecer um formulário.

            Excluir vira ícone, sem texto e sem vermelho parado. Vermelho em
            repouso grita numa tela que a pessoa abre para consultar, e dois
            botões grandes lado a lado disputando a mesma faixa é justamente o
            desenho que faz um painel parecer template. A cor só aparece no
            hover, quando a intenção já é essa. */}
        <SheetFooter className="p-4 border-t bg-white shrink-0 flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            onClick={onEditar}
            variant="outline"
            className="flex items-center gap-2 font-medium"
          >
            <Pencil className="w-4 h-4" />
            Editar ação
          </Button>

          {onExcluir && (
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir ação"
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Excluir ação</TooltipContent>
              </Tooltip>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir esta ação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{task.titulo_acao}” será removida do quadro. Os feedbacks ligados a ela
                    voltam a ficar disponíveis para novos insights. Não dá para desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onExcluir}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
