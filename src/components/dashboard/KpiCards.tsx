import { MessageSquare, Smile } from 'lucide-react'
import type { DashboardData, PeriodInfo } from '@/lib/queries/visao-geral'
import { TrendIndicator } from '@/components/dashboard/TrendIndicator'

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

export function KpiCards({ data, period }: { data: DashboardData['kpis']; period: PeriodInfo }) {
  const periodoLabel = PERIODO_LABEL[period]
  const suffix = `nos últimos ${periodoLabel}`
  return (
    <div className="flex items-center gap-10">
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
      <div className="w-px h-16 bg-border" />
      <div className="flex items-center gap-3">
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
    </div>
  )
}
