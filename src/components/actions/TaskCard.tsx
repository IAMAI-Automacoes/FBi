import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { CheckCircle2, ArrowRight, RotateCcw, Archive, ArchiveRestore, MessageSquare, Zap, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { estiloPrioridade } from '@/lib/prioridade'

interface TaskCardProps {
  // Linha de `acoes_operacionais` com apelidos do quadro; tipar por completo
  // exigiria refatorar o TaskBoard inteiro, fora do escopo desta mudança.
  task: any
  onClick?: () => void
  onProgress?: () => void
  onUndo?: () => void
  onArquivar?: () => void
  onDesarquivar?: () => void
  /** Alterna o card fixado no topo da coluna (por cima da ordenação por prioridade). */
  onPin?: (fixado: boolean) => void
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
  onPin,
  canUndo,
  isOverlay,
  somenteLeitura = false,
}: TaskCardProps) {
  // `useSortable` (não o `useDraggable` puro) é o que faz as outras ações da
  // coluna abrirem espaço suavemente enquanto esta é arrastada por cima —
  // isso É o indicador visual de "vai entrar aqui", sem precisar desenhar
  // uma linha à parte. O id da versão do DragOverlay é só pra não colidir
  // com o card real, que continua montado (só fica com opacidade baixa).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: isOverlay ? `overlay-${task.id}` : task.id.toString(),
    data: { task },
    disabled: somenteLeitura,
  })

  const style =
    !isOverlay
      ? {
          transform: CSS.Transform.toString(transform),
          transition,
        }
      : undefined

  const isCompleted = task.status === 'CONCLUIDO'

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
        'bg-white p-5 rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col border-l-4',
        // `transition-all` durante o arraste anima até o `transform` que o
        // dnd-kit atualiza a cada frame do ponteiro — o card fica "correndo
        // atrás" do cursor em vez de seguir 1:1. Só anima a sombra do hover.
        !isDragging && 'transition-shadow hover:shadow-md',
        estiloPrioridade(task.prioridade).corBorda,
        !isOverlay && !somenteLeitura && 'cursor-grab active:cursor-grabbing',
        // Arquivada não arrasta, mas abre o modal no clique.
        somenteLeitura && onClick && 'cursor-pointer',
        isCompleted && 'opacity-75 bg-slate-50/50',
        isDragging && !isOverlay && 'opacity-40 z-50 relative',
        isOverlay && 'shadow-xl scale-[1.03] cursor-grabbing z-50',
      )}
    >
      {/* Barrinha marcando o ponto de inserção — sobreposta (não ocupa
          espaço próprio), pra não mudar a altura do slot que as outras
          ações abriram e causar um "pulo" quando soltar. */}
      {isDragging && !isOverlay && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#1D4ED8] z-10" />
      )}

      <div className="flex items-start justify-between mb-3 gap-2">
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
            isCompleted ? 'bg-green-100 text-green-700' : estiloPrioridade(task.prioridade).corSolida,
          )}
        >
          {isCompleted ? 'CONCLUÍDO' : estiloPrioridade(task.prioridade).label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          {!isOverlay && !somenteLeitura && onPin && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPin(!task.fixado)
              }}
              title={task.fixado ? 'Desafixar' : 'Fixar no topo da coluna'}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                task.fixado ? 'text-amber-500' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Pin className={cn('w-3.5 h-3.5', task.fixado && 'fill-current')} />
            </button>
          )}
        </div>
      </div>

      <h4
        className={cn(
          'font-semibold text-sm mb-1.5 leading-tight',
          isCompleted && 'line-through text-muted-foreground',
        )}
      >
        {task.titulo_acao}
      </h4>

      {/* `texto` (não `insight_id`!) é o sinal confiável de "veio da IA": a
          edge function `sugerir-acoes` sempre grava esse texto padrão nela,
          mesmo quando não consegue casar o insight_id que a IA citou (nesse
          caso ele grava null) — ações criadas manualmente nunca têm `texto`. */}
      {task.texto && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 mb-2 self-start">
          <Zap className="w-3 h-3" />
          Sugerida pela IA
        </span>
      )}

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

      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="w-6 h-6 border border-border">
            <AvatarFallback
              className={cn(
                'text-[10px] font-semibold',
                corAvatar(task.responsavel).bg,
                corAvatar(task.responsavel).text,
              )}
            >
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
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-300 animate-fade-in-up">
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
