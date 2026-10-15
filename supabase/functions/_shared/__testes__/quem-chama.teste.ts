/**
 * Quem pode chamar as funções do motor (supabase/functions/_shared/quem-chama.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/quem-chama.teste.ts
 */
import { podeMexerNaConta, quemChama, quemChamaOMotor, veioDoBanco, type QuemChama } from '../quem-chama.ts'

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

// ── O banco (gatilhos e rotinas) com o segredo ──────────────────────────────
const SEGREDO = 'segredo-dos-gatilhos'
const bancoComSegredo = (valor: string | null, quebrado = false) => {
  const base = banco()
  return {
    ...base,
    from: (tabela: string) => tabela === 'integracao_config'
      ? { select: () => ({ eq: (_c: string, chave: string) => ({ maybeSingle: async () => {
        if (quebrado) throw new Error('banco fora')
        return { data: chave === 'PUSH_TRIGGER_SECRET' && valor != null ? { valor } : null }
      } }) }) }
      : base.from(tabela),
  }
}
const doBanco = (segredo?: string, token = PUBLICA) => new Request('https://x.test/f', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, ...(segredo != null ? { 'x-cron-secret': segredo } : {}) },
})
ok('banco com o segredo certo: passa como servidor', (await veioDoBanco(doBanco(SEGREDO), bancoComSegredo(SEGREDO))) === true)
q = await quemChamaOMotor(doBanco(SEGREDO), bancoComSegredo(SEGREDO), SERVICO)
ok('motor: o banco com o segredo mexe em qualquer conta', q.ok === true && q.servico === true && podeMexerNaConta(q, 999))
ok('segredo errado não passa', (await veioDoBanco(doBanco('outro'), bancoComSegredo(SEGREDO))) === false)
ok('sem o segredo não passa', (await veioDoBanco(doBanco(), bancoComSegredo(SEGREDO))) === false)
ok('segredo vazio no banco não abre nada', (await veioDoBanco(doBanco(''), bancoComSegredo(''))) === false && (await veioDoBanco(doBanco('x'), bancoComSegredo(null))) === false)
ok('banco fora do ar: não passa (e não quebra)', (await veioDoBanco(doBanco(SEGREDO), bancoComSegredo(SEGREDO, true))) === false)
q = await quemChamaOMotor(doBanco('chute'), bancoComSegredo(SEGREDO), SERVICO)
ok('motor: chave pública com segredo errado continua 401', q.ok === false && q.status === 401)
q = await quemChamaOMotor(doBanco(undefined, 'token-do-dono'), bancoComSegredo(SEGREDO), SERVICO)
ok('motor: o dono logado passa e só mexe na conta dele', q.ok === true && podeMexerNaConta(q, 24) && !podeMexerNaConta(q, 11))
q = await quemChamaOMotor(doBanco(undefined, SERVICO), bancoComSegredo(SEGREDO), SERVICO)
ok('motor: a chave de serviço continua passando', q.ok === true && q.servico === true)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nquem chama as funções: tudo certo')
process.exit(falhas ? 1 : 0)
