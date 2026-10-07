/**
 * Testes do "Esqueci a senha" (função recuperar-senha), com banco, Supabase e n8n de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/recuperar-senha.teste.ts
 */
import { LIMITE_IP_POR_HORA, normalizarEmail, pedirRecuperacao, type DepsRecuperar } from '../../recuperar-senha/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const AGORA = Date.UTC(2026, 9, 7, 12, 0, 0)
function cenario(over: Partial<DepsRecuperar> & { pedidos?: Array<{ email: string; ip: string; em: number }>; contas?: Record<string, string | null>; n8n?: 'ok' | 'falha' | 'sem' | 'erro'; supabaseEspera?: number } = {}) {
  const pedidos = over.pedidos ?? []
  const feito: string[] = []
  const contas = over.contas ?? { 'dono@restaurante.com': 'Raver Brandi' }
  const deps: DepsRecuperar = {
    ipHash: 'ip-1',
    contarPorEmail: async (email, desde) => pedidos.filter((p) => p.email === email && p.em >= new Date(desde).getTime()).length,
    contarPorIp: async (ip, desde) => pedidos.filter((p) => p.ip === ip && p.em >= new Date(desde).getTime()).length,
    registrar: async (email, ip) => { pedidos.push({ email, ip, em: AGORA }); feito.push(`registrou:${email}`) },
    gerarLink: async (email) => (email in contas ? { link: `https://lixrcruilisncfhfhndo.supabase.co/auth/v1/verify?token=t&type=recovery`, nome: contas[email] } : null),
    enviarN8n: over.n8n === 'sem' ? null : async (p) => {
      feito.push(`n8n:${p.email}:${p.nome}:${p.validadeMinutos}`)
      if (over.n8n === 'erro') throw new Error('rede')
      return over.n8n !== 'falha'
    },
    enviarPeloSupabase: async (email) => {
      // Recusa só a primeira vez (como o Supabase logo depois do link gerado para o n8n).
      if (over.supabaseEspera && !feito.includes('supabase-recusou')) { feito.push('supabase-recusou'); return { esperarSegundos: over.supabaseEspera } }
      feito.push(`supabase:${email}`)
    },
    esperar: async (ms) => { feito.push(`esperou:${ms}`) },
    agora: () => AGORA,
    ...over,
  }
  return { feito, deps, pedidos }
}

ok('e-mail normalizado', normalizarEmail('  Dono@Restaurante.COM ') === 'dono@restaurante.com')
ok('e-mail inválido', normalizarEmail('sem-arroba') === null && normalizarEmail('') === null && normalizarEmail('a@b') === null)

{
  const c = cenario()
  const r = await pedirRecuperacao('Dono@Restaurante.com', c.deps)
  ok('caminho normal: registra e manda pelo n8n com o nome', r.status === 200 && r.corpo.ok === true && c.feito.join() === 'registrou:dono@restaurante.com,n8n:dono@restaurante.com:Raver Brandi:60', c.feito)
}
{
  const c = cenario()
  const r = await pedirRecuperacao('ninguem@x.com', c.deps)
  ok('e-mail sem conta: responde ok e não manda nada (não revela quem tem conta)', r.status === 200 && r.corpo.ok === true && !c.feito.some((f) => f.startsWith('n8n') || f.startsWith('supabase')))
}
{
  const c = cenario()
  const r = await pedirRecuperacao('nao-e-email', c.deps)
  ok('e-mail inválido: 400 sem registrar', r.status === 400 && r.corpo.motivo === 'email_invalido' && c.feito.length === 0)
}
{
  const c = cenario({ pedidos: [{ email: 'dono@restaurante.com', ip: 'outro', em: AGORA - 30_000 }] })
  const r = await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('mesmo e-mail há menos de 1 minuto: ok sem mandar de novo', r.status === 200 && c.feito.length === 0)
}
{
  const c = cenario({ pedidos: [{ email: 'dono@restaurante.com', ip: 'outro', em: AGORA - 90_000 }] })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('mesmo e-mail depois de 1 minuto: manda', c.feito.some((f) => f.startsWith('n8n')))
}
{
  const pedidos = Array.from({ length: LIMITE_IP_POR_HORA }, (_, i) => ({ email: `x${i}@y.com`, ip: 'ip-1', em: AGORA - (i + 1) * 60_000 }))
  const c = cenario({ pedidos })
  const r = await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('5 pedidos na última hora do mesmo IP: 429', r.status === 429 && r.corpo.motivo === 'muitas_tentativas' && c.feito.length === 0)
}
{
  const pedidos = Array.from({ length: LIMITE_IP_POR_HORA }, (_, i) => ({ email: `x${i}@y.com`, ip: 'ip-1', em: AGORA - 2 * 60 * 60_000 }))
  const c = cenario({ pedidos })
  ok('pedidos do IP com mais de 1 hora não contam', (await pedirRecuperacao('dono@restaurante.com', c.deps)).status === 200)
}
{
  const c = cenario({ n8n: 'sem' })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('n8n não configurado: manda pelo Supabase, como antes', c.feito.join() === 'registrou:dono@restaurante.com,supabase:dono@restaurante.com', c.feito)
}
{
  const c = cenario({ n8n: 'falha' })
  const r = await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('n8n respondeu erro: manda pelo Supabase (reserva) e responde ok', r.status === 200 && c.feito.at(-1) === 'supabase:dono@restaurante.com')
}
{
  const c = cenario({ n8n: 'erro' })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('n8n fora do ar (erro de rede): manda pelo Supabase', c.feito.at(-1) === 'supabase:dono@restaurante.com')
}
{
  // O caso real de 07/10: o link gerado para o n8n conta como envio, e o Supabase só deixa outro depois de 1 minuto.
  const segundoPlano: Promise<unknown>[] = []
  let liberar = () => {}
  const c = cenario({ n8n: 'falha', supabaseEspera: 59, emSegundoPlano: (p) => { segundoPlano.push(p) } })
  // Segura a espera até a resposta ter saído.
  c.deps.esperar = (ms) => new Promise<void>((ok) => { liberar = () => { c.feito.push(`esperou:${ms}`); ok() } })
  const r = await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('reserva barrada pelo limite de 1 minuto: responde ok na hora', r.status === 200 && r.corpo.ok === true && segundoPlano.length === 1 && !c.feito.includes('supabase:dono@restaurante.com'), c.feito)
  liberar()
  await Promise.all(segundoPlano)
  ok('...e manda pelo Supabase depois de esperar (59 + 2 s), em segundo plano', c.feito.slice(-2).join() === 'esperou:61000,supabase:dono@restaurante.com', c.feito)
}
{
  const c = cenario({ n8n: 'falha', supabaseEspera: 30 })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('sem segundo plano: espera junto e manda', c.feito.slice(-2).join() === 'esperou:32000,supabase:dono@restaurante.com', c.feito)
}
{
  const c = cenario({ n8n: 'falha' })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('reserva sem limite: manda na hora, sem esperar', !c.feito.some((f) => f.startsWith('esperou')), c.feito)
}
{
  const c = cenario({ gerarLink: async () => { throw new Error('auth fora') } })
  await pedirRecuperacao('dono@restaurante.com', c.deps)
  ok('falha ao gerar o link: manda pelo Supabase', c.feito.at(-1) === 'supabase:dono@restaurante.com' && !c.feito.some((f) => f.startsWith('n8n')))
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
