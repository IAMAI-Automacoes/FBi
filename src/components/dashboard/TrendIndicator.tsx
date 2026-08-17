import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrendIndicatorProps {
  /** "totalTrend"/"sentimentTrend" de `buscarKpis()`: "+12%", "+5 pts", "estável", "novo" ou "—". */
  trend: string
  hasPrevData: boolean
  prevConfiavel: boolean
  /** Total de avaliações do período anterior — só usado na mensagem de amostra pequena. */
  prevTotal?: number
  /** Texto depois do valor, ex: "nos últimos 30 dias" ou "vs. período anterior". */
  suffix: string
  /** sentimentTrend vem como "+5 pts" — troca o sufixo por "%" na exibição, sem recalcular nada. */
  isPontosCsat?: boolean
  className?: string
}

/**
 * Seta + cor pro quanto uma métrica subiu/caiu vs. o período anterior — mesmo
 * padrão visual em todo canto do app que compara com o período anterior
 * (Visão Geral e Relatórios).
 */
export function TrendIndicator({
  trend,
  hasPrevData,
  prevConfiavel,
  prevTotal,
  suffix,
  isPontosCsat,
  className,
}: TrendIndicatorProps) {
  if (!hasPrevData) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        {trend === 'novo' ? 'Primeiro período com dados' : 'Sem dados no período'}
      </p>
    )
  }
  if (!prevConfiavel) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        {prevTotal != null
          ? `período anterior teve só ${prevTotal} avaliação${prevTotal !== 1 ? 'ões' : ''}`
          : 'Poucos dados no período anterior'}
      </p>
    )
  }
  if (trend === 'estável' || trend === '—') {
    return (
      <p className={cn('flex items-center gap-1 text-xs font-medium text-slate-500', className)}>
        <Minus className="h-3 w-3" /> Estável {suffix}
      </p>
    )
  }
  const isNegative = trend.trim().startsWith('-')
  const label = isPontosCsat ? trend.replace(' pts', '%') : trend
  const Icon = isNegative ? ArrowDown : ArrowUp
  return (
    <p
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        isNegative ? 'text-rose-600' : 'text-emerald-600',
        className,
      )}
    >
      <Icon className="h-3 w-3" /> {label} {suffix}
    </p>
  )
}
