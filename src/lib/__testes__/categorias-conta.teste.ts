/**
 * Testes das categorias editáveis (src/lib/categorias-conta.ts).
 *   node --experimental-strip-types src/lib/__testes__/categorias-conta.teste.ts
 */
import {
  arrumarCategorias, categoriasMudaram, ehOutros, lerCategorias, limparNomeDaCategoria, MAX_CATEGORIAS, nomesAtivos, problemaDasCategorias,
  RECUSA_DAS_CATEGORIAS, type CategoriaDaConta,
} from '../categorias-conta.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const c = (nome: string, extra: Partial<CategoriaDaConta> = {}): CategoriaDaConta => ({ nome, descricao: '', cor: null, icone: null, ativa: true, ...extra })

// ── Problemas ────────────────────────────────────────────────────────────────
ok('lista boa: sem problema', problemaDasCategorias([c('Pratos'), c('Drinks'), c('Outros')]) === null)
ok('vazia', problemaDasCategorias([])?.motivo === 'vazia')
ok('demais', problemaDasCategorias(Array.from({ length: MAX_CATEGORIAS + 1 }, (_, i) => c(`C${i}`)))?.motivo === 'demais')
ok('nome vazio (só espaço também)', problemaDasCategorias([c('  ')])?.motivo === 'nome_vazio')
ok('nome longo', problemaDasCategorias([c('x'.repeat(41))])?.motivo === 'nome_longo' && problemaDasCategorias([c('x'.repeat(40))]) === null)
ok('repetida, sem ligar para maiúscula nem espaço', problemaDasCategorias([c('Pratos'), c('  pratos ')])?.motivo === 'repetida')
ok('descrição longa', problemaDasCategorias([c('A', { descricao: 'd'.repeat(201) })])?.motivo === 'descricao_longa')
ok('toda recusa tem texto (as do banco também)', ['vazia', 'demais', 'nome_vazio', 'nome_longo', 'repetida', 'descricao_longa', 'sem_conta'].every((m) => RECUSA_DAS_CATEGORIAS[m]))

// ── Arrumar ──────────────────────────────────────────────────────────────────
const arrumada = arrumarCategorias([c('Outros', { ativa: false, descricao: 'resto' }), c('  Pratos   da casa '), c('Drinks', { ativa: false })])
ok('"Outros" vai para o fim e fica ligada, com a descrição que tinha', arrumada.map((x) => x.nome).join() === 'Pratos da casa,Drinks,Outros' && arrumada[2].ativa && arrumada[2].descricao === 'resto', arrumada)
const semOutros = arrumarCategorias([c('Pratos')])
ok('sem "Outros": entra sozinha, com descrição e a cor dela', semOutros.length === 2 && semOutros[1].nome === 'Outros' && semOutros[1].cor === 'Outros' && !!semOutros[1].descricao)
ok('"outros" minúsculo conta como Outros', ehOutros(' outros ') && arrumarCategorias([c('outros'), c('A')]).map((x) => x.nome).join() === 'A,Outros')
ok('nomes limpos', limparNomeDaCategoria('  Tempo   de  espera ') === 'Tempo de espera')

// ── O que a IA e os filtros usam ────────────────────────────────────────────
ok('só as ligadas', nomesAtivos([c('A'), c('B', { ativa: false }), c('Outros')]).join() === 'A,Outros')

// ── Mudou? ───────────────────────────────────────────────────────────────────
const base = [c('A', { descricao: 'x' }), c('Outros')]
ok('igual não mudou (espaço sobrando não conta)', !categoriasMudaram(base, [c(' A ', { descricao: 'x ' }), c('Outros')]))
ok('renomear, descrever, cor, ícone, ligar e a ordem contam', [
  [c('B', { descricao: 'x' }), c('Outros')],
  [c('A', { descricao: 'y' }), c('Outros')],
  [c('A', { descricao: 'x', cor: 'Comida' }), c('Outros')],
  [c('A', { descricao: 'x', icone: 'wine' }), c('Outros')],
  [c('A', { descricao: 'x', ativa: false }), c('Outros')],
  [c('Outros'), c('A', { descricao: 'x' })],
].every((l) => categoriasMudaram(base, l)))

// ── Ler do banco ─────────────────────────────────────────────────────────────
const lidas = lerCategorias([{ nome: ' Pratos ', descricao: 'd', cor: 'Comida', icone: null, ativa: true }, { nome: 'X', ativa: false }, { nome: '' }, null, 'lixo'])
ok('lê o que veio do banco e descarta o que não serve', lidas.length === 2 && lidas[0].nome === 'Pratos' && lidas[0].cor === 'Comida' && lidas[1].ativa === false && lidas[1].descricao === '', lidas)
ok('não é lista: vazio', lerCategorias(null).length === 0 && lerCategorias({}).length === 0)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncategorias da conta: tudo certo')
if (falhas) process.exit(1)
