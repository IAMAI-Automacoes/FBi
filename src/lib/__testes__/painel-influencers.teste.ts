/**
 * Testes do painel do EasyFeed Influencers (pautas e contas) e do valor em reais do admin.
 *   node --experimental-strip-types src/lib/__testes__/painel-influencers.teste.ts
 */
import { formatarReais, ideiasDePauta, lerValorEmReais, pct, rotuloBonito, variacao, type DadosPainel } from '../painel-influencers.ts'

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
  totais: { pontos: 84, reclamacoes: 45, elogios: 27, sugestoes: 6, neutros: 6, pontos_anterior: 125 },
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
  em_alta: [{ tipo: 'reclamacao', rotulo: 'demora na entrega', mencoes: 4, mencoes_anterior: 1, comum: false }],
  frases: [],
  evolucao: { intervalo: 'dia', pontos: [] },
}

ok('rotulo com a primeira letra maiúscula', rotuloBonito(' comida fria ') === 'Comida fria' && rotuloBonito('') === '')
ok('porcentagem', pct(18, 45) === 40 && pct(1, 0) === 0)
ok('variação', variacao(9, 4) === 125 && variacao(2, 4) === -50 && variacao(3, 0) === null)

const pautas = ideiasDePauta(base)
ok('pauta do assunto que lidera as reclamações (Comida, 40%)', pautas[0].titulo.includes('cozinha') && pautas[0].porque.startsWith('40% das reclamações'), pautas[0])
ok('pauta da reclamação mais citada, com "em mais de um restaurante"', pautas.some((p) => p.titulo.startsWith('“Comida fria”') && p.porque.includes('8 vezes') && p.porque.includes('mais de um restaurante')))
ok('pauta do elogio', pautas.some((p) => p.titulo.includes('“comida saborosa”')))
ok('pauta da sugestão', pautas.some((p) => p.titulo.includes('“opcao vegana”') && p.porque.includes('2 vezes')))
ok('pauta do que está crescendo, com antes e depois', pautas.some((p) => p.titulo.includes('“demora na entrega”') && p.porque.includes('de 1 para 4')))
ok('nenhum título repetido e nada de travessão', new Set(pautas.map((p) => p.titulo)).size === pautas.length && !pautas.some((p) => /—/.test(p.titulo + p.porque)))

const vazio = ideiasDePauta({ ...base, totais: { ...base.totais, pontos: 0, reclamacoes: 0 }, categorias: [], temas: [], em_alta: [] })
ok('sem dados: nenhuma pauta (a tela mostra o vazio)', vazio.length === 0)

const soOutros = ideiasDePauta({ ...base, categorias: [{ nome: 'Outros', reclamacoes: 5, elogios: 0, sugestoes: 0, neutros: 0, total: 5, total_anterior: 0 }], temas: [], em_alta: [] })
ok('assunto "Outros" não vira pauta genérica', soOutros.length === 0)

const altaRepetida = ideiasDePauta({ ...base, em_alta: [base.temas[0]] })
ok('o que está crescendo não repete a reclamação já sugerida', altaRepetida.filter((p) => p.titulo.toLowerCase().includes('comida fria')).length === 1)
const altaSegunda = ideiasDePauta({ ...base, em_alta: [base.temas[2], { tipo: 'neutro', rotulo: 'experiencia ok', mencoes: 3, mencoes_anterior: 0, comum: false }, base.em_alta[0]] })
ok('pula o que já virou pauta e o neutro, e usa o próximo que cresceu', altaSegunda.some((p) => p.titulo === 'Está crescendo: “demora na entrega”') && !altaSegunda.some((p) => p.titulo.includes('experiencia ok')), altaSegunda.map((p) => p.titulo))

ok('valor: vírgula, ponto, R$ e espaços', lerValorEmReais('49,90') === 49.9 && lerValorEmReais('49.90') === 49.9 && lerValorEmReais('R$ 1.200,50') === 1200.5 && lerValorEmReais(' 30 ') === 30)
ok('valor vazio = não definido; texto ou negativo = inválido', lerValorEmReais('') === null && Number.isNaN(lerValorEmReais('abc')) && Number.isNaN(lerValorEmReais('-5')))
ok('formata em reais', formatarReais(49.9).replace(/\s/g, ' ') === 'R$ 49,90')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
