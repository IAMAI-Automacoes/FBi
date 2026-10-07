// Admin da plataforma entra na conta de um cliente com um clique (painel Admin
// → Contas → "Entrar"). Lógica em handler.ts.
//
// Gera um link mágico da conta pela API de admin (NÃO manda e-mail) e o troca
// por uma sessão aqui mesmo, num cliente à parte: trocar no `clienteAdmin`
// faria as consultas seguintes rodarem como o cliente, e não como serviço.
// Registra a sessão em `acessos_admin` antes de devolver.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { entrarNaConta } from './handler.ts'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const corpo = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')

  const r = await entrarNaConta(corpo?.restauranteId, {
    quemPede: async () => {
      const { data } = await db.auth.getUser(jwt)
      const u = data?.user
      return u?.email ? { userId: u.id, email: u.email } : null
    },
    emailsAdmins: async () => {
      const { data } = await db.from('platform_admins').select('email')
      return (data ?? []).map((l: { email: string }) => l.email)
    },
    restaurante: async (id) => {
      const { data } = await db.from('restaurantes').select('auth_user_id, nome_restaurante, excluida_em').eq('id', id).maybeSingle()
      return data ?? null
    },
    emailDoUsuario: async (userId) => {
      const { data } = await db.auth.admin.getUserById(userId)
      return data?.user?.email ?? null
    },
    registrar: async (linha) => {
      const { data, error } = await db.from('acessos_admin').insert(linha).select('id').single()
      if (error) throw error
      return data.id
    },
    abrirSessao: async (email) => {
      const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
      const tokenHash = link?.properties?.hashed_token
      if (error || !tokenHash) throw error ?? new Error('generateLink sem hashed_token')
      const avulso = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error: erroTroca } = await avulso.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      const s = data?.session
      if (erroTroca || !s?.access_token || !s?.refresh_token) throw erroTroca ?? new Error('verifyOtp sem sessão')
      return { access_token: s.access_token, refresh_token: s.refresh_token }
    },
    gravarSessao: async (registroId, sessionId) => {
      const { error } = await db.from('acessos_admin').update({ session_id: sessionId }).eq('id', registroId)
      if (error) throw error
    },
  })
  return json(r.corpo, r.status)
})
