import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { Button } from '@/components/ui/button'
import { Pencil, CalendarDays, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { estiloPrioridade } from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'

interface DetalhesAcaoPanelProps {
  // Mesma linha de `acoes_operacionais` que o TaskCard recebe.
  task: any
  onClose: () => void
  onEditar: () => void
}

/**
 * Painel lateral só de leitura (plano completo + prazo + responsável) — não
 * modal: `modal={false}` + `semOverlay` (mesmo padrão do chat de IA em
 * `ChatFab.tsx`) deixa o resto do quadro clicável com o painel aberto, sem
 * fundo escurecido. Fecha só pelo X ou pelo botão Editar (que abre o popup
 * de edição de verdade), não ao clicar fora — mesma escolha do ChatFab.
 */
export function DetalhesAcaoPanel({ task, onClose, onEditar }: DetalhesAcaoPanelProps) {
  const dataExibida = task.prazo
    ? format(parseISO(task.prazo), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null
  const isCompleted = task.status === 'CONCLUIDO'

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} modal={false}>
      <SheetContent
        semOverlay
        className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="p-5 border-b bg-white shrink-0 space-y-2 text-left">
          <span
            className={cn(
              'inline-flex w-fit text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
              isCompleted ? 'bg-green-100 text-green-700' : estiloPrioridade(task.prioridade).corSolida,
            )}
          >
            {isCompleted ? 'CONCLUÍDO' : estiloPrioridade(task.prioridade).label}
          </span>
          <SheetTitle className="text-lg font-bold leading-snug">{task.titulo_acao}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes da ação</SheetDescription>
          {task.categoria && (
            <p className="inline-flex w-fit text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
              {task.categoria}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Responsável</p>
            <div className="flex items-center gap-2.5">
              <Avatar className="w-8 h-8 border border-border shrink-0">
                <AvatarFallback
                  className={cn('text-xs font-semibold', corAvatar(task.responsavel).bg, corAvatar(task.responsavel).text)}
                >
                  {getIniciais(task.responsavel || 'Sem responsável', 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-gray-800">
                {task.responsavel || 'Sem responsável'}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Prazo</p>
            <p className="flex items-center gap-1.5 text-sm text-gray-800">
              <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
              {dataExibida ?? 'Sem prazo definido'}
            </p>
          </div>

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

          {/* Feedbacks relacionados: saiu do card e vive aqui.
              No card era mais um link competindo com o clique de abrir; aqui
              está junto do resto do contexto, que é onde o dono vai quando
              quer entender a ação em vez de só olhá-la. */}
          {task.insight_id && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">
                Feedbacks relacionados
              </p>
              <Link
                to={`/feedbacks?insight_id=${task.insight_id}`}
                className="inline-flex items-center gap-1.5 text-sm text-[#1D4ED8] hover:underline font-medium"
              >
                <MessageSquare className="w-4 h-4" />
                Ver os feedbacks que originaram esta ação
              </Link>
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t bg-white shrink-0 sm:justify-start">
          <Button onClick={onEditar} className="w-full sm:w-auto flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Editar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
