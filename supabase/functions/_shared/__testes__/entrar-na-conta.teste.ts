/**
 * Testes do "Entrar" do painel do admin (função entrar-na-conta), com banco e Supabase de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/entrar-na-conta.teste.ts
 */
import { entrarNaConta, idDaSessao, type DepsEntrar } from '../../entrar-na-conta/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// Token no formato do Supabase (só o meio importa aqui).
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = (claims: Record<string, unknown>) => `eyJhbGciOiJIUzI1NiJ9.${b64url(claims)}.assinatura`
const SESSAO = 'a1b2c3d4-0000-4000-8000-000000000001'

function cenario(over: Partial<DepsEntrar> & { quem?: { userId: string; email: string } | null } = {}) {
  const feito: string[] = []
  const restaurantes: Record<number, { auth_user_id: string | null; nome_restaurante: string | null; excluida_em: string | null }> = {
    20: { auth_user_id: 'u-cliente', nome_restaurante: 'Pizzaria Bella', excluida_em: null },
    21: { auth_user_id: 'u-excluida', nome_restaurante: 'Fechou', excluida_em: '2026-09-01T00:00:00Z' },
    12: { auth_user_id: 'u-caio', nome_restaurante: 'Do Caio', excluida_em: null },
    22: { auth_user_id: 'u-sem-email', nome_restaurante: 'Sem e-mail', excluida_em: null },
  }
  const emails: Record<string, string | null> = { 'u-cliente': 'dono@bella.com', 'u-excluida': 'x@y.com', 'u-caio': 'DMCAIO.24@gmail.com', 'u-sem-email': null }
  const deps: DepsEntrar = {
    quemPede: async () => ('quem' in over ? over.quem! : { userId: 'u-raver', email: 'raverbrandi@gmail.com' }),
    emailsAdmins: async () => ['raverbrandi@gmail.com', 'dmcaio.24@gmail.com'],
    restaurante: async (id) => restaurantes[id] ?? null,
    emailDoUsuario: async (id) => emails[id] ?? null,
    registrar: async (r) => { feito.push(`registrou:${r.admin_email}:${r.alvo_user_id}:${r.restaurante_id}`); return 'reg-1' },
    abrirSessao: async (email) => { feito.push(`abriu:${email}`); return { access_token: token({ sub: 'u-cliente', session_id: SESSAO }), refresh_token: 'r-1' } },
    gravarSessao: async (reg, sessao) => { feito.push(`gravou:${reg}:${sessao}`) },
    ...over,
  }
  return { feito, deps }
}

ok('id da sessão sai do token', idDaSessao(token({ session_id: SESSAO })) === SESSAO)
ok('token sem session_id: null', idDaSessao(token({ sub: 'x' })) === null && idDaSessao('lixo') === null)

{
  const c = cenario()
  const r = await entrarNaConta(20, c.deps)
  ok('admin entra: registra, abre a sessão e liga uma à outra', r.status === 200 && r.corpo.refresh_token === 'r-1' && r.corpo.email === 'dono@bella.com'
    && c.feito.join() === `registrou:raverbrandi@gmail.com:u-cliente:20,abriu:dono@bella.com,gravou:reg-1:${SESSAO}`, c.feito)
  ok('devolve o nome do restaurante para a barra', r.corpo.nome === 'Pizzaria Bella')
}
{
  const c = cenario({ quem: { userId: 'u-x', email: 'cliente@qualquer.com' } })
  const r = await entrarNaConta(20, c.deps)
  ok('quem não é admin: 403 e nada acontece', r.status === 403 && r.corpo.motivo === 'so_admin' && c.feito.length === 0)
}
{
  const c = cenario({ quem: { userId: 'u-raver', email: 'RaverBrandi@Gmail.com' } })
  ok('admin com e-mail em maiúsculas também entra', (await entrarNaConta(20, c.deps)).status === 200)
}
{
  const c = cenario({ quem: null })
  ok('sem login: 401', (await entrarNaConta(20, c.deps)).status === 401 && c.feito.length === 0)
}
{
  const c = cenario()
  ok('conta não informada: 400', (await entrarNaConta('abc', c.deps)).status === 400 && (await entrarNaConta(undefined, c.deps)).status === 400)
  ok('conta que não existe: 404', (await entrarNaConta(999, c.deps)).status === 404)
  ok('conta excluída: 409 (restaurar antes)', (await entrarNaConta(21, c.deps)).corpo.motivo === 'conta_excluida')
  ok('conta de outro admin: 409', (await entrarNaConta(12, c.deps)).corpo.motivo === 'conta_de_admin')
  ok('conta sem e-mail: 409', (await entrarNaConta(22, c.deps)).corpo.motivo === 'sem_email')
  ok('nenhuma recusa abriu sessão', !c.feito.some((f) => f.startsWith('abriu')))
}
{
  const c = cenario({ abrirSessao: async () => ({ access_token: token({ sub: 'u' }), refresh_token: 'r' }) })
  const r = await entrarNaConta(20, c.deps)
  ok('sessão sem id: não entrega o login (não daria para marcar como do admin)', r.status === 500 && !('access_token' in r.corpo))
}
{
  const c = cenario({ abrirSessao: async () => { throw new Error('auth fora') } })
  const r = await entrarNaConta(20, c.deps)
  ok('falha ao abrir a sessão: 500 com mensagem', r.status === 500 && typeof r.corpo.error === 'string')
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
