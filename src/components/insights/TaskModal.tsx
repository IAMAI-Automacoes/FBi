import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  const [priority, setPriority] = useState<string>('NORMAL')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState('')
  const [source, setSource] = useState('')
  const [plano, setPlano] = useState('')

  useEffect(() => {
    if (!open) return
    if (task) {
      setTitle(task.title ?? '')
      setPriority(task.priority ?? 'NORMAL')
      setResponsavel(task.responsavel ?? '')
      setPrazo(task.prazo ?? '')
      setSource(task.source ?? '')
      setPlano(task.plano_detalhado ?? '')
    } else {
      setTitle('')
      setPriority('NORMAL')
      setResponsavel('')
      setPrazo('')
      setSource('')
      setPlano('')
    }
  }, [task, open])

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
              Título da Ação
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
            </Label>
            <Select value={priority} onValueChange={setPriority} disabled={somenteLeitura}>
              <SelectTrigger id="priority">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="IMPORTANTE">Importante</SelectItem>
                <SelectItem value="URGENTE">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source" className="font-semibold">
              Categoria
            </Label>
            <Input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ex: Atendimento"
              disabled={somenteLeitura}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assignee" className="font-semibold">
              Responsável
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
            <Input
              id="deadline"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              disabled={somenteLeitura}
            />
          </div>

          {/* Fora de qualquer condicional: o plano também aparece ao criar uma
              ação manualmente, não só ao editar. */}
          <Separator className="my-2" />
          <div className="grid gap-2">
            <Label className="font-semibold">Plano de Ação</Label>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <PlanoAcao
                acaoId={acaoId}
                planoInicial={plano}
                isConcluido={isConcluido}
                onPlanoUpdate={setPlano}
              />
            </div>
          </div>

          {task?.insight_id && (
            <Link
              to={`/feedbacks?insight_id=${task.insight_id}`}
              className="text-sm text-[#1D4ED8] hover:underline font-medium"
            >
              Ver feedbacks relacionados
            </Link>
          )}
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
                className="w-full sm:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white"
              >
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
