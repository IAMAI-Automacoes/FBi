/**
 * Testes do painel do EasyFeed Influencers (as contas no formato da Visão Geral,
 * as pautas) e do valor em reais do admin.
 *   node --experimental-strip-types src/lib/__testes__/painel-influencers.teste.ts
 */
import {
  categoriasDoGrafico, formatarReais, ideiasDePauta, kpisDoPainel, lerValorEmReais, pct, periodoDoPainel,
  rotuloBonito, sentimentoGeral, serieDoGrafico, temasParaLista, type DadosPainel,
} from '../painel-influencers.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const base: DadosPainel = {
  periodo: { dias: 30 },
  culinaria: null,
  culinarias: [],
  totais: { pontos: 84, reclamacoes: 45, elogios: 27, sugestoes: 6, neutros: 6, pontos_anterior: 126 },
  totais_anterior: { pontos: 126, reclamacoes: 89, elogios: 37, sugestoes: 0, neutros: 0 },
  categorias: [
    { nome: 'Comida', reclamacoes: 18, elogios: 12, sugestoes: 1, neutros: 0, total: 31, total_anterior: 40 },
    { nome: 'Tempo de Espera', reclamacoes: 9, elogios: 0, sugestoes: 0, neutros: 0, total: 9, total_anterior: 4 },
  ],
  temas: [
    { tipo: 'reclamacao', rotulo: 'comida fria', mencoes: 8, mencoes_anterior: 3, comum: true },
    { tipo: 'reclamacao', rotulo: 'banheiro sujo', mencoes: 5, mencoes_anterior: 5, comum: true },
    { tipo: 'elogio', rotulo: 'Comida saborosa', mencoes: 6, mencoes_anterior: 3, comum: true },
    { tipo: 'sugestao', rotulo: 'opcao vegana', mencoes: 2, mencoes_anterior: 0, comum: false },
  ],
  em_alta: [
    { tipo: 'reclamacao', rotulo: 'demora na entrega', mencoes: 4, mencoes_anterior: 1, comum: false },
    { tipo: 'reclamacao', rotulo: 'musica alta', mencoes: 7, mencoes_anterior: 3, comum: false },
  ],
  frases: [],
  evolucao: {
    intervalo: 'dia',
    pontos: [
      { inicio: '2026-10-06', reclamacoes: 0, elogios: 0, neutros: 0, sugestoes: 0 },
      { inicio: '2026-10-07', reclamacoes: 1, elogios: 2, neutros: 1, sugestoes: 3 },
    ],
  },
}

ok('rotulo com a primeira letra maiúscula', rotuloBonito(' comida fria ') === 'Comida fria' && rotuloBonito('') === '')
ok('porcentagem', pct(18, 45) === 40 && pct(1, 0) === 0)
ok('período dos componentes da Visão Geral', periodoDoPainel(7) === '7d' && periodoDoPainel(30) === '30d' && periodoDoPainel(90) === '90d')

// ── Mesma conta da Visão Geral ──
ok('sentimento: elogio 100, neutro 50, reclamação 0, sem as sugestões', sentimentoGeral({ elogios: 27, neutros: 6, reclamacoes: 45 }) === 38)
ok('sentimento sem avaliação: nulo (o gráfico liga por cima)', sentimentoGeral({ elogios: 0, neutros: 0, reclamacoes: 0 }) === null)

const k = kpisDoPainel(base)
ok('total e tendência em % com base confiável', k.totalFeedbacks === 84 && k.totalTrend === '-33%' && k.prevConfiavel === true, k)
ok('sentimento geral e variação em pontos', k.sentiment === 38 && k.prevSentiment === 29 && k.sentimentTrend === '+9 pts', k)
ok('divisão das avaliações em %', k.positivePercent === 32 && k.negativePercent === 54 && k.neutralPercent === 7 && k.suggestionPercent === 7)
const poucoAntes = kpisDoPainel({ ...base, totais_anterior: { pontos: 1, reclamacoes: 1, elogios: 0, sugestoes: 0, neutros: 0 } })
ok('período anterior com menos de 3: sem comparação confiável (nada de "+8300%")', poucoAntes.prevConfiavel === false && poucoAntes.prevTotal === 1)
const nadaAntes = kpisDoPainel({ ...base, totais_anterior: { pontos: 0, reclamacoes: 0, elogios: 0, sugestoes: 0, neutros: 0 } })
ok('sem nada antes: "novo"', nadaAntes.hasPrevData === false && nadaAntes.totalTrend === 'novo' && nadaAntes.sentimentTrend === 'novo')

const serie = serieDoGrafico(base)
ok('gráfico de 30 dias com rótulo "d MMM" (como a Visão Geral)', serie[1].date === '7 out', serie)
ok('dia sem avaliação fica nulo; o dia com avaliação tem a nota e os números', serie[0].sentiment === null && serie[0].avaliacoes === 0
  && serie[1].sentiment === 63 && serie[1].avaliacoes === 4 && serie[1].positivos === 2 && serie[1].negativos === 1 && serie[1].sugestoes === 3, serie)
ok('7 dias: rótulo do dia da semana, igual ao da Visão Geral', serieDoGrafico({ ...base, periodo: { dias: 7 } })[1].date === 'quarta')
ok('90 dias: rótulo do mês', serieDoGrafico({ ...base, periodo: { dias: 90 }, evolucao: { intervalo: 'mes', pontos: [{ inicio: '2026-09-01', reclamacoes: 1, elogios: 1, neutros: 0, sugestoes: 0 }] } })[0].date === 'set')

const cats = categoriasDoGrafico(base)
ok('categorias do gráfico com o nº de reclamações', cats[0].name === 'Comida' && cats[0].negativeCount === 18 && cats[1].negativeCount === 9)

const temas = temasParaLista(base)
ok('temas no formato da lista, com o rótulo bonito e a quantidade', temas[0].rotulo === 'Comida fria' && temas[0].quantidade === 8 && temas[0].tipo === 'reclamacao' && new Set(temas.map((t) => t.id)).size === temas.length)

// ── Pautas ──
const pautas = ideiasDePauta(base)
ok('pauta do assunto que lidera as reclamações (Comida, 40%)', pautas[0].titulo.includes('cozinha') && pautas[0].porque.startsWith('40% das reclamações'), pautas[0])
ok('pauta da reclamação mais citada, com "em mais de um restaurante"', pautas.some((p) => p.titulo.startsWith('“Comida fria”') && p.porque.includes('8 vezes') && p.porque.includes('mais de um restaurante')))
ok('pauta do elogio', pautas.some((p) => p.titulo.includes('“comida saborosa”')))
ok('pauta da sugestão', pautas.some((p) => p.titulo.includes('“opcao vegana”') && p.porque.includes('2 vezes')))
ok('"está crescendo" só com 3+ menções antes: pula o de 1 para 4 e usa o de 3 para 7',
  pautas.some((p) => p.titulo === 'Está crescendo: “musica alta”' && p.porque.includes('de 3 para 7')) && !pautas.some((p) => p.titulo.includes('demora na entrega')), pautas.map((p) => p.titulo))
ok('nenhum título repetido e nada de travessão', new Set(pautas.map((p) => p.titulo)).size === pautas.length && !pautas.some((p) => /—/.test(p.titulo + p.porque)))

const vazio = ideiasDePauta({ ...base, totais: { ...base.totais, pontos: 0, reclamacoes: 0 }, categorias: [], temas: [], em_alta: [] })
ok('sem dados: nenhuma pauta (a tela mostra o vazio)', vazio.length === 0)
const soOutros = ideiasDePauta({ ...base, categorias: [{ nome: 'Outros', reclamacoes: 5, elogios: 0, sugestoes: 0, neutros: 0, total: 5, total_anterior: 0 }], temas: [], em_alta: [] })
ok('assunto "Outros" não vira pauta genérica', soOutros.length === 0)
const altaRepetida = ideiasDePauta({ ...base, em_alta: [{ ...base.temas[0], mencoes_anterior: 3 }] })
ok('o que está crescendo não repete a reclamação já sugerida', altaRepetida.filter((p) => p.titulo.toLowerCase().includes('comida fria')).length === 1)

// ── Valor em reais (admin) ──
ok('valor: vírgula, ponto, R$ e espaços', lerValorEmReais('49,90') === 49.9 && lerValorEmReais('49.90') === 49.9 && lerValorEmReais('R$ 1.200,50') === 1200.5 && lerValorEmReais(' 30 ') === 30)
ok('valor vazio = não definido; texto ou negativo = inválido', lerValorEmReais('') === null && Number.isNaN(lerValorEmReais('abc')) && Number.isNaN(lerValorEmReais('-5')))
ok('formata em reais', formatarReais(49.9).replace(/\s/g, ' ') === 'R$ 49,90')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
