import { Lightbulb, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { Insight } from '@/lib/tipos/insight'
import { PRIORIDADES, estiloPrioridade } from '@/lib/prioridade'

interface InsightCardProps {
  insight: Insight
  onCreateTask: () => void
  onAiChat: () => void
  onDelete: () => void
  /** Fica `true` enquanto a IA está gerando a ação sugerida deste insight. */
  criandoAcao?: boolean
}

/**
 * "Observação" que é elogio (não existe como prioridade própria no banco —
 * "elogio sem ação imediata" já cai dentro de OBSERVACAO pelo prompt da IA).
 * Detectado por palavra-chave no título/descrição — mesma palavra que a IA
 * usa pra gerar esses títulos.
 */
function ehElogio(insight: Insight): boolean {
  const texto = `${insight.titulo ?? ''} ${insight.descricao ?? ''}`.toLowerCase()
  return texto.includes('elogi')
}

export function InsightCard({
  insight,
  onCreateTask,
  onAiChat,
  onDelete,
  criandoAcao = false,
}: InsightCardProps) {
  const prio = insight.prioridade || 'OBSERVACAO'
  const ehObservacaoElogio = (prio === 'OBSERVACAO' || prio === 'OBSERVAÇÃO') && ehElogio(insight)
  const config = ehObservacaoElogio ? PRIORIDADES.ELOGIO : estiloPrioridade(prio)

  // Insights gerados antes da ligação por IDs têm `feedback_ids` vazio: não há
  // para onde navegar, então o contador vira texto simples em vez de link morto.
  const temFeedbacksLigados = (insight.feedback_ids?.length ?? 0) > 0
  const totalFeedbacks = insight.feedback_ids?.length ?? insight.feedbacks_relacionados ?? 0

  return (
    <Card
      className={cn(
        'bg-white border-border shadow-sm flex flex-col hover:shadow-md transition-shadow duration-200 h-full relative border-l-4',
        config.corBorda,
      )}
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors z-10"
            title="Excluir insight"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O insight será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CardHeader className="px-4 sm:px-5 pt-3 sm:pt-3 pb-1 sm:pb-1 space-y-1 pr-11">
        <div>
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] font-bold tracking-wider rounded-full px-2.5 py-0.5',
              config.corFundo,
              config.corTexto,
              'hover:bg-opacity-80 border-none',
            )}
          >
            {config.label}
          </Badge>
        </div>
        <CardTitle className="text-lg font-bold text-gray-900 leading-tight">
          {insight.titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-2 sm:pb-2 flex-1 space-y-1.5">
        <p className="text-sm text-gray-600 leading-snug line-clamp-2">{insight.descricao}</p>
        <div className="flex items-start gap-2 text-sm font-bold text-gray-900 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1D4ED8] shrink-0">
            <Lightbulb className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="mt-0.5">{insight.sugestao}</span>
        </div>
      </CardContent>
      <CardFooter className="px-4 sm:px-5 pb-4 pt-2 sm:pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-auto">
        {temFeedbacksLigados ? (
          <Link
            to={`/feedbacks?insight_id=${insight.id}`}
            className="text-sm text-[#1D4ED8] hover:underline font-medium"
          >
            {totalFeedbacks} feedbacks relacionados →
          </Link>
        ) : (
          <span
            className="text-sm text-gray-400 font-medium cursor-help"
            title="Este insight foi gerado antes da ligação com os feedbacks de origem. Gere os insights novamente para poder navegar até eles."
          >
            {totalFeedbacks} feedbacks relacionados
          </span>
        )}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            onClick={onCreateTask}
            disabled={criandoAcao}
            className="w-full sm:w-auto bg-[#1D4ED8] hover:bg-blue-800 text-white h-9"
          >
            {criandoAcao && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {criandoAcao ? 'Gerando...' : 'Criar Ação'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onAiChat}
            className="w-full sm:w-auto text-[#1D4ED8] border-[#1D4ED8] hover:bg-blue-50 h-9 font-semibold"
          >
            Discutir com IA
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
