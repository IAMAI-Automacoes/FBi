import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { CheckCircle2, ArrowRight, ArrowLeft, RotateCcw, Archive, ArchiveRestore, Zap, Pin, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { estiloPrioridade } from '@/lib/prioridade'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TaskCardProps {
  // Linha de `acoes_operacionais` com apelidos do quadro; tipar por completo
  // exigiria refatorar o TaskBoard inteiro, fora do escopo desta mudança.
  task: any
  onClick?: () => void
  onProgress?: () => void
  /** Volta uma etapa (Em Andamento→Pendente ou Concluído→Em Andamento) —
   *  botão permanente, sem limite de tempo. Ausente em cards PENDENTE (não
   *  há pra onde voltar). */
  onVoltar?: () => void
  onArquivar?: () => void
  onDesarquivar?: () => void
  /** Alterna o card fixado no topo da coluna (por cima da ordenação por prioridade). */
  onPin?: (fixado: boolean) => void
  isOverlay?: boolean
  /** Na página de arquivadas o card não arrasta nem avança de status. */
  somenteLeitura?: boolean
  /** Quantos clientes distintos serão avisados quando esta ação avançar de
   *  etapa. `undefined` enquanto carrega; 0 esconde o selo. */
  clientesAvisados?: number
}

export function TaskCard({
  task,
  onClick,
  onProgress,
  onVoltar,
  onArquivar,
  onDesarquivar,
  onPin,
  isOverlay,
  somenteLeitura = false,
  clientesAvisados,
}: TaskCardProps) {
  // `disabled: isOverlay` é essencial, não cosmético: sem isso a cópia do
  // DragOverlay (que segue o cursor) registra SEU PRÓPRIO droppable — e por
  // estar sempre bem embaixo do ponteiro, `closestCorners` frequentemente a
  // escolhe como alvo em vez do card/coluna de verdade, fazendo a barrinha
  // sumir e o drop falhar silenciosamente (o id "overlay-x" não bate com
  // nenhuma tarefa real nem com "col-"). `useSortable` com `disabled: true`
  // tira o nó da lista de droppables candidatos da colisão.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: isOverlay ? `overlay-${task.id}` : task.id.toString(),
    data: { task },
    disabled: isOverlay || somenteLeitura,
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
        // `border-l-0`: a borda cinza de 1px nos outros lados reservava uma
        // fatia própria à esquerda TAMBÉM — como a faixa colorida abaixo é
        // `absolute left-0`, ela nasce por DENTRO dessa borda (não por cima
        // dela), sobrando um fiapo cinza visível à esquerda da faixa. Sem
        // largura de borda reservada à esquerda, a faixa fica rente à
        // borda de verdade do card.
        'relative overflow-hidden bg-white p-5 rounded-xl border-y border-r border-l-0 border-[#E5E7EB] shadow-sm flex flex-col',
        // `transition-all` durante o arraste anima até o `transform` que o
        // dnd-kit atualiza a cada frame do ponteiro — o card fica "correndo
        // atrás" do cursor em vez de seguir 1:1. Só anima a sombra do hover.
        !isDragging && 'transition-shadow hover:shadow-md',
        !isOverlay && !somenteLeitura && 'cursor-grab active:cursor-grabbing',
        // Arquivada não arrasta, mas abre o modal no clique.
        somenteLeitura && onClick && 'cursor-pointer',
        isCompleted && 'opacity-75 bg-slate-50/50',
        isDragging && !isOverlay && 'opacity-40 z-50 relative',
        isOverlay && 'shadow-xl scale-[1.03] cursor-grabbing z-50',
      )}
    >
      {/* Faixa de prioridade como camada solta (não `border-l-4` colorido) —
          misturar largura de borda diferente (1px nas outras bordas, 4px
          nesta) com `rounded-xl` faz o navegador deixar uma frestinha no
          canto arredondado, mostrando o cinza do fundo da página por trás
          (o "risco cinza do lado da borda" que apareceu no print). Uma
          camada `absolute` + `overflow-hidden` no card evita esse problema:
          ela é sempre cortada exatamente no contorno arredondado do card. */}
      <div className={cn('absolute inset-y-0 left-0 w-1', estiloPrioridade(task.prioridade).corSolida)} />

      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
              isCompleted ? 'bg-green-100 text-green-700' : estiloPrioridade(task.prioridade).corSolida,
            )}
          >
            {isCompleted ? 'CONCLUÍDO' : estiloPrioridade(task.prioridade).label}
          </span>

          {/* `texto` (não `insight_id`!) é o sinal confiável de "veio da IA": a
              edge function `sugerir-acoes` sempre grava esse texto padrão nela,
              mesmo quando não consegue casar o insight_id que a IA citou (nesse
              caso grava null) — ação criada à mão nunca tem `texto`.
              Fica ao lado da prioridade porque as duas respondem à mesma
              pergunta de relance: o que é isto e de onde veio.

              Tooltip do Radix, e não o `title` do HTML: o nativo demora ~1s
              para aparecer, some sozinho e não é estilizável — num ícone de
              20px que o dono vai consultar de passagem, esse atraso é a
              diferença entre a explicação existir ou não. */}
          {task.texto && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center w-5 h-5 shrink-0 text-green-700 bg-green-50 border border-green-200 rounded-full cursor-help"
                >
                  <Zap className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Sugerida pela IA</TooltipContent>
            </Tooltip>
          )}
        </div>
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


      {/* Categoria no MESMO formato do card de feedback (pílula arredondada,
          `text-[11px]`, ícone de 12px, cores da paleta) — é o mesmo assunto
          visto em telas diferentes, e ler dois desenhos distintos para a mesma
          coisa custa atenção do dono à toa. */}
      {task.categoria && (() => {
        const estiloCat = estiloCategoria(task.categoria)
        const IconeCat = estiloCat.icon
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium mb-3 self-start',
              isCompleted
                ? 'bg-slate-100 text-slate-500 border-slate-200'
                : cn(estiloCat.corFundo, estiloCat.corTexto, estiloCat.corBorda),
            )}
          >
            <IconeCat className="h-3 w-3" />
            {task.categoria}
          </span>
        )
      })()}

      {/* O link para os feedbacks relacionados saiu daqui: o card e para bater
          o olho, e cada link a mais nele e uma chance de o clique de conferir
          virar navegacao sem querer. Agora vive no painel de detalhes, junto do
          resto do contexto da acao. */}

      {/* Avisa o dono, ANTES do gesto, que mover este card vai gerar mensagem
          para cliente real. Até aqui isso acontecia de forma invisível: o
          disparo saía no drag e ninguém via. Concluído não mostra — dali a
          ação não avança mais, então não há novo aviso a gerar. */}
      {!isCompleted && (clientesAvisados ?? 0) > 0 && (
        <span
          title={`Ao avançar esta etapa, ${clientesAvisados} cliente${clientesAvisados! > 1 ? 's' : ''} receberá${clientesAvisados! > 1 ? 'ão' : ''} uma mensagem no WhatsApp (respeitando o intervalo mínimo entre mensagens).`}
          className="text-[11px] font-medium mb-3 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md self-start"
        >
          <Send className="w-3 h-3" />
          {clientesAvisados === 1
            ? '1 cliente será avisado'
            : `${clientesAvisados} clientes serão avisados`}
        </span>
      )}

      {/* O botao "Ver detalhes" saiu: o CARD INTEIRO abre o painel agora, entao
          um botao dentro dele so repetia o mesmo gesto num alvo menor. */}

      {/* `min-w-0` no grupo da esquerda e no `span` do nome é o que faz o
          `truncate` valer de verdade dentro de um flex — sem isso o item
          flex recusa encolher abaixo do conteúdo e o nome comprido empurra
          por cima do prazo (`shrink-0 whitespace-nowrap` do lado do prazo)
          em vez de truncar com reticências. */}
      <div className="flex items-center justify-between mt-auto pt-1 gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Avatar className="w-6 h-6 border border-border shrink-0">
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
          <span className="truncate min-w-0 font-medium">
            {task.responsavel || 'Sem responsável'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium shrink-0 whitespace-nowrap">
          {dataExibida}
        </span>
      </div>

      {/* A barra some só quando não há nada a oferecer: card concluído sem
          desfazer disponível e sem arquivar/desarquivar. */}
      {!isOverlay && !isDragging && (!isCompleted || !!onVoltar || !!onArquivar || !!onDesarquivar) && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-300 animate-fade-in-up">
          {/* Botão pequeno e permanente — Em Andamento é a única coluna com
              progresso (Concluir) e retrocesso (Pendente) lado a lado. */}
          {task.status === 'EM_ANDAMENTO' && onVoltar && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 shrink-0 text-slate-500 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation()
                onVoltar()
              }}
              title="Voltar para Pendente"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
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
          {isCompleted && onVoltar && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:text-amber-800 flex-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onVoltar()
              }}
            >
              <RotateCcw className="w-3 h-3 mr-1.5" /> Desfazer
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
