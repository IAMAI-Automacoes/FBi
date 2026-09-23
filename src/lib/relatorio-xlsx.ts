import ExcelJS from 'exceljs'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  sentimentoLegivel,
  situacaoLegivel,
  tipoTemaLegivel,
  type DadosCsv,
  // Extensão explícita: é o que permite rodar o teste com
  // `node --experimental-strip-types`, sem passar por bundler.
} from './relatorio-csv.ts'

/**
 * A planilha do relatório, em Excel de verdade (.xlsx).
 *
 * ## Por que não é mais CSV
 *
 * CSV é uma tabela só. Todas as seções — resumo, categorias, temas, evolução,
 * insights, ações e a lista inteira de avaliações — eram empilhadas numa
 * coluna A cheia de títulos em caixa alta, e as larguras de coluna de uma
 * seção brigavam com as da seguinte (a coluna do texto do cliente forçava
 * largura que estragava a tabela de números lá em cima).
 *
 * Aqui cada seção é uma ABA. A pessoa clica na aba que quer, cada uma tem as
 * suas próprias colunas, e o formato ainda carrega o que CSV nunca carregou:
 * negrito, cor, largura, cabeçalho congelado, filtro e número de verdade —
 * `12,5` entra em soma sem ninguém converter nada.
 *
 * ## Números são números
 *
 * O CSV escrevia `numero()` com vírgula porque texto era tudo que ele tinha.
 * Aqui os valores vão como `number` e o formato da célula (`numFmt`) decide
 * como aparecem — é o que faz o Excel somar, ordenar e filtrar. Datas idem:
 * `Date` com `numFmt`, sem o truque do `="dd/mm/aaaa"` que existia para
 * impedir o Excel de reformatar texto sozinho.
 */

/** Azul da identidade (mesmo do PDF e do app), em hexa ARGB do Excel. */
const AZUL = 'FF1D4ED8'
const TINTA = 'FF0F172A'
const CINZA = 'FF64748B'
const FUNDO_TITULO = 'FFF1F5F9'
const VERDE = 'FF059669'
const VERMELHO = 'FFE11D48'

type Alinhamento = 'left' | 'center' | 'right'

interface Coluna {
  titulo: string
  /** Largura em caracteres — o Excel não tem "auto" ao gravar. */
  largura: number
  /** Formato de número da coluna inteira (`'0'`, `'0,0'`, `'dd/mm/aaaa'`…). */
  formato?: string
  alinhamento?: Alinhamento
}

/**
 * Cria uma aba já com a cara do relatório: faixa de título, uma linha de
 * explicação, cabeçalho azul congelado e filtro ligado.
 *
 * Toda aba passa por aqui — é o que faz as sete parecerem o mesmo documento em
 * vez de sete planilhas coladas.
 */
function criarAba(
  wb: ExcelJS.Workbook,
  nome: string,
  titulo: string,
  explicacao: string,
  colunas: Coluna[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nome, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  ws.columns = colunas.map((c) => ({
    width: c.largura,
    style: {
      numFmt: c.formato,
      alignment: { horizontal: c.alinhamento ?? 'left', vertical: 'top', wrapText: c.largura > 40 },
    },
  }))

  const ultima = colunas.length

  // Linha 1: o título da seção, numa faixa que atravessa as colunas.
  ws.mergeCells(1, 1, 1, ultima)
  const cTitulo = ws.getCell(1, 1)
  cTitulo.value = titulo
  cTitulo.font = { bold: true, size: 14, color: { argb: TINTA } }
  cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUNDO_TITULO } }
  cTitulo.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 26

  // Linha 2: uma frase dizendo o que a aba é. A dúvida mais cara de uma
  // planilha não é "qual o número", é "número do quê".
  ws.mergeCells(2, 1, 2, ultima)
  const cNota = ws.getCell(2, 1)
  cNota.value = explicacao
  cNota.font = { size: 9, italic: true, color: { argb: CINZA } }
  cNota.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 16

  // Linha 3 fica vazia de propósito: respiro entre a explicação e a tabela.

  // Linha 4: o cabeçalho de verdade — é ele que o congelamento segura no topo.
  const cabecalho = ws.getRow(4)
  colunas.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    cel.alignment = { horizontal: c.alinhamento ?? 'left', vertical: 'middle', wrapText: true }
  })
  cabecalho.height = 20

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ultima } }

  return ws
}

/**
 * Despeja as linhas de dados a partir da linha 5 e pinta as ímpares.
 *
 * A zebra não é enfeite: numa tabela de 300 avaliações com texto longo, é o
 * que impede o olho de pular de linha ao correr da primeira à última coluna.
 */
function preencher(ws: ExcelJS.Worksheet, linhas: (string | number | Date | null)[][]) {
  if (linhas.length === 0) {
    const cel = ws.getCell(5, 1)
    cel.value = 'Nada a mostrar neste período.'
    cel.font = { italic: true, color: { argb: CINZA }, size: 10 }
    return
  }

  linhas.forEach((linha, i) => {
    const row = ws.getRow(5 + i)
    linha.forEach((valor, j) => {
      row.getCell(j + 1).value = valor
    })
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cel) => {
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
  })
}

/** Pinta a coluna de sentimento com a cor do próprio sentimento. */
function colorirSentimento(ws: ExcelJS.Worksheet, coluna: number, primeiraLinha = 5) {
  ws.eachRow((row, n) => {
    if (n < primeiraLinha) return
    const cel = row.getCell(coluna)
    const v = String(cel.value ?? '')
    if (v === 'Positivo') cel.font = { color: { argb: VERDE }, bold: true, size: 10 }
    else if (v === 'Negativo') cel.font = { color: { argb: VERMELHO }, bold: true, size: 10 }
    else cel.font = { color: { argb: CINZA }, size: 10 }
  })
}

/**
 * Monta o arquivo inteiro. Recebe exatamente os mesmos dados que o CSV recebia
 * — quem chama não precisou juntar nada novo.
 */
export async function gerarXlsxRelatorio(d: DadosCsv): Promise<Blob> {
  const { kpis, stats } = d
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Easy Feed'
  wb.created = new Date()

  const comparavel = kpis.hasPrevData && kpis.prevConfiavel
  const variacao = (v: string) => (comparavel ? v : 'sem base para comparar')
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  // ── Aba 1: Resumo ───────────────────────────────────────────────────────
  // Abre primeiro porque é a aba que responde "como foi o período" sem que
  // ninguém precise ler tabela nenhuma.
  const resumo = criarAba(
    wb,
    'Resumo',
    `Relatório de satisfação · ${d.nomeRestaurante}`,
    `${d.rotuloPeriodo} (${format(d.inicio, 'dd/MM/yyyy')} a ${format(d.fim, 'dd/MM/yyyy')}) · gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    [
      { titulo: 'Métrica', largura: 44 },
      { titulo: 'Valor', largura: 18, alinhamento: 'right' },
      { titulo: 'vs. período anterior', largura: 26 },
    ],
  )

  const temaCritico =
    kpis.criticalTheme && kpis.criticalTheme !== 'Nenhum'
      ? `${kpis.criticalTheme} (${kpis.criticalPercent}% negativas)`
      : 'Nenhum'

  preencher(resumo, [
    ['Avaliações recebidas (mensagens)', num(kpis.totalMensagens), variacao(kpis.mensagensTrend)],
    ['Assuntos citados (base das outras abas)', num(kpis.totalFeedbacks), variacao(kpis.totalTrend)],
    ['Índice de satisfação (0-100)', num(kpis.sentiment), variacao(kpis.sentimentTrend)],
    ['Avaliações positivas', num(kpis.positivos), `${kpis.positivePercent ?? 0}% do total`],
    ['Avaliações neutras', num(kpis.neutros), `${kpis.neutralPercent ?? 0}% do total`],
    ['Avaliações negativas', num(kpis.negativos), `${kpis.negativePercent ?? 0}% do total`],
    // Linha de integridade, não métrica: o valor esperado é zero.
    ...(kpis.semClassificacao > 0
      ? [['Sem classificação de sentimento', num(kpis.semClassificacao), 'verifique com o suporte']]
      : []),
    ['Tema que mais preocupa', temaCritico, ''],
    ['Clientes diferentes', num(stats?.clientesUnicos), ''],
    ['Clientes que voltaram a avaliar', num(stats?.clientesRecorrentes), ''],
    ['Mensagens por cliente', num(stats?.mensagensPorCliente), ''],
  ] as (string | number | Date | null)[][])

  resumo.getColumn(2).numFmt = '#.##0,0##'

  // O resumo escrito pela IA vai ABAIXO da tabela, com as células unidas: é
  // texto corrido, e texto corrido numa coluna estreita vira uma tira ilegível.
  if (d.resumoIa?.trim()) {
    const linha = resumo.lastRow!.number + 2
    resumo.mergeCells(linha, 1, linha, 3)
    const cel = resumo.getCell(linha, 1)
    cel.value = 'LEITURA DO PERÍODO'
    cel.font = { bold: true, size: 10, color: { argb: AZUL } }

    resumo.mergeCells(linha + 1, 1, linha + 6, 3)
    const texto = resumo.getCell(linha + 1, 1)
    texto.value = d.resumoIa.trim()
    texto.alignment = { wrapText: true, vertical: 'top' }
    texto.font = { size: 10, color: { argb: TINTA } }
  }

  // Glossário no fim da primeira aba — as duas confusões de sempre são achar
  // que "avaliação" é pessoa e não saber a escala da satisfação.
  const inicioGlossario = (resumo.lastRow?.number ?? 5) + 2
  const glossario: [string, string][] = [
    ['Mensagem', 'Uma vez que um cliente escreveu.'],
    ['Assunto', 'Um ponto levantado dentro de uma mensagem. Quem falou de comida e de atendimento gerou dois — por isso as abas somam mais que as mensagens.'],
    ['Satisfação', 'Escala de 0 a 100. 100 = só positivas; 50 = tantas positivas quanto negativas; 0 = só negativas.'],
    ['Célula vazia', 'Não houve avaliação naquele recorte — diferente de zero.'],
  ]
  const tituloGloss = resumo.getCell(inicioGlossario, 1)
  tituloGloss.value = 'COMO LER ESTA PLANILHA'
  tituloGloss.font = { bold: true, size: 10, color: { argb: AZUL } }
  glossario.forEach(([termo, def], i) => {
    const n = inicioGlossario + 1 + i
    resumo.getCell(n, 1).value = termo
    resumo.getCell(n, 1).font = { bold: true, size: 9, color: { argb: TINTA } }
    resumo.mergeCells(n, 2, n, 3)
    const cel = resumo.getCell(n, 2)
    cel.value = def
    cel.font = { size: 9, color: { argb: CINZA } }
    cel.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' }
  })

  // ── Aba 2: Categorias ───────────────────────────────────────────────────
  const categorias = criarAba(
    wb,
    'Categorias',
    'Satisfação por categoria',
    'Onde o restaurante vai melhor e pior, da satisfação mais baixa para a mais alta.',
    [
      { titulo: 'Categoria', largura: 30 },
      { titulo: 'Avaliações', largura: 14, formato: '#.##0', alinhamento: 'right' },
      { titulo: '% do total', largura: 14, formato: '0,0"%"', alinhamento: 'right' },
      { titulo: 'Satisfação (0-100)', largura: 20, formato: '#.##0', alinhamento: 'right' },
    ],
  )
  preencher(
    categorias,
    (stats?.porCategoria ?? []).map((c: { nome: string; total: number; satisfacao: number }) => [
      c.nome,
      num(c.total),
      kpis.totalFeedbacks ? (c.total / kpis.totalFeedbacks) * 100 : null,
      num(c.satisfacao),
    ]),
  )

  // ── Aba 3: Temas ────────────────────────────────────────────────────────
  // Reclamações, elogios e neutros na MESMA aba, separados pela coluna "Tipo":
  // três abas quase iguais dariam mais trabalho de navegar do que um filtro.
  const temas = criarAba(
    wb,
    'Temas',
    'O que os clientes mais comentam',
    'Assuntos que a IA agrupou a partir do que foi escrito. Use o filtro da coluna "Tipo" para ver só reclamações ou só elogios.',
    [
      { titulo: 'Tipo', largura: 16 },
      { titulo: 'Assunto', largura: 46 },
      { titulo: 'Vezes citado', largura: 16, formato: '#.##0', alinhamento: 'right' },
    ],
  )
  const ordemTipo: Record<string, number> = { Reclamação: 0, Elogio: 1, Neutro: 2 }
  preencher(
    temas,
    [...d.temas]
      .map((t) => ({ tipo: tipoTemaLegivel(t.tipo), rotulo: t.rotulo, q: num(t.quantidade) }))
      .sort((a, b) => (ordemTipo[a.tipo] ?? 9) - (ordemTipo[b.tipo] ?? 9) || (b.q ?? 0) - (a.q ?? 0))
      .map((t) => [t.tipo, t.rotulo, t.q]),
  )
  // Reclamação em vermelho, elogio em verde: a coluna "Tipo" é a primeira
  // coisa que se lê nesta aba, e a cor evita ter que ler a palavra inteira.
  temas.eachRow((row, n) => {
    if (n < 5) return
    const cel = row.getCell(1)
    const v = String(cel.value ?? '')
    if (v === 'Reclamação') cel.font = { color: { argb: VERMELHO }, bold: true, size: 10 }
    else if (v === 'Elogio') cel.font = { color: { argb: VERDE }, bold: true, size: 10 }
    else cel.font = { color: { argb: CINZA }, size: 10 }
  })

  // ── Aba 4: Evolução ─────────────────────────────────────────────────────
  const evolucao = criarAba(
    wb,
    'Evolução',
    'Evolução dia a dia',
    'Um dia por linha, do mais antigo ao mais recente. Satisfação em branco = nenhuma avaliação naquele dia.',
    [
      { titulo: 'Data', largura: 16 },
      { titulo: 'Avaliações', largura: 14, formato: '#.##0', alinhamento: 'right' },
      { titulo: 'Satisfação (0-100)', largura: 20, formato: '#.##0', alinhamento: 'right' },
    ],
  )
  preencher(
    evolucao,
    d.tendencia.map((t) => [t.date, num(t.avaliacoes), num(t.sentiment)]),
  )

  // Dia da semana e faixa de horário vão na mesma aba, um abaixo do outro:
  // são o mesmo assunto ("em que momento isto acontece") visto por dois cortes.
  const blocoExtra = (
    ws: ExcelJS.Worksheet,
    titulo: string,
    cabecalhos: string[],
    linhas: (string | number | null)[][],
  ) => {
    if (linhas.length === 0) return
    const inicio = (ws.lastRow?.number ?? 4) + 2
    const cel = ws.getCell(inicio, 1)
    cel.value = titulo
    cel.font = { bold: true, size: 10, color: { argb: AZUL } }
    cabecalhos.forEach((h, i) => {
      const c = ws.getCell(inicio + 1, i + 1)
      c.value = h
      c.font = { bold: true, size: 9, color: { argb: CINZA } }
    })
    linhas.forEach((linha, i) => {
      linha.forEach((valor, j) => {
        ws.getCell(inicio + 2 + i, j + 1).value = valor
      })
    })
  }

  blocoExtra(
    evolucao,
    'POR DIA DA SEMANA (soma de todas as semanas do período)',
    ['Dia', 'Avaliações', 'Satisfação (0-100)'],
    (stats?.porDiaSemana ?? []).map((x: { nome: string; total: number; satisfacao: number | null }) => [
      x.nome,
      num(x.total),
      num(x.satisfacao),
    ]),
  )
  blocoExtra(
    evolucao,
    'POR FAIXA DE HORÁRIO (hora em que a mensagem chegou, não a do atendimento)',
    ['Faixa', 'Avaliações', 'Satisfação (0-100)'],
    (stats?.porFaixaHorario ?? []).map((x: { nome: string; total: number; satisfacao: number | null }) => [
      x.nome,
      num(x.total),
      num(x.satisfacao),
    ]),
  )

  // ── Aba 5: Insights e ações ─────────────────────────────────────────────
  // As duas juntas porque contam a mesma história em dois tempos: o que o
  // sistema concluiu, e o que o restaurante decidiu fazer a respeito.
  const plano = criarAba(
    wb,
    'Insights e ações',
    'O que o sistema concluiu e o que está sendo feito',
    'Insights são deste período. Ações são as abertas hoje, independente do período escolhido.',
    [
      { titulo: 'Origem', largura: 14 },
      { titulo: 'Situação', largura: 20 },
      { titulo: 'Prioridade', largura: 16 },
      { titulo: 'Categoria', largura: 20 },
      { titulo: 'Descrição', largura: 62 },
    ],
  )
  preencher(plano, [
    ...d.insights.map((i) => ['Insight', '', i.prioridade ?? '', '', i.titulo]),
    ...d.acoes.map((a) => [
      'Ação',
      situacaoLegivel(a.status),
      a.prioridade ?? '',
      a.categoria ?? '',
      a.titulo_acao,
    ]),
  ])

  // ── Aba 6: Avaliações ───────────────────────────────────────────────────
  // A lista crua, que é o que o analista abre. Data e hora como valores de
  // verdade: ordenar por data aqui ordena cronologicamente, não alfabeticamente.
  const avaliacoes = criarAba(
    wb,
    'Avaliações',
    'Todas as avaliações do período',
    'Uma linha por assunto citado, da mais recente à mais antiga. O total daqui é o mesmo "Assuntos citados" da aba Resumo.',
    [
      { titulo: 'Data', largura: 13, formato: 'dd/mm/aaaa', alinhamento: 'center' },
      { titulo: 'Hora', largura: 9, formato: 'hh:mm', alinhamento: 'center' },
      { titulo: 'Categoria', largura: 20 },
      { titulo: 'Sentimento', largura: 15, alinhamento: 'center' },
      { titulo: 'O que o cliente disse', largura: 80 },
    ],
  )
  preencher(
    avaliacoes,
    d.avaliacoes.map((f) => {
      const dt = parseISO(f.created_at)
      return [
        dt,
        dt,
        f.categoria || 'Outros',
        sentimentoLegivel(f.sentimento),
        // Quebra de linha dentro da célula desalinha a altura da linha; vira
        // espaço, e o `wrapText` da coluna cuida do resto.
        (f.texto_original || f.resumo || '').replace(/[\r\n]+/g, ' ').trim(),
      ]
    }),
  )
  colorirSentimento(avaliacoes, 4)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
