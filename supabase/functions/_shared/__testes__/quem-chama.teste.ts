/**
 * Quem pode chamar as funções do motor (supabase/functions/_shared/quem-chama.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/quem-chama.teste.ts
 */
import { podeMexerNaConta, quemChama, type QuemChama } from '../quem-chama.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const SERVICO = 'chave-de-servico-do-projeto'
const PUBLICA = 'chave-publica-do-site'
const USUARIOS: Record<string, { id: string; email: string }> = {
  'token-do-dono': { id: 'u-dono', email: 'Dono@Camelo.com' },
  'token-do-admin': { id: 'u-admin', email: 'Admin@EasyFeed.com' },
  'token-sem-conta': { id: 'u-novo', email: 'novo@exemplo.com' },
}
const RESTAURANTES: Record<string, number> = { 'u-dono': 24, 'u-admin': 11 }
const banco = (quebrado = false) => ({
  auth: {
    getUser: async (jwt: string) => {
      if (quebrado) throw new Error('auth fora')
      // A chave pública é um token do projeto, mas não é de ninguém.
      return USUARIOS[jwt] ? { data: { user: USUARIOS[jwt] }, error: null } : { data: { user: null }, error: { message: 'invalid claim: missing sub claim' } }
    },
  },
  from: (tabela: string) => tabela === 'restaurantes'
    ? { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: RESTAURANTES[id] ? { id: RESTAURANTES[id] } : null }) }) }) }
    : { select: async () => ({ data: [{ email: 'admin@easyfeed.com' }] }) },
})
const pedido = (token?: string) => new Request('https://x.test/f', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
const chama = (token?: string, db = banco()) => quemChama(pedido(token), db, SERVICO)

let q: QuemChama = await chama()
ok('sem token: 401', q.ok === false && q.status === 401)
q = await chama(PUBLICA)
ok('a chave pública do site sozinha: 401 (era a brecha)', q.ok === false && q.status === 401)
ok('e não mexe em conta nenhuma', !podeMexerNaConta(q, 24) && !podeMexerNaConta(q, 11))
q = await chama('token-inventado')
ok('token que não é de ninguém: 401', q.ok === false && q.status === 401)
q = await chama('token-do-dono', banco(true))
ok('login fora do ar: não deixa passar', q.ok === false && q.status === 401)

q = await chama(SERVICO)
ok('o próprio servidor (chave de serviço): passa em qualquer conta', q.ok === true && q.servico === true && podeMexerNaConta(q, 24) && podeMexerNaConta(q, 999))
ok('sem a chave de serviço no ambiente, nada vira "servidor" por engano', (await quemChama(pedido(''), banco(), '')).ok === false
  && (await quemChama(pedido(PUBLICA), banco(), '')).ok === false)

q = await chama('token-do-dono')
ok('dono logado: é reconhecido com a conta dele', q.ok === true && q.servico === false && q.restauranteId === 24 && !q.ehAdmin && q.email === 'dono@camelo.com')
ok('dono mexe na própria conta', podeMexerNaConta(q, 24) && podeMexerNaConta(q, '24'))
ok('dono NÃO mexe na conta dos outros', !podeMexerNaConta(q, 11) && !podeMexerNaConta(q, 25) && !podeMexerNaConta(q, null) && !podeMexerNaConta(q, undefined) && !podeMexerNaConta(q, 'abc'))

q = await chama('token-do-admin')
ok('admin da plataforma (e-mail sem diferenciar maiúscula): passa em qualquer conta', q.ok === true && q.servico === false && q.ehAdmin && podeMexerNaConta(q, 24) && podeMexerNaConta(q, 11))

q = await chama('token-sem-conta')
ok('logado mas sem conta: não mexe em nenhuma', q.ok === true && q.servico === false && q.restauranteId === null && !podeMexerNaConta(q, 24) && !podeMexerNaConta(q, null))

ok('"bearer" minúsculo e espaço sobrando também valem', (await quemChama(new Request('https://x.test/f', { headers: { Authorization: 'bearer   token-do-dono  ' } }), banco(), SERVICO)).ok === true)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nquem chama as funções: tudo certo')
process.exit(falhas ? 1 : 0)
