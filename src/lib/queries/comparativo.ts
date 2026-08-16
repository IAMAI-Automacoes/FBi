import { supabase } from '@/lib/supabase/client'
import {
  MIN_AMOSTRA,
  calcularSatisfacao,
  contarSentimentos,
  agruparPorCategoria,
  calcularEstatisticaClientes,
  type FeedbackLinha,
} from '@/lib/kpi-calc'

export interface PeriodoIntervalo {
  /** Início do intervalo, inclusive. */
  inicio: Date
  /** Fim do intervalo, EXCLUSIVO (ex.: "01/09 00:00" para incluir até 31/08 inteiro). */
  fim: Date
}

export type Direcao = 'melhorou' | 'piorou' | 'estavel' | 'sem_dados'

export interface MetricaComparada {
  atual: number | null
  anterior: number | null
  delta: number | null
  /** Variação percentual relativa (não confundir com delta em pontos). */
  deltaPercentual: number | null
  direcao: Direcao
}

export interface CategoriaComparada {
  nome: string
  satisfacaoAtual: number | null
  satisfacaoAnterior: number | null
  totalAtual: number
  totalAnterior: number
  delta: number | null
  /** Só vira "melhorou"/"piorou" com confiança quando true (>= MIN_AMOSTRA nos dois períodos). */
  amostraSuficiente: boolean
}

export interface ResultadoComparativo {
  periodoA: { inicio: string; fim: string }
  periodoB: { inicio: string; fim: string }
  totalAtual: number
  totalAnterior: number
  satisfacao: MetricaComparada
  positivas: MetricaComparada
  negativas: MetricaComparada
  clientesUnicos: MetricaComparada
  /** Todas as categorias vistas em qualquer um dos períodos, maior volume primeiro. */
  categorias: CategoriaComparada[]
  /** Subconjunto de `categorias` com amostra suficiente e melhora real — pronto pra destacar. */
  melhorou: CategoriaComparada[]
  piorou: CategoriaComparada[]
  /** true se qualquer um dos dois períodos tem poucas avaliações — mostrar aviso na tela. */
  amostraPequena: boolean
}

async function buscarFeedbacksNoPeriodo(
  restauranteId: number,
  intervalo: PeriodoIntervalo,
): Promise<FeedbackLinha[]> {
  const { data, error } = await supabase
    .from('feedbacks_restaurante')
    .select('id, categoria, sentimento, telefone_cliente, origem_id')
    .eq('restaurante_id', restauranteId)
    .gte('created_at', intervalo.inicio.toISOString())
    .lt('created_at', intervalo.fim.toISOString())
  if (error) throw error
  return data || []
}

function metrica(
  atual: number | null,
  anterior: number | null,
  maiorEhMelhor: boolean,
  limiar = 0,
): MetricaComparada {
  if (atual == null || anterior == null) {
    return { atual, anterior, delta: null, deltaPercentual: null, direcao: 'sem_dados' }
  }
  const delta = Math.round((atual - anterior) * 10) / 10
  const deltaPercentual = anterior !== 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null
  let direcao: Direcao = 'estavel'
  if (Math.abs(delta) > limiar) direcao = maiorEhMelhor === delta > 0 ? 'melhorou' : 'piorou'
  return { atual, anterior, delta, deltaPercentual, direcao }
}

/** Calcula o comparativo entre dois períodos (A = mais recente, B = anterior). */
export async function compararPeriodos(
  restauranteId: number | null,
  periodoA: PeriodoIntervalo,
  periodoB: PeriodoIntervalo,
): Promise<ResultadoComparativo> {
  if (!restauranteId) throw new Error('Restaurante não identificado.')

  const [fsA, fsB] = await Promise.all([
    buscarFeedbacksNoPeriodo(restauranteId, periodoA),
    buscarFeedbacksNoPeriodo(restauranteId, periodoB),
  ])

  const sentA = contarSentimentos(fsA)
  const sentB = contarSentimentos(fsB)
  const satA = fsA.length ? calcularSatisfacao(fsA) : null
  const satB = fsB.length ? calcularSatisfacao(fsB) : null
  const clientesA = calcularEstatisticaClientes(fsA)
  const clientesB = calcularEstatisticaClientes(fsB)

  const catA = agruparPorCategoria(fsA)
  const catB = agruparPorCategoria(fsB)
  const nomes = new Set<string>([...catA.keys(), ...catB.keys()])
  const categorias: CategoriaComparada[] = [...nomes]
    .map((nome) => {
      const listaA = catA.get(nome) ?? []
      const listaB = catB.get(nome) ?? []
      const sA = calcularSatisfacao(listaA)
      const sB = calcularSatisfacao(listaB)
      const amostraSuficiente = listaA.length >= MIN_AMOSTRA && listaB.length >= MIN_AMOSTRA
      return {
        nome,
        satisfacaoAtual: sA,
        satisfacaoAnterior: sB,
        totalAtual: listaA.length,
        totalAnterior: listaB.length,
        delta: amostraSuficiente && sA != null && sB != null ? sA - sB : null,
        amostraSuficiente,
      }
    })
    .sort((a, b) => b.totalAtual + b.totalAnterior - (a.totalAtual + a.totalAnterior))

  // "Melhorou"/"piorou" de verdade: amostra confiável e mudança de pelo menos
  // 2 pontos (abaixo disso é ruído, não uma mudança real).
  const comAmostra = categorias.filter((c) => c.amostraSuficiente && c.delta != null)
  const melhorou = comAmostra
    .filter((c) => (c.delta as number) >= 2)
    .sort((a, b) => (b.delta as number) - (a.delta as number))
  const piorou = comAmostra
    .filter((c) => (c.delta as number) <= -2)
    .sort((a, b) => (a.delta as number) - (b.delta as number))

  return {
    periodoA: { inicio: periodoA.inicio.toISOString(), fim: periodoA.fim.toISOString() },
    periodoB: { inicio: periodoB.inicio.toISOString(), fim: periodoB.fim.toISOString() },
    totalAtual: fsA.length,
    totalAnterior: fsB.length,
    satisfacao: metrica(satA, satB, true, 1),
    positivas: metrica(fsA.length ? sentA.positivePercent : null, fsB.length ? sentB.positivePercent : null, true, 1),
    negativas: metrica(fsA.length ? sentA.negativePercent : null, fsB.length ? sentB.negativePercent : null, false, 1),
    clientesUnicos: metrica(clientesA.clientesUnicos, clientesB.clientesUnicos, true, 0),
    categorias,
    melhorou,
    piorou,
    amostraPequena: fsA.length < MIN_AMOSTRA || fsB.length < MIN_AMOSTRA,
  }
}

// ── Presets rápidos ─────────────────────────────────────────────────────────

export type PresetComparativo = '7d' | '30d' | 'mes' | 'ano'

export const PRESET_LABEL: Record<PresetComparativo, string> = {
  '7d': 'Últimos 7 dias vs. 7 dias anteriores',
  '30d': 'Últimos 30 dias vs. 30 dias anteriores',
  mes: 'Este mês vs. mês passado',
  ano: 'Este ano vs. ano passado',
}

function inicioDoDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function somarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function gerarPreset(preset: PresetComparativo): { periodoA: PeriodoIntervalo; periodoB: PeriodoIntervalo } {
  const hoje = inicioDoDia(new Date())
  const amanha = somarDias(hoje, 1) // fim exclusivo = inclui hoje inteiro

  if (preset === '7d') {
    const inicioA = somarDias(hoje, -6)
    return {
      periodoA: { inicio: inicioA, fim: amanha },
      periodoB: { inicio: somarDias(inicioA, -7), fim: inicioA },
    }
  }
  if (preset === '30d') {
    const inicioA = somarDias(hoje, -29)
    return {
      periodoA: { inicio: inicioA, fim: amanha },
      periodoB: { inicio: somarDias(inicioA, -30), fim: inicioA },
    }
  }
  if (preset === 'mes') {
    const inicioA = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicioB = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    return {
      periodoA: { inicio: inicioA, fim: amanha },
      periodoB: { inicio: inicioB, fim: inicioA },
    }
  }
  // 'ano'
  const inicioA = new Date(hoje.getFullYear(), 0, 1)
  const inicioB = new Date(hoje.getFullYear() - 1, 0, 1)
  return {
    periodoA: { inicio: inicioA, fim: amanha },
    periodoB: { inicio: inicioB, fim: inicioA },
  }
}

// ── Comparações salvas ───────────────────────────────────────────────────────

export interface ComparativoSalvo {
  id: string
  titulo: string | null
  periodo_a_inicio: string
  periodo_a_fim: string
  periodo_b_inicio: string
  periodo_b_fim: string
  resultado_json: ResultadoComparativo
  created_at: string
}

export async function salvarComparativo(
  restauranteId: number,
  titulo: string | null,
  periodoA: PeriodoIntervalo,
  periodoB: PeriodoIntervalo,
  resultado: ResultadoComparativo,
): Promise<void> {
  const { error } = await supabase.from('comparativos_periodo').insert({
    restaurante_id: restauranteId,
    titulo: titulo?.trim() || null,
    periodo_a_inicio: periodoA.inicio.toISOString(),
    periodo_a_fim: periodoA.fim.toISOString(),
    periodo_b_inicio: periodoB.inicio.toISOString(),
    periodo_b_fim: periodoB.fim.toISOString(),
    resultado_json: resultado as unknown as Record<string, unknown>,
  })
  if (error) throw error
}

export async function listarComparativosSalvos(restauranteId: number): Promise<ComparativoSalvo[]> {
  const { data, error } = await supabase
    .from('comparativos_periodo')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as unknown as ComparativoSalvo[]
}

export async function excluirComparativo(id: string): Promise<void> {
  const { error } = await supabase.from('comparativos_periodo').delete().eq('id', id)
  if (error) throw error
}
