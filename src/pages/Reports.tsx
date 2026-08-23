import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import {
  FileText, Download, FileDown, Users, ThumbsUp, ThumbsDown,
  AlertTriangle, Loader2, PartyPopper, CalendarDays, Clock,
  Heart, MessageCircle, ChevronRight, TrendingUp,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { TrendIndicator } from '@/components/dashboard/TrendIndicator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  buscarKpis, buscarTendencia, getPeriodDates, PeriodInfo,
} from '@/lib/queries/visao-geral'
import {
  buscarEstatisticasRelatorio, gerarAnaliseRelatorio, gerarResumoExecutivo, salvarRelatorio,
  EstatisticasRelatorio, AnaliseRelatorio,
} from '@/lib/queries/relatorios'
import { buscarTemas, TemaFeedback } from '@/lib/queries/temas'
import { estiloCategoria } from '@/lib/categorias-feedback'
import { gerarPdfRelatorio } from '@/lib/pdf/gerar-pdf-relatorio'
import { supabase } from '@/lib/supabase/client'
import { useUserProfile } from '@/hooks/use-user-profile'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PERIOD_LABEL: Record<PeriodInfo, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 3 meses',
}

const chartConfig = { sentiment: { label: 'Satisfação', color: 'hsl(var(--chart-1))' } }

function baixar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function SatisfacaoTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold text-foreground mb-0.5">{d.date}</p>
      {d.avaliacoes > 0 ? (
        <p className="text-xs text-muted-foreground">
          Satisfação: <span className="font-semibold text-foreground">{d.sentiment}%</span>
          {' · '}{d.avaliacoes} avaliaç{d.avaliacoes !== 1 ? 'ões' : 'ão'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Sem avaliações</p>
      )}
    </div>
  )
}

export default function Reports() {
  const { profile, loading: profileLoading } = useUserProfile()
  const [period, setPeriod] = useState<PeriodInfo>('30d')
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<any>(null)
  const [stats, setStats] = useState<EstatisticasRelatorio | null>(null)
  const [tendencia, setTendencia] = useState<any[]>([])
  const [nomeRestaurante, setNomeRestaurante] = useState('Restaurante')
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [gerandoCsv, setGerandoCsv] = useState(false)
  const [analise, setAnalise] = useState<AnaliseRelatorio | null>(null)
  const [resumoExecutivo, setResumoExecutivo] = useState<string>('')
  const [analisando, setAnalisando] = useState(false)
  // Elogios/críticas em pílula (layout novo) — mesma RPC que já alimenta
  // `TemasFeedback.tsx` na Visão Geral, só filtrada pelo período do relatório.
  const [temas, setTemas] = useState<TemaFeedback[]>([])

  const restauranteId = profile?.restaurante_id ?? null

  const carregar = useCallback(async () => {
    setLoading(true)
    setAnalise(null) // a leitura da IA é por período
    try {
      const [k, e, t, tm] = await Promise.all([
        buscarKpis(restauranteId, period),
        buscarEstatisticasRelatorio(restauranteId, period),
        buscarTendencia(restauranteId, period),
        buscarTemas(restauranteId, getPeriodDates(period).days, 'todos'),
      ])
      setKpis(k); setStats(e); setTendencia(t); setTemas(tm)
      if (restauranteId) {
        const { data: r } = await supabase
          .from('restaurantes').select('nome_restaurante').eq('id', restauranteId).single()
        if (r?.nome_restaurante) setNomeRestaurante(r.nome_restaurante)
      }
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível carregar os dados do relatório.')
    }
    setLoading(false)
  }, [restauranteId, period])

  useEffect(() => {
    if (profileLoading) return
    carregar()
  }, [profileLoading, carregar])

  // Tempo real: novos feedbacks separados recarregam KPIs e gráficos sozinhos.
  useRealtimeReload(['feedbacks_restaurante'], restauranteId, carregar)

  const semDados = !!kpis && kpis.totalFeedbacks === 0

  // ── CSV completo (várias seções + lista de avaliações) ─────────────────────
  const handleExportCSV = async () => {
    if (!kpis || !stats) return
    setGerandoCsv(true)
    try {
      const { currentStart } = getPeriodDates(period)
      const { data: brutos } = restauranteId
        ? await supabase
            .from('feedbacks_restaurante')
            .select('created_at, categoria, sentimento, texto_original, resumo')
            .eq('restaurante_id', restauranteId)
            .gte('created_at', currentStart.toISOString())
            .order('created_at', { ascending: false })
        : { data: [] as any[] }

      const temaCritico =
        kpis.criticalTheme && kpis.criticalTheme !== 'Nenhum'
          ? `${kpis.criticalTheme} (${kpis.criticalPercent}% negativas)` : 'Nenhum'

      // Mesma regra da tela e do PDF: só mostra variação vs. período anterior
      // quando ele tem base suficiente (senão "+200%" saindo de 1 avaliação
      // engana). Antes o CSV só checava `hasPrevData`, ignorando essa trava.
      const comparavelCsv = kpis.hasPrevData && kpis.prevConfiavel

      const linhas: string[][] = [
        ['RELATÓRIO', nomeRestaurante],
        ['Período', PERIOD_LABEL[period]],
        ['Gerado em', format(new Date(), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })],
        [],
        ['RESUMO'],
        ['Métrica', 'Valor', 'vs. período anterior'],
        ['Total de avaliações', String(kpis.totalFeedbacks), comparavelCsv ? kpis.totalTrend : '—'],
        ['Índice de satisfação (0-100)', String(kpis.sentiment), comparavelCsv ? kpis.sentimentTrend : '—'],
        ['Avaliações positivas', `${kpis.positivos} (${kpis.positivePercent}%)`, ''],
        ['Avaliações neutras', `${kpis.neutros} (${kpis.neutralPercent}%)`, ''],
        ['Avaliações negativas', `${kpis.negativos} (${kpis.negativePercent}%)`, ''],
        ['Tema que mais preocupa', temaCritico, ''],
        ['Clientes únicos', String(stats.clientesUnicos), ''],
        ['Clientes que avaliaram mais de uma vez', String(stats.clientesRecorrentes), ''],
        ['Avaliações por cliente', String(stats.avaliacoesPorCliente), ''],
        [],
        ['POR CATEGORIA'],
        ['Categoria', 'Avaliações', 'Satisfação (0-100)'],
        ...stats.porCategoria.map((c) => [c.nome, String(c.total), String(c.satisfacao)]),
        [],
        ['EVOLUÇÃO NO PERÍODO'],
        ['Data', 'Avaliações', 'Satisfação (0-100)'],
        ...tendencia.map((t) => [t.date, String(t.avaliacoes), t.sentiment == null ? '' : String(t.sentiment)]),
        [],
        ['POR DIA DA SEMANA'],
        ['Dia', 'Avaliações', 'Satisfação (0-100)'],
        ...stats.porDiaSemana.map((d) => [d.nome, String(d.total), d.satisfacao == null ? '' : String(d.satisfacao)]),
        [],
        ['POR FAIXA DE HORÁRIO'],
        ['Faixa', 'Avaliações', 'Satisfação (0-100)'],
        ...stats.porFaixaHorario.map((f) => [f.nome, String(f.total), f.satisfacao == null ? '' : String(f.satisfacao)]),
        [],
        ['TODAS AS AVALIAÇÕES'],
        ['Data', 'Hora', 'Categoria', 'Sentimento', 'Avaliação'],
        ...(brutos || []).map((f: any) => {
          const d = parseISO(f.created_at)
          return [
            format(d, 'dd/MM/yyyy'), format(d, 'HH:mm'),
            f.categoria || 'Outros', f.sentimento || '',
            (f.texto_original || f.resumo || '').replace(/[\r\n]+/g, ' '),
          ]
        }),
      ]

      const csv = linhas
        .map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\r\n')
      baixar(
        new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
        `relatorio-${nomeRestaurante.replace(/\s+/g, '-').toLowerCase()}-${period}.csv`,
      )
      toast.success('CSV baixado!')
    } catch (e: any) {
      toast.error('Erro ao gerar o CSV', { description: e.message })
    } finally {
      setGerandoCsv(false)
    }
  }

  /** Monta o pacote de dados que alimenta a IA e o PDF. */
  const montarDados = async () => {
    const { currentStart } = getPeriodDates(period)
    const [fbRes, insRes] = await Promise.all([
      restauranteId
        ? supabase.from('feedbacks_restaurante')
            .select('categoria, sentimento, texto_original, resumo')
            .eq('restaurante_id', restauranteId)
            .gte('created_at', currentStart.toISOString())
            .order('created_at', { ascending: false }).limit(15)
        : Promise.resolve({ data: [] as any[] }),
      restauranteId
        ? supabase.from('insights').select('titulo, prioridade')
            .eq('restaurante_id', restauranteId).eq('ativo', true)
            .order('created_at', { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as any[] }),
    ])
    return {
      periodo: PERIOD_LABEL[period],
      geradoEm: new Date().toISOString(),
      kpis,
      estatisticas: stats,
      categorias: stats?.porCategoria ?? [],
      insights: insRes.data || [],
      feedbacks: fbRes.data || [],
    }
  }

  /** Reaproveita a análise já gerada no período (evita chamar a IA duas vezes). */
  const obterAnalise = async (dados: any): Promise<AnaliseRelatorio> => {
    if (analise) return analise
    const a = await gerarAnaliseRelatorio(dados)
    setAnalise(a)
    return a
  }

  const handleAnalisar = async () => {
    if (!kpis || !stats) return
    setAnalisando(true)
    try {
      const dados = await montarDados()
      // O resumo executivo sai junto: é a leitura em texto corrido que o dono
      // lê na tela, sem precisar abrir o PDF.
      const [a, resumo] = await Promise.all([
        gerarAnaliseRelatorio(dados),
        gerarResumoExecutivo(dados),
      ])
      setAnalise(a)
      setResumoExecutivo(resumo)
      if (!a.porIa) toast.warning('A IA não respondeu — mostrando a leitura calculada.')

      if (restauranteId) {
        // Guarda o histórico do período; falhar aqui não pode esconder a
        // análise que já está na tela.
        salvarRelatorio(restauranteId, PERIOD_LABEL[period], dados, resumo, '').catch((err) =>
          console.warn('Não foi possível salvar o relatório:', err),
        )
      }
    } catch (e: any) {
      toast.error('Erro ao gerar a análise', { description: e.message })
    } finally {
      setAnalisando(false)
    }
  }

  // ── PDF com análise estruturada escrita pela IA ────────────────────────────
  const handleExportPdf = async () => {
    if (!kpis || !stats) return
    setGerandoPdf(true)
    try {
      const dados = await montarDados()
      const a = await obterAnalise(dados)
      const blob = await gerarPdfRelatorio(dados, a, nomeRestaurante)
      baixar(blob, `relatorio-${nomeRestaurante.replace(/\s+/g, '-').toLowerCase()}-${period}.pdf`)
      toast.success(a.porIa ? 'PDF gerado com análise da IA!' : 'PDF gerado (sem IA).')
    } catch (e: any) {
      console.error(e)
      toast.error('Erro ao gerar o PDF', { description: e.message })
    } finally {
      setGerandoPdf(false)
    }
  }

  if (loading || !kpis || !stats) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  const diasComDados = tendencia.filter((t) => t.avaliacoes > 0).length

  const layoutProps: LayoutProps = {
    period, setPeriod, semDados, kpis, stats, tendencia, temas,
    analise, resumoExecutivo, analisando, handleAnalisar,
    gerandoPdf, gerandoCsv, handleExportCSV, handleExportPdf, diasComDados,
  }

  return <LayoutNovo {...layoutProps} />
}

interface LayoutProps {
  period: PeriodInfo
  setPeriod: (p: PeriodInfo) => void
  semDados: boolean
  kpis: any
  stats: EstatisticasRelatorio
  tendencia: any[]
  temas: TemaFeedback[]
  analise: AnaliseRelatorio | null
  resumoExecutivo: string
  analisando: boolean
  handleAnalisar: () => void
  gerandoPdf: boolean
  gerandoCsv: boolean
  handleExportCSV: () => void
  handleExportPdf: () => void
  diasComDados: number
}

/** Cor da barra de categoria por faixa de valor (vermelho→âmbar→verde),
 *  igual à referência — não é mais uma cor fixa pra todas. */
function corPorValor(v: number): string {
  // Limiares batidos contra a referência: 62% (Comida) é verde lá, então o
  // corte "âmbar→verde" precisa ficar abaixo de 62, não em 65 como na
  // primeira tentativa (senão 62% caía errado como âmbar).
  if (v < 45) return 'bg-red-500'
  if (v < 60) return 'bg-amber-500'
  return 'bg-green-500'
}

function KpiCardNovo({
  icon: Icon, iconBg, iconColor, label, valor, valorCor, trend, hasPrevData, prevConfiavel, prevTotal,
  detalhe, destaque, atencao,
}: {
  icon: any; iconBg: string; iconColor: string; label: string; valor: string; valorCor?: string
  trend?: string; hasPrevData?: boolean; prevConfiavel?: boolean; prevTotal?: number
  detalhe?: string; destaque?: boolean; atencao?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-5 shadow-sm',
        destaque ? 'border-green-300 ring-1 ring-green-100' : 'border-gray-200',
      )}
    >
      <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-full', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className={cn('text-3xl font-bold', valorCor ?? 'text-gray-900')}>{valor}</div>
      <p className="mt-0.5 text-sm text-gray-500">{label}</p>
      {trend != null && hasPrevData != null && prevConfiavel != null && (
        <TrendIndicator
          trend={trend} hasPrevData={hasPrevData} prevConfiavel={prevConfiavel} prevTotal={prevTotal}
          suffix="vs. período anterior" isPontosCsat className="mt-2"
        />
      )}
      {detalhe && <p className="mt-1 text-[11px] text-gray-400">{detalhe}</p>}
      {atencao && (
        <span className="mt-2 inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600">
          Atenção
        </span>
      )}
    </div>
  )
}

function CardNovo({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>
      {children}
    </div>
  )
}

function LayoutNovo({
  period, setPeriod, semDados, kpis, stats, tendencia, temas,
  gerandoPdf, gerandoCsv, handleExportCSV, handleExportPdf,
}: LayoutProps) {
  const satisfacaoCaindo =
    !!kpis.hasPrevData && !!kpis.prevConfiavel && String(kpis.sentimentTrend).trim().startsWith('-')

  // Sempre mostra todas as categorias que já têm alguma avaliação no
  // período — sem cortar, sem botão de "ver mais", sem linha inventada
  // pra categoria sem dado nenhum (decisão explícita do Raver).
  const categoriasOrdenadas = [...(stats.porCategoria || [])].sort((a, b) => a.satisfacao - b.satisfacao)

  const elogios = temas.filter((t) => t.tipo === 'elogio').slice(0, 6)
  const criticas = temas.filter((t) => t.tipo === 'reclamacao').slice(0, 6)

  const temaCriticoCount = kpis.criticalTheme
    ? (stats.porCategoria || []).find((c) => c.nome === kpis.criticalTheme)?.total ?? 0
    : 0

  const { days: diasDoPeriodo } = getPeriodDates(period)
  const mediaPorDia = diasDoPeriodo > 0 ? kpis.totalFeedbacks / diasDoPeriodo : 0

  return (
    // `-m-4 sm:-m-6 lg:-m-8` cancela o padding-top que o Layout (scroll
    // container) já aplica por cima do `main`, e o `pt-2` reaplica só uma
    // folga mínima — mesma técnica de `Insights.tsx` pra colar o conteúdo no
    // cabeçalho fixo em vez de somar os dois espaçamentos.
    <div className="flex-1 -m-4 sm:-m-6 lg:-m-8 space-y-5 bg-gray-50 px-4 sm:px-6 lg:px-8 pt-2 pb-6 md:pb-8 max-w-7xl mx-auto w-full animate-fade-in-up">
      {/* Barra de topo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Sem título/subtítulo aqui — pedido explícito; o espaço vazio à
            esquerda mantém os controles na mesma posição de antes. */}
        <div />
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodInfo)}>
            <SelectTrigger className="w-[170px] rounded-md border-gray-200 bg-white">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline" onClick={handleExportCSV} disabled={semDados || gerandoCsv}
            className="rounded-md border-gray-200 bg-white text-gray-700"
          >
            {gerandoCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar
          </Button>
          <Button
            onClick={handleExportPdf} disabled={semDados || gerandoPdf}
            className="rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            {gerandoPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            PDF
          </Button>
        </div>
      </div>

      {semDados ? (
        <CardNovo className="border-dashed">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border bg-gray-50">
              <FileText className="h-7 w-7 text-gray-400" />
            </div>
            <p className="font-semibold text-gray-900">Nenhuma avaliação neste período</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Assim que seus clientes começarem a responder, o relatório aparece aqui. Tente um período maior ou
              compartilhe o QR Code.
            </p>
          </div>
        </CardNovo>
      ) : (
        <>
          {/* 4 KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCardNovo
              icon={MessageCircle} iconBg="bg-blue-50" iconColor="text-blue-600"
              label="Avaliações recebidas" valor={String(kpis.totalFeedbacks)}
              trend={kpis.totalTrend} hasPrevData={kpis.hasPrevData} prevConfiavel={kpis.prevConfiavel}
              prevTotal={kpis.prevTotal}
            />
            <KpiCardNovo
              icon={Heart} iconBg="bg-green-50" iconColor="text-green-600"
              label="Índice de satisfação" valor={`${kpis.sentiment}%`}
              trend={kpis.sentimentTrend} hasPrevData={kpis.hasPrevData} prevConfiavel={kpis.prevConfiavel}
              prevTotal={kpis.prevTotal} atencao={satisfacaoCaindo}
            />
            <KpiCardNovo
              icon={ThumbsUp} iconBg="bg-green-50" iconColor="text-green-600"
              label="Avaliações positivas" valor={`${kpis.positivePercent}%`}
              trend={kpis.positivePercentTrend} hasPrevData={kpis.hasPrevData} prevConfiavel={kpis.prevConfiavel}
              prevTotal={kpis.prevTotal}
            />
            <KpiCardNovo
              icon={Users} iconBg="bg-slate-100" iconColor="text-slate-600"
              label="Clientes que avaliaram" valor={String(stats.clientesUnicos)}
              detalhe={
                stats.clientesRecorrentes > 0
                  ? `${stats.clientesRecorrentes} avaliaram mais de uma vez`
                  : 'nenhum avaliou duas vezes ainda'
              }
            />
          </div>

          {/* Como as avaliações se dividem */}
          <CardNovo>
            <h3 className="text-base font-bold text-gray-900">Como as avaliações se dividem</h3>
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex shrink-0 gap-6">
                {[
                  { valor: kpis.positivePercent, cor: 'text-green-600', dot: 'bg-green-500', label: 'Positivas' },
                  { valor: kpis.neutralPercent, cor: 'text-amber-500', dot: 'bg-amber-500', label: 'Neutras' },
                  { valor: kpis.negativePercent, cor: 'text-red-500', dot: 'bg-red-500', label: 'Negativas' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={cn('text-2xl font-bold', s.cor)}>{s.valor}%</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={cn('h-2 w-2 rounded-full', s.dot)} />
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="flex h-full w-full">
                  {[
                    { n: kpis.positivos, cor: 'bg-green-500' },
                    { n: kpis.neutros, cor: 'bg-amber-500' },
                    { n: kpis.negativos, cor: 'bg-red-500' },
                  ].map((s, i) =>
                    s.n > 0 ? (
                      <div key={i} className={s.cor} style={{ width: `${(s.n / kpis.totalFeedbacks) * 100}%` }} />
                    ) : null,
                  )}
                </div>
              </div>
            </div>
          </CardNovo>

          {/* Tema crítico */}
          {kpis.criticalTheme && kpis.criticalTheme !== 'Nenhum' ? (
            <div className="flex flex-col gap-5 rounded-xl border border-red-200 bg-red-50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Tema que mais precisa de atenção
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{kpis.criticalTheme}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {kpis.criticalPercent}% das avaliações relacionadas a este tema foram negativas.
                  </p>
                  {temaCriticoCount > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                      <FileText className="h-3.5 w-3.5" />
                      {temaCriticoCount} avaliaç{temaCriticoCount !== 1 ? 'ões' : 'ão'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="hidden h-16 w-16 items-center justify-center rounded-full bg-red-100 sm:flex">
                  <CalendarDays className="h-7 w-7 text-red-500" />
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <Button asChild className="bg-red-600 text-white hover:bg-red-700">
                    <Link to="/feedbacks">Ver avaliações</Link>
                  </Button>
                  <Button asChild variant="outline" className="border-gray-300 bg-white text-gray-700">
                    <Link to="/acoes">Criar plano de ação</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
                <PartyPopper className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                  Nenhum tema concentrando reclamações
                </p>
                <p className="mt-1 text-sm text-green-800">
                  Nenhuma categoria teve reclamações em destaque neste período. Continue assim!
                </p>
              </div>
            </div>
          )}

          {/* Evolução da satisfação */}
          <CardNovo>
            <h3 className="text-base font-bold text-gray-900">Evolução da satisfação</h3>
            {/* Sem o número/tendência repetidos aqui do lado — é o mesmo
                valor do card "Índice de satisfação" lá em cima; deixar só lá
                evita duplicar e dá o espaço de volta pro gráfico (que é a
                parte que realmente só existe aqui). */}
            <div className="mt-4">
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <AreaChart data={tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSatisfacaoNovo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.6} />
                    <XAxis
                      dataKey="date" axisLine={false} tickLine={false} dy={10}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      interval={tendencia.length > 10 ? Math.max(1, Math.ceil((tendencia.length - 1) / 5)) : 0}
                    />
                    <YAxis
                      axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <ReferenceLine
                      y={70} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.8}
                      label={{ value: 'Meta: 70%', position: 'insideTopRight', fill: '#3b82f6', fontSize: 11 }}
                    />
                    <ChartTooltip content={<SatisfacaoTooltip />} />
                    <Area
                      type="monotone" dataKey="sentiment" stroke="hsl(var(--chart-1))" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gradSatisfacaoNovo)" connectNulls
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props
                        const ultimo = index === tendencia.length - 1
                        if (!cx || !cy || !payload.avaliacoes) return <g key={`d-${index}`} />
                        return (
                          <circle
                            key={`d-${index}`} cx={cx} cy={cy} r={ultimo ? 5 : 3.5}
                            fill="hsl(var(--chart-1))" stroke="white" strokeWidth={2}
                          />
                        )
                      }}
                    />
                  </AreaChart>
                </ChartContainer>
            </div>
          </CardNovo>

          {/* Satisfação por categoria + O que os clientes mais comentam */}
          <div className="grid gap-5 lg:grid-cols-5">
            {stats.porCategoria.length > 0 && (
              <CardNovo className="lg:col-span-3">
                <h3 className="text-base font-bold text-gray-900">Satisfação por categoria</h3>
                <div className="mt-4 space-y-3.5">
                  {categoriasOrdenadas.map((c) => {
                    const estilo = estiloCategoria(c.nome)
                    const Icone = estilo.icon
                    return (
                      <div key={c.nome} className="flex items-center gap-3">
                        <Icone className={cn('h-4 w-4 shrink-0', estilo.corTexto)} />
                        <span className="w-32 shrink-0 truncate text-sm text-gray-700">{c.nome}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          {/* largura com piso mínimo: em 0% a barra some de vista e
                              parece "sem avaliação nenhuma" — mas a categoria só
                              aparece aqui quando já tem pelo menos 1 avaliação, só
                              que todas negativas. O traço mínimo deixa isso visível. */}
                          <div
                            className={cn('h-full rounded-full', corPorValor(c.satisfacao))}
                            style={{ width: `${Math.max(c.satisfacao, 4)}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900">
                          {c.satisfacao}%
                        </span>
                        <span className="w-24 shrink-0 text-right text-[11px] text-gray-400">
                          ({c.total} avaliaç{c.total !== 1 ? 'ões' : 'ão'})
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardNovo>
            )}

            <CardNovo className="lg:col-span-2">
              <h3 className="text-base font-bold text-gray-900">O que os clientes mais comentam</h3>
              {elogios.length === 0 && criticas.length === 0 ? (
                <p className="mt-4 text-sm text-gray-400">Ainda não há comentários suficientes neste período.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {elogios.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                        <ThumbsUp className="h-4 w-4" /> Principais elogios
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {elogios.map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
                          >
                            {t.rotulo}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {criticas.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
                        <ThumbsDown className="h-4 w-4" /> Principais críticas
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {criticas.map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600"
                          >
                            {t.rotulo}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Link
                to="/feedbacks"
                className="mt-4 flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Ver todos os comentários <ChevronRight className="h-4 w-4" />
              </Link>
            </CardNovo>
          </div>

          {/* Comportamento das avaliações */}
          {(stats.faixaMaisMovimentada || stats.melhorDia || kpis.totalFeedbacks > 0) && (
            <div>
              <h3 className="mb-3 text-base font-bold text-gray-900">Comportamento das avaliações</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCardNovo
                  icon={TrendingUp} iconBg="bg-blue-50" iconColor="text-blue-600"
                  label="Média de avaliações por dia"
                  valor={mediaPorDia.toFixed(1).replace('.', ',')}
                  trend={kpis.totalTrend} hasPrevData={kpis.hasPrevData} prevConfiavel={kpis.prevConfiavel}
                  prevTotal={kpis.prevTotal}
                />
                {stats.faixaMaisMovimentada && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                      <Clock className="h-5 w-5 text-slate-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats.faixaMaisMovimentada.nome.split(' ')[0]}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">Horário com mais avaliações</p>
                    <span className="mt-2 inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {stats.faixaMaisMovimentada.nome.match(/\(([^)]+)\)/)?.[1] ?? ''}
                    </span>
                  </div>
                )}
                {stats.melhorDia && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                      <CalendarDays className="h-5 w-5 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.melhorDia.nome}</p>
                    <p className="mt-0.5 text-sm text-gray-500">Dia com mais avaliações</p>
                    <span className="mt-2 inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-700">
                      {(stats.melhorDia.satisfacao / 10).toFixed(1).replace('.', ',')} de satisfação média
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
