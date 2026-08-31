import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { DataSegmentada } from '@/components/DataSegmentada'
import { CalendarDays, Link2, Loader2 } from 'lucide-react'
import { categorizarAcao } from '@/lib/queries/acoes'
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
import { useToast } from '@/hooks/use-toast'
import { PlanoAcao } from '@/components/actions/PlanoAcao'
import { Separator } from '@/components/ui/separator'
import { CATEGORIAS_FEEDBACK, estiloCategoria } from '@/lib/categorias-feedback'
import { cn } from '@/lib/utils'

/** Formato que o modal recebe do quadro e devolve ao salvar. Mistura os campos
 *  da linha do banco com os apelidos que o TaskBoard já usava. */
export interface DadosTarefaModal {
  id?: string
  title?: string
  priority?: string
  source?: string
  responsavel?: string | null
  prazo?: string | null
  plano_detalhado?: string | null
  status?: string
  insight_id?: string | null
}

interface TaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: DadosTarefaModal | null
  onSave?: (task: DadosTarefaModal) => void
  onDelete?: (taskId: string) => void
  /** Ação arquivada: os campos ficam visíveis mas travados, e o rodapé mostra
   *  só "Excluir" e "Fechar" — nada é editável. */
  somenteLeitura?: boolean
}

export function TaskModal({
  open,
  onOpenChange,
  task,
  onSave,
  onDelete,
  somenteLeitura = false,
}: TaskModalProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  // Em branco por padrão (não "OBSERVACAO"): é o sinal de "o dono não
  // escolheu" que deixa a IA decidir sozinha ao criar (ver `categorizar-acao`
  // e `handleSaveTask` em TaskBoard.tsx) — só nas ações NOVAS, sem editar as
  // que a IA (ou o dono) já classificou antes.
  const [priority, setPriority] = useState<string>('')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState('')
  const [source, setSource] = useState('')
  const [plano, setPlano] = useState('')
  const [prazoAberto, setPrazoAberto] = useState(false)

  // `prazo` fica como string "yyyy-MM-dd" (mesmo formato que já ia pro banco) —
  // só converte pra Date na hora de alimentar o calendário/campo segmentado.
  const prazoData = prazo ? parseISO(prazo) : undefined
  const definirPrazo = (data: Date | undefined) => {
    setPrazo(data ? format(data, 'yyyy-MM-dd') : '')
  }

  // Snapshot dos valores com que o modal abriu — é contra isto que comparamos
  // pra saber se algo mudou (e portanto se o "Salvar" deve ficar clicável).
  const valoresIniciaisRef = useRef({
    title: '',
    priority: '',
    responsavel: '',
    prazo: '',
    source: '',
    plano: '',
  })

  useEffect(() => {
    if (!open) return
    const iniciais = task
      ? {
          title: task.title ?? '',
          priority: task.priority ?? '',
          responsavel: task.responsavel ?? '',
          prazo: task.prazo ?? '',
          source: task.source ?? '',
          plano: task.plano_detalhado ?? '',
        }
      : { title: '', priority: '', responsavel: '', prazo: '', source: '', plano: '' }
    valoresIniciaisRef.current = iniciais
    setTitle(iniciais.title)
    setPriority(iniciais.priority)
    setResponsavel(iniciais.responsavel)
    setPrazo(iniciais.prazo)
    setSource(iniciais.source)
    setPlano(iniciais.plano)
  }, [task, open])

  const houveAlteracao =
    title !== valoresIniciaisRef.current.title ||
    priority !== valoresIniciaisRef.current.priority ||
    responsavel !== valoresIniciaisRef.current.responsavel ||
    prazo !== valoresIniciaisRef.current.prazo ||
    source !== valoresIniciaisRef.current.source ||
    plano !== valoresIniciaisRef.current.plano

  // Só na CRIAÇÃO (pedido explícito do Raver) — editar uma ação já existente
  // não passa a travar por causa de campos que ficaram em branco antes desta
  // regra existir. Prioridade e categoria continuam sempre opcionais (a IA
  // completa ao criar, ver TaskBoard.tsx).
  const camposObrigatoriosPreenchidos =
    !!task || (!!title.trim() && !!responsavel.trim() && !!plano.trim())

  const handleSave = () => {
    if (onSave) {
      onSave({
        title,
        priority,
        source,
        responsavel: responsavel.trim() || null,
        prazo: prazo || null,
        plano_detalhado: plano,
      })
    } else {
      toast({
        title: 'Ação criada com sucesso',
        description: `A ação "${title}" foi adicionada ao backlog.`,
      })
    }
    onOpenChange(false)
  }

  const acaoId = task?.id ? Number(task.id) : undefined

  /**
   * "Buscar feedbacks relacionados".
   *
   * Existe porque uma acao pode terminar sem vinculo nenhum: o titulo estava
   * vago demais quando ela nasceu, ou a IA nao achou nada livre naquele
   * momento. Sem vinculo, a acao avanca de status e NINGUEM e avisado — o
   * motor de retorno acha o destinatario justamente por `feedback_acao`.
   *
   * Passa `apenasVinculo`: categoria e prioridade ja estao decididas e a IA
   * nao deve mexer nelas.
   */
  const [buscandoFeedbacks, setBuscandoFeedbacks] = useState(false)

  const buscarFeedbacksRelacionados = async () => {
    if (!acaoId) return
    setBuscandoFeedbacks(true)
    try {
      const res = await categorizarAcao(acaoId, true)
      const n = res?.feedbacks_vinculados ?? 0
      if (n > 0) {
        toast({
          title: `${n} feedback${n > 1 ? "s" : ""} ligado${n > 1 ? "s" : ""}`,
          description: "Quem escreveu vai ser avisado quando esta ação avançar de status.",
        })
      } else {
        toast({
          title: "Nenhum feedback novo",
          description:
            res?.motivo_sem_vinculo ??
            "Não há feedback livre que esta ação resolva. Detalhar o plano ajuda a IA a reconhecê-los.",
        })
      }
    } catch {
      toast({
        title: "Não consegui buscar agora",
        description: "Tente de novo em instantes.",
        variant: "destructive",
      })
    } finally {
      setBuscandoFeedbacks(false)
    }
  }
  // Arquivada também não se edita, então o plano trava junto.
  const isConcluido = task?.status === 'CONCLUIDO' || somenteLeitura

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {somenteLeitura ? 'Ação Arquivada' : task ? 'Editar Ação' : 'Criar Nova Ação'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title" className="font-semibold">
              Título da Ação <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título da ação..."
              disabled={somenteLeitura}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="priority" className="font-semibold">
              Prioridade
              {!task && <span className="ml-1 font-normal text-muted-foreground">(opcional — a IA decide se deixar em branco)</span>}
            </Label>
            <Select value={priority} onValueChange={setPriority} disabled={somenteLeitura}>
              <SelectTrigger id="priority">
                <SelectValue placeholder={task ? 'Selecione...' : 'IA decide automaticamente'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OBSERVACAO">Observação</SelectItem>
                <SelectItem value="IMPORTANTE">Importante</SelectItem>
                <SelectItem value="URGENTE">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source" className="font-semibold">
              Categoria
              {!task && <span className="ml-1 font-normal text-muted-foreground">(opcional — a IA decide se deixar em branco)</span>}
            </Label>
            <Select value={source} onValueChange={setSource} disabled={somenteLeitura}>
              <SelectTrigger id="source">
                <SelectValue placeholder={task ? 'Selecione...' : 'IA decide automaticamente'} />
              </SelectTrigger>
              <SelectContent>
                {/* Ícone + cor da paleta em cada opção: o dono reconhece a
                    categoria pelo símbolo antes de ler, e é o mesmo visual que
                    ele já vê no card e nos filtros. */}
                {CATEGORIAS_FEEDBACK.map((cat) => {
                  const estiloCat = estiloCategoria(cat)
                  const IconeCat = estiloCat.icon
                  return (
                    <SelectItem key={cat} value={cat}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full text-white shrink-0',
                            estiloCat.corSolida,
                          )}
                        >
                          <IconeCat className="h-2.5 w-2.5" />
                        </span>
                        {cat}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assignee" className="font-semibold">
              Responsável {!task && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id="assignee"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Ex: Chef Pepê"
              disabled={somenteLeitura}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deadline" className="font-semibold">
              Prazo
            </Label>
            <Popover open={prazoAberto} onOpenChange={setPrazoAberto}>
              <PopoverTrigger asChild>
                <Button
                  id="deadline"
                  type="button"
                  variant="outline"
                  disabled={somenteLeitura}
                  className="w-full justify-start font-normal bg-white shadow-sm border-gray-200 h-10"
                >
                  <CalendarDays className="mr-2 h-4 w-4 text-gray-400 shrink-0" />
                  {prazoData
                    ? format(prazoData, "d 'de' MMM 'de' yyyy", { locale: ptBR })
                    : 'Selecionar prazo'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={prazoData}
                  onSelect={(d) => {
                    definirPrazo(d)
                    setPrazoAberto(false)
                  }}
                  locale={ptBR}
                  disabled={{ before: new Date() }}
                />
                <div className="border-t p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Data selecionada</p>
                  <DataSegmentada value={prazoData} onChange={definirPrazo} />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Fora de qualquer condicional: o plano também aparece ao criar uma
              ação manualmente, não só ao editar. */}
          <Separator className="my-2" />
          <div className="grid gap-2">
            <Label className="font-semibold">
              Plano de Ação {!task && <span className="text-red-500">*</span>}
            </Label>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <PlanoAcao
                acaoId={acaoId}
                // O SNAPSHOT fixo (não `plano` ao vivo) — senão, como
                // `onPlanoUpdate` alimenta `plano` a cada tecla, o baseline
                // interno do PlanoAcao (usado pra decidir se mostra
                // "Desfazer") ficaria perseguindo o que o próprio usuário
                // acabou de digitar e nunca detectaria alteração nenhuma.
                planoInicial={valoresIniciaisRef.current.plano}
                isConcluido={isConcluido}
                onPlanoUpdate={setPlano}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {task?.insight_id && (
              <Link
                to={`/feedbacks?insight_id=${task.insight_id}`}
                className="text-sm text-[#1D4ED8] hover:underline font-medium"
              >
                Ver feedbacks relacionados
              </Link>
            )}

            {/* Só faz sentido em ação existente e que NÃO veio de insight: essa
                já herdou os vínculos do insight de origem. */}
            {acaoId && !task?.insight_id && !isConcluido && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={buscarFeedbacksRelacionados}
                disabled={buscandoFeedbacks}
              >
                {buscandoFeedbacks
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Link2 className="h-3.5 w-3.5" />}
                {buscandoFeedbacks ? 'Buscando…' : 'Buscar feedbacks relacionados'}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-between w-full flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          {task && onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso excluirá permanentemente a ação e os
                    dados associados a ela.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => task.id && onDelete(task.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto mt-2 sm:mt-0"
            >
              {somenteLeitura ? 'Fechar' : 'Cancelar'}
            </Button>
            {/* Nada é editável numa ação arquivada, então não há o que salvar. */}
            {!somenteLeitura && (
              <Button
                onClick={handleSave}
                disabled={!houveAlteracao || !camposObrigatoriosPreenchidos}
                className="w-full sm:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white"
              >
                {task ? 'Salvar' : 'Criar'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
