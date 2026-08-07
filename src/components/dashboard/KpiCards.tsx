import type { DashboardData } from '@/lib/queries/visao-geral'

export function KpiCards({ data }: { data: DashboardData['kpis'] }) {
  return (
    <div className="flex items-center gap-10">
      <div>
        <p className="text-sm text-muted-foreground">Total de Feedbacks</p>
        <p className="text-4xl font-bold text-foreground mt-1">{data.totalFeedbacks}</p>
      </div>
      <div className="w-px h-10 bg-border" />
      <div>
        <p className="text-sm text-muted-foreground">
          Sentimento Geral <span className="text-muted-foreground/70">— quanto mais alto melhor</span>
        </p>
        <p className="text-4xl font-bold text-foreground mt-1">{data.sentiment}%</p>
      </div>
    </div>
  )
}
