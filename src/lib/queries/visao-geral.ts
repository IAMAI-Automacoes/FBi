import { supabase } from '@/lib/supabase/client'
import { subDays, isAfter, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatarDataFeedback } from '@/lib/formatar-tempo'

export type PeriodInfo = '7d' | '30d' | '90d'

/** Amostra mínima para eleger "melhor/pior/crítico" sem virar ruído estatístico
 *  (1 avaliação negativa numa categoria não pode "vencer" 8 negativas em 20).
 *  Mesmo valor usado em `src/lib/queries/relatorios.ts`. */
export const MIN_AMOSTRA = 3

export interface CategoryScore {
  name: string
  score: number
  count: number
  trend: 'up' | 'down' | 'neutral'
  /** Quantos desses feedbacks são negativos — usado só pra decidir destaque visual. */
  negativeCount: number
}

export interface FeedbackItem {
  id: string
  text: string
  categories: string[]
  /** Sentimento cru da MENSAGEM ORIGINAL: positivo|negativo|positivo e negativo|neutro. */
  sentiment: string
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
    neutralPercent: number
    /**
     * Avaliações cujo sentimento não é positivo, negativo nem neutro.
     *
     * Deve ser sempre 0. Se passar disso, o classificador começou a gravar um
     * valor que ninguém aqui conhece, e as três fatias da barra de divisão
     * param de somar o total — a planilha avisa quando acontece.
     */
    semClassificacao: number
    /** Pontos percentuais vs. período anterior, ex: "+8 pts". Usada no card "Avaliações positivas". */
    positivePercentTrend: string
    /** Mensagens recebidas — uma por vez que um cliente escreveu. */
    totalMensagens: number
    mensagensTrend: string
    /** Mensagens do período anterior, para a trava de base mínima. */
    prevMensagens: number
    /** Valor bruto (0-100) do índice de satisfação do período anterior — para
     *  textos que precisem citar o número sem reconstruí-lo a partir da string
     *  formatada de `sentimentTrend` (ex.: "estável", "+5 pts"). */
    prevSentiment: number
  }
  chartData: Array<{
    date: string
    sentiment: number | null
    avaliacoes: number
    positivos: number
    negativos: number
    neutros: number
  }>
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

/**
 * As MENSAGENS originais do período — uma por vez que um cliente escreveu.
 *
 * Consulta `feedbacks_originais` direto, e não conta `origem_id` distinto nos
 * separados: existem mensagens que ainda não foram divididas em assuntos (8 no
 * Camelo, em 30 dias), e contar pelos separados as perderia — o número diria
 * 45 quando o restaurante recebeu 53.
 */
const getMensagensDoPeriodo = async (restauranteId: number | null, period: PeriodInfo) => {
  if (!restauranteId) return []
  const { previousStart } = getPeriodDates(period)
  const { data, error } = await supabase
    .from('feedbacks_originais')
    .select('id, created_at')
    .eq('restaurante_id', restauranteId)
    .gte('created_at', previousStart.toISOString())
  if (error) throw error
  return data || []
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
  const [feedbacks, mensagens] = await Promise.all([
    getFeedbacksForPeriod(restauranteId, periodo),
    getMensagensDoPeriodo(restauranteId, periodo),
  ])
  const { currentStart } = getPeriodDates(periodo)

  const currentFeedbacks = feedbacks.filter((f) => isAfter(parseISO(f.created_at), currentStart))
  const previousFeedbacks = feedbacks.filter((f) => !isAfter(parseISO(f.created_at), currentStart))

  const totalFeedbacks = currentFeedbacks.length
  const prevTotal = previousFeedbacks.length

  // ── Mensagens x assuntos ─────────────────────────────────────────────────
  // Duas contagens diferentes da mesma realidade, e as duas importam:
  //
  //   mensagens = quantas vezes um cliente escreveu
  //   assuntos  = quantos pontos ele levantou (uma mensagem que fala de comida
  //               e de atendimento vira dois)
  //
  // O card do topo mostra MENSAGENS, que é o que o dono chama de "avaliação".
  // O resto da página trabalha com assuntos, porque satisfação por categoria
  // só faz sentido por assunto. Os dois números aparecem juntos no card para
  // que a diferença fique explicada onde ela é vista pela primeira vez.
  const totalMensagens = mensagens.filter((m) => isAfter(parseISO(m.created_at), currentStart)).length
  const prevMensagens = mensagens.length - totalMensagens
  let mensagensTrend: string
  if (prevMensagens === 0) {
    mensagensTrend = totalMensagens > 0 ? 'novo' : '—'
  } else {
    const v = Math.round(((totalMensagens - prevMensagens) / prevMensagens) * 100)
    mensagensTrend = v === 0 ? 'estável' : `${v >= 0 ? '+' : ''}${v}%`
  }
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

  // `toLowerCase` porque o banco tem as duas grafias ('negativo' e 'Negativo'),
  // vindas de versões diferentes do classificador.
  const isPositivo = (f: any) =>
    f.sentimento?.toLowerCase() === 'positivo' || f.sentimento?.toLowerCase() === 'positive'
  const isNegativo = (f: any) =>
    f.sentimento?.toLowerCase() === 'negativo' || f.sentimento?.toLowerCase() === 'negative'
  const isNeutro = (f: any) => {
    const s = f.sentimento?.toLowerCase()
    return s === 'neutro' || s === 'neutral'
  }

  // Contagens absolutas do período atual (métricas diretas que o dono entende)
  const positivos = currentFeedbacks.filter(isPositivo).length
  const negativos = currentFeedbacks.filter(isNegativo).length
  // Contado, não subtraído.
  //
  // Era `total - positivos - negativos`, e isso jogava em "neutro" tudo que
  // não fosse reconhecido — sentimento nulo, vazio ou grafado de um jeito
  // novo. Pior: o ÍNDICE de satisfação usa a definição estrita (só 'neutro' e
  // 'neutral'), então um valor desconhecido contava como neutro na barra de
  // divisão e como negativo no índice. As duas leituras da mesma tela
  // discordariam sem nada explicando.
  //
  // Hoje não há sentimento fora dos três valores (conferido no banco), então
  // isto é uma trava para o dia em que houver.
  const neutros = currentFeedbacks.filter(isNeutro).length
  const semClassificacao = totalFeedbacks - positivos - negativos - neutros
  const positivePercent = totalFeedbacks ? Math.round((positivos / totalFeedbacks) * 100) : 0
  const negativePercent = totalFeedbacks ? Math.round((negativos / totalFeedbacks) * 100) : 0
  const neutralPercent = totalFeedbacks ? Math.round((neutros / totalFeedbacks) * 100) : 0

  // % positivo do período anterior — só para a seta de tendência do card
  // "Avaliações positivas" (Relatórios). Mesma regra de pontos percentuais
  // usada em `sentimentTrend`.
  const prevPositivos = previousFeedbacks.filter(isPositivo).length
  const prevPositivePercent = prevTotal ? Math.round((prevPositivos / prevTotal) * 100) : 0
  let positivePercentTrend: string
  if (!hasPrevData) {
    positivePercentTrend = totalFeedbacks > 0 ? 'novo' : '—'
  } else {
    const v = positivePercent - prevPositivePercent
    positivePercentTrend = v === 0 ? 'estável' : `${v >= 0 ? '+' : ''}${v} pts`
  }

  // Índice 0-100: positivo vale 100, neutro vale 50, negativo vale 0. Usa a
  // MESMA definição de neutro das contagens acima — ver a nota lá.
  const getSentimentScore = (arr: any[]) => {
    if (!arr.length) return 0
    const pos = arr.filter(isPositivo).length
    const neu = arr.filter(isNeutro).length
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
  // Só concorrem categorias com amostra mínima — senão 1 avaliação negativa
  // isolada (ratio 100%) venceria uma categoria com 8 negativas em 20 (40%).
  type CatStats = { total: number; negative: number }
  const catStats: Record<string, CatStats> = {}
  for (const f of currentFeedbacks) {
    const cat = f.categoria || 'Outros'
    if (!catStats[cat]) catStats[cat] = { total: 0, negative: 0 }
    catStats[cat].total++
    if (isNegativo(f)) catStats[cat].negative++
  }

  let criticalTheme = 'Nenhum'
  let criticalPercent = 0
  let worstRatio = 0

  for (const [cat, s] of Object.entries(catStats)) {
    if (s.negative === 0 || s.total < MIN_AMOSTRA) continue
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
    totalMensagens,
    mensagensTrend,
    prevMensagens,
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
    neutralPercent,
    semClassificacao,
    positivePercentTrend,
    prevSentiment,
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

  // Breakdown por sentimento do dia/mês — usado no tooltip do gráfico.
  const breakdown = (b: Bucket) => ({
    positivos: b.positive,
    neutros: b.neutral,
    negativos: b.total - b.positive - b.neutral,
  })

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
      ...breakdown(b),
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
        ...breakdown(b),
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
      ...breakdown(monthMap[key]),
    }
  })
}

export const buscarCategorias = async (restauranteId: number | null, periodo: PeriodInfo) => {
  const feedbacks = await getFeedbacksForPeriod(restauranteId, periodo)
  const { currentStart } = getPeriodDates(periodo)

  const currentFeedbacks = feedbacks.filter((f) => isAfter(parseISO(f.created_at), currentStart))
  const previousFeedbacks = feedbacks.filter((f) => !isAfter(parseISO(f.created_at), currentStart))

  // CSAT 0-100 (positivo=100, neutro=50, negativo=0) — mesma fórmula usada em
  // `getSentimentScore` (índice geral) e em `calcSatisfacao` de relatorios.ts.
  // Antes esta função usava só positivo/total*100 (ignorava neutro por completo),
  // então a mesma categoria no mesmo período mostrava números diferentes no
  // painel (aqui) e no relatório — agora os dois batem.
  type CatAcc = { total: number; positive: number; neutral: number; prevTotal: number; prevPositive: number; prevNeutral: number }
  const categoryMap = currentFeedbacks.reduce(
    (acc, f) => {
      const cat = f.categoria || 'Outros'
      if (!acc[cat]) acc[cat] = { total: 0, positive: 0, neutral: 0, prevTotal: 0, prevPositive: 0, prevNeutral: 0 }
      acc[cat].total++
      const s = f.sentimento?.toLowerCase()
      if (s === 'positivo' || s === 'positive') acc[cat].positive++
      else if (s === 'neutro' || s === 'neutral') acc[cat].neutral++
      return acc
    },
    {} as Record<string, CatAcc>,
  )

  previousFeedbacks.forEach((f) => {
    const cat = f.categoria || 'Outros'
    if (!categoryMap[cat])
      categoryMap[cat] = { total: 0, positive: 0, neutral: 0, prevTotal: 0, prevPositive: 0, prevNeutral: 0 }
    categoryMap[cat].prevTotal++
    const s = f.sentimento?.toLowerCase()
    if (s === 'positivo' || s === 'positive') categoryMap[cat].prevPositive++
    else if (s === 'neutro' || s === 'neutral') categoryMap[cat].prevNeutral++
  })

  const csat = (positive: number, neutral: number, total: number) =>
    total === 0 ? 0 : Math.round((positive * 100 + neutral * 50) / total)

  return Object.entries(categoryMap)
    .filter(([_, stats]) => stats.total > 0)
    .map(([name, stats]) => {
      const score = csat(stats.positive, stats.neutral, stats.total)
      const prevScore = csat(stats.prevPositive, stats.prevNeutral, stats.prevTotal)

      let trend: 'up' | 'down' | 'neutral' = 'neutral'
      if (score > prevScore) trend = 'up'
      else if (score < prevScore) trend = 'down'

      // Reclamações da categoria — usado só pra decidir destaque visual (as 3
      // categorias com mais feedback NEGATIVO), não pra mudar o `count` exibido.
      const negativeCount = stats.total - stats.positive - stats.neutral

      return { name, score, count: stats.total, trend, negativeCount } as CategoryScore
    })
    .sort((a, b) => b.count - a.count)
}

/**
 * Os feedbacks mais recentes DENTRO do período escolhido.
 *
 * O `period` não existia aqui: a lista trazia os últimos cinco de sempre, e
 * com o filtro em 7 dias a tela mostrava "0 feedbacks" no topo e cinco
 * mensagens logo abaixo — as de semanas atrás. Quem olhava só a lista concluía
 * que o número estava errado.
 *
 * Sem `period`, não há corte — é o que os chamadores antigos esperam.
 */
export const buscarUltimosFeedbacks = async (
  restauranteId: number | null,
  limit = 5,
  period?: PeriodInfo,
): Promise<FeedbackItem[]> => {
  if (!restauranteId) return []

  // Mensagem ORIGINAL do cliente (transcrição exata). A view deriva o sentimento
  // geral e as categorias a partir dos pedaços separados.
  let consulta = supabase
    .from('feedbacks_originais_view')
    .select('*')
    .eq('restaurante_id', restauranteId)

  if (period) {
    consulta = consulta.gte('created_at', getPeriodDates(period).currentStart.toISOString())
  }

  const { data, error } = await consulta
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data || []).map((f) => ({
    id: String(f.id),
    // `texto_destacado` (com **trechos-chave**) vem da IA em segundo plano —
    // enquanto não chega, cai no texto puro sem nenhum negrito.
    text: f.texto_destacado || f.texto_original || '',
    categories: (f.categorias ?? []) as string[],
    sentiment: (f.sentimento || 'neutro') as string,
    timeAgo: formatarDataFeedback(f.created_at),
  }))
}
