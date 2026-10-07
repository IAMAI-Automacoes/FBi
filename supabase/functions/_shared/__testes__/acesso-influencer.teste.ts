/**
 * Testes da entrada do EasyFeed Influencers (função acesso-influencer), com banco, Supabase e n8n de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/acesso-influencer.teste.ts
 */
import { acessoInfluencer, LIMITE_CONSULTAS_POR_HORA, LIMITE_LINKS_IP_POR_HORA, type DepsAcesso } from '../../acesso-influencer/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const AGORA = Date.UTC(2026, 9, 8, 12, 0, 0)

function cenario(over: Partial<DepsAcesso> & {
  lista?: Record<string, string | null>
  contas?: Record<string, { userId: string; temSenha: boolean }>
  consultas?: number
  links?: Array<{ email: string; ip: string; em: number }>
  n8n?: 'ok' | 'falha' | 'sem'
} = {}) {
  const feito: string[] = []
  const lista = over.lista ?? { 'ana@influencer.com': 'Ana', 'novo@influencer.com': null }
  const contas = over.contas ?? { 'ana@influencer.com': { userId: 'u-ana', temSenha: true } }
  const links = over.links ?? []
  let consultas = over.consultas ?? 0
  const deps: DepsAcesso = {
    ipHash: 'ip-1',
    contarConsultas: async () => consultas,
    registrarConsulta: async () => { consultas++ },
    naLista: async (email) => (email in lista ? { nome: lista[email] } : null),
    conta: async (email) => contas[email] ?? { userId: null, temSenha: false },
    criarUsuario: async (email) => { feito.push(`criou:${email}`); return `u-${email}` },
    ligarUsuario: async (email, id) => { feito.push(`ligou:${email}:${id}`) },
    contarLinksPorEmail: async (email, desde) => links.filter((l) => l.email === email && l.em >= new Date(desde).getTime()).length,
    contarLinksPorIp: async (ip, desde) => links.filter((l) => l.ip === ip && l.em >= new Date(desde).getTime()).length,
    registrarLink: async (email, ip) => { links.push({ email, ip, em: AGORA }) },
    gerarLink: async (email) => `https://lixrcruilisncfhfhndo.supabase.co/auth/v1/verify?token=t&type=recovery&para=${email}`,
    enviarN8n: over.n8n === 'sem' ? null : async (p) => {
      feito.push(`n8n:${p.email}:${p.tipo}:${p.nome}`)
      return over.n8n !== 'falha'
    },
    enviarPeloSupabase: async (email) => { feito.push(`supabase:${email}`) },
    agora: () => AGORA,
    ...over,
  }
  return { feito, deps }
}

{
  const c = cenario()
  const r = await acessoInfluencer('situacao', 'Fulano@Qualquer.com', c.deps)
  ok('e-mail fora da lista: sem_acesso e nada acontece', r.status === 200 && r.corpo.situacao === 'sem_acesso' && c.feito.length === 0)
}
{
  const c = cenario()
  const r = await acessoInfluencer('situacao', ' ANA@influencer.com ', c.deps)
  ok('na lista e já tem senha: entrar (sem mandar link)', r.corpo.situacao === 'entrar' && c.feito.length === 0)
}
{
  const c = cenario()
  const r = await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('primeiro acesso: cria o usuário, liga à lista e manda o link pelo n8n', r.corpo.situacao === 'link_enviado'
    && c.feito.join() === 'criou:novo@influencer.com,ligou:novo@influencer.com:u-novo@influencer.com,n8n:novo@influencer.com:acesso_influencer:null', c.feito)
}
{
  const c = cenario({ contas: { 'novo@influencer.com': { userId: 'u-velho', temSenha: false } } })
  await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('usuário criado antes mas sem senha: não cria outro, manda o link', !c.feito.some((f) => f.startsWith('criou')) && c.feito.some((f) => f.startsWith('n8n')), c.feito)
}
{
  const c = cenario()
  const r = await acessoInfluencer('esqueci', 'ana@influencer.com', c.deps)
  ok('esqueci a senha (tem conta): manda o link com o nome', r.corpo.situacao === 'link_enviado' && c.feito.at(-1) === 'n8n:ana@influencer.com:acesso_influencer:Ana', c.feito)
}
{
  const c = cenario()
  const r = await acessoInfluencer('esqueci', 'fora@lista.com', c.deps)
  ok('esqueci com e-mail fora da lista: sem_acesso', r.corpo.situacao === 'sem_acesso' && c.feito.length === 0)
}
{
  const c = cenario({ links: [{ email: 'novo@influencer.com', ip: 'outro', em: AGORA - 30_000 }] })
  const r = await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('link pedido há menos de 1 minuto: responde link_enviado sem mandar de novo', r.corpo.situacao === 'link_enviado' && c.feito.length === 0)
}
{
  const links = Array.from({ length: LIMITE_LINKS_IP_POR_HORA }, (_, i) => ({ email: `x${i}@y.com`, ip: 'ip-1', em: AGORA - (i + 1) * 60_000 }))
  const c = cenario({ links })
  const r = await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('5 links na última hora do mesmo IP: 429', r.status === 429 && r.corpo.motivo === 'muitas_tentativas' && c.feito.length === 0)
}
{
  const c = cenario({ consultas: LIMITE_CONSULTAS_POR_HORA })
  const r = await acessoInfluencer('situacao', 'ana@influencer.com', c.deps)
  ok('30 consultas na hora do mesmo IP: 429 (contra varredura de e-mails)', r.status === 429)
}
{
  const c = cenario()
  const r = await acessoInfluencer('situacao', 'nao-e-email', c.deps)
  ok('e-mail inválido: 400', r.status === 400 && r.corpo.motivo === 'email_invalido')
}
{
  const c = cenario({ n8n: 'falha' })
  await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('n8n falhou: manda pelo Supabase', c.feito.at(-1) === 'supabase:novo@influencer.com', c.feito)
}
{
  const c = cenario({ n8n: 'sem' })
  await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('n8n não configurado: manda pelo Supabase', c.feito.at(-1) === 'supabase:novo@influencer.com', c.feito)
}
{
  const c = cenario({ gerarLink: async () => { throw new Error('auth fora') } })
  const r = await acessoInfluencer('situacao', 'novo@influencer.com', c.deps)
  ok('falha ao gerar o link: manda pelo Supabase e responde link_enviado', r.corpo.situacao === 'link_enviado' && c.feito.at(-1) === 'supabase:novo@influencer.com' && !c.feito.some((f) => f.startsWith('n8n')), c.feito)
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
