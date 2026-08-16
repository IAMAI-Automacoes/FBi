/**
 * Fórmulas de KPI compartilhadas — hoje usadas pelo Comparativo de Períodos
 * (`src/lib/queries/comparativo.ts`). `visao-geral.ts` e `relatorios.ts` têm
 * suas próprias cópias (já corrigidas) destas mesmas fórmulas; centralizamos
 * aqui para o comparativo não virar uma TERCEIRA cópia divergente — qualquer
 * ajuste de fórmula que valha para os três lugares deveria migrar pra cá.
 *
 * Todas operam sobre linhas de `feedbacks_restaurante` (a tabela SEPARADA por
 * tópico) — nunca `feedbacks_originais`, que não serve pra conta agregada.
 */

/** Amostra mínima para uma categoria/recorte entrar em "melhorou"/"piorou"
 *  com confiança — 1 avaliação isolada não pode decidir 0% ou 100%. */
export const MIN_AMOSTRA = 3

export interface FeedbackLinha {
  sentimento?: string | null
  categoria?: string | null
  telefone_cliente?: string | null
  origem_id?: string | null
  id?: number | string | null
}

export const isPositivo = (f: FeedbackLinha): boolean => {
  const s = f.sentimento?.toLowerCase()
  return s === 'positivo' || s === 'positive'
}
export const isNegativo = (f: FeedbackLinha): boolean => {
  const s = f.sentimento?.toLowerCase()
  return s === 'negativo' || s === 'negative'
}
export const isNeutro = (f: FeedbackLinha): boolean => {
  const s = f.sentimento?.toLowerCase()
  return s === 'neutro' || s === 'neutral'
}

/** CSAT 0-100 (positivo=100, neutro=50, negativo=0). `null` se não há dado. */
export function calcularSatisfacao(fs: FeedbackLinha[]): number | null {
  if (!fs.length) return null
  let pos = 0
  let neu = 0
  for (const f of fs) {
    if (isPositivo(f)) pos++
    else if (isNeutro(f)) neu++
  }
  return Math.round((pos * 100 + neu * 50) / fs.length)
}

export interface Sentimentos {
  total: number
  positivos: number
  negativos: number
  neutros: number
  positivePercent: number
  negativePercent: number
  neutralPercent: number
}

export function contarSentimentos(fs: FeedbackLinha[]): Sentimentos {
  const total = fs.length
  let positivos = 0
  let negativos = 0
  for (const f of fs) {
    if (isPositivo(f)) positivos++
    else if (isNegativo(f)) negativos++
  }
  const neutros = total - positivos - negativos
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return {
    total,
    positivos,
    negativos,
    neutros,
    positivePercent: pct(positivos),
    negativePercent: pct(negativos),
    neutralPercent: pct(neutros),
  }
}

/** Agrupa por categoria (linhas sem categoria caem em "Geral"). */
export function agruparPorCategoria(fs: FeedbackLinha[]): Map<string, FeedbackLinha[]> {
  const mapa = new Map<string, FeedbackLinha[]>()
  for (const f of fs) {
    const cat = f.categoria || 'Geral'
    if (!mapa.has(cat)) mapa.set(cat, [])
    mapa.get(cat)!.push(f)
  }
  return mapa
}

export interface EstatisticaClientes {
  clientesUnicos: number
  clientesRecorrentes: number
  avaliacoesPorCliente: number
}

/**
 * Clientes únicos/recorrentes deduplicados por MENSAGEM de origem, não por
 * linha — uma mensagem com sentimento misto vira 2+ linhas em
 * `feedbacks_restaurante` (mesmo `origem_id`), e contar linhas infla a
 * recorrência (cliente que mandou 1 mensagem parece ter voltado 2 vezes).
 * Linhas sem `origem_id` (dado antigo) contam como mensagem própria via `id`.
 */
export function calcularEstatisticaClientes(fs: FeedbackLinha[]): EstatisticaClientes {
  const porTelefone = new Map<string, Set<string>>()
  for (const f of fs) {
    if (!f.telefone_cliente) continue
    const chaveMensagem = f.origem_id ?? `linha-${f.id}`
    if (!porTelefone.has(f.telefone_cliente)) porTelefone.set(f.telefone_cliente, new Set())
    porTelefone.get(f.telefone_cliente)!.add(chaveMensagem)
  }
  const clientesUnicos = porTelefone.size
  const clientesRecorrentes = [...porTelefone.values()].filter((m) => m.size > 1).length
  const totalMensagens = [...porTelefone.values()].reduce((soma, m) => soma + m.size, 0)
  const avaliacoesPorCliente = clientesUnicos ? Number((totalMensagens / clientesUnicos).toFixed(1)) : 0
  return { clientesUnicos, clientesRecorrentes, avaliacoesPorCliente }
}
