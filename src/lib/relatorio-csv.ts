import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * A planilha do relatório.
 *
 * Escrita para três leitores ao mesmo tempo, e é isso que decide o formato:
 *
 * - o **dono do restaurante**, que abre no Excel e quer entender sem manual —
 *   daí cada bloco começar com uma frase dizendo o que ele é, e nenhum número
 *   aparecer sem unidade;
 * - o **analista**, que vai ordenar, filtrar e cruzar — daí uma linha por
 *   registro, colunas sempre no mesmo lugar e nada de célula mesclada;
 * - a **IA**, que pode receber o arquivo colado num prompt — daí os títulos de
 *   bloco em caixa alta e as legendas em texto corrido: o modelo consegue
 *   separar seções e entender as unidades sem que ninguém explique.
 *
 * ## Sobre cores
 *
 * CSV é texto puro: não carrega cor, negrito nem largura de coluna — quem
 * abrir vê a formatação padrão do programa dele. Para destacar visualmente
 * seria preciso XLSX, um formato binário que exige uma biblioteca inteira só
 * para isso. O que dá para fazer aqui, e está feito, é organização: blocos
 * separados por linha em branco, títulos em caixa alta, uma legenda por bloco
 * e as colunas na ordem em que se lê.
 */

/** Uma linha da planilha. Lista vazia = linha em branco (separa os blocos). */
type Linha = (string | number)[]

export interface DadosCsv {
  nomeRestaurante: string
  rotuloPeriodo: string
  inicio: Date
  fim: Date
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kpis: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any
  tendencia: Array<{ date: string; avaliacoes: number; sentiment: number | null }>
  temas: Array<{ rotulo: string; tipo: string; quantidade: number }>
  insights: Array<{ titulo: string; prioridade: string; descricao?: string | null }>
  acoes: Array<{ titulo_acao: string; status: string; prioridade: string; categoria: string | null }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  avaliacoes: any[]
  /** Resumo escrito pela IA, quando já foi gerado na tela. */
  resumoIa?: string | null
}

/**
 * Número com vírgula decimal.
 *
 * O Excel em português trata "5.8" como TEXTO — a célula encosta à esquerda e
 * não entra em soma nenhuma. Com vírgula ele reconhece como número. É a mesma
 * razão de o separador de colunas ser `;` e não `,`.
 */
function numero(n: number | null | undefined, casas = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return n.toFixed(casas).replace('.', ',')
}

/**
 * "Positivo", "Negativo", "Neutro" — sempre do mesmo jeito.
 *
 * O banco guarda as duas grafias (`negativo` e `Negativo`), porque vieram de
 * versões diferentes do classificador. Sem normalizar, a planilha sai com as
 * duas e o filtro do Excel mostra cinco opções para três valores.
 */
export function sentimentoLegivel(s: string | null | undefined): string {
  const v = (s ?? '').trim().toLowerCase()
  if (v.startsWith('pos')) return 'Positivo'
  if (v.startsWith('neg')) return 'Negativo'
  if (v.startsWith('neu')) return 'Neutro'
  return v ? v[0].toUpperCase() + v.slice(1) : 'Sem classificação'
}

/**
 * O tipo do tema, incluindo NEUTRO.
 *
 * Havia um `tipo === 'elogio' ? 'Elogio' : 'Reclamação'`, e os três temas
 * neutros do banco saíam rotulados como reclamação — "Opinião neutra geral"
 * aparecia na planilha como queixa, inflando a contagem de problemas.
 */
export function tipoTemaLegivel(t: string | null | undefined): string {
  const v = (t ?? '').trim().toLowerCase()
  if (v === 'elogio') return 'Elogio'
  if (v === 'reclamacao' || v === 'reclamação') return 'Reclamação'
  if (v === 'neutro') return 'Neutro'
  return 'Não classificado'
}

/** Monta todas as linhas da planilha. Puro — dá para testar sem navegador. */
export function montarLinhasCsv(d: DadosCsv): Linha[] {
  const { kpis, stats } = d

  // Só mostra variação quando o período anterior tem base — comparar 3 contra
  // 1 vira "+200%" e engana. Mesma trava da tela e do PDF.
  const comparavel = kpis.hasPrevData && kpis.prevConfiavel
  const variacao = (v: string) => (comparavel ? v : 'sem base para comparar')

  const temaCritico =
    kpis.criticalTheme && kpis.criticalTheme !== 'Nenhum'
      ? `${kpis.criticalTheme} (${kpis.criticalPercent}% negativas)`
      : 'Nenhum'

  const linhas: Linha[] = [
    // ── Identificação ────────────────────────────────────────────────────
    ['RELATÓRIO DE SATISFAÇÃO'],
    ['Restaurante', d.nomeRestaurante],
    ['Período', d.rotuloPeriodo],
    // As datas por extenso, e não só "Últimos 30 dias": a planilha vai ser
    // aberta semanas depois, quando o rótulo relativo já não diz nada.
    ['De', format(d.inicio, 'dd/MM/yyyy')],
    ['Até', format(d.fim, 'dd/MM/yyyy')],
    ['Gerado em', format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
    [],

    // ── Como ler ─────────────────────────────────────────────────────────
    // Antes das tabelas, porque as duas confusões mais comuns são achar que
    // "avaliação" é pessoa e não saber a escala da satisfação.
    ['COMO LER ESTA PLANILHA'],
    ['Mensagem', 'Uma vez que um cliente escreveu. É o número do topo da página de relatórios.'],
    ['Assunto', 'Um ponto levantado dentro de uma mensagem. Quem falou de comida e de atendimento gerou dois — por isso as tabelas abaixo somam mais que as mensagens.'],
    ['Satisfação', 'Escala de 0 a 100. 100 = só avaliações positivas; 50 = tantas positivas quanto negativas; 0 = só negativas.'],
    ['Período', 'Todos os números abaixo são apenas do intervalo indicado acima.'],
    ['Em branco', 'Célula vazia significa que não houve avaliação naquele recorte — diferente de zero.'],
    [],
  ]

  // ── Resumo escrito ──────────────────────────────────────────────────────
  // Vem antes dos números: quem abre a planilha para saber "como foi o mês"
  // encontra a resposta na primeira tela, sem interpretar tabela.
  if (d.resumoIa?.trim()) {
    linhas.push(['RESUMO DO PERÍODO'], [d.resumoIa.trim()], [])
  }

  linhas.push(
    // ── Números ──────────────────────────────────────────────────────────
    ['RESUMO EM NÚMEROS'],
    ['Métrica', 'Valor', 'vs. período anterior'],
    // As duas contagens, uma embaixo da outra: é aqui que a diferença fica
    // clara para quem for somar as tabelas de baixo e comparar com o topo.
    ['Avaliações recebidas (mensagens)', numero(kpis.totalMensagens), variacao(kpis.mensagensTrend)],
    ['Assuntos citados (base das tabelas abaixo)', numero(kpis.totalFeedbacks), variacao(kpis.totalTrend)],
    ['Índice de satisfação (0-100)', numero(kpis.sentiment), variacao(kpis.sentimentTrend)],
    ['Avaliações positivas', `${numero(kpis.positivos)} (${numero(kpis.positivePercent)}%)`, ''],
    ['Avaliações neutras', `${numero(kpis.neutros)} (${numero(kpis.neutralPercent)}%)`, ''],
    ['Avaliações negativas', `${numero(kpis.negativos)} (${numero(kpis.negativePercent)}%)`, ''],
    // Só aparece se houver: é uma linha de integridade, não uma métrica. O
    // valor esperado é zero, e vê-la significa que alguma avaliação chegou com
    // um sentimento que o sistema não reconhece.
    ...(kpis.semClassificacao > 0
      ? [['Sem classificação de sentimento', numero(kpis.semClassificacao), 'verifique com o suporte']]
      : []),
    ['Tema que mais preocupa', temaCritico, ''],
    ['Clientes diferentes', numero(stats?.clientesUnicos), ''],
    ['Clientes que voltaram a avaliar', numero(stats?.clientesRecorrentes), ''],
    ['Mensagens por cliente', numero(stats?.mensagensPorCliente, 1), ''],
    [],

    // ── Categorias ───────────────────────────────────────────────────────
    ['SATISFAÇÃO POR CATEGORIA'],
    ['Onde o restaurante vai melhor e pior. Ordenado por número de avaliações.'],
    ['Categoria', 'Avaliações', '% do total', 'Satisfação (0-100)'],
    ...(stats?.porCategoria ?? []).map((c: { nome: string; total: number; satisfacao: number }) => [
      c.nome,
      numero(c.total),
      kpis.totalFeedbacks ? numero((c.total / kpis.totalFeedbacks) * 100) : '',
      numero(c.satisfacao),
    ]),
    [],
  )

  // ── Temas ───────────────────────────────────────────────────────────────
  // Separados por tipo: o dono quer ver o que incomoda e o que agrada como
  // duas listas, não uma coluna que ele precisa filtrar.
  const porTipo = (tipo: string) =>
    d.temas.filter((t) => tipoTemaLegivel(t.tipo) === tipo).map((t) => [t.rotulo, numero(t.quantidade)])

  const reclamacoes = porTipo('Reclamação')
  const elogios = porTipo('Elogio')
  const neutros = porTipo('Neutro')

  linhas.push(
    ['O QUE OS CLIENTES MAIS RECLAMAM'],
    ['Assuntos que a IA agrupou a partir do que foi escrito, do mais citado ao menos.'],
    ['Assunto', 'Vezes'],
    ...(reclamacoes.length ? reclamacoes : [['Nenhuma reclamação agrupada no período', '']]),
    [],
    ['O QUE OS CLIENTES MAIS ELOGIAM'],
    ['Assunto', 'Vezes'],
    ...(elogios.length ? elogios : [['Nenhum elogio agrupado no período', '']]),
    [],
  )
  if (neutros.length) {
    linhas.push(
      ['COMENTÁRIOS NEUTROS'],
      ['Assuntos citados sem carga positiva nem negativa.'],
      ['Assunto', 'Vezes'],
      ...neutros,
      [],
    )
  }

  linhas.push(
    // ── Evolução ─────────────────────────────────────────────────────────
    ['EVOLUÇÃO DIA A DIA'],
    ['Um dia por linha, do mais antigo ao mais recente.'],
    ['Data', 'Avaliações', 'Satisfação (0-100)'],
    ...d.tendencia.map((t) => [t.date, numero(t.avaliacoes), numero(t.sentiment)]),
    [],

    ['POR DIA DA SEMANA'],
    ['Soma de todas as semanas do período — mostra o dia que costuma pesar.'],
    ['Dia', 'Avaliações', 'Satisfação (0-100)'],
    ...(stats?.porDiaSemana ?? []).map((x: { nome: string; total: number; satisfacao: number | null }) => [
      x.nome,
      numero(x.total),
      numero(x.satisfacao),
    ]),
    [],

    ['POR FAIXA DE HORÁRIO'],
    ['Hora em que a mensagem chegou, não a do atendimento.'],
    ['Faixa', 'Avaliações', 'Satisfação (0-100)'],
    ...(stats?.porFaixaHorario ?? []).map((x: { nome: string; total: number; satisfacao: number | null }) => [
      x.nome,
      numero(x.total),
      numero(x.satisfacao),
    ]),
    [],
  )

  // ── Insights e ações ────────────────────────────────────────────────────
  // Não estão na página de relatórios, mas são o que o sistema CONCLUIU e o
  // que está sendo FEITO. Sem eles a planilha conta só o problema, e quem a
  // recebe não tem como saber que alguém já está tratando dele.
  linhas.push(
    ['INSIGHTS ATIVOS'],
    ['O que a IA concluiu a partir dos feedbacks deste período.'],
    ['Prioridade', 'Insight'],
    ...(d.insights.length
      ? d.insights.map((i) => [i.prioridade, i.titulo])
      : [['', 'Nenhum insight ativo no período']]),
    [],
    ['AÇÕES EM ANDAMENTO'],
    ['O que o restaurante decidiu fazer. Não depende do período — são as ações abertas hoje.'],
    ['Situação', 'Prioridade', 'Categoria', 'Ação'],
    ...(d.acoes.length
      ? d.acoes.map((a) => [
          situacaoLegivel(a.status),
          a.prioridade,
          a.categoria ?? '',
          a.titulo_acao,
        ])
      : [['', '', '', 'Nenhuma ação aberta']]),
    [],

    // ── Detalhe ──────────────────────────────────────────────────────────
    ['TODAS AS AVALIAÇÕES'],
    ['Uma linha por assunto citado, da mais recente à mais antiga.'],
    ['O total daqui é o mesmo "Assuntos citados" do resumo.'],
    ['Data', 'Hora', 'Categoria', 'Sentimento', 'O que o cliente disse'],
    ...d.avaliacoes.map((f) => {
      const dt = parseISO(f.created_at)
      return [
        format(dt, 'dd/MM/yyyy'),
        format(dt, 'HH:mm'),
        f.categoria || 'Outros',
        sentimentoLegivel(f.sentimento),
        // Quebra de linha dentro da célula desalinha a planilha em vários
        // programas; vira espaço.
        (f.texto_original || f.resumo || '').replace(/[\r\n]+/g, ' ').trim(),
      ]
    }),
  )

  return linhas
}

/** Nome legível do status da ação (o banco guarda em caixa alta com underscore). */
function situacaoLegivel(status: string): string {
  const mapa: Record<string, string> = {
    SUGERIDA: 'Sugerida pela IA',
    PENDENTE: 'A fazer',
    EM_ANDAMENTO: 'Em andamento',
    CONCLUIDO: 'Concluída',
  }
  return mapa[status] ?? status
}

/**
 * Serializa para o texto do arquivo.
 *
 * `;` como separador e BOM no início: é o par que faz o Excel em português
 * abrir o arquivo com as colunas separadas e os acentos certos, sem passar
 * pelo assistente de importação.
 */
export function serializarCsv(linhas: Linha[]): string {
  const corpo = linhas
    .map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  return '﻿' + corpo
}
