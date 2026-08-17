import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { MoreHorizontal } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DashboardData, PeriodInfo } from '@/lib/queries/visao-geral'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

const chartConfig = {
  sentiment: {
    label: 'Sentimento (%)',
    color: 'hsl(var(--chart-1))',
  },
}

interface TooltipPayload {
  date: string
  sentiment: number | null
  avaliacoes: number
  positivos: number
  negativos: number
  neutros: number
  isAtual?: boolean
}

function SentimentTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: TooltipPayload }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (d.avaliacoes === 0) {
    return (
      <div className="rounded-lg bg-foreground/90 text-white px-3 py-2 shadow-md text-xs">
        Sem feedbacks
      </div>
    )
  }
  // Nota do dia (0-100, mostrada como %) — NÃO é variação/tendência, é o valor
  // absoluto daquele ponto. Por isso sem seta/ícone de alta aqui (isso ficaria
  // ambíguo com a seta de "subiu vs. período anterior" do topo da página).
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-2 shadow-md text-xs">
      <span className="font-semibold whitespace-nowrap">
        Nota do dia: {d.sentiment}%{d.isAtual ? ' (Atual)' : ''}
      </span>
      <span className="text-[11px] text-emerald-50/90 whitespace-nowrap">
        {d.positivos} positivo{d.positivos !== 1 ? 's' : ''} · {d.negativos} negativo{d.negativos !== 1 ? 's' : ''}
        {d.neutros > 0 ? ` · ${d.neutros} neutro${d.neutros !== 1 ? 's' : ''}` : ''}
      </span>
    </div>
  )
}

interface TrendChartProps {
  data: DashboardData['chartData']
  categories: DashboardData['categories']
  period: PeriodInfo
  onPeriodChange: (p: PeriodInfo) => void
}

// Paleta fixa por nome de categoria — mesma família de cores já usada no resto
// do app (emerald/blue/purple/slate/amber). Fallback pra nomes não mapeados.
const CATEGORY_DOT: Record<string, string> = {
  comida: 'bg-emerald-500',
  ambiente: 'bg-blue-600',
  atendimento: 'bg-purple-500',
  agilidade: 'bg-slate-400',
  'preço': 'bg-amber-500',
  preco: 'bg-amber-500',
}
const dotColor = (name: string) => CATEGORY_DOT[name.trim().toLowerCase()] ?? 'bg-slate-400'

const MAX_CATEGORIAS = 5

export function TrendChart({ data, categories, period, onPeriodChange }: TrendChartProps) {
  // Intervalo derivado do tamanho real dos dados (não do period),
  // para evitar bug visual quando o period muda antes dos dados chegarem.
  // Mais de 10 pontos → espaça os rótulos; ≤10 → mostra todos.
  const xInterval =
    data.length > 10 ? Math.max(1, Math.ceil((data.length - 1) / 5)) : 0

  // Marca o ponto mais recente pra o balão do tooltip mostrar "(Atual)"
  const dataComFlag = data.map((d, i) => ({ ...d, isAtual: i === data.length - 1 }))

  // Mais de 5 categorias: agrupa o resto em "Outros" (soma das contagens)
  const visiveis = categories.slice(0, MAX_CATEGORIAS)
  const resto = categories.slice(MAX_CATEGORIAS)
  const outrosCount = resto.reduce((s, c) => s + c.count, 0)
  const listaCategorias =
    outrosCount > 0
      ? [...visiveis, { name: 'Outros', score: 0, count: outrosCount, trend: 'neutral' as const }]
      : visiveis

  return (
    <Card className="shadow-subtle flex flex-col">
      <CardHeader className="p-5 pb-0 flex flex-row items-center justify-between border-b-0 space-y-0">
        <CardTitle className="text-base font-semibold">Tendência de Sentimento</CardTitle>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && onPeriodChange(v as PeriodInfo)}
          className="bg-muted p-1 rounded-lg scale-90 sm:scale-100"
        >
          <ToggleGroupItem
            value="7d"
            className="h-7 px-3 text-xs data-[state=on]:bg-white data-[state=on]:shadow-sm"
          >
            7d
          </ToggleGroupItem>
          <ToggleGroupItem
            value="30d"
            className="h-7 px-3 text-xs data-[state=on]:bg-white data-[state=on]:shadow-sm"
          >
            30d
          </ToggleGroupItem>
          <ToggleGroupItem
            value="90d"
            className="h-7 px-3 text-xs data-[state=on]:bg-white data-[state=on]:shadow-sm"
          >
            90d
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="p-5 pt-6 flex gap-6 min-h-[280px]">
        <div className="flex-1 min-w-0">
          <ChartContainer config={chartConfig} className="w-full h-full min-h-[240px]">
            <AreaChart data={dataComFlag} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                interval={xInterval}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `${v}`}
              />
              <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 2" strokeOpacity={0.7} />
              <ChartTooltip
                content={<SentimentTooltip />}
                cursor={{ stroke: 'hsl(var(--chart-1))', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="sentiment"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorSentiment)"
                animationDuration={1000}
                connectNulls={true}
                dot={(props: any) => {
                  const { cx, cy, payload, index } = props
                  if (!cx || !cy || payload.avaliacoes === 0) return <g key={`d-${index}`} />
                  return (
                    <circle
                      key={`d-${index}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill="hsl(var(--chart-1))"
                      stroke="white"
                      strokeWidth={2}
                    />
                  )
                }}
                activeDot={(props: any) => {
                  const { cx, cy, payload } = props
                  if (!cx || !cy || payload.avaliacoes === 0) return <g />
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="hsl(var(--chart-1))"
                      stroke="white"
                      strokeWidth={2}
                    />
                  )
                }}
              />
            </AreaChart>
          </ChartContainer>
        </div>

        <div className="w-px bg-border/50 self-stretch shrink-0" />

        <div className="w-44 shrink-0 flex flex-col">
          <p className="text-sm font-semibold text-foreground mb-3">Categorias de Feedback</p>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria neste período</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/40">
              {listaCategorias.map((cat, i) => (
                <div key={i} className="flex items-center gap-2 justify-between py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {cat.name === 'Outros' ? (
                      <MoreHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotColor(cat.name))} />
                    )}
                    <span className="text-sm text-foreground truncate">{cat.name}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                    {cat.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
