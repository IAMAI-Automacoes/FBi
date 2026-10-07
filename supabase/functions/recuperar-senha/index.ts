// "Esqueci a senha" — chamada pela tela /recuperar-senha (sem login: vai com a
// chave pública). Lógica em handler.ts.
//
// Segredos:
//   N8N_RECUPERAR_SENHA          URL do webhook do workflow "EasyFeed - Recuperação de senha"
//   N8N_RECUPERAR_SENHA_SEGREDO  valor do cabeçalho x-easyfeed-segredo (o mesmo da credencial no n8n)
// Sem eles, o e-mail sai pelo Supabase, como antes.

import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { siteUrl } from '../_shared/stripe/config.ts'
import { pedirRecuperacao } from './handler.ts'

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
  const redirectTo = `${await siteUrl(db)}/recuperar-senha`

  const r = await pedirRecuperacao(corpo?.email, {
    ipHash: await sha256(`${segredo}:${ip}`),
    contarPorEmail: async (email, desde) => {
      const { count } = await db.from('recuperacoes_senha').select('id', { count: 'exact', head: true }).eq('email', email).gte('criado_em', desde)
      return count ?? 0
    },
    contarPorIp: async (ipHash, desde) => {
      const { count } = await db.from('recuperacoes_senha').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
      return count ?? 0
    },
    registrar: async (email, ipHash) => {
      await db.from('recuperacoes_senha').insert({ email, ip_hash: ipHash })
    },
    gerarLink: async (email) => {
      const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      if (error) {
        // Sem conta com esse e-mail não é erro para quem pediu (não revela quem tem conta).
        if (error.status === 404 || /not found/i.test(error.message ?? '')) return null
        throw error
      }
      const link = data?.properties?.action_link
      if (!link) throw new Error('generateLink sem action_link')
      const nome = typeof data?.user?.user_metadata?.nome === 'string' ? data.user.user_metadata.nome : null
      return { link, nome }
    },
    enviarN8n: urlN8n && segredo
      ? async (p) => {
        const resp = await fetch(urlN8n, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-easyfeed-segredo': segredo },
          body: JSON.stringify(p),
          signal: AbortSignal.timeout(20_000),
        })
        // O motivo fica no log da função (403 = segredo da credencial do n8n diferente).
        if (!resp.ok) console.error(`recuperar-senha: n8n respondeu ${resp.status}`, (await resp.text().catch(() => '')).slice(0, 300))
        return resp.ok
      }
      : null,
    enviarPeloSupabase: async (email) => {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo })
      if (!error) return
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
        // "For security purposes, you can only request this after 59 seconds."
        return { esperarSegundos: Number(/(\d+)\s*seconds?/.exec(error.message ?? '')?.[1] ?? 60) }
      }
      console.error('recuperar-senha: e-mail padrão do Supabase falhou', error.message)
    },
    emSegundoPlano: typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil
      ? (tarefa) => EdgeRuntime.waitUntil(tarefa)
      : undefined,
  })
  return json(r.corpo, r.status)
})
