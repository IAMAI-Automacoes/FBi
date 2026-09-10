/** Testes da planilha do relatório. Puro — não precisa de navegador. */
import { montarLinhasCsv, serializarCsv, sentimentoLegivel, tipoTemaLegivel } from '../relatorio-csv.ts'

let falhas = 0
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!ok) console.log(`   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
}

// ── As duas grafias do banco viram uma só ───────────────────────────────────
checa('negativo minusculo', sentimentoLegivel('negativo'), 'Negativo')
checa('Negativo maiusculo', sentimentoLegivel('Negativo'), 'Negativo')
checa('positivo', sentimentoLegivel('positivo'), 'Positivo')
checa('Neutro', sentimentoLegivel('Neutro'), 'Neutro')
checa('vazio', sentimentoLegivel(null), 'Sem classificação')

// ── O tema neutro que virava reclamação ─────────────────────────────────────
checa('elogio', tipoTemaLegivel('elogio'), 'Elogio')
checa('reclamacao', tipoTemaLegivel('reclamacao'), 'Reclamação')
checa('NEUTRO nao vira reclamacao', tipoTemaLegivel('neutro'), 'Neutro')

const dados = {
  nomeRestaurante: 'Camelo',
  rotuloPeriodo: 'Últimos 30 dias',
  inicio: new Date('2026-08-03T12:00:00'),
  fim: new Date('2026-09-02T12:00:00'),
  kpis: {
    totalFeedbacks: 113, sentiment: 42, positivos: 43, positivePercent: 38,
    neutros: 9, neutralPercent: 8, negativos: 61, negativePercent: 54,
    criticalTheme: 'Reserva', criticalPercent: 100,
    totalTrend: '+1156%', sentimentTrend: '-25 pts',
    hasPrevData: true, prevConfiavel: true,
  },
  stats: {
    clientesUnicos: 8, clientesRecorrentes: 1, mensagensPorCliente: 5.8,
    porCategoria: [{ nome: 'Comida', total: 44, satisfacao: 48 }],
    porDiaSemana: [{ nome: 'sábado', total: 0, satisfacao: null }],
    porFaixaHorario: [{ nome: 'Jantar (18h–23h)', total: 41, satisfacao: 41 }],
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

const linhas = montarLinhasCsv(dados as never)
const txt = serializarCsv(linhas)
const achar = (t: string) => linhas.findIndex((l) => String(l[0] ?? '').startsWith(t))

// ── Todos os blocos que o relatório precisa ter ─────────────────────────────
for (const bloco of [
  'RELATÓRIO DE SATISFAÇÃO', 'COMO LER ESTA PLANILHA', 'RESUMO DO PERÍODO',
  'RESUMO EM NÚMEROS', 'SATISFAÇÃO POR CATEGORIA', 'O QUE OS CLIENTES MAIS RECLAMAM',
  'O QUE OS CLIENTES MAIS ELOGIAM', 'COMENTÁRIOS NEUTROS', 'EVOLUÇÃO DIA A DIA',
  'POR DIA DA SEMANA', 'POR FAIXA DE HORÁRIO', 'INSIGHTS ATIVOS',
  'AÇÕES EM ANDAMENTO', 'TODAS AS AVALIAÇÕES',
]) {
  checa(`tem o bloco ${bloco}`, achar(bloco) >= 0, true)
}

// ── Os defeitos do arquivo que o Raver baixou ───────────────────────────────
checa('decimal com virgula (Excel BR le como numero)', txt.includes('"5,8"'), true)
checa('nao usa ponto decimal', txt.includes('"5.8"'), false)
checa('sentimento normalizado na lista', txt.includes('"Negativo"'), true)
checa('elogio aparece separado das reclamacoes', achar('O QUE OS CLIENTES MAIS ELOGIAM') > achar('O QUE OS CLIENTES MAIS RECLAMAM'), true)
checa('quebra de linha vira espaco', txt.includes('Linha 1 Linha 2'), true)

// O separador e o BOM são o que faz o Excel PT-BR abrir direito.
checa('separador ponto-e-virgula', txt.includes('";"'), true)
checa('comeca com BOM', txt.charCodeAt(0), 0xfeff)


// ─────────────────────────────────────────────────────────────────────────────
// A linha de integridade do sentimento
//
// `neutros` era calculado por subtração (`total - positivos - negativos`), o
// que jogava em "neutro" qualquer sentimento desconhecido. Agora é contado, e
// o que sobra aparece como "Sem classificação" — mas só quando existe.
// ─────────────────────────────────────────────────────────────────────────────

const semAviso = montarLinhasCsv({ ...dados, kpis: { ...dados.kpis, semClassificacao: 0 } } as never)
const comAviso = montarLinhasCsv({ ...dados, kpis: { ...dados.kpis, semClassificacao: 4 } } as never)
const temLinha = (ls: unknown[][]) => ls.some((l) => String(l[0] ?? '').startsWith('Sem classificação'))

checa('sem avaliacao desconhecida, a linha nao aparece', temLinha(semAviso), false)
checa('com avaliacao desconhecida, a linha aparece', temLinha(comAviso), true)

// ─────────────────────────────────────────────────────────────────────────────
// As datas viravam "########" no Excel
//
// "03/08/2026" sozinho é lido pelo Excel como uma data DE VERDADE, e quando a
// coluna é mais estreita que o formato escolhido a célula vira uma fileira de
// "#". A correção padrão em CSV é escrever a célula como fórmula que RESULTA
// no texto: ="03/08/2026" — o Excel calcula e mostra o texto, sem adivinhar
// mais nada. Isto testa que a fórmula chega inteira ao arquivo final, com a
// escapagem de aspas do CSV aplicada corretamente por cima dela.
// ─────────────────────────────────────────────────────────────────────────────

const acharLinha = (ls: (string | number)[][], rotulo: string) => ls.find((l) => l[0] === rotulo)

const deLinha = acharLinha(linhas, 'De')
checa('data De vira formula de texto', deLinha?.[1], '="03/08/2026"')

// O CSV final: a fórmula ="03/08/2026" tem 2 aspas internas, cada uma dobra
// (regra do CSV), e o campo inteiro fica entre um terceiro par de aspas — o
// resultado esperado no texto bruto é: "=""03/08/2026"""
checa(
  'a fórmula sai corretamente escapada no CSV',
  txt.includes('"De";"=""03/08/2026"""'),
  true,
)

// A tabela de avaliações: Data E Hora, as duas protegidas. O valor esperado
// vem do próprio horário de sistema (não fixo "13:20") para o teste não
// quebrar rodando num fuso diferente do de quem escreveu.
const dtAvaliacao = new Date('2026-08-25T13:20:00Z')
const dd = String(dtAvaliacao.getDate()).padStart(2, '0')
const mm = String(dtAvaliacao.getMonth() + 1).padStart(2, '0')
const hh = String(dtAvaliacao.getHours()).padStart(2, '0')
const min = String(dtAvaliacao.getMinutes()).padStart(2, '0')

const linhaAvaliacao = linhas.find(
  (l) => typeof l[0] === 'string' && l[0].startsWith('=') && String(l[4] ?? '').includes('Linha 1'),
)
checa('Data da avaliação protegida', linhaAvaliacao?.[0], `="${dd}/${mm}/2026"`)
checa('Hora da avaliação protegida', linhaAvaliacao?.[1], `="${hh}:${min}"`)

// "Gerado em" tem texto junto (" às HH:mm") — não é uma data pura, não
// precisa (e não deve) da proteção, para não poluir à toa.
const geradoEm = acharLinha(linhas, 'Gerado em')
checa('Gerado em NÃO usa a fórmula (já não parece data pura)', String(geradoEm?.[1]).startsWith('='), false)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
if (falhas > 0) process.exit(1)
