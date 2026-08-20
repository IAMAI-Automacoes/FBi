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

interface InsightCardProps {
  insight: Insight
  onCreateTask: () => void
  onAiChat: () => void
  onDelete: () => void
  /** Fica `true` enquanto a IA está gerando a ação sugerida deste insight. */
  criandoAcao?: boolean
}

interface EstiloPrioridade {
  bg: string
  text: string
  label: string
}

const priorityConfig: Record<string, EstiloPrioridade> = {
  URGENTE: { bg: 'bg-[#FEF2F2]', text: 'text-[#EF4444]', label: 'URGENTE' },
  IMPORTANTE: { bg: 'bg-[#FFF7ED]', text: 'text-[#F59E0B]', label: 'IMPORTANTE' },
  OBSERVAÇÃO: { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]', label: 'OBSERVAÇÃO' },
  OBSERVACAO: { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]', label: 'OBSERVAÇÃO' },
}

export function InsightCard({
  insight,
  onCreateTask,
  onAiChat,
  onDelete,
  criandoAcao = false,
}: InsightCardProps) {
  const prio = insight.prioridade || 'OBSERVACAO'
  const config = priorityConfig[prio] || priorityConfig['OBSERVACAO']

  // Insights gerados antes da ligação por IDs têm `feedback_ids` vazio: não há
  // para onde navegar, então o contador vira texto simples em vez de link morto.
  const temFeedbacksLigados = (insight.feedback_ids?.length ?? 0) > 0
  const totalFeedbacks = insight.feedback_ids?.length ?? insight.feedbacks_relacionados ?? 0

  return (
    <Card className="bg-white border-border shadow-sm flex flex-col hover:shadow-md transition-shadow duration-200 h-full relative">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded border border-red-400 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors z-10"
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

      <CardHeader className="pb-3 space-y-3 pr-12">
        <div>
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] font-bold tracking-wider rounded-md px-2 py-0.5',
              config.bg,
              config.text,
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
      <CardContent className="pb-4 flex-1 space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">{insight.descricao}</p>
        <div className="flex items-start gap-2 text-sm text-[#1D4ED8] font-medium bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{insight.sugestao}</span>
        </div>
      </CardContent>
      <CardFooter className="pt-0 pb-4 px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-gray-300 mt-auto pt-4">
        {temFeedbacksLigados ? (
          <Link
            to={`/feedbacks?insight_id=${insight.id}`}
            className="text-sm text-[#1D4ED8] hover:underline font-medium"
          >
            {totalFeedbacks} feedbacks relacionados
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
            variant="outline"
            size="sm"
            onClick={onCreateTask}
            disabled={criandoAcao}
            className="w-full sm:w-auto text-gray-700 border-gray-300 hover:bg-gray-50 h-9"
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
