/**
 * Testes de Admin → Vendedores (src/lib/vendedores.ts).
 *   node --experimental-strip-types src/lib/__testes__/vendedores.teste.ts
 */
import { exemploDaRegra, juntarVendedores, mensalidadeLiquida, problemaDaRegra, REGRA_PADRAO, reais, textoDaRegra } from '../vendedores.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── A regra ──────────────────────────────────────────────────────────────────
ok('padrão: mensalidade cheia na 2ª, depois 15% por 12 meses', REGRA_PADRAO.entradaPct === 100 && REGRA_PADRAO.recorrentePct === 15 && REGRA_PADRAO.recorrenteMeses === 12)
ok('texto do padrão', textoDaRegra(REGRA_PADRAO) === 'A mensalidade líquida inteira quando o indicado paga a 2ª mensalidade, depois 15% de cada mensalidade líquida por 12 meses.', textoDaRegra(REGRA_PADRAO))
ok('texto com outra %', textoDaRegra({ entradaPct: 50, recorrentePct: 10, recorrenteMeses: 1 }) === '50% da mensalidade líquida quando o indicado paga a 2ª mensalidade, depois 10% de cada mensalidade líquida por 1 mês.')
ok('texto sem recorrente', textoDaRegra({ entradaPct: 100, recorrentePct: 15, recorrenteMeses: 0 }) === 'A mensalidade líquida inteira quando o indicado paga a 2ª mensalidade.')
const ex = exemploDaRegra(REGRA_PADRAO, 19700)
ok('exemplo com R$ 197: R$ 197 + 12 × R$ 29,55 = R$ 551,60', ex.entrada === 19700 && ex.porMes === 2955 && ex.total === 55160, ex)
// Mensalidade líquida = recebido − custos de % − custos em R$ (decisão do Caio, 21/10/2026).
const custos = [
  { tipo: 'porcentagem' as const, valor: 6, ativo: true },
  { tipo: 'valor' as const, valor: 20, ativo: true },
  { tipo: 'valor' as const, valor: 99, ativo: false },
]
ok('líquida: R$ 197 − 6% − R$ 20 = R$ 165,18 (custo desligado não conta)', mensalidadeLiquida(19700, custos) === 16518, mensalidadeLiquida(19700, custos))
ok('líquida sem custos = o recebido; nunca negativa', mensalidadeLiquida(19700, []) === 19700 && mensalidadeLiquida(1000, [{ tipo: 'valor', valor: 50, ativo: true }]) === 0)
ok('reais no formato brasileiro', reais(55160) === 'R$ 551,60' && reais(2955) === 'R$ 29,55', [reais(55160), reais(2955)])
ok('regra boa passa', problemaDaRegra(REGRA_PADRAO) === null)
ok('regra fora dos limites não passa', [
  { entradaPct: 101, recorrentePct: 15, recorrenteMeses: 12 },
  { entradaPct: 100, recorrentePct: -1, recorrenteMeses: 12 },
  { entradaPct: 100, recorrentePct: 15, recorrenteMeses: 1.5 },
  { entradaPct: 100, recorrentePct: 15, recorrenteMeses: 121 },
  { entradaPct: Number.NaN, recorrentePct: 15, recorrenteMeses: 12 },
].every((r) => problemaDaRegra(r) !== null))

// ── A lista ──────────────────────────────────────────────────────────────────
const cad = (id: string, nome: string, email: string | null, restaurante_id: number | null = null) => ({ id, nome, email, codigo: id.toUpperCase(), ativo: true, restaurante_id })
const marca = (email: string) => ({ email, temConta: true, nomeRestaurante: 'Demo', ultimaDemoEm: null })
const cadastros = [cad('b', 'Bruno', 'Bruno@x.com'), cad('a', 'Ana', null), cad('p', 'Padaria', 'padaria@x.com', 7)]
const marcas = [marca('bruno@x.com'), marca('carla@x.com')]

const noRest = juntarVendedores(cadastros, marcas, true)
ok('a conta EasyFeed que indica fica de fora', !noRest.some((v) => v.cadastro?.id === 'p'))
ok('cadastro e marca do mesmo e-mail viram um vendedor só (sem caixa)', noRest.filter((v) => v.email?.toLowerCase() === 'bruno@x.com').length === 1 && noRest.find((v) => v.cadastro?.id === 'b')?.demo?.email === 'bruno@x.com')
ok('marca sem cadastro aparece sozinha', noRest.some((v) => v.cadastro === null && v.email === 'carla@x.com'))
ok('em ordem de nome', noRest.map((v) => v.cadastro?.nome ?? v.email).join() === 'Ana,Bruno,carla@x.com', noRest.map((v) => v.cadastro?.nome ?? v.email))
const noRh = juntarVendedores(cadastros, marcas, false)
ok('no RH não há demonstração: só os cadastros', noRh.length === 2 && noRh.every((v) => v.demo === null && v.cadastro))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nvendedores: tudo certo')
if (falhas) process.exit(1)
