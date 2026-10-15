/**
 * As categorias da conta nas funções do motor (supabase/functions/_shared/categorias.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/categorias.teste.ts
 */
import { readFileSync } from 'node:fs'
import { categoriasDaConta, categoriasDe, categoriasPadrao } from '../categorias.ts'
import { CATEGORIAS_CLIENTE, CATEGORIAS_EQUIPE } from '../publico.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const pedidos: unknown[] = []
const banco = (resposta: { data?: unknown; error?: unknown } | 'quebra') => ({
  rpc: async (nome: string, args: unknown) => {
    pedidos.push({ nome, args })
    if (resposta === 'quebra') throw new Error('banco fora')
    return { data: resposta.data ?? null, error: resposta.error ?? null }
  },
})

ok('padrão dos clientes: as 14, com Outros no fim', CATEGORIAS_CLIENTE.length === 14 && CATEGORIAS_CLIENTE[13] === 'Outros' && categoriasPadrao('cliente').join() === CATEGORIAS_CLIENTE.join())
ok('padrão da equipe: as 12', categoriasPadrao('equipe').join() === CATEGORIAS_EQUIPE.join())
ok('a lista dos clientes é a mesma do site', (() => {
  const site = readFileSync(new URL('../../../../src/lib/categorias-feedback.ts', import.meta.url), 'utf8')
  const bloco = site.match(/export const CATEGORIAS_FEEDBACK = \[([\s\S]*?)\] as const/)?.[1] ?? ''
  return [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1]).join() === CATEGORIAS_CLIENTE.join()
})())

ok('usa a lista que o banco devolveu', (await categoriasDaConta(banco({ data: { nomes: ['Pratos', 'Drinks', 'Outros'] } }), 24, 'cliente')).join() === 'Pratos,Drinks,Outros')
ok('pede a conta e o público certos', JSON.stringify(pedidos.at(-1)) === JSON.stringify({ nome: 'categorias_da_conta', args: { p_restaurante_id: 24, p_publico: 'cliente' } }))
ok('erro do banco: o padrão do público', (await categoriasDaConta(banco({ error: { message: 'x' } }), 24, 'equipe')).join() === CATEGORIAS_EQUIPE.join())
ok('banco fora do ar: o padrão, sem quebrar', (await categoriasDaConta(banco('quebra'), 24, 'cliente')).join() === CATEGORIAS_CLIENTE.join())
ok('lista vazia ou estranha: o padrão', (await categoriasDaConta(banco({ data: { nomes: [] } }), 24, 'cliente')).length === 14
  && (await categoriasDaConta(banco({ data: 'lixo' }), 24, 'cliente')).length === 14)
const antes = pedidos.length
ok('conta sem id: o padrão, sem perguntar ao banco', (await categoriasDaConta(banco({ data: { nomes: ['X'] } }), 'abc', 'cliente')).length === 14 && pedidos.length === antes)
ok('categoriasDe: a da conta quando tem, senão o padrão', categoriasDe('cliente', ['A', 'Outros']).join() === 'A,Outros' && categoriasDe('equipe', []).length === 12 && categoriasDe('cliente').length === 14)

// As 3 funções que escolhem categoria usam a lista da conta.
const raiz = new URL('../../', import.meta.url)
for (const arquivo of ['gerar-insights/index.ts', 'sugerir-acoes/index.ts', 'categorizar-acao/index.ts']) {
  const codigo = readFileSync(new URL(arquivo, raiz), 'utf8')
  ok(`${arquivo}: busca as categorias da conta e não tem lista fixa própria`, /categoriasDaConta\(db, /.test(codigo) && !/const CATEGORIAS = \[/.test(codigo) && !/'Cardápio\/Variedade'/.test(codigo))
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncategorias no motor: tudo certo')
process.exit(falhas ? 1 : 0)
