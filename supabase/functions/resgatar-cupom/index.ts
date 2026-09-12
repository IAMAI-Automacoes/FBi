// Resgata um cupom de ACESSO: põe a assinatura do restaurante como ativa por
// `dias_validade` dias (ou sem data de fim, quando o campo está vazio).
//
// Não aplica desconto. As colunas `porcentagem_desconto` e `valor_desconto`
// existem na tabela desde o começo e NUNCA foram lidas aqui — o painel do
// admin pedia as duas como obrigatórias, então quem criava um "DESC50 — 50%"
// achava estar dando meio preço e estava dando acesso inteiro. O formulário
// foi alinhado a esta função; as colunas ficaram no banco, sem uso.
//
// Estava publicada só no painel do Supabase, sem fonte no repositório. Este
// arquivo é o que está rodando (versão 3), trazido para cá para que um deploy
// geral não a apague e para que dê para revisar o que ela faz.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
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

    // Quem está resgatando
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    const userId = userData.user.id

    const { data: rest, error: restErr } = await admin
      .from('restaurantes')
      .select('id, assinatura_status')
      .eq('auth_user_id', userId)
      .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)

    const body = await req.json().catch(() => ({}))
    const codigo = String(body.codigo ?? '').trim()
    if (!codigo) return json({ error: 'Informe o código do cupom.' }, 400)

    // Busca o cupom (sem diferenciar maiúscula/minúscula)
    const { data: cupons } = await admin
      .from('cupons')
      .select('*')
      .ilike('cupom', codigo)
      .limit(1)
    const cupom = cupons?.[0]
    if (!cupom || cupom.ativo !== true) return json({ error: 'Cupom inválido ou inativo.' }, 404)

    // Passou do último dia em que podia ser resgatado?
    if (cupom.data_expiracao) {
      const hoje = new Date().toISOString().slice(0, 10)
      if (String(cupom.data_expiracao) < hoje) return json({ error: 'Este cupom expirou.' }, 410)
    }

    // Esgotado? (vezes_uso_maximo nulo = ilimitado)
    const max = cupom.vezes_uso_maximo
    const usado = Number(cupom.vezes_usado ?? 0)
    if (max != null && usado >= Number(max)) return json({ error: 'Este cupom já atingiu o limite de usos.' }, 410)

    // Reserva o uso de forma atômica (lock otimista pelo valor atual): o
    // `.eq('vezes_usado', usado)` só deixa passar quem leu o valor mais
    // recente, então dois resgates simultâneos não gastam o mesmo uso.
    const { data: claim, error: claimErr } = await admin
      .from('cupons')
      .update({ vezes_usado: usado + 1 })
      .eq('id', cupom.id)
      .eq('vezes_usado', usado)
      .select('id')
    if (claimErr) return json({ error: claimErr.message }, 500)
    if (!claim?.length) return json({ error: 'Cupom em uso agora, tente novamente.' }, 409)

    // Quantos dias de acesso o cupom libera (vazio/0 = sem expiração)
    const dias = parseInt(String(cupom.dias_validade ?? '').replace(/\D/g, ''), 10)
    let expira: string | null = null
    if (Number.isFinite(dias) && dias > 0) {
      const d = new Date()
      d.setDate(d.getDate() + dias)
      expira = d.toISOString()
    }

    // Libera o acesso (service_role passa pelo trigger de proteção)
    const { data: upd, error: updErr } = await admin
      .from('restaurantes')
      .update({ assinatura_status: 'ativa', assinatura_expira_em: expira })
      .eq('id', rest.id)
      .select('id')
    if (updErr || !upd?.length) {
      // Devolve o uso reservado, para o cupom não ser consumido à toa
      await admin.from('cupons').update({ vezes_usado: usado }).eq('id', cupom.id)
      return json({ error: 'Não consegui liberar o acesso. Tente de novo.' }, 500)
    }

    return json({ ok: true, expira_em: expira, dias: dias > 0 ? dias : null })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
