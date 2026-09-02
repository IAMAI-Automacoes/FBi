import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { DataSegmentada } from '@/components/DataSegmentada'
import { CalendarDays, Check, Flag, Tag, Type, User } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { PlanoAcao } from '@/components/actions/PlanoAcao'
import { CATEGORIAS_FEEDBACK, estiloCategoria } from '@/lib/categorias-feedback'
import { estiloPrioridade } from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import { useAlturaAutomatica } from '@/hooks/use-altura-automatica'

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
  /** Ação arquivada: os campos ficam visíveis mas travados. */
  somenteLeitura?: boolean
}

const PRIORIDADES = ['OBSERVACAO', 'IMPORTANTE', 'URGENTE'] as const

/** Rótulo de campo: caixa alta pequena, igual ao painel de detalhes. */
function RotuloCampo({
  children,
  icone: Icone,
  htmlFor,
}: {
  children: React.ReactNode
  icone: React.ElementType
  htmlFor?: string
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-[12px] font-medium text-gray-700"
    >
      <Icone className="h-3.5 w-3.5 text-gray-400" />
      {children}
    </Label>
  )
}

/**
 * Formulário de ação — criar e editar.
 *
 * ## Dois invólucros, um formulário
 *
 * Editar abre no PAINEL LATERAL direito, no mesmo lugar e com o mesmo desenho
 * do `DetalhesAcaoPanel`: quem clica em "editar" acabou de ler os detalhes ali,
 * e trocar um painel encostado na direita por uma caixa no centro da tela move
 * o olho à toa e faz parecer outra tela, não o mesmo item em outro modo.
 *
 * O painel de edição é NÃO MODAL (`modal={false}` + `semOverlay`): o quadro
 * atrás continua clicável, e o escurecido de fundo é um véu único que o
 * TaskBoard mantém de pé para os dois painéis — assim ir de "ver detalhes"
 * para "editar" não apaga e reacende o fundo no meio do caminho.
 *
 * Criar abre no centro, porque não vem de lugar nenhum — não há contexto atrás
 * a preservar. Mas com o fundo bem mais claro que o padrão (`bg-black/80` do
 * shadcn apaga o quadro inteiro): o dono escreve a ação olhando as que já
 * existem, e escurecer tudo tira justamente essa referência.
 *
 * ## Todos os campos obrigatórios ao criar
 *
 * Prioridade e categoria eram opcionais e a IA preenchia o que ficasse em
 * branco. Agora são exigidas, e o preenchimento automático foi retirado por
 * inteiro (ver `vincularFeedbacksDaAcao`): quem cria a ação à mão sabe do que
 * ela trata, e um palpite de máquina sobre isso só gera card com categoria
 * errada para corrigir depois. A IA continua entrando no que ela faz melhor —
 * achar os feedbacks que a ação resolve.
 */
export function TaskModal({
  open,
  onOpenChange,
  task,
  onSave,
  somenteLeitura = false,
}: TaskModalProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<string>('')
  const [responsavel, setResponsavel] = useState('')
  const [prazo, setPrazo] = useState('')
  const [source, setSource] = useState('')
  const [plano, setPlano] = useState('')
  const [prazoAberto, setPrazoAberto] = useState(false)
  /** Só marca os campos vazios depois da primeira tentativa de salvar. */
  const [tentouSalvar, setTentouSalvar] = useState(false)

  // `prazo` fica como string "yyyy-MM-dd" (mesmo formato que já ia pro banco) —
  // só converte pra Date na hora de alimentar o calendário/campo segmentado.
  // O título é um textarea de uma linha, não um Input: um título comprido
  // rolava na horizontal dentro do campo e escondia o começo do que a pessoa
  // escreveu. Aqui ele quebra e a caixa cresce.
  const refTitulo = useAlturaAutomatica<HTMLTextAreaElement>(title)

  const prazoData = prazo ? parseISO(prazo) : undefined
  const definirPrazo = (data: Date | undefined) => {
    setPrazo(data ? format(data, 'yyyy-MM-dd') : '')
  }

  // Snapshot dos valores com que o modal abriu — é contra isto que comparamos
  // pra saber se algo mudou (e portanto se o "Salvar" deve ficar clicável).
  const valoresIniciaisRef = useRef({
    title: '', priority: '', responsavel: '', prazo: '', source: '', plano: '',
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
    setTentouSalvar(false)
  }, [task, open])

  const houveAlteracao =
    title !== valoresIniciaisRef.current.title ||
    priority !== valoresIniciaisRef.current.priority ||
    responsavel !== valoresIniciaisRef.current.responsavel ||
    prazo !== valoresIniciaisRef.current.prazo ||
    source !== valoresIniciaisRef.current.source ||
    plano !== valoresIniciaisRef.current.plano

  // Ao CRIAR, tudo é obrigatório. Ao EDITAR, não: ações antigas nasceram antes
  // desta regra e travar o salvar nelas impediria de corrigir o título por
  // causa de um prazo que nunca existiu.
  const faltando = {
    title: !title.trim(),
    priority: !priority,
    source: !source,
    responsavel: !responsavel.trim(),
    prazo: !prazo,
    plano: !plano.trim(),
  }
  const podeSalvar = !!task || !Object.values(faltando).some(Boolean)

  const handleSave = () => {
    setTentouSalvar(true)
    if (!podeSalvar) return

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
        title: 'Ação criada',
      })
    }
    onOpenChange(false)
  }

  const acaoId = task?.id ? Number(task.id) : undefined
  // Arquivada também não se edita, então o plano trava junto.
  const isConcluido = task?.status === 'CONCLUIDO' || somenteLeitura

  /** Borda vermelha só depois de tentar salvar — avisar antes de a pessoa
   *  terminar de preencher é ruído, não ajuda. */
  const erro = (campo: keyof typeof faltando) => tentouSalvar && !task && faltando[campo]

  const titulo = somenteLeitura ? 'Ação arquivada' : task ? 'Editar ação' : 'Nova ação'

  const formulario = (
    <div className="space-y-5">
      <div className="space-y-2">
        <RotuloCampo icone={Type} htmlFor="title">Título</RotuloCampo>
        <Textarea
          id="title"
          ref={refTitulo}
          rows={1}
          value={title}
          onKeyDown={(e) => {
            // Enter num título quase sempre é engano — a quebra automática já
            // cuida do texto comprido.
            if (e.key === 'Enter') e.preventDefault()
          }}
          // split/join e não regex: texto colado de outro lugar pode vir com
          // quebras, e elas viram espaço em vez de deformar o campo.
          onChange={(e) => setTitle(e.target.value.split('\n').join(' '))}
          placeholder="Ex: Revisar o fluxo de saída dos pratos"
          disabled={somenteLeitura}
          className={cn(
            'min-h-0 resize-none overflow-hidden py-2 leading-relaxed',
            erro('title') && 'border-red-400 focus-visible:ring-red-400',
          )}
        />
      </div>

      {/* Prioridade e categoria dividem a linha: são os dois rótulos que o card
          mostra lado a lado, então preenchê-los juntos espelha o resultado. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2 min-w-0">
          <RotuloCampo icone={Flag} htmlFor="priority">Prioridade</RotuloCampo>
          <Select value={priority} onValueChange={setPriority} disabled={somenteLeitura}>
            <SelectTrigger
              id="priority"
              className={cn('h-10', erro('priority') && 'border-red-400 focus:ring-red-400')}
            >
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {PRIORIDADES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('h-2 w-2 rounded-full shrink-0', estiloPrioridade(p).corSolida)}
                    />
                    {estiloPrioridade(p).label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 min-w-0">
          <RotuloCampo icone={Tag} htmlFor="source">Categoria</RotuloCampo>
          <Select value={source} onValueChange={setSource} disabled={somenteLeitura}>
            <SelectTrigger
              id="source"
              className={cn('h-10', erro('source') && 'border-red-400 focus:ring-red-400')}
            >
              <SelectValue placeholder="Selecionar" />
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2 min-w-0">
          <RotuloCampo icone={User} htmlFor="assignee">Responsável</RotuloCampo>
          <Input
            id="assignee"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Ex: Chef Pepê"
            disabled={somenteLeitura}
            className={cn('h-10', erro('responsavel') && 'border-red-400 focus-visible:ring-red-400')}
          />
        </div>

        <div className="space-y-2 min-w-0">
          <RotuloCampo icone={CalendarDays} htmlFor="deadline">Prazo</RotuloCampo>
          <Popover open={prazoAberto} onOpenChange={setPrazoAberto}>
            <PopoverTrigger asChild>
              <Button
                id="deadline"
                type="button"
                variant="outline"
                disabled={somenteLeitura}
                className={cn(
                  'w-full justify-start font-normal bg-white shadow-sm border-gray-200 h-10',
                  !prazoData && 'text-muted-foreground',
                  erro('prazo') && 'border-red-400',
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">
                  {prazoData
                    ? format(prazoData, "d 'de' MMM 'de' yyyy", { locale: ptBR })
                    : 'Selecionar'}
                </span>
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
      </div>

      <div className="space-y-2">
        <RotuloCampo icone={Check}>Plano de ação</RotuloCampo>
        <div
          className={cn(
            'rounded-lg border bg-white px-3 pb-3 pt-2 transition-colors focus-within:border-gray-400',
            erro('plano') ? 'border-red-400' : 'border-gray-200',
          )}
        >
          <PlanoAcao
            acaoId={acaoId}
            // O SNAPSHOT fixo (não `plano` ao vivo) — senão, como
            // `onPlanoUpdate` alimenta `plano` a cada tecla, o baseline
            // interno do PlanoAcao (usado pra decidir se mostra "Desfazer")
            // ficaria perseguindo o que o próprio usuário acabou de digitar e
            // nunca detectaria alteração nenhuma.
            planoInicial={valoresIniciaisRef.current.plano}
            isConcluido={isConcluido}
            onPlanoUpdate={setPlano}
          />
        </div>
      </div>

      {/* Uma linha só, e só depois de tentar salvar: marcar cada campo com um
          asterisco vermelho desde a abertura enche a tela de alerta antes de a
          pessoa ter errado qualquer coisa. */}
      {tentouSalvar && !podeSalvar && (
        <p className="text-sm text-red-600">Preencha todos os campos para criar a ação.</p>
      )}
    </div>
  )

  /* Os dois botões têm a MESMA altura e o mesmo peso de fonte; o que separa
     o primário do secundário é só o preenchimento. Antes eram tamanhos
     diferentes com um azul saturado ao lado de um botão fantasma — o par
     desequilibrado é o que fazia o rodapé parecer template.

     "Cancelar" não leva borda: uma borda dá a ele o mesmo peso visual de um
     botão de ação, e desfazer não é uma ação que se ofereça com destaque. */
  /* O primário é o cinza-900, não o azul da marca.
     O azul saturado é a cor de link e de destaque do app inteiro — usá-lo
     também no botão de salvar o punha no mesmo peso de tudo que é clicável na
     tela, e o resultado era um retângulo colorido que não parecia decisão,
     parecia enfeite. Preto sobre branco é o contraste mais alto disponível: em
     um rodapé de dois botões, ele é o único que precisa saltar.

     Altura de 36px (h-9), não 40: o rodapé tem dois botões e nenhum campo, e
     40px ali fazia a faixa competir em peso com o formulário inteiro. */
  const botoes = (
    <>
      <Button
        variant="ghost"
        onClick={() => onOpenChange(false)}
        className="h-9 px-3.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        {somenteLeitura ? 'Fechar' : 'Cancelar'}
      </Button>
      {!somenteLeitura && (
        <Button
          onClick={handleSave}
          disabled={!!task && !houveAlteracao}
          className="h-9 px-4 text-sm font-medium bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
        >
          {task ? 'Salvar' : 'Criar ação'}
        </Button>
      )}
    </>
  )

  // ---- EDITAR: painel lateral, no lugar de onde veio ----
  if (task) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          semOverlay
          className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Sem a linha de apoio ("as alterações valem ao salvar") e sem
              borda: ela dizia o que o botão Salvar já diz, e a borda somada ao
              padding de 20px empurrava o primeiro campo para longe do nome do
              painel. Agora o título e o campo de título ficam próximos, que é
              como se lê — o nome da tela e a primeira coisa a preencher. */}
          <SheetHeader className="shrink-0 bg-white px-5 pb-1 pt-5 text-left">
            <SheetTitle className="text-base font-semibold leading-snug">{titulo}</SheetTitle>
            <SheetDescription className="sr-only">
              {somenteLeitura ? 'Ação arquivada, sem edição.' : 'Editar os dados da ação.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-3">{formulario}</div>

          <SheetFooter className="shrink-0 flex-row justify-end gap-1 border-t bg-white p-4 sm:space-x-0">
            {botoes}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  // ---- CRIAR: no centro, com o quadro ainda visível atrás ----
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Coluna com o MIOLO rolando e o rodapé preso embaixo, em vez de um
          `overflow-y-auto` no diálogo inteiro. Com a rolagem no todo, o plano
          crescendo empurrava os botões para fora da área visível, e salvar
          exigia parar de escrever e rolar atrás deles.

          `useAlturaAutomatica` completa o par: a cada linha nova o miolo rola
          os mesmos pixels, então a base fica parada e a linha que está sendo
          digitada não sai do lugar. */}
      <DialogContent
        classNameOverlay="bg-black/25 backdrop-blur-[1px]"
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogHeader className="shrink-0 px-5 pb-1 pt-5 text-left">
          <DialogTitle className="text-base font-semibold leading-snug">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">
            Preencha os dados da nova ação.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">{formulario}</div>

        <DialogFooter className="shrink-0 gap-1 border-t bg-white p-4 sm:justify-end sm:space-x-0">
          {botoes}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
