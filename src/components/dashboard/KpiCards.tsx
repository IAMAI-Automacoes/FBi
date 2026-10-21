import type { ReactNode } from 'react'
import { MessageSquare, Smile } from 'lucide-react'
import type { DashboardData, PeriodInfo } from '@/lib/queries/visao-geral'
import { TrendIndicator } from '@/components/dashboard/TrendIndicator'
import { cn } from '@/lib/utils'

const PERIODO_LABEL: Record<PeriodInfo, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
}

function IconBox({ icon: Icon }: { icon: typeof MessageSquare }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-slate-700 shrink-0">
      <Icon className="h-5 w-5" />
    </div>
  )
}

/** Com mais números na fileira (RH): a linha entre eles, só com as 4 colunas lado a lado. */
export const CELULA_COM_DIVISOR = 'lg:border-l lg:border-border lg:pl-6'

/**
 * Os números do topo da Visão Geral. `depois`: o que vem na mesma fileira,
 * depois do sentimento (no RH, funcionários e o último pedido de feedback —
 * cada um com `CELULA_COM_DIVISOR`). Com eles, a fileira vira uma grade de 4
 * colunas iguais (2 no tablet, 1 no celular), para não quebrar no meio com o
 * menu lateral aberto.
 */
export function KpiCards({ data, period, depois }: { data: DashboardData['kpis']; period: PeriodInfo; depois?: ReactNode }) {
  const periodoLabel = PERIODO_LABEL[period]
  const suffix = `nos últimos ${periodoLabel}`
  const emGrade = !!depois
  return (
    // Sem os números do RH: os dois lado a lado; no celular, um embaixo do outro
    // (sem quebrar, o "Sentimento Geral" passava da borda da tela).
    <div className={emGrade ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4' : 'flex flex-wrap items-center gap-x-10 gap-y-6'}>
      <div className="flex items-center gap-3">
        <IconBox icon={MessageSquare} />
        <div>
          <p className="text-sm font-bold text-muted-foreground">Total de Feedbacks</p>
          <p className="text-4xl font-bold text-foreground mt-0.5">{data.totalFeedbacks}</p>
          <TrendIndicator
            trend={data.totalTrend}
            hasPrevData={data.hasPrevData}
            prevConfiavel={data.prevConfiavel}
            prevTotal={data.prevTotal}
            suffix={suffix}
            className="mt-1.5"
          />
        </div>
      </div>
      {!emGrade && <div className="hidden h-16 w-px bg-border sm:block" />}
      <div className={cn('flex items-center gap-3', emGrade && CELULA_COM_DIVISOR)}>
        <IconBox icon={Smile} />
        <div>
          <p className="text-sm font-bold text-muted-foreground">Sentimento Geral</p>
          <p className="text-4xl font-bold text-foreground mt-0.5">{data.sentiment}%</p>
          <TrendIndicator
            trend={data.sentimentTrend}
            hasPrevData={data.hasPrevData}
            prevConfiavel={data.prevConfiavel}
            prevTotal={data.prevTotal}
            suffix={suffix}
            isPontosCsat
            className="mt-1.5"
          />
        </div>
      </div>
      {depois}
    </div>
  )
}
