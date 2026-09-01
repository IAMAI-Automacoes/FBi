import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { Button } from '@/components/ui/button'
import { Pencil, CalendarDays, MessageSquare, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Plano de ação</p>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Responsável</p>
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
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Prazo</p>
              <p className="flex items-center gap-1.5 text-sm text-gray-800 min-w-0">
                <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="truncate">{dataExibida ?? 'Sem prazo definido'}</span>
              </p>
            </div>
          </div>

          {/* Feedbacks relacionados: saiu do card e vive aqui.
              No card era mais um link competindo com o clique de abrir; aqui
              está junto do resto do contexto, que é onde o dono vai quando
              quer entender a ação em vez de só olhá-la. */}
          {task.insight_id && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">
                Feedbacks relacionados
              </p>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
              >
                <Link to={`/feedbacks?insight_id=${task.insight_id}`}>
                  <MessageSquare className="w-4 h-4 text-[#1D4ED8]" />
                  Ver os feedbacks que originaram esta ação
                </Link>
              </Button>
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t bg-white shrink-0 flex-row gap-2 sm:justify-start">
          <Button onClick={onEditar} className="flex-1 sm:flex-none flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Editar
          </Button>

          {/* Excluir passa por confirmação: apagar uma ação leva junto os
              vínculos com os feedbacks dela, e um clique errado aqui não tem
              como ser desfeito. */}
          {onExcluir && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="flex-1 sm:flex-none flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </Button>
              </AlertDialogTrigger>
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
