import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { DashboardData } from '@/lib/queries/visao-geral'
import { MIN_AMOSTRA } from '@/lib/queries/visao-geral'
import { cn } from '@/lib/utils'

export function CategoryScores({ categories }: { categories: DashboardData['categories'] }) {
  return (
    <Card className="shadow-subtle col-span-1 flex flex-col">
      <CardHeader className="p-5 pb-4 border-b border-border/50">
        <CardTitle className="text-base font-semibold">Categorias de Feedback</CardTitle>
      </CardHeader>
      <CardContent className="p-5 flex-1 flex flex-col justify-between gap-4">
        {categories.map((cat, i) => {
          // Amostra pequena (1-2 avaliações) não tem confiança pra colorir de
          // verde/vermelho — uma única avaliação decidiria 0 ou 100.
          const amostraPequena = cat.count < MIN_AMOSTRA
          const isGood = !amostraPequena && cat.score >= 60
          const isBad = !amostraPequena && cat.score < 50
          const progressClass = cn({
            'progress-success': isGood,
            'progress-destructive': isBad,
            'progress-warning': !isGood && !isBad,
          })

          return (
            <div key={i} className="flex flex-col gap-1.5 group">
              <div className="flex justify-between items-end text-sm">
                <span className="font-medium text-foreground">{cat.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{cat.score}</span>
                  {cat.trend === 'up' && <ArrowUp className="h-3 w-3 text-success" />}
                  {cat.trend === 'down' && <ArrowDown className="h-3 w-3 text-destructive" />}
                  {cat.trend === 'neutral' && <Minus className="h-3 w-3 text-muted-foreground" />}
                </div>
              </div>
              <Progress value={cat.score} className={cn('h-1.5 bg-muted', progressClass)} />
              {amostraPequena && (
                <span className="text-[11px] text-muted-foreground">
                  {cat.count} avaliaç{cat.count !== 1 ? 'ões' : 'ão'} — poucas para confiar no número
                </span>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
