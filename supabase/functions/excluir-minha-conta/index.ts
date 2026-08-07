// Exclusão reversível da PRÓPRIA conta, pedida pelo cliente.
//
// O trigger `proteger_colunas_assinatura` impede o usuário de mexer direto em
// `excluida_em` — por isso a marcação é feita aqui, com service_role, e SÓ na
// linha do próprio usuário (achada pelo id do JWT). É soft-delete: a pessoa
// perde o acesso e não recupera sozinha (nem recriando conta no mesmo email,
// pois o login continua existindo), mas os dados ficam no banco e o admin da
// plataforma pode restaurar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Quem está pedindo (a partir do JWT).
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessão inválida.' }, 401)

    // Soft-delete só da própria conta, e só se ainda não estiver excluída.
    const admin = createClient(url, service)
    const { data, error } = await admin
      .from('restaurantes')
      .update({ excluida_em: new Date().toISOString() })
      .eq('auth_user_id', user.id)
      .is('excluida_em', null)
      .select('id')

    if (error) return json({ error: error.message }, 500)
    if (!data || data.length === 0) {
      return json({ error: 'Conta não encontrada ou já excluída.' }, 404)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
