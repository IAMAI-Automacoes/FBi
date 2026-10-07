/**
 * O painel do EasyFeed Influencers: o formato do que vem do banco
 * (`influencers_painel`) e as contas da tela. Sem React nem Supabase, para dar
 * para testar no Node.
 *
 * A tela usa os MESMOS componentes da Visão Geral dos restaurantes (KpiCards,
 * TrendChart, TemasFeedbackLista): as funções `kpisDoPainel`, `serieDoGrafico`,
 * `categoriasDoGrafico` e `temasParaLista` convertem os dados anônimos para o
 * formato deles, com as mesmas contas de `buscarKpis`/`buscarTendencia`
 * (src/lib/queries/visao-geral.ts).
 */
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CategoryScore, DashboardData, PeriodInfo } from './queries/visao-geral'
import type { TemaFeedback } from './queries/temas'

export type TipoPonto = 'reclamacao' | 'elogio' | 'sugestao' | 'neutro'

export interface TemaPainel {
  tipo: TipoPonto
  rotulo: string
  mencoes: number
  mencoes_anterior: number
  /** Citado em mais de um restaurante. */
  comum: boolean
}

export interface CategoriaPainel {
  nome: string
  reclamacoes: number
  elogios: number
  sugestoes: number
  neutros: number
  total: number
  total_anterior: number
}

export interface TotaisPorTipo {
  pontos: number
  reclamacoes: number
  elogios: number
  sugestoes: number
  neutros: number
}

export interface DadosPainel {
  periodo: { dias: number }
  culinaria: string | null
  culinarias: string[]
  totais: TotaisPorTipo & { pontos_anterior: number }
  totais_anterior: TotaisPorTipo
  categorias: CategoriaPainel[]
  temas: TemaPainel[]
  em_alta: TemaPainel[]
  frases: { tipo: TipoPonto; texto: string; categoria: string }[]
  /** Por dia até 31 dias; por mês acima (igual ao gráfico da Visão Geral). */
  evolucao: {
    intervalo: 'dia' | 'mes'
    pontos: { inicio: string; reclamacoes: number; elogios: number; neutros: number; sugestoes: number }[]
  }
}

// ── No formato da Visão Geral ─────────────────────────────────────────────────

/** 7, 30 ou 90 dias → o período dos componentes da Visão Geral. */
export function periodoDoPainel(dias: number): PeriodInfo {
  return dias <= 7 ? '7d' : dias <= 30 ? '30d' : '90d'
}

/** Índice 0-100 da Visão Geral: elogio 100, neutro 50, reclamação 0; sugestão fica fora. */
export function sentimentoGeral(t: { elogios: number; neutros: number; reclamacoes: number }): number | null {
  const base = t.elogios + t.neutros + t.reclamacoes
  return base === 0 ? null : Math.round((t.elogios * 100 + t.neutros * 50) / base)
}

/** Os números do topo, no formato do `KpiCards` (mesma regra de `buscarKpis`). */
export function kpisDoPainel(d: DadosPainel): DashboardData['kpis'] {
  const t = d.totais
  const a = d.totais_anterior
  const total = t.pontos
  const prevTotal = a.pontos
  const hasPrevData = prevTotal > 0
  // Comparar 3 contra 1 dá "+200%", que engana: só compara com base mínima.
  const prevConfiavel = prevTotal >= 3
  const sentiment = sentimentoGeral(t) ?? 0
  const prevSentiment = sentimentoGeral(a) ?? 0
  const variacaoTotal = hasPrevData ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0
  const totalTrend = !hasPrevData ? (total > 0 ? 'novo' : '—') : `${variacaoTotal >= 0 ? '+' : ''}${variacaoTotal}%`
  const difSentimento = sentiment - prevSentiment
  const sentimentTrend = !hasPrevData
    ? (total > 0 ? 'novo' : '—')
    : difSentimento === 0 ? 'estável' : `${difSentimento >= 0 ? '+' : ''}${difSentimento} pts`
  const avaliativos = t.elogios + t.neutros + t.reclamacoes
  const nps = avaliativos ? Math.round(((t.elogios - t.reclamacoes) / avaliativos) * 100) : 0
  return {
    totalFeedbacks: total,
    totalTrend,
    sentiment,
    sentimentTrend,
    nps,
    npsTrend: '—',
    criticalTheme: '',
    criticalPercent: 0,
    hasPrevData,
    prevConfiavel,
    prevTotal,
    positivos: t.elogios,
    negativos: t.reclamacoes,
    neutros: t.neutros,
    sugestoes: t.sugestoes,
    positivePercent: pct(t.elogios, total),
    negativePercent: pct(t.reclamacoes, total),
    neutralPercent: pct(t.neutros, total),
    suggestionPercent: pct(t.sugestoes, total),
    semClassificacao: 0,
    positivePercentTrend: '—',
    totalMensagens: total,
    mensagensTrend: totalTrend,
    prevMensagens: prevTotal,
    prevSentiment,
  }
}

/** "2026-10-07" como data local (sem virar o dia anterior pelo fuso). */
function dataLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

/** A série do gráfico "Tendência de Sentimento", com os mesmos rótulos da Visão Geral. */
export function serieDoGrafico(d: DadosPainel): DashboardData['chartData'] {
  const rotulo = (iso: string) => {
    const data = dataLocal(iso)
    if (d.evolucao.intervalo === 'mes') return format(data, 'MMM', { locale: ptBR })
    return d.periodo.dias <= 7 ? format(data, 'EE', { locale: ptBR }) : format(data, 'd MMM', { locale: ptBR })
  }
  return d.evolucao.pontos.map((p) => ({
    date: rotulo(p.inicio),
    sentiment: sentimentoGeral(p),
    avaliacoes: p.elogios + p.neutros + p.reclamacoes,
    positivos: p.elogios,
    negativos: p.reclamacoes,
    neutros: p.neutros,
    sugestoes: p.sugestoes,
  }))
}

/** As categorias da lateral do gráfico (ranqueadas por reclamação, como na Visão Geral). */
export function categoriasDoGrafico(d: DadosPainel): CategoryScore[] {
  return d.categorias.map((c) => ({
    name: c.nome,
    score: sentimentoGeral(c) ?? 0,
    count: c.total,
    trend: 'neutral' as const,
    negativeCount: c.reclamacoes,
  }))
}

/** Os temas no formato da lista "O que os clientes estão comentando". */
export function temasParaLista(d: DadosPainel): TemaFeedback[] {
  return d.temas.map((t) => ({ id: `${t.tipo}:${t.rotulo}`, rotulo: rotuloBonito(t.rotulo), tipo: t.tipo, quantidade: t.mencoes }))
}

/** O sentimento como a Visão Geral grava, para o selo do cartão de feedback. */
export const SENTIMENTO_DO_TIPO: Record<TipoPonto, string> = {
  reclamacao: 'Negativo',
  elogio: 'Positivo',
  sugestao: 'Sugestão',
  neutro: 'Neutro',
}

/** "comida fria" → "Comida fria". */
export function rotuloBonito(rotulo: string): string {
  const t = rotulo.trim()
  return t ? t[0].toLocaleUpperCase('pt-BR') + t.slice(1) : t
}

/** Porcentagem inteira; 0 quando não há base. */
export function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}


// ── Ideias de pauta ───────────────────────────────────────────────────────────

export interface Pauta {
  titulo: string
  /** De onde veio a ideia, com o número. */
  porque: string
}

/** Uma pauta por assunto, para quando ele lidera as reclamações. */
const PAUTA_DO_ASSUNTO: Record<string, string> = {
  'Comida': 'O erro na cozinha que mais vira reclamação, e como evitar',
  'Bebidas': 'Bebida errada, quente ou demorada: o que o cliente não perdoa',
  'Atendimento': 'O que faz o cliente reclamar do atendimento, nas palavras dele',
  'Ambiente': 'O que o cliente repara no ambiente assim que entra',
  'Limpeza': 'O detalhe de limpeza que o cliente sempre repara',
  'Preço': 'Como mostrar que o seu preço é justo antes de o cliente reclamar',
  'Tempo de Espera': 'Cliente esperando demais? Como cortar a espera sem contratar ninguém',
  'Reserva': 'A reserva que falha e faz o cliente não voltar',
  'Estacionamento': 'Estacionamento: o problema fora da cozinha que afasta clientes',
  'Acessibilidade': 'Acessibilidade: o que os clientes pedem e quase ninguém faz',
  'Música/Som': 'Música alta espanta cliente? O que os comentários mostram',
  'Cardápio/Variedade': 'Cardápio confuso ou repetitivo: o que os clientes pedem',
  'Higiene': 'Higiene: a reclamação que mais derruba um restaurante',
}

const vezes = (n: number) => (n === 1 ? '1 vez' : `${n} vezes`)

export function ideiasDePauta(d: DadosPainel): Pauta[] {
  const pautas: Pauta[] = []
  const periodo = `nos últimos ${d.periodo.dias} dias`
  const emVarios = (t: TemaPainel) => (t.comum ? ', em mais de um restaurante' : '')
  const primeiro = (tipo: TipoPonto) => d.temas.filter((t) => t.tipo === tipo).sort((a, b) => b.mencoes - a.mencoes)[0]

  const assunto = [...d.categorias].filter((c) => c.reclamacoes > 0 && PAUTA_DO_ASSUNTO[c.nome]).sort((a, b) => b.reclamacoes - a.reclamacoes)[0]
  if (assunto) {
    pautas.push({
      titulo: PAUTA_DO_ASSUNTO[assunto.nome],
      porque: `${pct(assunto.reclamacoes, d.totais.reclamacoes)}% das reclamações ${periodo} são sobre ${assunto.nome}.`,
    })
  }

  const reclamacao = primeiro('reclamacao')
  if (reclamacao) {
    pautas.push({
      titulo: `“${rotuloBonito(reclamacao.rotulo)}”: a reclamação que mais aparece e como resolver`,
      porque: `Citada ${vezes(reclamacao.mencoes)} ${periodo}${emVarios(reclamacao)}.`,
    })
  }

  const elogio = primeiro('elogio')
  if (elogio) {
    pautas.push({
      titulo: `O que faz o cliente elogiar: “${rotuloBonito(elogio.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: `O elogio mais repetido ${periodo}: ${vezes(elogio.mencoes)}${emVarios(elogio)}.`,
    })
  }

  const sugestao = primeiro('sugestao')
  if (sugestao) {
    pautas.push({
      titulo: `O que os clientes estão pedindo: “${rotuloBonito(sugestao.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: `Sugestão que apareceu ${vezes(sugestao.mencoes)} ${periodo}.`,
    })
  }

  // O que mais cresceu e ainda não virou pauta acima. Só com base de
  // comparação (3 menções antes, a mesma regra dos números do topo): de 1 para
  // 3 não é tendência. Neutro não rende vídeo.
  const jaUsados = new Set([reclamacao?.rotulo, elogio?.rotulo, sugestao?.rotulo])
  const alta = d.em_alta.find((t) => t.tipo !== 'neutro' && t.mencoes_anterior >= 3 && !jaUsados.has(t.rotulo))
  if (alta) {
    pautas.push({
      titulo: `Está crescendo: “${rotuloBonito(alta.rotulo).toLocaleLowerCase('pt-BR')}”`,
      porque: `Passou de ${alta.mencoes_anterior} para ${alta.mencoes} menções, comparando com o período anterior.`,
    })
  }

  // Sem repetir título.
  return pautas.filter((p, i) => pautas.findIndex((q) => q.titulo === p.titulo) === i)
}

// ── Valor em reais (painel do admin) ─────────────────────────────────────────

/** "12,50" ou "12.50" ou "R$ 12" → 12.5; vazio → null; inválido → NaN. */
export function lerValorEmReais(texto: string): number | null {
  const limpo = texto.replace(/r\$/i, '').replace(/\s/g, '')
  if (!limpo) return null
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
