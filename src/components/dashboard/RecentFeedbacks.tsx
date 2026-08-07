import { ArrowRight, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DashboardData } from '@/lib/queries/visao-geral'
import { cn } from '@/lib/utils'

const sentimentConfig = {
  positive: {
    label: 'Positivo',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  neutral: {
    label: 'Positivo / Negativo',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  negative: {
    label: 'Negativo',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
}

export function RecentFeedbacks({ feedbacks }: { feedbacks: DashboardData['recentFeedbacks'] }) {
  return (
    <Card className="shadow-subtle">
      <CardHeader className="p-5 flex flex-row items-center justify-between border-b border-border/50">
        <CardTitle className="text-base font-semibold">Últimos Feedbacks</CardTitle>
        <Link
          to="/feedbacks"
          className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {feedbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Nenhum feedback recente</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/50">
            {feedbacks.map((item) => {
              const config = sentimentConfig[item.sentiment]
              return (
                <div
                  key={item.id}
                  className="p-5 flex gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="pt-0.5 shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
                        config.badge,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dot)} />
                      {config.label}
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-foreground leading-relaxed line-clamp-2">
                        "{item.text}"
                      </p>
                      <span className="text-[12px] text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                        {item.timeAgo}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.categories.map((cat, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-accent text-primary hover:bg-accent/80 font-medium text-[10px] px-2 py-0 h-5"
                        >
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
