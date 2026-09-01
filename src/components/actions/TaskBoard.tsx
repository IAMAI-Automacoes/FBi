import { useState, useEffect, useRef, Fragment } from 'react'
import { ActionStatus } from '@/lib/mock-data'
import { TaskCard } from './TaskCard'
import { DetalhesAcaoPanel } from './DetalhesAcaoPanel'
import { TaskModal } from '@/components/insights/TaskModal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus, Archive, ListOrdered, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
  pointerWithin,
  useDroppable,
  defaultDropAnimationSideEffects,
  type DropAnimation,
  type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable'

// Cada TaskCard registra um droppable do próprio tamanho, e cada coluna
// TAMBÉM registra um droppable grande (a área toda, pra dar pra soltar no
// vazio). `closestCorners` compara TUDO por distância de cantos — como o
// retângulo da coluna é bem maior que o de um card, ele podia "ganhar" a
// colisão mesmo com o cursor bem em cima de um card específico no meio da
// lista (a barra então pulava pro fim da coluna em vez de aparecer entre os
// 2 cards certos). A correção: primeiro tenta achar um CARD onde o ponteiro
// está literalmente em cima (`pointerWithin`, restrito aos cards) — isso
// sempre ganha da coluna quando faz sentido ganhar. Só cai pro container da
// coluna quando o ponteiro não está sobre nenhum card (topo/fim da lista,
// coluna vazia). E só cai pro `closestCorners` bruto se nem isso achar nada
// (ex.: ponteiro momentaneamente fora de tudo, arrasto muito rápido).
const detectarColisao: CollisionDetection = (args) => {
  const semAtivo = args.droppableContainers.filter((c) => c.id !== args.active.id)
  const cards = semAtivo.filter((c) => !String(c.id).startsWith('col-'))
  const colunas = semAtivo.filter((c) => String(c.id).startsWith('col-'))

  const sobreCard = pointerWithin({ ...args, droppableContainers: cards })
  if (sobreCard.length > 0) return sobreCard

  const sobreColuna = pointerWithin({ ...args, droppableContainers: colunas })
  if (sobreColuna.length > 0) return sobreColuna

  return closestCorners({ ...args, droppableContainers: semAtivo })
}

// O board já usa `DragOverlay`, então o `useSortable` de cada card nunca
// desloca o próprio card ativo por transform (só a `DragOverlay` segue o
// cursor) — uma strategy que sempre retorna `null` desliga o reposicionamento
// automático dos outros cards por transform, deixando o "abrir espaço" 100%
// a cargo da barra cinza (ver `DropIndicatorBar`), que é só mais um item no
// fluxo/gap da coluna.
const noopSortingStrategy: SortingStrategy = () => null

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
  categorizarAcao,
} from '@/lib/queries/acoes'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
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

/** `texto` é o sinal confiável de "veio da IA" (ver mesma lógica em
 *  TaskCard.tsx): `sugerir-acoes` sempre grava esse texto padrão, mesmo
 *  quando não consegue casar o insight_id citado; criação manual nunca
 *  grava `texto`. */
function ehCriadaPelaIA(task: ExtendedActionTask): boolean {
  return !!task.texto
}

/** Ordem usada pelo botão "Organizar": prioridade primeiro (Urgente >
 *  Importante > Observação); empatando, ação criada pelo usuário vem antes
 *  da sugerida por IA; empatando ainda (mesma origem), a mais antiga vem
 *  primeiro — quem está esperando há mais tempo não deve ser empurrada pra
 *  trás só porque surgiu uma sugestão mais nova no mesmo nível. */
function compararParaOrganizar(a: ExtendedActionTask, b: ExtendedActionTask): number {
  const pesoA = pesoPrioridade(a.prioridade)
  const pesoB = pesoPrioridade(b.prioridade)
  if (pesoA !== pesoB) return pesoB - pesoA

  const iaA = ehCriadaPelaIA(a)
  const iaB = ehCriadaPelaIA(b)
  if (iaA !== iaB) return iaA ? 1 : -1

  const dataA = a.created_at ? new Date(a.created_at).getTime() : 0
  const dataB = b.created_at ? new Date(b.created_at).getTime() : 0
  return dataA - dataB
}

/** A ordem por prioridade (`compararParaOrganizar`) já é exatamente a ordem
 *  atual da coluna? Usado pra desabilitar o botão "Organizar" quando não há
 *  nada a fazer. */
function jaEstaOrganizada(colunaOrdenada: ExtendedActionTask[]): boolean {
  const fixados = colunaOrdenada.filter((t) => t.fixado).sort(compararParaOrganizar)
  const livres = colunaOrdenada.filter((t) => !t.fixado).sort(compararParaOrganizar)
  const alvo = [...fixados, ...livres]
  return colunaOrdenada.every((t, i) => t.id === alvo[i].id)
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

function DroppableColumn({ id, title, count, taskIds, children, acaoCabecalho }: any) {
  // `useDroppable` aqui cobre soltar na área vazia da coluna (sem card
  // nenhum perto) — o reordenar/entrar por cima de um card específico é o
  // `useSortable` de cada `TaskCard`, coordenado por este `SortableContext`.
  const { isOver, setNodeRef } = useDroppable({ id: `col-${id}` })
  const cor = estiloStatus(id)
  return (
    <div className="flex flex-col w-full min-w-0">
      {/* Cabeçalho fica FORA da caixa dos cards, direto no fundo da página —
          nome do status e contador soltos, sem borda em volta. `justify-between`
          entre os DOIS grupos (nome+contador de um lado, botões do outro) em
          vez de um spacer `flex-1` solto entre irmãos: com `flex-wrap`, o
          spacer competia pela linha e empurrava os botões pra uma 2ª linha
          mesmo cabendo espaço, que era o bug do print. */}
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn('font-semibold text-sm tracking-wide whitespace-nowrap shrink-0', cor.corTexto)}>
            {title}
          </h3>
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md shrink-0', cor.corSolida)}>
            {count}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">{acaoCabecalho}</div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col gap-3 flex-1 overflow-y-auto min-h-[150px] rounded-xl transition-colors p-1',
          isOver && 'bg-slate-100/70 ring-2 ring-primary/20',
        )}
      >
        <SortableContext items={taskIds} strategy={noopSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  )
}

/** Barrinha fina indicando onde o card cairia se solto agora — é só mais um
 *  item no flex da coluna (empurra os vizinhos via `gap`, sem precisar
 *  animar nada manualmente nem duplicar o card). */
function DropIndicatorBar() {
  return <div aria-hidden className="h-1.5 rounded-full bg-slate-300 mx-1 shrink-0" />
}

/** Contorno tracejado no formato de um card — aparece em QUALQUER coluna que
 *  esteja vazia (não só quando o quadro inteiro está vazio), avisando qual
 *  status não tem nenhuma ação no momento. */
function EstadoVazioColuna({ status }: { status: ActionStatus }) {
  const texto =
    status === 'PENDENTE'
      ? 'Nenhuma ação pendente'
      : status === 'EM_ANDAMENTO'
        ? 'Nenhuma ação em andamento'
        : 'Nenhuma ação concluída'
  return (
    <div className="flex min-h-[110px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted-foreground">
      {texto}
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
  /** Onde o card cairia se solto AGORA — puramente visual (não mexe em
   *  `tasks`), calculado a cada `onDragOver`. `index` já exclui o próprio
   *  card ativo, então serve tanto pra desenhar a barra quanto pro splice
   *  real no `handleDragEnd`. */
  const [dropIndicator, setDropIndicator] = useState<{ status: ActionStatus; index: number } | null>(
    null,
  )
  /** Evita a barra "piscar" de lado quando o cursor está bem em cima do
   *  centro de um card: só troca de antes/depois quando ultrapassa uma
   *  margem, e mantém o último lado decidido dentro da zona morta. */
  const ladoEstavelRef = useRef<'antes' | 'depois'>('antes')

  /** Janela de 30s pra desfazer o último "Organizar" de cada coluna — a
   *  chave presente (mesmo array vazio) significa "dentro da janela"; o
   *  valor é a ordem de ANTES de organizar, pra onde um novo clique volta. */
  const [desfazerOrganizar, setDesfazerOrganizar] = useState<
    Partial<Record<ActionStatus, { id: string; ordem: number }[]>>
  >({})
  const organizarTimers = useRef<Partial<Record<ActionStatus, ReturnType<typeof setTimeout>>>>({})

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ExtendedActionTask | null>(null)
  const [activeColumn, setActiveColumn] = useState<ActionStatus>('PENDENTE')
  /** Card cujo painel lateral de detalhes (plano completo + prazo +
   *  responsável) está aberto — só leitura, ver `DetalhesAcaoPanel`. */
  const [detalhesTask, setDetalhesTask] = useState<ExtendedActionTask | null>(null)

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
          prioridade: d.prioridade || 'OBSERVACAO',
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
      Object.values(organizarTimers.current).forEach((timer) => clearTimeout(timer))
    }
  }, [refreshTrigger, usuario])

  const isValidMove = (from: ActionStatus, to: ActionStatus) => {
    if (from === 'PENDENTE' && to === 'EM_ANDAMENTO') return true
    if (from === 'EM_ANDAMENTO' && to === 'CONCLUIDO') return true
    // Voltar uma etapa (Em Andamento → Pendente) pode ser feito arrastando
    // direto — só CONCLUÍDO que continua exigindo o botão "Desfazer".
    if (from === 'EM_ANDAMENTO' && to === 'PENDENTE') return true
    return false
  }

  const doMoveStatusApi = async (
    taskId: string,
    oldStatus: ActionStatus,
    newStatus: ActionStatus,
  ) => {
    try {
      await atualizarStatusAcao(parseInt(taskId), newStatus)
      toast({
        title: oldStatus !== newStatus ? 'Status atualizado' : 'Avanço de etapa',
        description: `A tarefa foi movida para ${newStatus === 'EM_ANDAMENTO' ? 'Em Andamento' : newStatus === 'CONCLUIDO' ? 'Concluído' : 'Pendente'}.`,
      })

      // Quem avisa o cliente é o motor de retorno, não o navegador. A mudança de
      // status já é registrada em `acao_status_historico` pelo trigger, espera as
      // 2h de carência e só então vira aviso — e essa rota funciona mesmo quando
      // o status muda pela API ou por outra aba. O disparo daqui era um segundo
      // caminho, que mandava a mensagem na hora e não sabia desfazer.
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao atualizar o status.', variant: 'destructive' })
      load() // reload to reset state on error
    }
  }

  const moveTask = async (taskId: string, oldStatus: ActionStatus, newStatus: ActionStatus) => {
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

    await doMoveStatusApi(taskId, oldStatus, newStatus)

    if (updatedTasks.length > 0) {
      const changedOrders = updatedTasks.map((t) => ({ id: parseInt(t.id), ordem: t.ordem }))
      atualizarOrdemAcoes(changedOrders).catch(console.error)
    }
  }

  /** Botão permanente de "voltar uma etapa" (Em Andamento→Pendente ou
   *  Concluído→Em Andamento) — sem timer, sempre disponível enquanto o card
   *  não estiver em PENDENTE. Reaproveita `moveTask`, que já insere no topo
   *  do nível de prioridade — a regra certa pra mudança via botão. */
  const handleVoltar = (taskId: string, statusAtual: ActionStatus) => {
    const anterior: ActionStatus = statusAtual === 'CONCLUIDO' ? 'EM_ANDAMENTO' : 'PENDENTE'
    moveTask(taskId, statusAtual, anterior)
  }

  /** Aplica uma lista de {id, ordem} já pronta — usado tanto por "Organizar"
   *  quanto pelo desfazer dele, que é literalmente a mesma operação com a
   *  lista invertida. */
  const aplicarOrdem = (pares: { id: string; ordem: number }[]) => {
    const porId = new Map(pares.map((p) => [p.id, p.ordem]))
    setTasks((prev) =>
      prev.map((t) => {
        const novo = porId.get(t.id)
        return novo !== undefined && novo !== t.ordem ? { ...t, ordem: novo } : t
      }),
    )
    atualizarOrdemAcoes(pares.map((p) => ({ id: parseInt(p.id), ordem: p.ordem }))).catch(() => {
      toast({ title: 'Erro', description: 'Falha ao organizar a coluna.', variant: 'destructive' })
    })
  }

  /** Botão "Organizar": reordena a coluna por `compararParaOrganizar`. Um
   *  segundo clique dentro de 30s desfaz (volta pra ordem de antes) — depois
   *  disso, ou assim que a coluna já está na ordem organizada, o botão fica
   *  desabilitado (nada a fazer até ela sair de novo dessa ordem). */
  const handleOrganizar = (status: ActionStatus) => {
    const snapshotAnterior = desfazerOrganizar[status]

    if (snapshotAnterior) {
      if (organizarTimers.current[status]) clearTimeout(organizarTimers.current[status])
      setDesfazerOrganizar((prev) => ({ ...prev, [status]: undefined }))
      aplicarOrdem(snapshotAnterior)
      return
    }

    const coluna = ordenarColuna(tasks.filter((t) => t.status === status))
    if (jaEstaOrganizada(coluna)) return // botão deveria estar desabilitado; defensivo

    const antes = coluna.map((t) => ({ id: t.id, ordem: t.ordem }))
    const fixados = coluna.filter((t) => t.fixado).sort(compararParaOrganizar)
    const livres = coluna.filter((t) => !t.fixado).sort(compararParaOrganizar)
    const depois = [...fixados, ...livres].map((t, i) => ({ id: t.id, ordem: i }))

    aplicarOrdem(depois)

    setDesfazerOrganizar((prev) => ({ ...prev, [status]: antes }))
    if (organizarTimers.current[status]) clearTimeout(organizarTimers.current[status])
    organizarTimers.current[status] = setTimeout(() => {
      setDesfazerOrganizar((prev) => ({ ...prev, [status]: undefined }))
    }, 30000)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find((t) => t.id === active.id)
    if (task) setActiveTask(task) // snapshot do status ORIGINAL, antes de qualquer coisa mudar
    ladoEstavelRef.current = 'antes'
  }

  /** Motivo do bloqueio, setado durante o drag (ver handleDragOver) e
   *  consumido/limpo no handleDragEnd — pra avisar só uma vez, na soltada. */
  const movimentoBloqueadoRef = useRef<string | null>(null)

  /** Índice de inserção dentro de `destino` (lista JÁ SEM o card ativo,
   *  ordenada) — decide antes/depois do card sob o cursor comparando os
   *  centros verticais dos dois rects que o próprio evento do dnd-kit já
   *  fornece. Uma margem de histerese em volta do centro evita a barra
   *  "piscar" de lado quando o cursor está bem em cima da borda. */
  const computeInsertIndex = (
    event: DragOverEvent,
    destino: ExtendedActionTask[],
  ): number => {
    const { active, over } = event
    const overId = over!.id as string

    if (overId.startsWith('col-')) {
      // Área vazia da coluna (sem nenhum card por perto do ponteiro): decide
      // topo ou fim comparando com o MEIO do próprio container — perto do
      // topo dele = quer entrar em primeiro; perto do fim = quer ir pro final.
      if (destino.length === 0) return 0
      const overRect = over!.rect
      const activeRect = active.rect.current?.translated
      if (!overRect || !activeRect) return destino.length
      const activeCenterY = activeRect.top + activeRect.height / 2
      const colunaMeioY = overRect.top + overRect.height / 2
      return activeCenterY < colunaMeioY ? 0 : destino.length
    }

    const overIdx = destino.findIndex((t) => t.id === overId)
    if (overIdx === -1) return destino.length // pairando sobre o próprio card ativo

    const overRect = over!.rect
    const activeRect = active.rect.current?.translated
    if (!overRect || !activeRect) return overIdx

    const overCenterY = overRect.top + overRect.height / 2
    const activeCenterY = activeRect.top + activeRect.height / 2
    const MARGEM = 6

    let lado: 'antes' | 'depois'
    if (activeCenterY < overCenterY - MARGEM) lado = 'antes'
    else if (activeCenterY > overCenterY + MARGEM) lado = 'depois'
    else lado = ladoEstavelRef.current // zona morta: mantém a última decisão

    ladoEstavelRef.current = lado
    return lado === 'antes' ? overIdx : overIdx + 1
  }

  /** Enquanto arrasta: NUNCA muta `tasks` de verdade — só calcula onde o
   *  card cairia (`dropIndicator`), pra desenhar a barra cinza. Isso é o que
   *  garante que o fantasma (opacidade baixa) do card ativo fique sempre
   *  preso na coluna/posição de ORIGEM, nunca "teleporta" pro destino. */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!activeTask) return
    const activeId = active.id as string

    if (!over) {
      setDropIndicator(null)
      return
    }
    const overId = over.id as string
    if (activeId === overId) {
      setDropIndicator(null)
      return
    }

    const overStatus = overId.startsWith('col-')
      ? (overId.replace('col-', '') as ActionStatus)
      : tasks.find((t) => t.id === overId)?.status
    // `over.id` não bateu com nenhuma tarefa nem coluna conhecida — ruído
    // passageiro de colisão, não "saiu de tudo" (isso já é tratado acima,
    // quando `over` é `null`). Mantém a barra como estava em vez de apagar,
    // pra ela não sumir/piscar à toa enquanto o gesto continua válido.
    if (!overStatus) return

    const mudaStatus = overStatus !== activeTask.status
    if (mudaStatus && !isValidMove(activeTask.status, overStatus)) {
      movimentoBloqueadoRef.current = overStatus
      setDropIndicator(null)
      return
    }
    movimentoBloqueadoRef.current = null // hover válido corrige um bloqueio anterior

    const destino = ordenarColuna(tasks.filter((t) => t.status === overStatus && t.id !== activeId))
    const index = computeInsertIndex(event, destino)

    // Voltou pra posição exata de onde saiu (mesma coluna): não mostra barra,
    // é como se estivesse "devolvida no lugar".
    if (!mudaStatus) {
      const posOrigem = ordenarColuna(tasks.filter((t) => t.status === activeTask.status)).findIndex(
        (t) => t.id === activeId,
      )
      if (index === posOrigem) {
        setDropIndicator(null)
        return
      }
    }

    setDropIndicator((prev) =>
      prev && prev.status === overStatus && prev.index === index ? prev : { status: overStatus, index },
    )
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active } = event
    const original = activeTask // status ORIGINAL, de antes do drag inteiro
    const indicador = dropIndicator
    setActiveTask(null)
    setDropIndicator(null)

    const bloqueado = movimentoBloqueadoRef.current
    movimentoBloqueadoRef.current = null
    if (bloqueado) {
      let reason = 'Movimento inválido.'
      if (original?.status === 'CONCLUIDO')
        reason = 'Não é possível retornar tarefas concluídas arrastando. Use o botão "Desfazer".'
      else if (original?.status === 'PENDENTE' && bloqueado === 'CONCLUIDO')
        reason = 'Você não pode pular etapas. Mova para "Em Andamento" primeiro.'
      toast({ title: 'Movimentação Bloqueada', description: reason, variant: 'destructive' })
    }

    // Sem indicador: soltou fora de qualquer alvo válido, ou voltou pro
    // lugar de origem sem soltar em outra posição — nada muda.
    if (!original || !indicador) return
    const activeId = active.id as string
    const atual = tasks.find((t) => t.id === activeId)
    if (!atual) return

    const mudouStatus = original.status !== indicador.status

    const outros = tasks.filter((t) => t.id !== activeId)
    const tasksByStatus: Record<ActionStatus, ExtendedActionTask[]> = {
      PENDENTE: ordenarColuna(outros.filter((t) => t.status === 'PENDENTE')),
      EM_ANDAMENTO: ordenarColuna(outros.filter((t) => t.status === 'EM_ANDAMENTO')),
      CONCLUIDO: ordenarColuna(outros.filter((t) => t.status === 'CONCLUIDO')),
    }

    const movedTask = { ...atual, status: indicador.status }
    const destino = tasksByStatus[indicador.status]
    destino.splice(Math.min(Math.max(indicador.index, 0), destino.length), 0, movedTask)

    const updatedTasks = [
      ...tasksByStatus.PENDENTE.map((t, i) => ({ ...t, ordem: i })),
      ...tasksByStatus.EM_ANDAMENTO.map((t, i) => ({ ...t, ordem: i })),
      ...tasksByStatus.CONCLUIDO.map((t, i) => ({ ...t, ordem: i })),
    ]

    setTasks(updatedTasks)

    if (mudouStatus) {
      doMoveStatusApi(activeId, original.status, indicador.status, movedTask)
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
        const atualizada = await atualizarAcao(parseInt(editingTask.id), {
          titulo_acao: taskData.title || taskData.titulo_acao,
          prioridade: taskData.priority || taskData.prioridade,
          categoria: taskData.source || taskData.categoria,
          // O modal agora envia o plano de fato; antes nunca vinha e isto caía
          // sempre no fallback, gravando string vazia.
          plano_detalhado: taskData.plano_detalhado ?? editingTask.plano_detalhado ?? '',
          responsavel: taskData.responsavel ?? null,
          prazo: taskData.prazo ?? null,
        })
        // Atualiza só o card em memória — recarregar tudo do banco (`load()`)
        // troca a tela inteira por esqueleto de carregamento por um instante,
        // um "pisca" que não faz sentido pra uma edição pontual.
        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id
              ? {
                  ...t,
                  titulo_acao: atualizada.titulo_acao,
                  prioridade: atualizada.prioridade,
                  categoria: atualizada.categoria,
                  plano_detalhado: atualizada.plano_detalhado,
                  responsavel: atualizada.responsavel,
                  prazo: atualizada.prazo,
                }
              : t,
          ),
        )
        toast({ title: 'Ação atualizada' })
      } else {
        const currentPendente = tasks.filter((t) => t.status === 'PENDENTE')
        const maxOrdem =
          currentPendente.length > 0 ? Math.max(...currentPendente.map((t) => t.ordem)) : -1

        // Categoria/prioridade em branco (o dono não escolheu) vão como
        // `null` — é o sinal que `categorizar-acao` usa pra saber quais dos
        // dois campos completar sozinha, sem nunca sobrescrever o que já foi
        // preenchido manualmente.
        const categoriaEscolhida = taskData.source || taskData.categoria || null
        const prioridadeEscolhida = taskData.priority || taskData.prioridade || null

        const criada = await criarAcao({
          titulo_acao: taskData.title || taskData.titulo_acao || 'Nova Ação',
          prioridade: prioridadeEscolhida,
          categoria: categoriaEscolhida,
          plano_detalhado: taskData.plano_detalhado || '',
          responsavel: taskData.responsavel ?? null,
          prazo: taskData.prazo ?? null,
          status: 'PENDENTE',
          restaurante_id: usuario?.restaurante_id,
          ordem: maxOrdem + 1,
        })
        setTasks((prev) => [
          ...prev,
          {
            id: criada.id.toString(),
            titulo_acao: criada.titulo_acao || 'Sem título',
            // Só efeito visual enquanto a IA ainda não respondeu (abaixo) —
            // o que fica gravado no banco é o `null` de verdade.
            prioridade: criada.prioridade || 'OBSERVACAO',
            categoria: criada.categoria || 'Outros',
            plano_detalhado: criada.plano_detalhado || undefined,
            texto: criada.texto || undefined,
            feedback_id: criada.feedback_id,
            restaurante_id: criada.restaurante_id,
            created_at: criada.created_at,
            insight_id: criada.insight_id,
            arquivada_em: criada.arquivada_em,
            responsavel: criada.responsavel,
            prazo: criada.prazo,
            date: new Date(criada.created_at).toLocaleDateString(),
            status: criada.status as ActionStatus,
            ordem: criada.ordem || 0,
            fixado: !!criada.fixado,
          },
        ])
        toast({ title: 'Ação criada' })

        // SEMPRE, e não só quando falta categoria ou prioridade.
        //
        // Antes isto rodava só quando um dos dois campos vinha em branco — e o
        // efeito era que preencher os dois fazia a ação nascer SEM NENHUM
        // feedback vinculado. Uma ação sem vínculo muda de status e não avisa
        // ninguém, porque o motor de retorno acha o destinatário justamente por
        // `feedback_acao`. Quem preenchia tudo direitinho era quem perdia o
        // retorno ao cliente.
        //
        // `apenasVinculo` quando o dono já decidiu os dois: aí a IA não mexe
        // neles, só procura os feedbacks livres que esta ação resolve.
        const jaDecidiu = !!categoriaEscolhida && !!prioridadeEscolhida
        categorizarAcao(criada.id, jaDecidiu)
          .then((res) => {
            if (res?.status !== 'sucesso') return
            setTasks((prev) =>
              prev.map((t) =>
                t.id === criada.id.toString()
                  ? {
                      ...t,
                      categoria: res.categoria ?? t.categoria,
                      prioridade: res.prioridade ?? t.prioridade,
                    }
                  : t,
              ),
            )
            if (res.feedbacks_vinculados) {
              toast({
                title: `${res.feedbacks_vinculados} feedback${res.feedbacks_vinculados > 1 ? 's' : ''} ligado${res.feedbacks_vinculados > 1 ? 's' : ''}`,
                description:
                  'Quem escreveu vai ser avisado quando esta ação avançar de status.',
              })
            }
          })
          .catch(() => {
            // Falha na IA não é crítica: a ação já existe com os valores do
            // insert, e o dono pode usar "Buscar feedbacks relacionados" no
            // modal para tentar de novo.
          })
      }
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
      collisionDetection={detectarColisao}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 w-full h-full min-h-[600px] pb-4">
        {columns.map((col) => {
          const colTasks = ordenarColuna(tasks.filter((t) => t.status === col.status))
          // Card ativo continua na lista real (fica com opacidade baixa no
          // lugar de origem) — a barra é calculada sobre a lista SEM ele,
          // que é exatamente como `dropIndicator.index` foi computado.
          const outrosDaColuna = activeTask
            ? colTasks.filter((t) => t.id !== activeTask.id)
            : colTasks
          const mostraBarra = !!activeTask && dropIndicator?.status === col.status
          const idAntesDaBarra = mostraBarra
            ? (outrosDaColuna[dropIndicator!.index]?.id ?? '__fim__')
            : null
          const dentroDaJanelaDeDesfazer = !!desfazerOrganizar[col.status]
          const organizarDesabilitado = !dentroDaJanelaDeDesfazer && jaEstaOrganizada(colTasks)
          return (
            <DroppableColumn
              key={col.status}
              id={col.status}
              title={col.title}
              count={colTasks.length}
              taskIds={colTasks.map((t) => t.id)}
              acaoCabecalho={
                <>
                  {(col.status === 'PENDENTE' || col.status === 'EM_ANDAMENTO') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 shrink-0 bg-white"
                      onClick={() => handleOrganizar(col.status)}
                      disabled={organizarDesabilitado}
                      title={
                        dentroDaJanelaDeDesfazer
                          ? 'Desfazer organização'
                          : organizarDesabilitado
                            ? 'Coluna já organizada por prioridade'
                            : 'Organizar por prioridade'
                      }
                    >
                      {dentroDaJanelaDeDesfazer ? (
                        <RotateCcw className="w-3.5 h-3.5" />
                      ) : (
                        <ListOrdered className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                  {col.status === 'PENDENTE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 shrink-0 bg-white"
                      onClick={() => handleOpenModal(col.status)}
                      title="Adicionar Ação"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {col.status === 'CONCLUIDO' && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 shrink-0 bg-white"
                      title="Ver ações arquivadas"
                    >
                      <Link to="/acoes/arquivadas">
                        <Archive className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  )}
                </>
              }
            >
              {colTasks.map((task) => (
                <Fragment key={task.id}>
                  {idAntesDaBarra === task.id && <DropIndicatorBar />}
                  <TaskCard
                    task={task}
                    // Clicar no card abre os DETALHES, nao o formulario de edicao.
                    // Editar e um passo a mais, de dentro do painel — assim um clique
                    // para conferir a acao nao coloca o dono direto num formulario.
                    onClick={() => setDetalhesTask(task)}
                    onVoltar={
                      task.status !== 'PENDENTE' ? () => handleVoltar(task.id, task.status) : undefined
                    }
                    onArquivar={
                      task.status === 'CONCLUIDO' ? () => handleArquivar(task.id) : undefined
                    }
                    onProgress={() => {
                      const next = task.status === 'PENDENTE' ? 'EM_ANDAMENTO' : 'CONCLUIDO'
                      moveTask(task.id, task.status, next)
                    }}
                    onPin={(fixado) => handlePin(task.id, fixado)}
                  />
                </Fragment>
              ))}
              {idAntesDaBarra === '__fim__' && <DropIndicatorBar />}

              {colTasks.length === 0 && <EstadoVazioColuna status={col.status} />}
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

        {detalhesTask && (
          <DetalhesAcaoPanel
            task={detalhesTask}
            onClose={() => setDetalhesTask(null)}
            onEditar={() => {
              const status = detalhesTask.status
              setDetalhesTask(null)
              handleOpenModal(status, detalhesTask)
            }}
          />
        )}
      </div>
    </DndContext>
  )
}
