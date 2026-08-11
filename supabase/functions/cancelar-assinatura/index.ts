import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Cancela a assinatura do restaurante do usuário logado. O dono não pode mexer
// nos campos de assinatura (trigger bloqueia), então isso roda com service_role.
// Regra: se ainda tem data futura, mantém acesso até lá (o job de expiração
// encerra na data); se é infinita ou já vencida, encerra na hora.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const jwt = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)

    const { data: rest, error: restErr } = await admin
      .from('restaurantes')
      .select('id, assinatura_status, assinatura_expira_em')
      .eq('auth_user_id', userData.user.id)
      .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)

    if (rest.assinatura_status !== 'ativa' && rest.assinatura_status !== 'inadimplente') {
      return json({ error: 'Você não tem uma assinatura ativa para cancelar.' }, 400)
    }

    const agora = new Date()
    const expira = rest.assinatura_expira_em ? new Date(rest.assinatura_expira_em) : null
    const temAcessoFuturo = expira !== null && expira.getTime() > agora.getTime()

    if (temAcessoFuturo) {
      // Mantém acesso até a data paga; o job de expiração encerra lá.
      await admin
        .from('restaurantes')
        .update({ assinatura_cancelada_em: agora.toISOString() })
        .eq('id', rest.id)
      return json({ modo: 'agendado', acesso_ate: rest.assinatura_expira_em })
    }

    // Infinita ou já vencida → encerra na hora.
    await admin
      .from('restaurantes')
      .update({ assinatura_status: 'cancelada', assinatura_cancelada_em: agora.toISOString() })
      .eq('id', rest.id)
    return json({ modo: 'encerrada' })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
