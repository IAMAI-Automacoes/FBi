/**
 * Testes da planilha em Excel.
 *
 * Gera o arquivo de verdade e o LÊ de volta com o próprio ExcelJS: é a única
 * forma de garantir que o .xlsx abre — um arquivo corrompido ainda sai como
 * Blob de tamanho plausível, e o erro só apareceria no Excel do dono.
 */
import ExcelJS from 'exceljs'
import { gerarXlsxRelatorio } from '../relatorio-xlsx.ts'

let falhas = 0
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!ok) console.log(`   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
}

const dados = {
  nomeRestaurante: 'Camelo',
  rotuloPeriodo: 'Últimos 30 dias',
  inicio: new Date('2026-08-03T12:00:00'),
  fim: new Date('2026-09-02T12:00:00'),
  kpis: {
    totalMensagens: 42, totalFeedbacks: 113, sentiment: 42,
    positivos: 43, positivePercent: 38, neutros: 9, neutralPercent: 8, sugestoes: 0, suggestionPercent: 0,
    negativos: 61, negativePercent: 54, semClassificacao: 0,
    criticalTheme: 'Reserva', criticalPercent: 100,
    totalTrend: '+1156%', sentimentTrend: '-25 pts', mensagensTrend: '+80%',
    hasPrevData: true, prevConfiavel: true,
  },
  stats: {
    clientesUnicos: 8, clientesRecorrentes: 1, mensagensPorCliente: 5.8,
    porCategoria: [{ nome: 'Comida', total: 44, satisfacao: 48 }],
    porDiaSemana: [{ nome: 'sábado', total: 0, satisfacao: null }],
    porFaixaHorario: [{ nome: 'Jantar (18h-23h)', total: 41, satisfacao: 41 }],
  },
  tendencia: [{ date: '4 ago', avaliacoes: 0, sentiment: null }],
  temas: [
    { rotulo: 'Comida fria', tipo: 'reclamacao', quantidade: 12 },
    { rotulo: 'Comida saborosa', tipo: 'elogio', quantidade: 19 },
    { rotulo: 'Opiniao neutra geral', tipo: 'neutro', quantidade: 6 },
  ],
  insights: [{ titulo: 'Falhas no sistema de reservas', prioridade: 'URGENTE' }],
  acoes: [{ titulo_acao: 'Revisar reservas', status: 'EM_ANDAMENTO', prioridade: 'URGENTE', categoria: 'Reserva' }],
  avaliacoes: [
    { created_at: '2026-08-25T13:20:00Z', categoria: 'Atendimento', sentimento: 'negativo', texto_original: 'Linha 1\nLinha 2' },
  ],
  resumoIa: 'Volume subiu, satisfação caiu.',
}

const blob = await gerarXlsxRelatorio(dados as never)
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await blob.arrayBuffer())

// ── As abas ─────────────────────────────────────────────────────────────────
checa(
  'uma aba por seção, na ordem de leitura',
  wb.worksheets.map((w) => w.name),
  ['Resumo', 'Categorias', 'Temas', 'Evolução', 'Insights e ações', 'Avaliações'],
)

// ── Número é número ─────────────────────────────────────────────────────────
// Era este o ponto do CSV: tudo saía como texto com vírgula, e o Excel não
// somava nada sem conversão manual.
const resumo = wb.getWorksheet('Resumo')!
checa('a contagem de mensagens é numérica', typeof resumo.getCell(5, 2).value, 'number')
checa('e é o valor certo', resumo.getCell(5, 2).value, 42)

// ── Data é data ─────────────────────────────────────────────────────────────
const av = wb.getWorksheet('Avaliações')!
checa('a data da avaliação é um Date', av.getCell(5, 1).value instanceof Date, true)
checa('o sentimento vem normalizado', av.getCell(5, 4).value, 'Negativo')
checa(
  'a quebra de linha do texto virou espaço',
  av.getCell(5, 5).value,
  'Linha 1 Linha 2',
)

// ── O cabeçalho fica no topo ao rolar ───────────────────────────────────────
// A tipagem do ExcelJS declara `views` como união (normal | frozen | split) e
// `ySplit` só existe no ramo congelado — daí a leitura por índice.
checa('cabeçalho congelado na linha 4', (av.views?.[0] as Record<string, unknown>)?.ySplit, 4)
checa('filtro ligado no cabeçalho', !!av.autoFilter, true)

// ── Os três tipos de tema convivem na mesma aba ─────────────────────────────
const temas = wb.getWorksheet('Temas')!
const tipos = new Set<string>()
temas.eachRow((row, n) => {
  if (n >= 5 && row.getCell(1).value) tipos.add(String(row.getCell(1).value))
})
checa('reclamação, elogio e neutro', [...tipos].sort(), ['Elogio', 'Neutro', 'Reclamação'])

// ── Insights e ações na mesma aba, marcados pela origem ─────────────────────
const plano = wb.getWorksheet('Insights e ações')!
checa('a primeira linha é o insight', plano.getCell(5, 1).value, 'Insight')
checa('a segunda é a ação, com a situação traduzida', [plano.getCell(6, 1).value, plano.getCell(6, 2).value], ['Ação', 'Em andamento'])

// ── Período vazio não quebra o arquivo ──────────────────────────────────────
const vazio = await gerarXlsxRelatorio({
  ...dados,
  temas: [], insights: [], acoes: [], avaliacoes: [], tendencia: [],
  stats: { ...dados.stats, porCategoria: [], porDiaSemana: [], porFaixaHorario: [] },
  resumoIa: null,
} as never)
const wb2 = new ExcelJS.Workbook()
await wb2.xlsx.load(await vazio.arrayBuffer())
checa('sem dados, as abas continuam lá', wb2.worksheets.length, 6)
checa(
  'e dizem que não há o que mostrar',
  wb2.getWorksheet('Avaliações')!.getCell(5, 1).value,
  'Nada a mostrar neste período.',
)

// ── A planilha do cliente não mudou de palavras ─────────────────────────────
const linhasDoResumo = (w: ExcelJS.Worksheet) => {
  const rotulos: string[] = []
  w.eachRow((r) => { const v = r.getCell(1).value; if (typeof v === 'string') rotulos.push(v) })
  return rotulos
}
const rotulosCliente = linhasDoResumo(resumo)
checa('cliente: título e linhas de sempre', [
  rotulosCliente[0], rotulosCliente.includes('Avaliações recebidas (mensagens)'), rotulosCliente.includes('Avaliações negativas'),
  rotulosCliente.includes('Clientes diferentes'), rotulosCliente.includes('Clientes que voltaram a avaliar'), rotulosCliente.includes('Mensagens por cliente'),
], ['Relatório de satisfação · Camelo', true, true, true, true, true])
checa('cliente: nada de funcionário na planilha', rotulosCliente.some((r) => /funcion|feedback/i.test(r)), false)

// ── Relatório da equipe: outras palavras e só contagens de participação ─────
const participacao = { ativos: 12, minimo: 5, falaram: 7, mais_de_uma_vez: 2, feedbacks: 11, identificados: 6, anonimos: 4, aguardando: 1, pedidos: 2, receberam: 20, responderam: 9 }
const daEquipe = await gerarXlsxRelatorio({ ...dados, publico: 'equipe', participacao } as never)
const wb3 = new ExcelJS.Workbook()
await wb3.xlsx.load(await daEquipe.arrayBuffer())
checa('equipe: a aba da lista se chama Feedbacks', wb3.worksheets.map((w) => w.name), ['Resumo', 'Categorias', 'Temas', 'Evolução', 'Insights e ações', 'Feedbacks'])
const resumoEquipe = wb3.getWorksheet('Resumo')!
const rotulosEquipe = linhasDoResumo(resumoEquipe)
checa('equipe: título e linhas com as palavras da equipe', [
  rotulosEquipe[0], rotulosEquipe.includes('Feedbacks recebidos (mensagens)'), rotulosEquipe.includes('Feedbacks negativos'),
  rotulosEquipe.includes('Funcionários que falaram'), rotulosEquipe.includes('Feedbacks anônimos'), rotulosEquipe.includes('Pedidos de feedback enviados'),
], ['Relatório da equipe · Camelo', true, true, true, true, true])
checa('equipe: nada de cliente no resumo', rotulosEquipe.filter((r) => /cliente|avalia/i.test(r)), [])
const linhaDe = (w: ExcelJS.Worksheet, rotulo: string) => { let n = 0; w.eachRow((r, i) => { if (r.getCell(1).value === rotulo) n = i }); return n }
checa('equipe: quantos falaram é número', resumoEquipe.getCell(linhaDe(resumoEquipe, 'Funcionários que falaram'), 2).value, 7)
checa('equipe: a resposta aos pedidos vem por extenso', resumoEquipe.getCell(linhaDe(resumoEquipe, 'Pedidos de feedback enviados'), 3).value, '2 pedidos de feedback: 9 de 20 responderam (45%).')
checa('equipe: a coluna do texto não fala em cliente', wb3.getWorksheet('Feedbacks')!.getRow(4).getCell(5).value, 'O que a pessoa disse')

// Equipe pequena: o número de pessoas não sai, e a planilha diz por quê.
const pequena = await gerarXlsxRelatorio({ ...dados, publico: 'equipe', participacao: { ...participacao, ativos: 3, falaram: null, mais_de_uma_vez: null } } as never)
const wb4 = new ExcelJS.Workbook()
await wb4.xlsx.load(await pequena.arrayBuffer())
const resumoPequena = wb4.getWorksheet('Resumo')!
const linhaFalaram = linhaDe(resumoPequena, 'Funcionários que falaram')
checa('equipe pequena: célula vazia em vez de número', resumoPequena.getCell(linhaFalaram, 2).value ?? null, null)
checa('equipe pequena: e a explicação ao lado', String(resumoPequena.getCell(linhaFalaram, 3).value).includes('proteger o anonimato'), true)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`)
if (falhas > 0) process.exit(1)
