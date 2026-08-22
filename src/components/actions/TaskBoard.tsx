import { useState, useEffect, useRef } from 'react'
import { ActionStatus } from '@/lib/mock-data'
import { TaskCard } from './TaskCard'
import { TaskModal } from '@/components/insights/TaskModal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus, Archive } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
  useDroppable,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from '@dnd-kit/core'

// Suave e rápida: sem o "bounce" padrão do dnd-kit, só um fade curto do
// espaço de origem enquanto o card desliza pro lugar novo.
const dropAnimationConfig: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
}
import {
  buscarAcoes,
  atualizarStatusAcao,
  criarAcao,
  atualizarAcao,
  excluirAcao,
  atualizarOrdemAcoes,
  arquivarAcao,
  alternarFixadoAcao,
} from '@/lib/queries/acoes'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { estiloStatus } from '@/lib/status-acao'
import { cn } from '@/lib/utils'

export type ExtendedActionTask = {
  id: string
  titulo_acao: string
  plano_detalhado?: string
  status: ActionStatus
  prioridade: string
  categoria: string
  texto?: string
  feedback_id?: number | null
  restaurante_id?: number | null
  created_at?: string
  ordem: number
  /** Insight que originou a ação — alimenta o link "Feedbacks relacionados". */
  insight_id?: string | null
  arquivada_em?: string | null
  responsavel?: string | null
  prazo?: string | null
  date?: string
  /** Fixado no topo da coluna, por cima da ordenação automática por prioridade. */
  fixado?: boolean
}

/** Peso pra ordenar por prioridade: Urgente > Importante > Observação/Normal/outros. */
function pesoPrioridade(prioridade?: string | null): number {
  const v = (prioridade || '').toUpperCase().trim()
  if (v === 'URGENTE') return 3
  if (v === 'IMPORTANTE') return 2
  return 1
}

/** Ordem de exibição de uma coluna: fixados primeiro (entre si, pela `ordem`),
 *  depois o resto pela `ordem` — sem re-embaralhar por prioridade aqui, isso
 *  só acontece na hora de INSERIR um card que muda de status (ver `moveTask`
 *  e `handleDragEnd`), pra não desfazer um reposicionamento manual do usuário. */
function ordenarColuna(tasks: ExtendedActionTask[]): ExtendedActionTask[] {
  return [...tasks].sort((a, b) => {
    if (!!a.fixado !== !!b.fixado) return a.fixado ? -1 : 1
    return a.ordem - b.ordem
  })
}

/** Índice onde inserir um card que ACABOU de entrar numa coluna (mudou de
 *  status): no topo do seu nível de prioridade — acima de qualquer card já
 *  ali com prioridade igual ou menor. Cards fixados são pulados (sempre
 *  ficam por cima, não fazem parte da disputa por prioridade). */
function indiceInsercaoPorPrioridade(colunaOrdenada: ExtendedActionTask[], prioridadeNova?: string | null) {
  const peso = pesoPrioridade(prioridadeNova)
  const idx = colunaOrdenada.findIndex((t) => !t.fixado && pesoPrioridade(t.prioridade) <= peso)
  return idx === -1 ? colunaOrdenada.length : idx
}

function DroppableTask({ task, children }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'opacity-50 ring-2 ring-primary rounded-xl transition-all' : ''}
    >
      {children}
    </div>
  )
}

function DroppableColumn({ id, title, count, children, acaoCabecalho }: any) {
  const { isOver, setNodeRef } = useDroppable({ id: `col-${id}` })
  const cor = estiloStatus(id)
  return (
    <div className="flex flex-col w-full min-w-0">
      {/* Cabeçalho fica FORA da caixa dos cards, direto no fundo da página —
          nome do status e contador soltos, sem borda em volta. */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <h3 className={cn('font-semibold text-sm tracking-wide', cor.corTexto)}>{title}</h3>
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md', cor.corSolida)}>
          {count}
        </span>
        <div className="flex-1" />
        {acaoCabecalho}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col gap-3 flex-1 overflow-y-auto min-h-[150px] rounded-xl transition-colors p-1',
          isOver && 'bg-slate-100/70 ring-2 ring-primary/20',
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface TaskBoardProps {
  refreshTrigger?: number
}

export function TaskBoard({ refreshTrigger = 0 }: TaskBoardProps) {
  const { toast } = useToast()
  const { usuario } = useAuth()
  const [tasks, setTasks] = useState<ExtendedActionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<ExtendedActionTask | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ExtendedActionTask | null>(null)
  const [activeColumn, setActiveColumn] = useState<ActionStatus>('PENDENTE')

  const undoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [undoableTasks, setUndoableTasks] = useState<Record<string, ActionStatus>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const load = async () => {
    if (!usuario?.restaurante_id) {
      return
    }
    try {
      setLoading(true)
      const data = await buscarAcoes(usuario.restaurante_id, true)
      if (data) {
        const mapped: ExtendedActionTask[] = data.map((d) => ({
          id: d.id.toString(),
          titulo_acao: d.titulo_acao || 'Sem título',
          prioridade: d.prioridade || 'NORMAL',
          categoria: d.categoria || 'Outros',
          plano_detalhado: d.plano_detalhado || undefined,
          texto: d.texto || undefined,
          feedback_id: d.feedback_id,
          restaurante_id: d.restaurante_id,
          created_at: d.created_at,
          insight_id: d.insight_id,
          arquivada_em: d.arquivada_em,
          responsavel: d.responsavel,
          prazo: d.prazo,
          date: new Date(d.created_at).toLocaleDateString(),
          status: d.status as ActionStatus,
          ordem: d.ordem || 0,
          fixado: !!d.fixado,
        }))
        mapped.sort((a, b) => a.ordem - b.ordem)
        setTasks(mapped)
      }
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as ações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (usuario === undefined) {
      return
    }

    if (!usuario || !usuario.restaurante_id) {
      setLoading(false)
      return
    }

    load()

    return () => {
      Object.values(undoTimers.current).forEach((timer) => clearTimeout(timer))
    }
  }, [refreshTrigger, usuario])

  const isValidMove = (from: ActionStatus, to: ActionStatus) => {
    if (from === 'PENDENTE' && to === 'EM_ANDAMENTO') return true
    if (from === 'EM_ANDAMENTO' && to === 'CONCLUIDO') return true
    return false
  }

  const doMoveStatusApi = async (
    taskId: string,
    oldStatus: ActionStatus,
    newStatus: ActionStatus,
    taskDetails: any,
  ) => {
    try {
      await atualizarStatusAcao(parseInt(taskId), newStatus)
      toast({
        title: oldStatus !== newStatus ? 'Status atualizado' : 'Avanço de etapa',
        description: `A tarefa foi movida para ${newStatus === 'EM_ANDAMENTO' ? 'Em Andamento' : newStatus === 'CONCLUIDO' ? 'Concluído' : 'Pendente'}.`,
      })

      if (taskDetails) {
        supabase.functions
          .invoke('webhook-n8n', {
            body: {
              task_id: taskId,
              title: taskDetails.titulo_acao,
              status: newStatus,
              priority: taskDetails.prioridade,
              source: taskDetails.categoria,
              restaurante_id: usuario?.restaurante_id,
            },
          })
          .catch(console.error)
      }

      setUndoableTasks((prev) => ({ ...prev, [taskId]: oldStatus }))
      if (undoTimers.current[taskId]) clearTimeout(undoTimers.current[taskId])

      undoTimers.current[taskId] = setTimeout(() => {
        setUndoableTasks((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
        delete undoTimers.current[taskId]
      }, 60000)
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao atualizar o status.', variant: 'destructive' })
      load() // reload to reset state on error
    }
  }

  const moveTask = async (taskId: string, oldStatus: ActionStatus, newStatus: ActionStatus) => {
    const taskDetails = tasks.find((t) => t.id === taskId)
    let updatedTasks: ExtendedActionTask[] = []

    setTasks((prev) => {
      const atual = prev.find((t) => t.id === taskId)
      if (!atual) return prev
      const movedTask = { ...atual, status: newStatus }
      const outros = prev.filter((t) => t.id !== taskId)

      const byStatus: Record<ActionStatus, ExtendedActionTask[]> = {
        PENDENTE: ordenarColuna(outros.filter((t) => t.status === 'PENDENTE')),
        EM_ANDAMENTO: ordenarColuna(outros.filter((t) => t.status === 'EM_ANDAMENTO')),
        CONCLUIDO: ordenarColuna(outros.filter((t) => t.status === 'CONCLUIDO')),
      }
      // Entra no topo do seu nível de prioridade — não junto no fim da lista.
      const idx = indiceInsercaoPorPrioridade(byStatus[newStatus], movedTask.prioridade)
      byStatus[newStatus].splice(idx, 0, movedTask)

      updatedTasks = [
        ...byStatus.PENDENTE.map((t, i) => ({ ...t, ordem: i })),
        ...byStatus.EM_ANDAMENTO.map((t, i) => ({ ...t, ordem: i })),
        ...byStatus.CONCLUIDO.map((t, i) => ({ ...t, ordem: i })),
      ]
      return updatedTasks
    })

    await doMoveStatusApi(taskId, oldStatus, newStatus, taskDetails)

    if (updatedTasks.length > 0) {
      const changedOrders = updatedTasks.map((t) => ({ id: parseInt(t.id), ordem: t.ordem }))
      atualizarOrdemAcoes(changedOrders).catch(console.error)
    }
  }

  const handleUndo = async (taskId: string) => {
    const oldStatus = undoableTasks[taskId]
    if (!oldStatus) return

    const taskDetails = tasks.find((t) => t.id === taskId)
    if (!taskDetails) return

    let updatedTasks: ExtendedActionTask[] = []

    setTasks((prev) => {
      const atual = prev.find((t) => t.id === taskId)
      if (!atual) return prev
      const movedTask = { ...atual, status: oldStatus }
      const outros = prev.filter((t) => t.id !== taskId)

      const byStatus: Record<ActionStatus, ExtendedActionTask[]> = {
        PENDENTE: ordenarColuna(outros.filter((t) => t.status === 'PENDENTE')),
        EM_ANDAMENTO: ordenarColuna(outros.filter((t) => t.status === 'EM_ANDAMENTO')),
        CONCLUIDO: ordenarColuna(outros.filter((t) => t.status === 'CONCLUIDO')),
      }
      const idx = indiceInsercaoPorPrioridade(byStatus[oldStatus], movedTask.prioridade)
      byStatus[oldStatus].splice(idx, 0, movedTask)

      updatedTasks = [
        ...byStatus.PENDENTE.map((t, i) => ({ ...t, ordem: i })),
        ...byStatus.EM_ANDAMENTO.map((t, i) => ({ ...t, ordem: i })),
        ...byStatus.CONCLUIDO.map((t, i) => ({ ...t, ordem: i })),
      ]
      return updatedTasks
    })

    if (undoTimers.current[taskId]) clearTimeout(undoTimers.current[taskId])
    setUndoableTasks((prev) => {
      const next = { ...prev }
      delete next[taskId]
      return next
    })
    delete undoTimers.current[taskId]

    await doMoveStatusApi(taskId, taskDetails.status, oldStatus, taskDetails)

    if (updatedTasks.length > 0) {
      const changedOrders = updatedTasks.map((t) => ({ id: parseInt(t.id), ordem: t.ordem }))
      atualizarOrdemAcoes(changedOrders).catch(console.error)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find((t) => t.id === active.id)
    if (task) setActiveTask(task)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string

    const activeTaskIndex = tasks.findIndex((t) => t.id === activeId)
    const activeTask = tasks[activeTaskIndex]
    if (!activeTask) return

    let newStatus: ActionStatus
    let overTaskId: string | null = null

    if (overId.startsWith('col-')) {
      newStatus = overId.replace('col-', '') as ActionStatus
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      newStatus = overTask.status
      overTaskId = overId
    }

    if (activeTask.status !== newStatus) {
      if (!isValidMove(activeTask.status, newStatus)) {
        let reason = 'Movimento inválido.'
        if (activeTask.status === 'CONCLUIDO')
          reason = 'Não é possível retornar tarefas concluídas.'
        else if (newStatus === 'PENDENTE')
          reason = 'Não é possível retroceder etapas manualmente. Use o botão "Desfazer".'
        else if (activeTask.status === 'PENDENTE' && newStatus === 'CONCLUIDO')
          reason = 'Você não pode pular etapas. Mova para "Em Andamento" primeiro.'

        toast({ title: 'Movimentação Bloqueada', description: reason, variant: 'destructive' })
        return
      }
    }

    const oldStatus = activeTask.status
    const mudouStatus = oldStatus !== newStatus

    const outros = tasks.filter((t) => t.id !== activeId)
    const movedTask = { ...activeTask, status: newStatus }

    const tasksByStatus: Record<ActionStatus, ExtendedActionTask[]> = {
      PENDENTE: ordenarColuna(outros.filter((t) => t.status === 'PENDENTE')),
      EM_ANDAMENTO: ordenarColuna(outros.filter((t) => t.status === 'EM_ANDAMENTO')),
      CONCLUIDO: ordenarColuna(outros.filter((t) => t.status === 'CONCLUIDO')),
    }

    // Mudou de status: entra no topo do seu nível de prioridade (não importa
    // sobre qual card específico foi soltado). Só reordenou DENTRO da mesma
    // coluna: aí sim respeita a posição exata que o usuário soltou.
    const targetIndex = mudouStatus
      ? indiceInsercaoPorPrioridade(tasksByStatus[newStatus], movedTask.prioridade)
      : overTaskId
        ? tasksByStatus[newStatus].findIndex((t) => t.id === overTaskId)
        : tasksByStatus[newStatus].length

    tasksByStatus[newStatus].splice(targetIndex, 0, movedTask)

    const updatedTasks = [
      ...tasksByStatus.PENDENTE.map((t, i) => ({ ...t, ordem: i })),
      ...tasksByStatus.EM_ANDAMENTO.map((t, i) => ({ ...t, ordem: i })),
      ...tasksByStatus.CONCLUIDO.map((t, i) => ({ ...t, ordem: i })),
    ]

    setTasks(updatedTasks)

    if (mudouStatus) {
      doMoveStatusApi(activeId, oldStatus, newStatus, activeTask)
    }

    const changedOrders = updatedTasks
      .filter((t) => {
        const oldTask = tasks.find((old) => old.id === t.id)
        return oldTask && (oldTask.ordem !== t.ordem || oldTask.status !== t.status)
      })
      .map((t) => ({ id: parseInt(t.id), ordem: t.ordem }))

    if (changedOrders.length > 0) {
      atualizarOrdemAcoes(changedOrders).catch(() => {
        toast({
          title: 'Erro',
          description: 'Falha ao salvar a nova ordem.',
          variant: 'destructive',
        })
      })
    }
  }

  const handleOpenModal = (status: ActionStatus, task?: ExtendedActionTask) => {
    setActiveColumn(status)
    setEditingTask(task || null)
    setModalOpen(true)
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await excluirAcao(parseInt(taskId))
      toast({ title: 'Tarefa excluída', description: 'A tarefa foi removida com sucesso.' })
      setModalOpen(false)
      load()
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao excluir a tarefa', variant: 'destructive' })
    }
  }

  const handleSaveTask = async (taskData: any) => {
    try {
      if (editingTask) {
        await atualizarAcao(parseInt(editingTask.id), {
          titulo_acao: taskData.title || taskData.titulo_acao,
          prioridade: taskData.priority || taskData.prioridade,
          categoria: taskData.source || taskData.categoria,
          // O modal agora envia o plano de fato; antes nunca vinha e isto caía
          // sempre no fallback, gravando string vazia.
          plano_detalhado: taskData.plano_detalhado ?? editingTask.plano_detalhado ?? '',
          responsavel: taskData.responsavel ?? null,
          prazo: taskData.prazo ?? null,
        })
        toast({ title: 'Ação atualizada' })
      } else {
        const currentPendente = tasks.filter((t) => t.status === 'PENDENTE')
        const maxOrdem =
          currentPendente.length > 0 ? Math.max(...currentPendente.map((t) => t.ordem)) : -1

        await criarAcao({
          titulo_acao: taskData.title || taskData.titulo_acao || 'Nova Ação',
          prioridade: taskData.priority || taskData.prioridade || 'NORMAL',
          categoria: taskData.source || taskData.categoria || 'Outros',
          plano_detalhado: taskData.plano_detalhado || '',
          responsavel: taskData.responsavel ?? null,
          prazo: taskData.prazo ?? null,
          status: 'PENDENTE',
          restaurante_id: usuario?.restaurante_id,
          ordem: maxOrdem + 1,
        })
        toast({ title: 'Ação criada' })
      }
      load()
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao salvar ação', variant: 'destructive' })
    }
    setModalOpen(false)
  }

  const handleArquivar = async (taskId: string) => {
    try {
      await arquivarAcao(parseInt(taskId))
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast({ title: 'Ação arquivada', description: 'Veja em Ações › Arquivadas.' })
    } catch {
      toast({ title: 'Erro', description: 'Falha ao arquivar a ação', variant: 'destructive' })
    }
  }

  const handlePin = async (taskId: string, fixado: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, fixado } : t)))
    try {
      await alternarFixadoAcao(parseInt(taskId), fixado)
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, fixado: !fixado } : t)))
      toast({ title: 'Erro', description: 'Falha ao fixar a ação', variant: 'destructive' })
    }
  }

  const columns: { title: string; status: ActionStatus }[] = [
    { title: 'PENDENTE', status: 'PENDENTE' },
    { title: 'EM ANDAMENTO', status: 'EM_ANDAMENTO' },
    { title: 'CONCLUÍDO', status: 'CONCLUIDO' },
  ]

  if (loading) {
    return (
      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 w-full h-full min-h-[600px] pb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col w-full min-w-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="flex flex-col gap-3">
              {[1, 2].map((j) => (
                <div
                  key={j}
                  className="bg-white p-5 rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start mb-2">
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-5 w-16 rounded-md mt-1" />
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-300">
                    <div className="flex gap-2 items-center">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Sem `return` antecipado para o estado vazio: o quadro continua montado,
  // com um único TaskModal e um único botão de adicionar, e as colunas seguem
  // visíveis como alvos de arraste.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 w-full h-full min-h-[600px] pb-4">
        {columns.map((col) => {
          const colTasks = ordenarColuna(tasks.filter((t) => t.status === col.status))
          return (
            <DroppableColumn
              key={col.status}
              id={col.status}
              title={col.title}
              count={colTasks.length}
              acaoCabecalho={
                col.status === 'PENDENTE' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0 bg-white"
                    onClick={() => handleOpenModal(col.status)}
                    title="Adicionar Ação"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Adicionar Ação
                  </Button>
                ) : col.status === 'CONCLUIDO' ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0 bg-white"
                    title="Ver ações arquivadas"
                  >
                    <Link to="/acoes/arquivadas">
                      <Archive className="w-3.5 h-3.5 mr-1" />
                      Arquivadas
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {colTasks.map((task) => (
                <DroppableTask key={task.id} task={task}>
                  <TaskCard
                    task={task}
                    onClick={() => handleOpenModal(col.status, task)}
                    canUndo={!!undoableTasks[task.id]}
                    onUndo={() => handleUndo(task.id)}
                    onArquivar={
                      task.status === 'CONCLUIDO' ? () => handleArquivar(task.id) : undefined
                    }
                    onProgress={() => {
                      const next = task.status === 'PENDENTE' ? 'EM_ANDAMENTO' : 'CONCLUIDO'
                      moveTask(task.id, task.status, next)
                    }}
                    onPin={(fixado) => handlePin(task.id, fixado)}
                  />
                </DroppableTask>
              ))}

              {/* Estado vazio dentro da coluna PENDENTE, sem substituir o quadro */}
              {tasks.length === 0 && col.status === 'PENDENTE' && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 mb-3">
                    <Plus className="h-6 w-6 text-[#1D4ED8]" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Nenhuma ação no momento
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    As ações aparecem aqui quando você aprova sugestões da IA ou cria uma ação
                    manualmente.
                  </p>
                </div>
              )}
            </DroppableColumn>
          )
        })}

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
        </DragOverlay>

        {modalOpen && (
          <TaskModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            task={
              editingTask
                ? {
                    id: editingTask.id,
                    title: editingTask.titulo_acao,
                    priority: editingTask.prioridade,
                    source: editingTask.categoria,
                    status: editingTask.status,
                    insight_id: editingTask.insight_id,
                    responsavel: editingTask.responsavel,
                    prazo: editingTask.prazo,
                    plano_detalhado: editingTask.plano_detalhado,
                  }
                : null
            }
            onSave={handleSaveTask}
            onDelete={handleDeleteTask}
          />
        )}
      </div>
    </DndContext>
  )
}
