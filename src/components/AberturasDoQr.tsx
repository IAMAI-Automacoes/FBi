import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { QrCode } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { TrendIndicator } from '@/components/dashboard/TrendIndicator'
import {
  escalaDoEixo,
  ROTULO_DO_PERIODO,
  tendenciaDeAberturas,
  type IntervaloDeDatas,
  type PeriodoQr,
  type SerieDeAberturas,
} from '@/lib/aberturas-qr'

const chartConfig = {
  aberturas: { label: 'Aberturas', color: 'hsl(var(--chart-1))' },
}

/** Acima disto a linha vira um colar de contas — só o ponto sob o mouse. */
const MAX_PONTOS_COM_BOLINHA = 14

function dataCurta(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface DadoDoPonto {
  label: string
  aberturas: number
  intervalo: string
  emAndamento: boolean
}

function BalaoDeAberturas({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: DadoDoPonto }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  // "Ainda contando" no último ponto: ele cobre menos tempo que os outros, e
  // sem esse aviso a queda natural do período incompleto lê como piora real.
  const aviso = d.emAndamento ? ' · ainda contando' : ''
  if (d.aberturas === 0) {
    return (
      <div className="rounded-lg bg-foreground/90 px-3 py-2 text-xs text-white shadow-md">
        <span className="whitespace-nowrap">
          {d.intervalo} · nenhuma abertura{aviso}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white shadow-md">
      <span className="whitespace-nowrap font-semibold">
        {d.aberturas} abertura{d.aberturas !== 1 ? 's' : ''}
      </span>
      <span className="whitespace-nowrap text-[11px] text-emerald-50/90">
        {d.intervalo}
        {aviso}
      </span>
    </div>
  )
}

interface Props {
  serie: SerieDeAberturas
  periodo: PeriodoQr
  /** Preenchido quando o dono escolheu datas no calendário. */
  intervalo?: IntervaloDeDatas
}

/**
 * Quantas vezes abriram o QR, ao longo do tempo.
 *
 * Era uma fileira de três cards fixos (total, 7 dias, 30 dias) e um gráfico de
 * barras próprio. Três números parados obrigam o dono a comparar de cabeça, e
 * o desenho não era o dos gráficos da Visão Geral — a mesma pergunta ("está
 * subindo?") tinha duas respostas visuais diferentes no mesmo app.
 *
 * Agora o período é uma escolha só, e ela move o número e a curva juntos.
 */
export function AberturasDoQr({ serie, periodo, intervalo }: Props) {
  const { pontos, total, anterior, porSemana, primeiraAbertura, inicio, fim } = serie
  const tendencia = tendenciaDeAberturas(total, anterior)
  const nuncaAbriram = primeiraAbertura === null

  const dados: DadoDoPonto[] = pontos.map((p) => ({
    label: p.label,
    aberturas: p.aberturas,
    emAndamento: p.emAndamento,
    intervalo:
      p.inicio.getTime() === p.fim.getTime()
        ? dataCurta(p.inicio)
        : `${dataCurta(p.inicio)} a ${dataCurta(p.fim)}`,
  }))

  const { teto, marcas } = escalaDoEixo(Math.max(0, ...pontos.map((p) => p.aberturas)))
  // Mesmo cálculo do gráfico da Visão Geral: acima de 10 pontos os rótulos se
  // encavalam, então só um a cada N aparece.
  const intervaloX = dados.length > 10 ? Math.max(1, Math.ceil((dados.length - 1) / 5)) : 0
  const comBolinha = dados.length <= MAX_PONTOS_COM_BOLINHA

  const rotulo = ROTULO_DO_PERIODO[periodo]
  // Com datas escolhidas a mão, o atalho não vale mais e dizer "em 7 dias"
  // seria mentira; e "Total" não é um período, é a soma de todos eles.
  const tituloKpi = intervalo
    ? 'Aberturas no período'
    : periodo === 'total'
      ? 'Aberturas no total'
      : `Aberturas em ${rotulo}`

  // Quantos dias esta janela cobre — é o que o rodapé do card compara ("vs. os
  // 12 dias anteriores"), e num intervalo do calendário só se sabe contando.
  const diasNaJanela = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
  const comparacao = diasNaJanela === 1 ? 'vs. o dia anterior' : `vs. os ${diasNaJanela} dias anteriores`

  // As pontas da janela, do outro lado do card. Em "Total" sem nenhuma
  // abertura não há janela nenhuma a mostrar.
  // Só dá pra afirmar "nunca abriram" quando se está olhando tudo: com um
  // recorte, o que a busca trouxe é só daquele pedaço, e dizer que o QR nunca
  // foi escaneado seria falso — ele só não foi NAQUELES dias.
  const olhandoTudo = periodo === 'total' && !intervalo
  const semJanela = olhandoTudo && nuncaAbriram
  const intervaloDaJanela = semJanela ? null : `${dataCurta(inicio)} – ${dataCurta(fim)}`

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-subtle w-full max-w-sm">
        {/* `sm:p-5` junto do `p-5`: o CardContent padrão é `p-6 sm:p-8 pt-0
            sm:pt-0`, feito para cards que têm CardHeader em cima. Este não tem,
            e sem a variante responsiva o `sm:pt-0` sobrevivia — daí o título
            colado no topo e 32px sobrando embaixo. */}
        <CardContent className="flex items-center gap-3 p-5 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-slate-700">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground">
                {tituloKpi}
                {/* As datas ao lado do título, que é de quem elas falam: num
                    card estreito, soltas na outra ponta pareciam pertencer ao
                    número. E "em 7 dias" não diz QUAIS sete — é o que separa
                    esta janela de "esta semana". */}
                {intervaloDaJanela && (
                  <span className="ml-1.5 font-normal tabular-nums text-muted-foreground/70">
                    · {intervaloDaJanela}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-4xl font-bold tabular-nums text-foreground">{total}</p>
              {periodo === 'total' && !intervalo ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {primeiraAbertura
                    ? `Desde ${dataCurta(primeiraAbertura)}`
                    : 'Ninguém escaneou este QR Code ainda'}
                </p>
              ) : (
                <TrendIndicator
                  trend={tendencia.trend}
                  hasPrevData={tendencia.hasPrevData}
                  prevConfiavel={tendencia.prevConfiavel}
                  prevTotal={tendencia.prevTotal}
                  suffix={comparacao}
                  className="mt-1.5"
                />
              )}
            </div>
          </div>

        </CardContent>
      </Card>

      <Card className="shadow-subtle flex flex-col">
        <CardHeader className="space-y-0 border-b-0 p-5 pb-0">
          <CardTitle className="text-base font-semibold">
            Aberturas do QR Code
          </CardTitle>
          {/* Sem a frase explicativa: o título já diz o que é. Só fica o aviso
              de agrupamento, que não explica nada — diz o que cada ponto É, e
              sem ele uma semana pareceria um dia. */}
          {porSemana && (
            <p className="text-[11px] text-muted-foreground">Cada ponto é uma semana</p>
          )}
        </CardHeader>
        <CardContent className="p-5 pt-6">
          {total === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center">
              <QrCode className="mb-1 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">
                {olhandoTudo ? 'Nenhuma abertura ainda' : 'Nenhuma abertura neste período'}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {olhandoTudo
                  ? 'Assim que alguém escanear o QR Code, as aberturas aparecem aqui.'
                  : 'Escolha um período maior ou outras datas para ver o movimento.'}
              </p>
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                {/* `right` maior que os 10 da Visão Geral: lá o gráfico tem o painel de
                    categorias ao lado, então o último rótulo do eixo nunca chega na
                    borda. Aqui a curva ocupa a largura toda e "Dom" saía cortado. */}
                <AreaChart data={dados} margin={{ top: 10, right: 24, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="corAberturas" x1="0" y1="0" x2="0" y2="1">
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
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    interval={intervaloX}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    domain={[0, teto]}
                    ticks={marcas}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <ChartTooltip
                    content={<BalaoDeAberturas />}
                    cursor={{ stroke: 'hsl(var(--chart-1))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="aberturas"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#corAberturas)"
                    animationDuration={1000}
                    dot={
                      comBolinha
                        ? {
                            r: 4,
                            fill: 'hsl(var(--chart-1))',
                            stroke: 'white',
                            strokeWidth: 2,
                          }
                        : false
                    }
                    activeDot={{
                      r: 6,
                      fill: 'hsl(var(--chart-1))',
                      stroke: 'white',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
