import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DashboardData, PeriodInfo } from '@/lib/queries/visao-geral'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { estiloCategoria } from '@/lib/categorias-feedback'

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

/** Quantas categorias ficam visíveis antes de precisar expandir. */
const MAX_VISIVEL = 6
/** Quantas categorias (as com mais feedback NEGATIVO) ganham o card destacado. */
const MAX_DESTAQUE = 3

export function TrendChart({ data, categories, period, onPeriodChange }: TrendChartProps) {
  const [expandido, setExpandido] = useState(false)

  // Intervalo derivado do tamanho real dos dados (não do period),
  // para evitar bug visual quando o period muda antes dos dados chegarem.
  // Mais de 10 pontos → espaça os rótulos; ≤10 → mostra todos.
  const xInterval =
    data.length > 10 ? Math.max(1, Math.ceil((data.length - 1) / 5)) : 0

  // Marca o ponto mais recente pra o balão do tooltip mostrar "(Atual)"
  const dataComFlag = data.map((d, i) => ({ ...d, isAtual: i === data.length - 1 }))

  // Ranqueado por feedback NEGATIVO (não por volume total) — é sobre onde as
  // reclamações se concentram. Categoria sem nenhum negativo nem aparece aqui
  // (a lista é "pontos de atenção", não um censo de todas as categorias).
  // Nenhuma categoria com negativo é escondida num "Outros" agregado: as
  // categorias reais aparecem, só ficam atrás do "mostrar mais" quando passam
  // de MAX_VISIVEL.
  const categoriasOrdenadas = [...categories]
    .filter((c) => c.negativeCount > 0)
    .sort((a, b) => b.negativeCount - a.negativeCount)
  const temMais = categoriasOrdenadas.length > MAX_VISIVEL
  const listaCategorias = expandido ? categoriasOrdenadas : categoriasOrdenadas.slice(0, MAX_VISIVEL)

  // As 3 com mais feedback negativo ganham o card destacado.
  const destaque = new Set(
    categoriasOrdenadas
      .slice(0, MAX_DESTAQUE)
      .map((c) => c.name),
  )

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
          <p className="text-sm font-semibold text-foreground mb-1">Categorias de Feedback</p>
          <p className="text-[11px] text-muted-foreground mb-2">Nº de reclamações por categoria</p>
          {categoriasOrdenadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma reclamação neste período 🎉</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                {listaCategorias.map((cat) => {
                  const estilo = estiloCategoria(cat.name)
                  const Icon = estilo.icon
                  const emDestaque = destaque.has(cat.name)
                  return (
                    <div
                      key={cat.name}
                      className={cn(
                        'flex items-center gap-2 justify-between rounded-lg px-2 py-1.5 shrink-0',
                        emDestaque && cn('border', estilo.corFundo, estilo.corBorda),
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {emDestaque ? (
                          <span
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0',
                              estilo.corSolida,
                            )}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                        ) : (
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', estilo.corTexto)} />
                        )}
                        <span
                          className={cn(
                            'text-sm truncate',
                            estilo.corTexto,
                            emDestaque && 'font-medium',
                          )}
                        >
                          {cat.name}
                        </span>
                      </span>
                      <span className={cn('text-sm font-semibold tabular-nums shrink-0', estilo.corTexto)}>
                        {cat.negativeCount}
                      </span>
                    </div>
                  )
                })}
              </div>
              {temMais && (
                <button
                  onClick={() => setExpandido((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground mt-2 pt-2 border-t border-border/40"
                >
                  {expandido ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Mostrar mais {categoriasOrdenadas.length - MAX_VISIVEL}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
