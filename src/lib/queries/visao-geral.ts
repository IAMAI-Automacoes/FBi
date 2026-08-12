import { supabase } from '@/lib/supabase/client'
import { subDays, isAfter, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export type PeriodInfo = '7d' | '30d' | '90d'

export interface CategoryScore {
  name: string
  score: number
  count: number
  trend: 'up' | 'down' | 'neutral'
}

export interface FeedbackItem {
  id: string
  text: string
  categories: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
  timeAgo: string
}

export interface DashboardData {
  kpis: {
    totalFeedbacks: number
    totalTrend: string
    sentiment: number
    sentimentTrend: string
    nps: number
    npsTrend: string
    criticalTheme: string
    criticalPercent: number
    hasPrevData: boolean
    prevConfiavel: boolean
    prevTotal: number
    positivos: number
    negativos: number
    neutros: number
    positivePercent: number
    negativePercent: number
  }
  chartData: Array<{ date: string; sentiment: number | null; avaliacoes: number }>
  categories: CategoryScore[]
  recentFeedbacks: FeedbackItem[]
}

export const getPeriodDates = (period: PeriodInfo) => {
  const now = new Date()
  let days = 7
  if (period === '30d') days = 30
  if (period === '90d') days = 90

  const currentStart = subDays(now, days)
  const previousStart = subDays(now, days * 2)

  return { now, currentStart, previousStart, days }
}

const getFeedbacksForPeriod = async (restauranteId: number | null, period: PeriodInfo) => {
  // Conta sem restaurante vinculado (onboarding incompleto): nada a buscar
  if (!restauranteId) return []

  const { previousStart } = getPeriodDates(period)
  const { data, error } = await supabase
    .from('feedbacks_restaurante')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .gte('created_at', previousStart.toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export const buscarKpis = async (restauranteId: number | null, periodo: PeriodInfo) => {
  const feedbacks = await getFeedbacksForPeriod(restauranteId, periodo)
  const { currentStart } = getPeriodDates(periodo)

  const currentFeedbacks = feedbacks.filter((f) => isAfter(parseISO(f.created_at), currentStart))
  const previousFeedbacks = feedbacks.filter((f) => !isAfter(parseISO(f.created_at), currentStart))

  const totalFeedbacks = currentFeedbacks.length
  const prevTotal = previousFeedbacks.length
  const hasPrevData = prevTotal > 0
  // Comparar 3 avaliações contra 1 gera "+200%" que engana o dono.
  // Só tratamos a variação como confiável com uma base mínima.
  const prevConfiavel = prevTotal >= 3

  // Trend de total: só faz sentido comparar quando há dados anteriores
  let totalTrend: string
  if (!hasPrevData) {
    totalTrend = totalFeedbacks > 0 ? 'novo' : '—'
  } else {
    const v = Math.round(((totalFeedbacks - prevTotal) / prevTotal) * 100)
    totalTrend = `${v >= 0 ? '+' : ''}${v}%`
  }

  const isPositivo = (f: any) =>
    f.sentimento?.toLowerCase() === 'positivo' || f.sentimento?.toLowerCase() === 'positive'
  const isNegativo = (f: any) =>
    f.sentimento?.toLowerCase() === 'negativo' || f.sentimento?.toLowerCase() === 'negative'

  // Contagens absolutas do período atual (métricas diretas que o dono entende)
  const positivos = currentFeedbacks.filter(isPositivo).length
  const negativos = currentFeedbacks.filter(isNegativo).length
  const neutros = totalFeedbacks - positivos - negativos
  const positivePercent = totalFeedbacks ? Math.round((positivos / totalFeedbacks) * 100) : 0
  const negativePercent = totalFeedbacks ? Math.round((negativos / totalFeedbacks) * 100) : 0

  const getSentimentScore = (arr: any[]) => {
    if (!arr.length) return 0
    const pos = arr.filter(isPositivo).length
    const neu = arr.filter((f) => {
      const s = f.sentimento?.toLowerCase()
      return s === 'neutro' || s === 'neutral'
    }).length
    return Math.round((pos * 100 + neu * 50) / arr.length)
  }

  const sentiment = getSentimentScore(currentFeedbacks)
  const prevSentiment = getSentimentScore(previousFeedbacks)

  // Trend de sentimento: diferença de pontos CSAT vs período anterior
  let sentimentTrend: string
  if (!hasPrevData) {
    sentimentTrend = totalFeedbacks > 0 ? 'novo' : '—'
  } else {
    const v = sentiment - prevSentiment
    sentimentTrend = v === 0 ? 'estável' : `${v >= 0 ? '+' : ''}${v} pts`
  }

  const getNpsScore = (arr: any[]) => {
    if (!arr.length) return 0
    const proms = arr.filter(isPositivo).length
    const dets = arr.filter(isNegativo).length
    return Math.round(((proms - dets) / arr.length) * 100)
  }

  const nps = getNpsScore(currentFeedbacks)
  const prevNps = getNpsScore(previousFeedbacks)
  const npsTrendValue = nps - prevNps
  // "+0" parece bug — mostrar "—" quando sem variação
  const npsTrend =
    !hasPrevData || npsTrendValue === 0 ? '—' : `${npsTrendValue >= 0 ? '+' : ''}${npsTrendValue}`

  // Tema crítico: usa RATIO (negativos/total na categoria) — não contagem bruta
  // Ex: Ambiente 1 neg / 1 total = 100% > Comida 1 neg / 2 total = 50%
  type CatStats = { total: number; negative: number }
  const catStats: Record<string, CatStats> = {}
  for (const f of currentFeedbacks) {
    const cat = f.categoria || 'Geral'
    if (!catStats[cat]) catStats[cat] = { total: 0, negative: 0 }
    catStats[cat].total++
    if (isNegativo(f)) catStats[cat].negative++
  }

  let criticalTheme = 'Nenhum'
  let criticalPercent = 0
  let worstRatio = 0

  for (const [cat, s] of Object.entries(catStats)) {
    if (s.negative === 0) continue
    const ratio = s.negative / s.total
    if (ratio > worstRatio || (ratio === worstRatio && s.negative > catStats[criticalTheme]?.negative)) {
      worstRatio = ratio
      criticalTheme = cat
      criticalPercent = Math.round(ratio * 100)
    }
  }

  return {
    totalFeedbacks,
    totalTrend,
    sentiment,
    sentimentTrend,
    nps,
    npsTrend,
    criticalTheme,
    criticalPercent,
    hasPrevData,
    prevConfiavel,
    prevTotal,
    positivos,
    negativos,
    neutros,
    positivePercent,
    negativePercent,
  }
}

export const buscarTendencia = async (restauranteId: number | null, periodo: PeriodInfo) => {
  const feedbacks = await getFeedbacksForPeriod(restauranteId, periodo)
  const { now, currentStart, days } = getPeriodDates(periodo)
  const currentFeedbacks = feedbacks.filter((f) => isAfter(parseISO(f.created_at), currentStart))

  type Bucket = { total: number; positive: number; neutral: number }

  const addToBucket = (b: Bucket, sentimento: string | null | undefined) => {
    const s = sentimento?.toLowerCase()
    b.total++
    if (s === 'positivo' || s === 'positive') b.positive++
    else if (s === 'neutro' || s === 'neutral') b.neutral++
  }

  // CSAT 0-100: positivo=100pts, neutro=50pts, negativo=0pts
  const calcSentiment = (b: Bucket): number | null =>
    b.total === 0 ? null : Math.round((b.positive * 100 + b.neutral * 50) / b.total)

  if (periodo === '7d') {
    // 7 slots fixos (um por dia). Dias sem feedback ficam null.
    // O chart usa connectNulls=true + linhas tracejadas de referência para indicar gaps.
    const grouped: Record<string, Bucket> = {}
    for (let i = days - 1; i >= 0; i--) {
      const key = format(subDays(now, i), 'EE', { locale: ptBR })
      if (!grouped[key]) grouped[key] = { total: 0, positive: 0, neutral: 0 }
    }
    for (const f of currentFeedbacks) {
      const key = format(parseISO(f.created_at), 'EE', { locale: ptBR })
      if (grouped[key]) addToBucket(grouped[key], f.sentimento)
    }
    return Object.entries(grouped).map(([date, b]) => ({
      date,
      sentiment: calcSentiment(b),
      avaliacoes: b.total,
    }))
  }

  if (periodo === '30d') {
    // 30 slots fixos (1 por dia, do mesmo dia do mês passado até hoje).
    // Dias sem feedback ficam null — gap na linha = indicador visual de ausência.
    const grouped: Record<string, Bucket & { label: string }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(now, i)
      const key = format(d, 'yyyy-MM-dd')
      grouped[key] = {
        total: 0,
        positive: 0,
        neutral: 0,
        label: format(d, 'd MMM', { locale: ptBR }),
      }
    }
    for (const f of currentFeedbacks) {
      const key = format(parseISO(f.created_at), 'yyyy-MM-dd')
      if (grouped[key]) addToBucket(grouped[key], f.sentimento)
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, b]) => ({
        date: b.label,
        sentiment: calcSentiment(b),
        avaliacoes: b.total,
      }))
  }

  // 90d — 1 slot por mês do intervalo (3–4 meses). Meses sem feedback ficam null.
  // Chart usa linhas tracejadas de referência para meses sem dados.
  const firstMonthDate = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1)
  const months: Date[] = []
  for (
    let m = new Date(firstMonthDate);
    m <= now;
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    months.push(new Date(m))
  }
  const monthMap: Record<string, Bucket> = {}
  for (const monthDate of months) {
    monthMap[format(monthDate, 'yyyy-MM')] = { total: 0, positive: 0, neutral: 0 }
  }
  for (const f of currentFeedbacks) {
    const key = format(parseISO(f.created_at), 'yyyy-MM')
    if (monthMap[key]) addToBucket(monthMap[key], f.sentimento)
  }
  return months.map((monthDate) => {
    const key = format(monthDate, 'yyyy-MM')
    return {
      date: format(monthDate, 'MMM', { locale: ptBR }),
      sentiment: calcSentiment(monthMap[key]),
      avaliacoes: monthMap[key].total,
    }
  })
}

export const buscarCategorias = async (restauranteId: number | null, periodo: PeriodInfo) => {
  const feedbacks = await getFeedbacksForPeriod(restauranteId, periodo)
  const { currentStart } = getPeriodDates(periodo)

  const currentFeedbacks = feedbacks.filter((f) => isAfter(parseISO(f.created_at), currentStart))
  const previousFeedbacks = feedbacks.filter((f) => !isAfter(parseISO(f.created_at), currentStart))

  const categoryMap = currentFeedbacks.reduce(
    (acc, f) => {
      const cat = f.categoria || 'Geral'
      if (!acc[cat]) acc[cat] = { total: 0, positive: 0, prevTotal: 0, prevPositive: 0 }
      acc[cat].total++
      if (f.sentimento?.toLowerCase() === 'positivo' || f.sentimento?.toLowerCase() === 'positive')
        acc[cat].positive++
      return acc
    },
    {} as Record<
      string,
      { total: number; positive: number; prevTotal: number; prevPositive: number }
    >,
  )

  previousFeedbacks.forEach((f) => {
    const cat = f.categoria || 'Geral'
    if (!categoryMap[cat])
      categoryMap[cat] = { total: 0, positive: 0, prevTotal: 0, prevPositive: 0 }
    categoryMap[cat].prevTotal++
    if (f.sentimento?.toLowerCase() === 'positivo' || f.sentimento?.toLowerCase() === 'positive')
      categoryMap[cat].prevPositive++
  })

  return Object.entries(categoryMap)
    .filter(([_, stats]) => stats.total > 0)
    .map(([name, stats]) => {
      const score = Math.round((stats.positive / stats.total) * 100)
      const prevScore =
        stats.prevTotal === 0 ? 0 : Math.round((stats.prevPositive / stats.prevTotal) * 100)

      let trend: 'up' | 'down' | 'neutral' = 'neutral'
      if (score > prevScore) trend = 'up'
      else if (score < prevScore) trend = 'down'

      return { name, score, count: stats.total, trend } as CategoryScore
    })
    .sort((a, b) => b.count - a.count)
}

export const buscarUltimosFeedbacks = async (
  restauranteId: number | null,
  limit = 5,
): Promise<FeedbackItem[]> => {
  if (!restauranteId) return []

  // Mensagem ORIGINAL do cliente (transcrição exata). A view deriva o sentimento
  // geral e as categorias a partir dos pedaços separados.
  const { data, error } = await supabase
    .from('feedbacks_originais_view')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return (data || []).map((f) => {
    const date = parseISO(f.created_at)
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const calendarDays = Math.round(
      (todayStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24),
    )
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    const h = date.getHours()
    const m = date.getMinutes()
    const hourStr = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`

    let timeAgo: string
    if (diffMinutes < 2) timeAgo = 'agora mesmo'
    else if (diffMinutes < 60) timeAgo = `há ${diffMinutes}min`
    else if (calendarDays === 0) timeAgo = `hoje às ${hourStr}`
    else if (calendarDays === 1) timeAgo = 'Ontem'
    else timeAgo = `há ${calendarDays} dias`

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (f.sentimento?.toLowerCase() === 'positivo' || f.sentimento?.toLowerCase() === 'positive')
      sentiment = 'positive'
    else if (
      f.sentimento?.toLowerCase() === 'negativo' ||
      f.sentimento?.toLowerCase() === 'negative'
    )
      sentiment = 'negative'

    return {
      id: String(f.id),
      text: f.texto_original || '',
      categories: (f.categorias ?? []) as string[],
      sentiment,
      timeAgo,
    }
  })
}
