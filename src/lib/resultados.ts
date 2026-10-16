/**
 * Resultados: a evolução de cada restaurante desde que entrou no EasyFeed
 * (aba "Resultados" do painel do admin) e as frases de marketing que saem dela.
 *
 * A matéria-prima são as contagens diárias de `metricas_diarias` (migration
 * 20261029000000). Aqui só se soma e compara — sem React e sem Supabase, para
 * os testes rodarem no Node.
 *
 * Regras de honestidade (número de marketing precisa aguentar pergunta):
 *   - satisfação é o MESMO índice 0–100 da Visão Geral: positivo 100, neutro
 *     50, negativo 0; sugestão fica fora;
 *   - "início" = os primeiros 30 dias a partir do primeiro feedback; "agora" =
 *     os últimos 30 dias. Só compara quando as duas janelas não se sobrepõem
 *     (60+ dias de casa) e cada uma tem pelo menos MIN_AVALIACOES avaliações;
 *   - o agregado da base ignora contas de teste e só vira frase "divulgável"
 *     com MIN_RESTAURANTES_BASE restaurantes comparáveis;
 *   - toda frase leva a base de onde saiu, e nenhuma fala de cliente final.
 */

export const JANELA_DIAS = 30
export const MIN_DIAS_DE_CASA = 2 * JANELA_DIAS
export const MIN_AVALIACOES = 10
export const MIN_RESTAURANTES_BASE = 5
/** O mesmo `MIN_AMOSTRA` de `src/lib/queries/visao-geral.ts` (não importado
 *  de lá porque aquele arquivo puxa o cliente do Supabase). */
export const MIN_AMOSTRA_CATEGORIA = 3

export interface ContagemCategoria {
  pos: number
  neu: number
  neg: number
  sug: number
}

/** Uma linha de `metricas_diarias`. `dia` no formato yyyy-MM-dd (Brasília). */
export interface DiaMetricas {
  restaurante_id: number
  dia: string
  mensagens: number
  positivos: number
  negativos: number
  neutros: number
  sugestoes: number
  /** Só vem quando a consulta pede (o detalhe pede; a lista não). */
  por_categoria?: Record<string, ContagemCategoria> | null
  clientes_novos: number
  retornos: number
  aberturas_qr: number
  acoes_criadas: number
  acoes_concluidas: number
  insights_gerados: number
}

export interface Totais {
  mensagens: number
  positivos: number
  negativos: number
  neutros: number
  sugestoes: number
  /** positivos + neutros + negativos: a base do índice. */
  avaliacoes: number
  indice: number | null
  pctNegativos: number | null
  clientesNovos: number
  retornos: number
  aberturasQr: number
  acoesCriadas: number
  acoesConcluidas: number
  insightsGerados: number
  porCategoria: Record<string, ContagemCategoria>
}

export interface CategoriaComparada {
  nome: string
  inicio: number | null
  agora: number | null
  nInicio: number
  nAgora: number
  ganho: number | null
}

export interface Mes extends Totais {
  /** yyyy-MM */
  mes: string
  rotulo: string
}

export interface ResumoRestaurante {
  primeiroDia: string | null
  diasDeCasa: number
  inicio: Totais
  agora: Totais
  total: Totais
  inicioConfiavel: boolean
  agoraConfiavel: boolean
  /** Janelas separadas e as duas com base suficiente. */
  comparavel: boolean
  /** Pontos de satisfação (agora − início); null quando não é comparável. */
  ganho: number | null
  categorias: CategoriaComparada[]
  mensal: Mes[]
}

// ── Datas como texto yyyy-MM-dd (sem fuso: o dia já vem em Brasília) ────────

function paraData(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function paraTexto(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function somarDias(dia: string, n: number): string {
  const d = paraData(dia)
  d.setUTCDate(d.getUTCDate() + n)
  return paraTexto(d)
}

/** Dias de `de` até `ate`, contando os dois (mesmo dia = 1). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / 86_400_000) + 1
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]}/${String(a).slice(2)}`
}

// ── Somas ───────────────────────────────────────────────────────────────────

export function indiceSatisfacao(pos: number, neu: number, neg: number): number | null {
  const n = pos + neu + neg
  return n === 0 ? null : Math.round((pos * 100 + neu * 50) / n)
}

export function somar(dias: readonly DiaMetricas[]): Totais {
  const t = {
    mensagens: 0, positivos: 0, negativos: 0, neutros: 0, sugestoes: 0,
    clientesNovos: 0, retornos: 0, aberturasQr: 0, acoesCriadas: 0, acoesConcluidas: 0, insightsGerados: 0,
  }
  const porCategoria: Record<string, ContagemCategoria> = {}
  for (const d of dias) {
    t.mensagens += d.mensagens
    t.positivos += d.positivos
    t.negativos += d.negativos
    t.neutros += d.neutros
    t.sugestoes += d.sugestoes
    t.clientesNovos += d.clientes_novos
    t.retornos += d.retornos
    t.aberturasQr += d.aberturas_qr
    t.acoesCriadas += d.acoes_criadas
    t.acoesConcluidas += d.acoes_concluidas
    t.insightsGerados += d.insights_gerados
    for (const [nome, c] of Object.entries(d.por_categoria ?? {})) {
      const acc = (porCategoria[nome] ??= { pos: 0, neu: 0, neg: 0, sug: 0 })
      acc.pos += c.pos ?? 0
      acc.neu += c.neu ?? 0
      acc.neg += c.neg ?? 0
      acc.sug += c.sug ?? 0
    }
  }
  const avaliacoes = t.positivos + t.neutros + t.negativos
  return {
    ...t,
    avaliacoes,
    indice: indiceSatisfacao(t.positivos, t.neutros, t.negativos),
    pctNegativos: avaliacoes ? Math.round((t.negativos / avaliacoes) * 100) : null,
    porCategoria,
  }
}

const temFeedback = (d: DiaMetricas) =>
  d.mensagens + d.positivos + d.negativos + d.neutros + d.sugestoes > 0

const naJanela = (dias: readonly DiaMetricas[], de: string, ate: string) =>
  dias.filter((d) => d.dia >= de && d.dia <= ate)

function compararCategorias(inicio: Totais, agora: Totais, comparar: boolean): CategoriaComparada[] {
  const nomes = new Set([...Object.keys(inicio.porCategoria), ...Object.keys(agora.porCategoria)])
  const nota = (c?: ContagemCategoria) => {
    if (!c) return { n: 0, indice: null as number | null }
    const n = c.pos + c.neu + c.neg
    return { n, indice: n >= MIN_AMOSTRA_CATEGORIA ? indiceSatisfacao(c.pos, c.neu, c.neg) : null }
  }
  return [...nomes]
    .map((nome) => {
      const i = nota(inicio.porCategoria[nome])
      const a = nota(agora.porCategoria[nome])
      return {
        nome,
        inicio: i.indice,
        agora: a.indice,
        nInicio: i.n,
        nAgora: a.n,
        ganho: comparar && i.indice !== null && a.indice !== null ? a.indice - i.indice : null,
      }
    })
    .sort((x, y) => y.nInicio + y.nAgora - (x.nInicio + x.nAgora) || x.nome.localeCompare(y.nome))
}

/** `hoje` em yyyy-MM-dd (Brasília). */
export function resumirRestaurante(dias: readonly DiaMetricas[], hoje: string): ResumoRestaurante {
  const ordenados = [...dias].sort((a, b) => a.dia.localeCompare(b.dia))
  const primeiroDia = ordenados.find(temFeedback)?.dia ?? null
  const total = somar(ordenados)

  if (!primeiroDia) {
    const vazio = somar([])
    return {
      primeiroDia: null, diasDeCasa: 0, inicio: vazio, agora: vazio, total,
      inicioConfiavel: false, agoraConfiavel: false, comparavel: false, ganho: null, categorias: [], mensal: [],
    }
  }

  const diasDeCasa = diasEntre(primeiroDia, hoje)
  const inicio = somar(naJanela(ordenados, primeiroDia, somarDias(primeiroDia, JANELA_DIAS - 1)))
  const agora = somar(naJanela(ordenados, somarDias(hoje, -(JANELA_DIAS - 1)), hoje))
  const inicioConfiavel = inicio.avaliacoes >= MIN_AVALIACOES
  const agoraConfiavel = agora.avaliacoes >= MIN_AVALIACOES
  const comparavel = diasDeCasa >= MIN_DIAS_DE_CASA && inicioConfiavel && agoraConfiavel
  const ganho = comparavel && inicio.indice !== null && agora.indice !== null ? agora.indice - inicio.indice : null

  // Um ponto por mês, do mês do primeiro feedback até o de hoje (mês vazio
  // aparece vazio: buraco no gráfico é informação).
  const porMes = new Map<string, DiaMetricas[]>()
  for (const d of ordenados) {
    const mes = d.dia.slice(0, 7)
    if (!porMes.has(mes)) porMes.set(mes, [])
    porMes.get(mes)!.push(d)
  }
  const mensal: Mes[] = []
  for (let mes = primeiroDia.slice(0, 7); mes <= hoje.slice(0, 7); mes = somarDias(`${mes}-28`, 7).slice(0, 7)) {
    mensal.push({ mes, rotulo: rotuloDoMes(mes), ...somar(porMes.get(mes) ?? []) })
  }

  return {
    primeiroDia, diasDeCasa, inicio, agora, total, inicioConfiavel, agoraConfiavel, comparavel, ganho,
    categorias: compararCategorias(inicio, agora, diasDeCasa >= MIN_DIAS_DE_CASA),
    mensal,
  }
}

// ── A base inteira ──────────────────────────────────────────────────────────

export interface ResumoBase {
  /** Restaurantes de verdade (sem teste) com algum feedback. */
  restaurantes: number
  /** Desses, quantos dão para comparar início × agora. */
  comparaveis: number
  medianaGanho: number | null
  pctMelhoraram: number | null
  mediaInicio: number | null
  mediaAgora: number | null
  mensagens: number
  avaliacoes: number
  clientes: number
  acoesConcluidas: number
  /** Com menos de MIN_RESTAURANTES_BASE comparáveis, o agregado não sai em público. */
  divulgavel: boolean
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function resumirBase(itens: ReadonlyArray<{ resumo: ResumoRestaurante; ehTeste: boolean }>): ResumoBase {
  const reais = itens.filter((i) => !i.ehTeste && i.resumo.primeiroDia)
  const comp = reais.filter((i) => i.resumo.comparavel && i.resumo.ganho !== null)
  const ganhos = comp.map((i) => i.resumo.ganho as number)
  return {
    restaurantes: reais.length,
    comparaveis: comp.length,
    medianaGanho: mediana(ganhos),
    pctMelhoraram: comp.length ? Math.round((ganhos.filter((g) => g > 0).length / comp.length) * 100) : null,
    mediaInicio: media(comp.map((i) => i.resumo.inicio.indice as number)),
    mediaAgora: media(comp.map((i) => i.resumo.agora.indice as number)),
    mensagens: reais.reduce((s, i) => s + i.resumo.total.mensagens, 0),
    avaliacoes: reais.reduce((s, i) => s + i.resumo.total.avaliacoes, 0),
    clientes: reais.reduce((s, i) => s + i.resumo.total.clientesNovos, 0),
    acoesConcluidas: reais.reduce((s, i) => s + i.resumo.total.acoesConcluidas, 0),
    divulgavel: comp.length >= MIN_RESTAURANTES_BASE,
  }
}

// ── Frases de marketing ─────────────────────────────────────────────────────

export interface AutorizacaoMarketing {
  status: 'autorizado' | 'revogado'
  pode_nome: boolean
  pode_logo: boolean
  pode_numeros: boolean
  pode_depoimento: boolean
}

/** Nome do restaurante junto com números só com as duas permissões. */
export function podeNomear(a: AutorizacaoMarketing | null | undefined): boolean {
  return !!a && a.status === 'autorizado' && a.pode_nome && a.pode_numeros
}

/**
 * Quem é o sujeito da frase. Sem autorização, "um restaurante" — e a culinária
 * só entra quando outros restaurantes da base têm a mesma (`culinariaSegura`,
 * mesma regra dos 3+ do EasyFeed Influencers); senão ela apontaria o restaurante.
 */
export function sujeitoDaFrase(p: {
  nome: string | null
  culinaria: string | null
  culinariaSegura: boolean
  autorizacao: AutorizacaoMarketing | null | undefined
}): { texto: string; nomeado: boolean } {
  if (podeNomear(p.autorizacao) && p.nome?.trim()) return { texto: p.nome.trim(), nomeado: true }
  if (p.culinaria && p.culinariaSegura) return { texto: `Um restaurante de ${p.culinaria.toLowerCase()}`, nomeado: false }
  return { texto: 'Um restaurante', nomeado: false }
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

export function tempoDeCasa(dias: number): string {
  if (dias < 60) return plural(dias, 'dia', 'dias')
  return plural(Math.round(dias / 30), 'mês', 'meses')
}

/** Só fatos a favor, cada um com a base de onde saiu. Nada sai sem base. */
export function frasesDoRestaurante(r: ResumoRestaurante, sujeito: string): string[] {
  const frases: string[] = []
  if (!r.primeiroDia) return frases
  const base = `Base: ${plural(r.inicio.avaliacoes, 'avaliação', 'avaliações')} nos primeiros 30 dias e ${r.agora.avaliacoes.toLocaleString('pt-BR')} nos últimos 30.`

  if (r.comparavel && r.ganho !== null && r.ganho > 0) {
    frases.push(
      `${sujeito} saiu de ${r.inicio.indice} para ${r.agora.indice} pontos de satisfação dos clientes (escala de 0 a 100) em ${tempoDeCasa(r.diasDeCasa)} com o EasyFeed. ${base}`,
    )
  }
  if (r.comparavel && r.inicio.pctNegativos !== null && r.agora.pctNegativos !== null && r.agora.pctNegativos < r.inicio.pctNegativos) {
    frases.push(
      `${sujeito}: as avaliações negativas caíram de ${r.inicio.pctNegativos}% para ${r.agora.pctNegativos}% entre os primeiros e os últimos 30 dias com o EasyFeed. ${base}`,
    )
  }
  const melhorCategoria = r.categorias
    .filter((c) => c.ganho !== null && c.ganho > 0)
    .sort((a, b) => (b.ganho as number) - (a.ganho as number))[0]
  if (melhorCategoria) {
    frases.push(
      `${sujeito}: ${melhorCategoria.nome} subiu de ${melhorCategoria.inicio} para ${melhorCategoria.agora} pontos de satisfação. Base: ${melhorCategoria.nInicio} e ${melhorCategoria.nAgora} avaliações sobre o tema nos primeiros e nos últimos 30 dias.`,
    )
  }
  if (r.total.acoesConcluidas > 0) {
    frases.push(
      `${sujeito} concluiu ${plural(r.total.acoesConcluidas, 'melhoria', 'melhorias')} a partir do que os clientes disseram, em ${tempoDeCasa(r.diasDeCasa)} de EasyFeed.`,
    )
  }
  if (r.total.clientesNovos > 0) {
    frases.push(
      `${sujeito} ouviu ${plural(r.total.clientesNovos, 'cliente', 'clientes diferentes')} pelo WhatsApp, em ${plural(r.total.mensagens, 'mensagem', 'mensagens')}, em ${tempoDeCasa(r.diasDeCasa)}.`,
    )
  }
  return frases
}

export function frasesDaBase(b: ResumoBase): string[] {
  const frases: string[] = []
  if (b.comparaveis > 0 && b.medianaGanho !== null && b.medianaGanho > 0) {
    frases.push(
      `Nos restaurantes com 60 dias ou mais de EasyFeed, a satisfação dos clientes subiu ${b.medianaGanho} pontos (mediana, escala de 0 a 100) entre os primeiros e os últimos 30 dias, e ${b.pctMelhoraram}% deles melhoraram. Base: ${plural(b.comparaveis, 'restaurante', 'restaurantes')} com pelo menos ${MIN_AVALIACOES} avaliações em cada período.`,
    )
  }
  if (b.mensagens > 0) {
    frases.push(
      `${plural(b.restaurantes, 'restaurante já recebeu', 'restaurantes já receberam')} ${plural(b.mensagens, 'mensagem', 'mensagens')} de ${plural(b.clientes, 'cliente', 'clientes')} pelo EasyFeed${b.acoesConcluidas > 0 ? ` e ${b.restaurantes === 1 ? 'concluiu' : 'concluíram'} ${plural(b.acoesConcluidas, 'melhoria', 'melhorias')} a partir delas` : ''}.`,
    )
  }
  return frases
}

// ── Planilha (uso interno do admin) ─────────────────────────────────────────

export function linhasCsvMensal(r: ResumoRestaurante): Array<Array<string | number>> {
  const cab = [
    'Mês', 'Mensagens', 'Avaliações', 'Positivas', 'Neutras', 'Negativas', 'Sugestões', 'Satisfação (0-100)',
    'Negativas (%)', 'Clientes novos', 'Retornos', 'Aberturas do QR', 'Ações criadas', 'Ações concluídas', 'Insights',
  ]
  return [
    cab,
    ...r.mensal.map((m) => [
      m.rotulo, m.mensagens, m.avaliacoes, m.positivos, m.neutros, m.negativos, m.sugestoes, m.indice ?? '',
      m.pctNegativos ?? '', m.clientesNovos, m.retornos, m.aberturasQr, m.acoesCriadas, m.acoesConcluidas, m.insightsGerados,
    ]),
  ]
}
