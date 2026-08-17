import { useState, useEffect, useCallback } from 'react'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import {
  FileText, Download, FileDown, Users, Smile, ThumbsUp, Sparkles,
  AlertTriangle, Loader2, PartyPopper, UserCheck, Repeat, CalendarDays, Clock,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { TrendIndicator } from '@/components/dashboard/TrendIndicator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { gerarPdfRelatorio } from '@/lib/pdf/gerar-pdf-relatorio'
import { supabase } from '@/lib/supabase/client'
import { useUserProfile } from '@/hooks/use-user-profile'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

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

function StatMini({ icon: Icon, label, valor, detalhe }: {
  icon: any; label: string; valor: string; detalhe?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-white p-4">
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground leading-tight truncate">{valor}</p>
        {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
      </div>
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

  const restauranteId = profile?.restaurante_id ?? null

  const carregar = useCallback(async () => {
    setLoading(true)
    setAnalise(null) // a leitura da IA é por período
    try {
      const [k, e, t] = await Promise.all([
        buscarKpis(restauranteId, period),
        buscarEstatisticasRelatorio(restauranteId, period),
        buscarTendencia(restauranteId, period),
      ])
      setKpis(k); setStats(e); setTendencia(t)
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
            f.categoria || 'Geral', f.sentimento || '',
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

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 max-w-7xl mx-auto w-full animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Relatórios
          </h2>
          <p className="text-muted-foreground mt-1">
            Resumo do que seus clientes acharam — pronto para baixar e compartilhar.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodInfo)}>
            <SelectTrigger className="w-[150px] bg-white">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportCSV} disabled={semDados || gerandoCsv} className="bg-white">
            {gerandoCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            CSV
          </Button>
          <Button onClick={handleExportPdf} disabled={semDados || gerandoPdf} className="shadow-sm">
            {gerandoPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            PDF
          </Button>
        </div>
      </div>

      {semDados ? (
        <Card className="border-dashed bg-secondary/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-sm mb-4 border">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">Nenhuma avaliação neste período</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Assim que seus clientes começarem a responder, o relatório aparece aqui. Tente um período maior ou compartilhe o QR Code.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total de avaliações</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{kpis.totalFeedbacks}</div>
                <TrendIndicator
                  trend={kpis.totalTrend}
                  hasPrevData={kpis.hasPrevData}
                  prevConfiavel={kpis.prevConfiavel}
                  prevTotal={kpis.prevTotal}
                  suffix="vs. período anterior"
                  className="mt-1"
                />
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Índice de satisfação</CardTitle>
                <Smile className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{kpis.sentiment}%</div>
                <TrendIndicator
                  trend={kpis.sentimentTrend}
                  hasPrevData={kpis.hasPrevData}
                  prevConfiavel={kpis.prevConfiavel}
                  prevTotal={kpis.prevTotal}
                  suffix="vs. período anterior"
                  isPontosCsat
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">quanto maior, melhor</p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avaliações positivas</CardTitle>
                <ThumbsUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">{kpis.positivePercent}%</div>
                <TrendIndicator
                  trend={kpis.positivePercentTrend}
                  hasPrevData={kpis.hasPrevData}
                  prevConfiavel={kpis.prevConfiavel}
                  prevTotal={kpis.prevTotal}
                  suffix="vs. período anterior"
                  isPontosCsat
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpis.positivos} de {kpis.totalFeedbacks} avaliações</p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Clientes que avaliaram</CardTitle>
                <UserCheck className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.clientesUnicos}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.clientesRecorrentes > 0
                    ? `${stats.clientesRecorrentes} avaliaram mais de uma vez`
                    : 'nenhum avaliou duas vezes ainda'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Distribuição — deixa as neutras visíveis e mostra que soma 100% */}
          <Card className="bg-white shadow-sm border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Como as avaliações se dividem</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
                {[
                  { n: kpis.positivos, cor: 'bg-emerald-500' },
                  { n: kpis.neutros, cor: 'bg-slate-400' },
                  { n: kpis.negativos, cor: 'bg-rose-500' },
                ].map((s, i) =>
                  s.n > 0 ? (
                    <div key={i} className={s.cor} style={{ width: `${(s.n / kpis.totalFeedbacks) * 100}%` }} />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Positivas: <b className="text-foreground">{kpis.positivos}</b> ({kpis.positivePercent}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  Neutras: <b className="text-foreground">{kpis.neutros}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Negativas: <b className="text-foreground">{kpis.negativos}</b> ({kpis.negativePercent}%)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Leitura em linguagem simples, escrita pela IA */}
          <Card className="border-primary/20 border-l-4 border-l-primary bg-primary/[0.03] shadow-none">
            <CardContent className="p-6">
              {analise ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-primary">
                        {analise.porIa ? 'Leitura do período (gerada por IA)' : 'Leitura do período (calculada)'}
                      </p>
                      <p className="text-lg font-bold text-foreground leading-snug mt-0.5">{analise.titulo}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{analise.resumo}</p>
                  {resumoExecutivo && (
                    <div className="rounded-lg bg-white border border-primary/15 p-3.5">
                      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1.5">
                        Resumo executivo
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{resumoExecutivo}</p>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border-l-2 border-emerald-500 bg-white p-3">
                      <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Ponto forte</p>
                      <p className="text-sm text-foreground mt-1">{analise.ponto_forte}</p>
                    </div>
                    <div className="rounded-lg border-l-2 border-rose-500 bg-white p-3">
                      <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">Precisa de atenção</p>
                      <p className="text-sm text-foreground mt-1">{analise.ponto_fraco}</p>
                    </div>
                  </div>
                  {analise.recomendacoes.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-2">O que fazer agora</p>
                      <ol className="space-y-1.5">
                        {analise.recomendacoes.map((r, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                              {i + 1}
                            </span>
                            {r}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {analise.alerta_amostra && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      {analise.alerta_amostra}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground">Não entendeu os números?</p>
                      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        A IA lê tudo isso pra você e explica, em português simples, o que aconteceu e o que fazer.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleAnalisar} disabled={analisando} size="lg"
                    className="w-full shrink-0 rounded-full px-6 shadow-sm sm:w-auto"
                  >
                    {analisando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {analisando ? 'Analisando…' : 'Explicar para mim'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tema crítico */}
          {kpis.criticalTheme && kpis.criticalTheme !== 'Nenhum' ? (
            <Card className="border-amber-200/80 border-l-4 border-l-amber-500 bg-amber-50 shadow-none">
              <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Tema que mais precisa de atenção
                    </p>
                    <p className="mt-1 text-2xl font-bold text-amber-900">{kpis.criticalTheme}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
                  <span className="text-3xl font-bold tabular-nums text-amber-700">{kpis.criticalPercent}%</span>
                  <span className="text-xs text-amber-700/80">das avaliações foram negativas</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-200/80 border-l-4 border-l-emerald-500 bg-emerald-50 shadow-none">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <PartyPopper className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Nenhum tema concentrando reclamações
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    Nenhuma categoria teve reclamações em destaque neste período. Continue assim!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evolução da satisfação */}
          <Card className="bg-white shadow-sm border-border/60">
            <CardHeader className="pb-0">
              <CardTitle className="text-base font-semibold">Evolução da satisfação</CardTitle>
              <p className="text-xs text-muted-foreground">
                {diasComDados <= 3
                  ? `Só ${diasComDados} dia${diasComDados !== 1 ? 's' : ''} teve avaliação no período — cada ponto é um dia, a linha apenas os liga.`
                  : 'Índice de 0 a 100 ao longo do período. A linha tracejada é o meio da escala (50).'}
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <ChartContainer config={chartConfig} className="w-full h-[240px]">
                <AreaChart data={tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSatisfacao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis
                    dataKey="date" axisLine={false} tickLine={false} dy={10}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    interval={tendencia.length > 10 ? Math.max(1, Math.ceil((tendencia.length - 1) / 5)) : 0}
                  />
                  <YAxis
                    axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 2" strokeOpacity={0.7} />
                  <ChartTooltip content={<SatisfacaoTooltip />} />
                  {/* linear (não "monotone"): curva suave inventaria variação entre dias sem dado */}
                  <Area
                    type="linear" dataKey="sentiment" stroke="hsl(var(--chart-1))" strokeWidth={2.5}
                    fillOpacity={1} fill="url(#gradSatisfacao)" connectNulls
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props
                      if (!cx || !cy || !payload.avaliacoes) return <g key={`d-${index}`} />
                      return (
                        <circle key={`d-${index}`} cx={cx} cy={cy} r={4}
                          fill="hsl(var(--chart-1))" stroke="white" strokeWidth={2} />
                      )
                    }}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Categorias */}
          {stats.porCategoria.length > 0 && (
            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Satisfação por categoria</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Índice de 0 a 100 em cada assunto citado pelos clientes.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {stats.porCategoria.map((c) => (
                  <div key={c.nome} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm text-foreground">{c.nome}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.satisfacao}%`, background: 'hsl(var(--chart-1))' }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                      {c.satisfacao}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                      {c.total} avaliaç{c.total !== 1 ? 'ões' : 'ão'}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recortes extras — só os que têm dado de verdade */}
          {(stats.faixaMaisMovimentada || stats.melhorDia || stats.avaliacoesPorCliente > 0) && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stats.avaliacoesPorCliente > 0 && (
                <StatMini
                  icon={Repeat} label="Avaliações por cliente"
                  valor={String(stats.avaliacoesPorCliente)}
                  detalhe={`${stats.clientesUnicos} clientes diferentes`}
                />
              )}
              {stats.faixaMaisMovimentada && (
                <StatMini
                  icon={Clock} label="Horário com mais avaliações"
                  valor={stats.faixaMaisMovimentada.nome.split(' ')[0]}
                  detalhe={`${stats.faixaMaisMovimentada.total} avaliações · satisfação ${stats.faixaMaisMovimentada.satisfacao}/100`}
                />
              )}
              {stats.melhorDia && (
                <StatMini
                  icon={CalendarDays} label="Melhor dia da semana"
                  valor={stats.melhorDia.nome}
                  detalhe={`${stats.melhorDia.satisfacao}/100 · ${stats.melhorDia.total} avaliações`}
                />
              )}
            </div>
          )}

          {/* Pontos de atenção derivados dos recortes */}
          {(stats.piorDia || stats.faixaCritica || stats.piorCategoria) && (
            <Card className="bg-white shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Onde vale olhar de perto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-2 text-sm">
                {stats.piorCategoria && (
                  <p className="text-muted-foreground">
                    A categoria com menor satisfação foi{' '}
                    <span className="font-semibold text-foreground">{stats.piorCategoria.nome}</span>{' '}
                    ({stats.piorCategoria.satisfacao}/100 em {stats.piorCategoria.total} avaliações).
                  </p>
                )}
                {stats.piorDia && (
                  <p className="text-muted-foreground">
                    O dia mais fraco foi{' '}
                    <span className="font-semibold text-foreground">{stats.piorDia.nome}</span>{' '}
                    ({stats.piorDia.satisfacao}/100 em {stats.piorDia.total} avaliações).
                  </p>
                )}
                {stats.faixaCritica && (
                  <p className="text-muted-foreground">
                    A faixa de horário com menor satisfação foi{' '}
                    <span className="font-semibold text-foreground">{stats.faixaCritica.nome}</span>{' '}
                    ({stats.faixaCritica.satisfacao}/100 em {stats.faixaCritica.total} avaliações).
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {!stats.amostraSuficiente && (
            <p className="text-xs text-muted-foreground text-center">
              Com poucas avaliações, os recortes por dia e horário ficam ocultos para não induzir a conclusões erradas.
            </p>
          )}
        </>
      )}
    </div>
  )
}
