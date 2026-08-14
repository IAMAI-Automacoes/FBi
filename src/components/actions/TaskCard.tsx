import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais } from '@/lib/iniciais'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, ArrowRight, RotateCcw, Archive, ArchiveRestore, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDraggable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface TaskCardProps {
  // Linha de `acoes_operacionais` com apelidos do quadro; tipar por completo
  // exigiria refatorar o TaskBoard inteiro, fora do escopo desta mudança.
  task: any
  onClick?: () => void
  onProgress?: () => void
  onUndo?: () => void
  onArquivar?: () => void
  onDesarquivar?: () => void
  canUndo?: boolean
  isOverlay?: boolean
  /** Na página de arquivadas o card não arrasta nem avança de status. */
  somenteLeitura?: boolean
}

export function TaskCard({
  task,
  onClick,
  onProgress,
  onUndo,
  onArquivar,
  onDesarquivar,
  canUndo,
  isOverlay,
  somenteLeitura = false,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: isOverlay ? `overlay-${task.id}` : task.id.toString(),
    data: { task },
    disabled: somenteLeitura,
  })

  const style =
    transform && !isOverlay
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        }
      : undefined

  const getPriorityStyle = (prioridade: string) => {
    switch (prioridade?.toUpperCase()) {
      case 'URGENTE':
        return 'bg-[#EF4444] text-white'
      case 'IMPORTANTE':
        return 'bg-[#F59E0B] text-white'
      case 'NORMAL':
        return 'bg-[#F3F4F6] text-[#1F2937]'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const isCompleted = task.status === 'CONCLUIDO'
  const isOngoing = task.status === 'EM_ANDAMENTO'

  // Prazo é `date` no banco; sem prazo mostra a data de criação, como antes.
  const dataExibida = task.prazo
    ? `Prazo: ${format(parseISO(task.prazo), "d 'de' MMM", { locale: ptBR })}`
    : task.date

  return (
    <div
      ref={isOverlay || somenteLeitura ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || somenteLeitura ? {} : listeners)}
      {...(isOverlay || somenteLeitura ? {} : attributes)}
      onClick={() => {
        if (!isDragging && !isOverlay && onClick) onClick()
      }}
      className={cn(
        'bg-white p-5 rounded-xl border border-[#E5E7EB] hover:shadow-md transition-all shadow-sm flex flex-col',
        !isOverlay && !somenteLeitura && 'cursor-grab active:cursor-grabbing',
        // Arquivada não arrasta, mas abre o modal no clique.
        somenteLeitura && onClick && 'cursor-pointer',
        isCompleted && 'opacity-75 bg-slate-50/50',
        isDragging && !isOverlay && 'opacity-50 ring-2 ring-primary ring-offset-2 z-50 relative',
        isOverlay && 'rotate-2 shadow-xl scale-105 cursor-grabbing z-50',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
            isCompleted ? 'bg-green-100 text-green-700' : getPriorityStyle(task.prioridade),
          )}
        >
          {isCompleted ? 'CONCLUÍDO' : task.prioridade || 'NORMAL'}
        </span>
        {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      </div>

      <h4
        className={cn(
          'font-semibold text-sm mb-1.5 leading-tight',
          isCompleted && 'line-through text-muted-foreground',
        )}
      >
        {task.titulo_acao}
      </h4>

      {task.texto && (
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{task.texto}</p>
      )}

      {task.plano_detalhado && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.plano_detalhado}</p>
      )}

      <p
        className={cn(
          'text-[11px] font-medium mb-2 inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md self-start',
          isCompleted && 'bg-slate-100 text-slate-500',
        )}
      >
        {task.categoria}
      </p>

      {/* Mesmo destino do link nos Insights: os feedbacks que geraram o insight
          de onde esta ação nasceu. */}
      {task.insight_id && (
        <Link
          to={`/feedbacks?insight_id=${task.insight_id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-[#1D4ED8] hover:underline font-medium mb-3 inline-flex items-center gap-1 self-start"
        >
          <MessageSquare className="w-3 h-3" />
          Feedbacks relacionados
        </Link>
      )}

      {isOngoing && task.progress !== undefined && (
        <div className="mb-4">
          <Progress value={task.progress} className="h-1.5 bg-blue-100 [&>div]:bg-[#1D4ED8]" />
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="w-6 h-6 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
              {getIniciais(task.responsavel || 'Sem responsável', 2)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate max-w-[100px] font-medium">
            {task.responsavel || 'Sem responsável'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">{dataExibida}</span>
      </div>

      {/* A barra some só quando não há nada a oferecer: card concluído sem
          desfazer disponível e sem arquivar/desarquivar. */}
      {!isOverlay && !isDragging && (canUndo || !isCompleted || !!onArquivar || !!onDesarquivar) && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 animate-fade-in-up">
          {canUndo && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:text-amber-800 flex-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onUndo?.()
              }}
            >
              <RotateCcw className="w-3 h-3 mr-1.5" /> Desfazer
            </Button>
          )}
          {!isCompleted && (
            <Button
              size="sm"
              className={cn(
                'h-8 px-3 text-xs flex-1 transition-all',
                task.status === 'PENDENTE'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white',
              )}
              onClick={(e) => {
                e.stopPropagation()
                onProgress?.()
              }}
            >
              {task.status === 'PENDENTE' ? 'Iniciar Ação' : 'Concluir'}
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </Button>
          )}
          {isCompleted && onArquivar && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs flex-1 text-slate-600 hover:text-slate-900"
              onClick={(e) => {
                e.stopPropagation()
                onArquivar()
              }}
            >
              <Archive className="w-3 h-3 mr-1.5" /> Arquivar
            </Button>
          )}
          {onDesarquivar && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs flex-1 text-slate-600 hover:text-slate-900"
              onClick={(e) => {
                e.stopPropagation()
                onDesarquivar()
              }}
            >
              <ArchiveRestore className="w-3 h-3 mr-1.5" /> Desarquivar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
