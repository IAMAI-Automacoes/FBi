/**
 * Testes de _shared/publico.ts (cliente x equipe no mesmo motor).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/publico.teste.ts
 */
import { readFileSync } from 'node:fs'
import {
  categoriaDaEquipe, CATEGORIAS_EQUIPE, colunaDaUltimaAnalise, NOTA_EQUIPE, promptDoPublico, publicoDe, publicoDoPedido, PUBLICOS,
} from '../publico.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

ok('só "equipe" é equipe; todo o resto (inclusive vazio) é cliente', publicoDe('equipe') === 'equipe' && publicoDe(' Equipe ') === 'equipe'
  && publicoDe('cliente') === 'cliente' && publicoDe(null) === 'cliente' && publicoDe(undefined) === 'cliente' && publicoDe('admin') === 'cliente')
ok('os dois públicos, cliente primeiro', PUBLICOS.join() === 'cliente,equipe')
ok('público do pedido: o corpo manda; sem corpo vale o cabeçalho', publicoDoPedido({ publico: 'equipe' }) === 'equipe'
  && publicoDoPedido({}, 'equipe') === 'equipe' && publicoDoPedido({ publico: 'cliente' }, 'equipe') === 'cliente' && publicoDoPedido(null) === 'cliente')

const base = 'Você agrupa feedbacks de clientes de restaurante.'
ok('prompt do cliente sai igual ao de sempre', promptDoPublico(base, 'cliente') === base)
const daEquipe = promptDoPublico(base, 'equipe')
ok('prompt da equipe: a nota vai na frente e o treinamento continua inteiro', daEquipe.startsWith(NOTA_EQUIPE) && daEquipe.endsWith(base))
ok('a nota diz quem escreveu, troca as categorias e protege a identidade', /FUNCIONÁRIO/.test(NOTA_EQUIPE) && CATEGORIAS_EQUIPE.every((c) => NOTA_EQUIPE.includes(`"${c}"`))
  && /Nunca escreva nome/.test(NOTA_EQUIPE) && /não vá embora/.test(NOTA_EQUIPE))
ok('a nota não tem {variável} (não briga com os placeholders dos prompts)', !/\{\w+\}/.test(NOTA_EQUIPE))

ok('categoria da equipe: grafia certa, sem acento ou caixa; fora da lista vira Outros', categoriaDaEquipe('salario e beneficios') === 'Salário e benefícios'
  && categoriaDaEquipe('ESCALA E HORÁRIOS') === 'Escala e horários' && categoriaDaEquipe('Comida') === 'Outros' && categoriaDaEquipe(null) === 'Outros')
ok('12 categorias, com Outros no fim', CATEGORIAS_EQUIPE.length === 12 && CATEGORIAS_EQUIPE[11] === 'Outros')
ok('cada público tem o seu marco da última análise', colunaDaUltimaAnalise('cliente') === 'ultima_analise_insights' && colunaDaUltimaAnalise('equipe') === 'ultima_analise_insights_equipe')

// As funções de IA usam a chave de serviço (passam por cima da RLS): cada busca
// nas tabelas do motor precisa do filtro de público escrito no código.
const funcoes = ['classificar-feedback', 'vincular-feedback', 'gerar-insights', 'sugerir-acoes', 'categorizar-acao', 'gerar-plano-acao']
const raiz = new URL('../../', import.meta.url)
for (const f of funcoes) {
  const codigo = readFileSync(new URL(`${f}/index.ts`, raiz), 'utf8').replace(/\r\n/g, '\n')
  ok(`${f}: usa o público`, codigo.includes("from '../_shared/publico.ts'") && codigo.includes('promptDoPublico('))
  // Toda busca por restaurante em insights, ações, temas e feedbacks livres leva o público junto.
  // (Busca por `id` não precisa: a linha achada já diz de que público é.)
  const semFiltro: string[] = []
  for (const m of codigo.matchAll(/\.from\('(insights|acoes_operacionais|feedback_temas|feedbacks_livres)'\)/g)) {
    const consulta = codigo.slice(m.index, m.index + 600).split(/\n\s*\n|\n\s*(?:const|let|if|return|await) /)[0]
    if (!consulta.includes(".eq('restaurante_id'") || consulta.includes(".eq('id',")) continue
    if (!consulta.includes("'publico'")) semFiltro.push(`${m[1]}: ${consulta.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  ok(`${f}: nenhuma busca por restaurante sem o filtro de público`, semFiltro.length === 0, semFiltro)
  // Todo prompt montado passa pela nota do público.
  const montados = (codigo.match(/montarPrompt\(/g) ?? []).length
  const comNota = (codigo.match(/promptDoPublico\(montarPrompt\(/g) ?? []).length
  ok(`${f}: todo prompt passa por promptDoPublico (${comNota}/${montados})`, montados > 0 && montados === comNota)
}
const vincular = readFileSync(new URL('vincular-feedback/index.ts', raiz), 'utf8')
ok('vincular-feedback: a equipe não dispara o alerta urgente (ele leva o telefone de quem escreveu)',
  /publico === 'equipe'\s*\?\s*\{ urgente: false/.test(vincular) && /p_publico: publico/.test(vincular) && /force: false, publico/.test(vincular))
const insights = readFileSync(new URL('gerar-insights/index.ts', raiz), 'utf8')
ok('gerar-insights: a rodada, o marco e o insight novo são do público pedido', /p_publico: publico/.test(insights) && insights.includes('[colunaDaUltimaAnalise(publico)]')
  && /restaurante_id: restauranteId,\s*publico,\s*prioridade/.test(insights) && /Disponivel so para o admin/.test(insights))
const banner = readFileSync(new URL('atualizar-banner/index.ts', raiz), 'utf8')
ok('banner da Visão Geral: só feedback de cliente', (banner.match(/\.eq\('publico', 'cliente'\)/g) ?? []).length === 2)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncliente x equipe: tudo certo')
process.exit(falhas ? 1 : 0)
