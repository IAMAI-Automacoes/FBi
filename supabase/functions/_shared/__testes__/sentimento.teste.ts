import { entraEmInsight, polaridade } from '../sentimento.ts'
import { avaliarGravidade } from '../gravidade.ts'
import { agruparEmAssuntos, chaveDoAssunto, type PontoBruto } from '../assuntos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// Polaridade: os 5 valores do n8n e as grafias antigas do banco
// ---------------------------------------------------------------------------
{
  const casos: Array<[string | null, string]> = [
    ['Positivo', 'pos'], ['positivo', 'pos'],
    ['Negativo', 'neg'], ['negativo', 'neg'],
    ['Positivo e Negativo', 'neg'],
    ['Sugestão', 'neg'], ['sugestao', 'neg'], ['SUGESTÃO', 'neg'],
    ['Neutro', 'neutro'], ['neutro', 'neutro'],
    ['Positivo e Neutro', 'pos'], ['Negativo e Neutro', 'neg'],
    [null, 'neutro'], ['', 'neutro'], ['Indefinido', 'neutro'],
  ]
  for (const [valor, esperado] of casos) {
    ok(`polaridade(${JSON.stringify(valor)}) = ${esperado}`, polaridade(valor) === esperado, polaridade(valor))
  }
  ok('Neutro não entra em insight', !entraEmInsight('Neutro'))
  ok('Sugestão entra em insight', entraEmInsight('Sugestão'))
  ok('Positivo entra em insight', entraEmInsight('Positivo'))
}

// ---------------------------------------------------------------------------
// Gravidade: sugestão é melhoria (1), nunca queixa (2) nem urgência
// ---------------------------------------------------------------------------
{
  ok('sugestão sem léxico → G1', avaliarGravidade('Podiam ter opção vegana no cardápio', 'Sugestão').G === 1)
  ok('negativo sem léxico → G2', avaliarGravidade('A mesa balançava muito', 'Negativo').G === 2)
  ok('neutro → G0', avaliarGravidade('O ambiente foi razoável', 'Neutro').G === 0)
  ok('sugestão com léxico grave continua grave', avaliarGravidade('Tinha uma barata, sugiro dedetizar', 'Sugestão').G >= 3)
}

// ---------------------------------------------------------------------------
// Assuntos: sugestão vai para o balde da queixa; neutro fica de fora
// ---------------------------------------------------------------------------
{
  let seq = 0
  const ponto = (p: Partial<PontoBruto> & { texto_original: string; sentimento: string }): PontoBruto => ({
    id: ++seq, resumo: null, categoria: 'Cardápio/Variedade', origem_id: `o-${seq}`, tema_id: 'tema-x',
    created_at: '2026-10-04T10:00:00Z', ...p,
  })
  ok('chave da sugestão é |neg', chaveDoAssunto({ tema_id: 't', categoria: null, sentimento: 'Sugestão' }) === 'tema:t|neg')
  const assuntos = agruparEmAssuntos([
    ponto({ texto_original: 'Podiam ter opção vegana', sentimento: 'Sugestão' }),
    ponto({ texto_original: 'Faltou opção vegetariana', sentimento: 'Negativo' }),
    ponto({ texto_original: 'O cardápio é ok', sentimento: 'Neutro' }),
    ponto({ texto_original: 'Cardápio variado', sentimento: 'Positivo' }),
  ], { agora: new Date('2026-10-04T12:00:00Z') })
  const neg = assuntos.find((a) => a.chave === 'tema:tema-x|neg')
  const pos = assuntos.find((a) => a.chave === 'tema:tema-x|pos')
  ok('sugestão + queixa no mesmo assunto', neg?.pontos.length === 2, String(neg?.pontos.length))
  ok('elogio separado', pos?.pontos.length === 1, String(pos?.pontos.length))
  ok('neutro não aparece em assunto nenhum', !assuntos.some((a) => a.pontos.some((p) => p.sentimento === 'Neutro')))
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`)
  process.exit(1)
}
console.log('\nsentimento: tudo certo')
