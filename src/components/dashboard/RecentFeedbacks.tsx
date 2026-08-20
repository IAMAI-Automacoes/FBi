import { ArrowRight, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/queries/visao-geral'
import { FeedbackOriginalCard } from '@/components/FeedbackOriginalCard'

export function RecentFeedbacks({ feedbacks }: { feedbacks: DashboardData['recentFeedbacks'] }) {
  return (
    <Card className="shadow-subtle">
      <CardHeader className="p-5 flex flex-row items-center justify-between border-b border-border">
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
          <div className="flex flex-col divide-y divide-border">
            {feedbacks.map((item) => (
              <div key={item.id} className="p-5 hover:bg-muted/30 transition-colors">
                <FeedbackOriginalCard
                  texto={item.text}
                  sentimento={item.sentiment}
                  categorias={item.categories}
                  quando={item.timeAgo}
                  truncar
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
