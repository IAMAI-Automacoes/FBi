import { montarPrompt, promptOverride } from '../prompts.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const TEMPLATE = 'Analise:\n{feedbacks}\nCategoria: {categoria}'
const VARS = { feedbacks: 'id 1: a comida chegou fria', categoria: 'Comida' }

// ---------------------------------------------------------------------------
// O bug de 2026-08-26: sem sobrescrita no banco, o template voltava CRU.
//
// Em producao `prompts_editaveis` esta vazia, entao ESTE era o caminho de todas
// as chamadas de IA do servidor — e a IA recebia "{feedbacks}" como texto,
// nunca os feedbacks. Nao dava erro: o modelo inventava insights genericos de
// restaurante e o resultado parecia legitimo.
// ---------------------------------------------------------------------------
{
  const semOverride = montarPrompt({}, 'ef_gerar_insights', TEMPLATE, VARS)
  ok(
    'SEM sobrescrita: substitui os placeholders',
    semOverride.includes('a comida chegou fria'),
    semOverride,
  )
  ok(
    'SEM sobrescrita: nao sobra placeholder cru',
    !semOverride.includes('{feedbacks}') && !semOverride.includes('{categoria}'),
    semOverride,
  )
}

{
  const comOverride = montarPrompt(
    { ef_gerar_insights: 'Sobrescrito:\n{feedbacks}' },
    'ef_gerar_insights',
    TEMPLATE,
    VARS,
  )
  ok('COM sobrescrita: usa o texto do admin', comOverride.startsWith('Sobrescrito:'))
  ok('COM sobrescrita: tambem substitui', comOverride.includes('a comida chegou fria'))
}

// ---------------------------------------------------------------------------
// Sobrescrita vazia ou so espaco nao conta como sobrescrita
// ---------------------------------------------------------------------------
{
  ok('override vazio => null', promptOverride({ x: '' }, 'x') === null)
  ok('override so com espaco => null', promptOverride({ x: '   ' }, 'x') === null)
  ok('override valido => devolve', promptOverride({ x: 'texto' }, 'x') === 'texto')
  ok(
    'override vazio cai no padrao E substitui',
    montarPrompt({ ef_x: '  ' }, 'ef_x', TEMPLATE, VARS).includes('a comida chegou fria'),
  )
}

// ---------------------------------------------------------------------------
// Placeholder sem valor correspondente fica como esta (nao vira "undefined")
// ---------------------------------------------------------------------------
{
  const r = montarPrompt({}, 'x', 'Oi {nome}, veja {faltante}', { nome: 'Chef' })
  ok('substitui o que tem', r.includes('Oi Chef'))
  ok('deixa intacto o que nao tem valor', r.includes('{faltante}'), r)
  ok('nunca escreve a palavra undefined', !r.includes('undefined'), r)
}

// ---------------------------------------------------------------------------
// Exemplos de JSON dentro do prompt nao podem ser destruidos pela regex.
// Os prompts reais mostram o formato de saida esperado em JSON.
// ---------------------------------------------------------------------------
{
  const comJson = `Retorne assim:
{
  "insights": [
    { "n": 1, "grupo": 2 }
  ]
}
Dados: {dados}`
  const r = montarPrompt({}, 'x', comJson, { dados: 'X' })
  ok('preserva chave de abertura de objeto', r.includes('{\n  "insights"'), r.slice(0, 40))
  ok('preserva objeto inline com aspas', r.includes('{ "n": 1, "grupo": 2 }'))
  ok('e ainda assim substitui a variavel', r.includes('Dados: X'))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
