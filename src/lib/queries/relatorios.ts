import { supabase } from '@/lib/supabase/client'
import {
  buscarKpis,
  buscarCategorias,
  buscarUltimosFeedbacks,
  getPeriodDates,
  PeriodInfo,
} from '@/lib/queries/visao-geral'
import { enviarMensagem } from '@/lib/openrouter'
import { paramsDoAgente } from '@/lib/ia/params'
import {
  construirSystemPromptResumoExecutivo,
  construirSystemPromptRelatorioEstruturado,
} from '@/lib/prompts-sistema'
import { parseISO, format, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Amostra mínima para afirmar "melhor/pior dia" sem virar ruído estatístico. */
const MIN_AMOSTRA = 3

/** Índice de satisfação 0-100: positivo=100, neutro=50, negativo=0. */
function calcSatisfacao(fs: any[]): number | null {
  if (!fs.length) return null
  let pos = 0
  let neu = 0
  for (const f of fs) {
    const s = f.sentimento?.toLowerCase()
    if (s === 'positivo' || s === 'positive') pos++
    else if (s === 'neutro' || s === 'neutral') neu++
  }
  return Math.round((pos * 100 + neu * 50) / fs.length)
}

function faixaDoHorario(h: number): string {
  if (h >= 6 && h < 11) return 'Manhã (6h–11h)'
  if (h >= 11 && h < 15) return 'Almoço (11h–15h)'
  if (h >= 15 && h < 18) return 'Tarde (15h–18h)'
  if (h >= 18 && h < 23) return 'Jantar (18h–23h)'
  return 'Madrugada (23h–6h)'
}

export interface Recorte {
  nome: string
  total: number
  satisfacao: number
}

export interface EstatisticasRelatorio {
  clientesUnicos: number
  clientesRecorrentes: number
  avaliacoesPorCliente: number
  /** Todas as categorias do período, com o MESMO índice 0-100 do resto da página. */
  porCategoria: Array<{ nome: string; total: number; satisfacao: number }>
  melhorCategoria: Recorte | null
  piorCategoria: Recorte | null
  porDiaSemana: Array<{ nome: string; total: number; satisfacao: number | null }>
  melhorDia: Recorte | null
  piorDia: Recorte | null
  porFaixaHorario: Array<{ nome: string; total: number; satisfacao: number | null }>
  faixaMaisMovimentada: Recorte | null
  faixaCritica: Recorte | null
  amostraSuficiente: boolean
}

/**
 * Estatísticas extras do período (recortes que o dono usa para agir:
 * clientes que voltaram, melhor/pior categoria, dia e horário fracos).
 */
export async function buscarEstatisticasRelatorio(
  restauranteId: number | null,
  periodo: PeriodInfo,
): Promise<EstatisticasRelatorio> {
  const vazio: EstatisticasRelatorio = {
    clientesUnicos: 0,
    clientesRecorrentes: 0,
    avaliacoesPorCliente: 0,
    porCategoria: [],
    melhorCategoria: null,
    piorCategoria: null,
    porDiaSemana: [],
    melhorDia: null,
    piorDia: null,
    porFaixaHorario: [],
    faixaMaisMovimentada: null,
    faixaCritica: null,
    amostraSuficiente: false,
  }
  if (!restauranteId) return vazio

  const { currentStart } = getPeriodDates(periodo)
  const { data, error } = await supabase
    .from('feedbacks_restaurante')
    .select('id, created_at, categoria, sentimento, telefone_cliente, origem_id')
    .eq('restaurante_id', restauranteId)
    .gte('created_at', currentStart.toISOString())
  if (error) throw error

  const fs = data || []
  if (!fs.length) return vazio

  // Clientes (telefone é o identificador do cliente no WhatsApp).
  // `feedbacks_restaurante` é a tabela SEPARADA POR TÓPICO: uma única mensagem
  // do cliente com sentimento misto ("comida ótima, mas demorou") vira 2+
  // linhas aqui. Contar linhas por telefone inflava "recorrência" — um cliente
  // que mandou 1 mensagem só já parecia ter avaliado 2 vezes. `origem_id` liga
  // as linhas que vieram da MESMA mensagem (mesmo uuid gerado pelo n8n); linhas
  // sem origem_id (dado antigo) contam como mensagem própria via o `id`.
  const porTelefone = new Map<string, Set<string>>()
  for (const f of fs) {
    if (!f.telefone_cliente) continue
    const chaveMensagem = f.origem_id ?? `linha-${f.id}`
    if (!porTelefone.has(f.telefone_cliente)) porTelefone.set(f.telefone_cliente, new Set())
    porTelefone.get(f.telefone_cliente)!.add(chaveMensagem)
  }
  const clientesUnicos = porTelefone.size
  const clientesRecorrentes = [...porTelefone.values()].filter((mensagens) => mensagens.size > 1).length
  const totalMensagens = [...porTelefone.values()].reduce((soma, mensagens) => soma + mensagens.size, 0)
  const avaliacoesPorCliente = clientesUnicos ? Number((totalMensagens / clientesUnicos).toFixed(1)) : 0

  // Melhor / pior categoria (exige amostra mínima para não eleger categoria de 1 avaliação)
  const porCategoria = new Map<string, any[]>()
  for (const f of fs) {
    const c = f.categoria || 'Geral'
    if (!porCategoria.has(c)) porCategoria.set(c, [])
    porCategoria.get(c)!.push(f)
  }
  // Todas as categorias (para exibição) — mesmo índice 0-100 usado no resto do relatório
  const listaCategorias = [...porCategoria.entries()]
    .map(([nome, arr]) => ({ nome, total: arr.length, satisfacao: calcSatisfacao(arr)! }))
    .sort((a, b) => b.total - a.total)
  // Melhor/pior só com amostra mínima, para não eleger categoria de 1 avaliação
  const cats: Recorte[] = listaCategorias
    .filter((c) => c.total >= MIN_AMOSTRA)
    .sort((a, b) => b.satisfacao - a.satisfacao)
  const melhorCategoria = cats.length ? cats[0] : null
  const piorCategoria = cats.length > 1 ? cats[cats.length - 1] : null

  // Dia da semana
  const diaBuckets = new Map<number, any[]>()
  for (const f of fs) {
    const d = getDay(parseISO(f.created_at))
    if (!diaBuckets.has(d)) diaBuckets.set(d, [])
    diaBuckets.get(d)!.push(f)
  }
  const nomeDia = (d: number) =>
    format(new Date(2024, 0, 7 + d), 'EEEE', { locale: ptBR }) // 07/01/2024 = domingo
  const porDiaSemana = Array.from({ length: 7 }, (_, d) => {
    const arr = diaBuckets.get(d) || []
    return { nome: nomeDia(d), total: arr.length, satisfacao: calcSatisfacao(arr) }
  })
  const diasComAmostra: Recorte[] = porDiaSemana
    .filter((d) => d.total >= MIN_AMOSTRA)
    .map((d) => ({ nome: d.nome, total: d.total, satisfacao: d.satisfacao! }))
    .sort((a, b) => b.satisfacao - a.satisfacao)
  const melhorDia = diasComAmostra.length ? diasComAmostra[0] : null
  const piorDia = diasComAmostra.length > 1 ? diasComAmostra[diasComAmostra.length - 1] : null

  // Faixa de horário
  const faixaBuckets = new Map<string, any[]>()
  for (const f of fs) {
    const nome = faixaDoHorario(parseISO(f.created_at).getHours())
    if (!faixaBuckets.has(nome)) faixaBuckets.set(nome, [])
    faixaBuckets.get(nome)!.push(f)
  }
  const porFaixaHorario = [...faixaBuckets.entries()]
    .map(([nome, arr]) => ({ nome, total: arr.length, satisfacao: calcSatisfacao(arr) }))
    .sort((a, b) => b.total - a.total)
  const faixaMaisMovimentada = porFaixaHorario.length
    ? {
        nome: porFaixaHorario[0].nome,
        total: porFaixaHorario[0].total,
        satisfacao: porFaixaHorario[0].satisfacao!,
      }
    : null
  const faixasComAmostra = porFaixaHorario
    .filter((f) => f.total >= MIN_AMOSTRA)
    .map((f) => ({ nome: f.nome, total: f.total, satisfacao: f.satisfacao! }))
    .sort((a, b) => a.satisfacao - b.satisfacao)
  // Só faz sentido falar em faixa "mais fraca" se houver com o que comparar
  const faixaCritica = faixasComAmostra.length > 1 ? faixasComAmostra[0] : null

  return {
    clientesUnicos,
    clientesRecorrentes,
    avaliacoesPorCliente,
    porCategoria: listaCategorias,
    melhorCategoria,
    piorCategoria,
    porDiaSemana,
    melhorDia,
    piorDia,
    porFaixaHorario,
    faixaMaisMovimentada,
    faixaCritica,
    amostraSuficiente: fs.length >= MIN_AMOSTRA,
  }
}

export async function buscarInsightsAtivos(restauranteId: number, limit: number) {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function gerarDadosRelatorio(restauranteId: number, periodo: '7d' | '30d' | '90d') {
  const kpis = await buscarKpis(restauranteId, periodo)
  const categorias = await buscarCategorias(restauranteId, periodo)
  const feedbacks = await buscarUltimosFeedbacks(restauranteId, 10)
  const insights = await buscarInsightsAtivos(restauranteId, 3)

  return {
    kpis,
    categorias: categorias.slice(0, 3),
    insights,
    feedbacks,
    restauranteId,
    periodo,
    geradoEm: new Date().toISOString(),
  }
}

export interface AnaliseRelatorio {
  titulo: string
  resumo: string
  ponto_forte: string
  ponto_fraco: string
  leitura_categorias: string
  leitura_clientes: string
  recomendacoes: string[]
  alerta_amostra: string
  porIa: boolean
}

/** Análise escrita sem IA — usada quando a chamada falha ou volta inválida. */
function analiseFallback(dados: any): AnaliseRelatorio {
  const k = dados.kpis || {}
  const e = dados.estatisticas || {}
  const comparar = k.hasPrevData && k.prevConfiavel
  return {
    titulo: `${k.totalFeedbacks || 0} avaliações no período`,
    resumo: [
      `No período (${String(dados.periodo || '').toLowerCase()}), o restaurante recebeu ${k.totalFeedbacks || 0} avaliações de ${e.clientesUnicos || 0} clientes.`,
      `O índice de satisfação ficou em ${k.sentiment ?? 0} de 100.`,
      comparar ? `No período anterior era ${k.prevSentiment ?? 0} de 100.` : '',
    ].filter(Boolean).join(' '),
    ponto_forte: k.positivos
      ? `${k.positivos} de ${k.totalFeedbacks} avaliações foram positivas (${k.positivePercent}%).`
      : 'Nenhuma avaliação positiva registrada no período.',
    ponto_fraco:
      k.criticalTheme && k.criticalTheme !== 'Nenhum'
        ? `O tema "${k.criticalTheme}" concentrou reclamações: ${k.criticalPercent}% das avaliações sobre ele foram negativas.`
        : `${k.negativos || 0} avaliações negativas no período.`,
    leitura_categorias: (e.porCategoria || [])
      .map((c: any) => `${c.nome}: ${c.satisfacao} de 100 em ${c.total} avaliações.`)
      .join(' '),
    leitura_clientes: `${e.clientesUnicos || 0} clientes avaliaram, ${e.clientesRecorrentes || 0} deles mais de uma vez.`,
    recomendacoes:
      k.criticalTheme && k.criticalTheme !== 'Nenhum'
        ? [`Revisar o que os clientes relataram sobre "${k.criticalTheme}".`]
        : ['Manter o padrão e seguir coletando avaliações.'],
    alerta_amostra:
      (k.totalFeedbacks || 0) < 10
        ? 'A quantidade de avaliações ainda é pequena, então esta leitura é preliminar.'
        : '',
    porIa: false,
  }
}

/**
 * Números "de verdade" que a IA tem permissão de citar no texto livre do
 * relatório — todo o resto do dado já calculado em código (ver `dados.kpis`/
 * `dados.estatisticas`). Usado por `numerosSuspeitos` para flagar quando a IA
 * escreveu um percentual ou um "X de 100" que não bate com nada real (sinal
 * de que ela recalculou ou inventou em vez de só ler o que foi dado).
 */
function numerosPermitidos(dados: any): Set<number> {
  const k = dados.kpis || {}
  const e = dados.estatisticas || {}
  const nums = new Set<number>()
  const add = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) nums.add(Math.round(v))
  }
  add(k.positivePercent)
  add(k.negativePercent)
  add(k.neutralPercent)
  add(k.criticalPercent)
  add(k.sentiment)
  add(k.prevSentiment)
  for (const c of e.porCategoria || []) add(c.satisfacao)
  return nums
}

/** Extrai "X%" e "X de 100" do texto e devolve os que NÃO batem com nenhum número real. */
function numerosSuspeitos(texto: string, permitidos: Set<number>): number[] {
  const achados = new Set<number>()
  for (const m of texto.matchAll(/(\d{1,3})\s*%/g)) achados.add(Number(m[1]))
  for (const m of texto.matchAll(/(\d{1,3})\s*de\s*100/gi)) achados.add(Number(m[1]))
  return [...achados].filter((n) => !permitidos.has(n))
}

/**
 * Pede à IA a análise estruturada (campo a campo) para o template do PDF.
 * Se a IA falhar ou devolver algo inválido, cai no texto calculado.
 */
export async function gerarAnaliseRelatorio(dados: any): Promise<AnaliseRelatorio> {
  const fallback = analiseFallback(dados)
  try {
    const systemPrompt = construirSystemPromptRelatorioEstruturado(dados)
    const resposta = await enviarMensagem(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Gere a análise do relatório no formato JSON pedido.' },
      ],
      paramsDoAgente('relatorio_estruturado', { response_format: { type: 'json_object' } }),
      'relatorio_estruturado',
    )

    const bruto =
      typeof resposta === 'string'
        ? JSON.parse(resposta.replace(/^```(?:json)?|```$/g, '').trim())
        : (resposta as any)

    const texto = (v: any, padrao: string) =>
      typeof v === 'string' && v.trim() ? v.trim() : padrao

    const resultado: AnaliseRelatorio = {
      titulo: texto(bruto.titulo, fallback.titulo),
      resumo: texto(bruto.resumo, fallback.resumo),
      ponto_forte: texto(bruto.ponto_forte, fallback.ponto_forte),
      ponto_fraco: texto(bruto.ponto_fraco, fallback.ponto_fraco),
      leitura_categorias: texto(bruto.leitura_categorias, fallback.leitura_categorias),
      leitura_clientes: texto(bruto.leitura_clientes, fallback.leitura_clientes),
      recomendacoes:
        Array.isArray(bruto.recomendacoes) && bruto.recomendacoes.length
          ? bruto.recomendacoes.filter((r: any) => typeof r === 'string' && r.trim()).slice(0, 4)
          : fallback.recomendacoes,
      alerta_amostra: typeof bruto.alerta_amostra === 'string' ? bruto.alerta_amostra.trim() : '',
      porIa: true,
    }

    // Rede de segurança final: o prompt já instrui "nunca invente número", mas
    // isso é uma instrução de linguagem natural — nada garantia até aqui que a
    // IA de fato só citou os números reais. Se ela citar um % ou um "X de 100"
    // que não bate com nenhum dado calculado, descarta a resposta inteira e
    // usa o texto 100% determinístico (nunca mostra um número não verificado).
    const textoLivre = [
      resultado.resumo, resultado.ponto_forte, resultado.ponto_fraco,
      resultado.leitura_categorias, resultado.leitura_clientes,
    ].join(' ')
    const suspeitos = numerosSuspeitos(textoLivre, numerosPermitidos(dados))
    if (suspeitos.length) {
      console.warn('Análise da IA citou número(s) fora dos dados reais, usando texto calculado:', suspeitos)
      return fallback
    }

    return resultado
  } catch (err) {
    console.warn('Análise por IA indisponível, usando texto calculado:', err)
    return fallback
  }
}

/**
 * Resumo executivo em texto corrido, para o dono ler antes de abrir o PDF.
 * Falhar aqui não pode impedir a geração do relatório, então devolve string
 * vazia e a tela simplesmente não mostra a seção.
 */
export async function gerarResumoExecutivo(dadosRelatorio: any): Promise<string> {
  try {
    const systemPrompt = construirSystemPromptResumoExecutivo(dadosRelatorio)
    const resposta = await enviarMensagem(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Gere o resumo executivo do relatório.' },
      ],
      paramsDoAgente('resumo_executivo', { max_tokens: 400 }),
      'resumo_executivo',
    )
    const texto = String(resposta ?? '')

    // Mesma rede de segurança de `gerarAnaliseRelatorio`: texto livre não tem
    // como ser validado por schema, então checamos os números citados contra
    // os dados reais. Se algo não bater, prefere não mostrar nada a mostrar
    // um número que pode estar errado — a tela já trata resumo vazio.
    const suspeitos = numerosSuspeitos(texto, numerosPermitidos(dadosRelatorio))
    if (suspeitos.length) {
      console.warn('Resumo executivo citou número(s) fora dos dados reais, ocultando:', suspeitos)
      return ''
    }
    return texto
  } catch (err) {
    console.warn('Resumo executivo indisponível:', err)
    return ''
  }
}

export async function salvarRelatorio(
  restauranteId: number,
  periodo: string,
  dadosJson: any,
  resumoExecutivo: string,
  urlPdf: string,
) {
  const { data, error } = await supabase
    .from('relatorios')
    .insert({
      restaurante_id: restauranteId,
      periodo,
      dados_json: dadosJson,
      resumo_executivo: resumoExecutivo,
      url_pdf: urlPdf,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listarRelatorios(restauranteId: number) {
  const { data, error } = await supabase
    .from('relatorios')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
