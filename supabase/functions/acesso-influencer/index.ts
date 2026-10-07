// Entrada do EasyFeed Influencers (/influencers), chamada sem login (chave
// pública). Lógica em handler.ts.
//
// O e-mail sai pelo mesmo workflow do n8n da recuperação de senha
// (N8N_RECUPERAR_SENHA + N8N_RECUPERAR_SENHA_SEGREDO), com tipo
// 'acesso_influencer'. Sem n8n, sai pelo e-mail padrão do Supabase.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { siteUrl } from '../_shared/stripe/config.ts'
import { acessoInfluencer } from './handler.ts'

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const urlN8n = (Deno.env.get('N8N_RECUPERAR_SENHA') ?? '').trim()
  const segredo = (Deno.env.get('N8N_RECUPERAR_SENHA_SEGREDO') ?? '').trim()
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido'
  const redirectTo = `${await siteUrl(db)}/influencers/criar-senha`

  // Consultas de mais de 1 dia não servem para a trava: some com elas.
  await db.from('influencer_consultas').delete().lt('criado_em', new Date(Date.now() - 24 * 60 * 60_000).toISOString())

  const r = await acessoInfluencer(corpo?.acao, corpo?.email, {
    ipHash: await sha256(`influencers:${segredo}:${ip}`),
    contarConsultas: async (ipHash, desde) => {
      const { count } = await db.from('influencer_consultas').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
      return count ?? 0
    },
    registrarConsulta: async (ipHash) => {
      await db.from('influencer_consultas').insert({ ip_hash: ipHash })
    },
    naLista: async (email) => {
      const { data } = await db.from('influenciadores').select('nome').eq('email', email).maybeSingle()
      return data ? { nome: data.nome ?? null } : null
    },
    conta: async (email) => {
      const { data } = await db.rpc('influencer_conta', { p_email: email })
      const linha = Array.isArray(data) ? data[0] : data
      return { userId: linha?.user_id ?? null, temSenha: linha?.tem_senha === true }
    },
    criarUsuario: async (email) => {
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { origem: 'influencers' } })
      if (data?.user?.id) return data.user.id
      // Criado entre a consulta e agora (dois cliques): usa o que já existe.
      const { data: existente } = await db.rpc('influencer_conta', { p_email: email })
      const linha = Array.isArray(existente) ? existente[0] : existente
      if (linha?.user_id) return linha.user_id
      throw error ?? new Error('createUser sem usuário')
    },
    ligarUsuario: async (email, userId) => {
      await db.from('influenciadores').update({ auth_user_id: userId }).eq('email', email).is('auth_user_id', null)
    },
    contarLinksPorEmail: async (email, desde) => {
      const { count } = await db.from('recuperacoes_senha').select('id', { count: 'exact', head: true }).eq('email', email).gte('criado_em', desde)
      return count ?? 0
    },
    contarLinksPorIp: async (ipHash, desde) => {
      const { count } = await db.from('recuperacoes_senha').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
      return count ?? 0
    },
    registrarLink: async (email, ipHash) => {
      await db.from('recuperacoes_senha').insert({ email, ip_hash: ipHash })
    },
    gerarLink: async (email) => {
      const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      const link = data?.properties?.action_link
      if (error || !link) throw error ?? new Error('generateLink sem action_link')
      return link
    },
    enviarN8n: urlN8n && segredo
      ? async (p) => {
        const resp = await fetch(urlN8n, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-easyfeed-segredo': segredo },
          body: JSON.stringify(p),
          signal: AbortSignal.timeout(20_000),
        })
        if (!resp.ok) console.error(`acesso-influencer: n8n respondeu ${resp.status}`, (await resp.text().catch(() => '')).slice(0, 300))
        return resp.ok
      }
      : null,
    enviarPeloSupabase: async (email) => {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo })
      if (!error) return
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
        return { esperarSegundos: Number(/(\d+)\s*seconds?/.exec(error.message ?? '')?.[1] ?? 60) }
      }
      console.error('acesso-influencer: e-mail padrão do Supabase falhou', error.message)
    },
    emSegundoPlano: typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil
      ? (tarefa) => EdgeRuntime.waitUntil(tarefa)
      : undefined,
  })
  return json(r.corpo, r.status)
})
