import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'

// Cancela a assinatura do restaurante do usuário logado. O dono não pode mexer
// nos campos de assinatura (trigger bloqueia), então isso roda com service_role.
//
// - Recorrente do Asaas: remove a assinatura NO ASAAS PRIMEIRO (para de
//   cobrar); se o Asaas falhar, nada muda aqui. O acesso continua até o fim do
//   período pago; atrasada encerra na hora.
// - Parcelado do Asaas: é pré-pago e não renova sozinho — nada a cancelar.
// - Acesso por data (cupom, liberação manual): se ainda tem data futura, mantém
//   até lá (o job de expiração encerra na data); se é infinita ou já vencida,
//   encerra na hora.
import { asaas, removerNoAsaas } from '../_shared/asaas/cliente.ts'

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

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    // Na demonstração a assinatura é a da conta de verdade do vendedor.
    if (await ehSessaoDemo(admin, jwt)) return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)

    const { data: rest, error: restErr } = await admin
      .from('restaurantes')
      .select('id, assinatura_status, assinatura_expira_em, assinatura_origem')
      .eq('auth_user_id', userData.user.id)
      .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)

    if (rest.assinatura_status !== 'ativa' && rest.assinatura_status !== 'inadimplente') {
      return json({ error: 'Você não tem uma assinatura ativa para cancelar.' }, 400)
    }

    if (rest.assinatura_origem === 'asaas_parcelado') {
      const ate = rest.assinatura_expira_em
        ? new Date(rest.assinatura_expira_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : null
      return json({
        error: `Seu plano já está pago${ate ? ` até ${ate}` : ''} e não renova sozinho: não há nada a cancelar.`,
      }, 400)
    }

    if (rest.assinatura_origem === 'asaas_recorrente') {
      const { data: assinaturas } = await admin
        .from('cobranca_assinaturas')
        .select('id, conta_id, asaas_id, status')
        .eq('restaurante_id', rest.id)
        .eq('modalidade', 'recorrente')
        .in('status', ['ativa', 'atrasada'])
      if (!assinaturas?.length) return json({ error: 'Não encontramos a assinatura para cancelar.' }, 409)

      const agoraIso = new Date().toISOString()
      for (const a of assinaturas) {
        // Primeiro no Asaas: cancelar só aqui deixaria o cartão sendo cobrado.
        if (a.asaas_id) await removerNoAsaas(asaas(a.conta_id), `/subscriptions/${a.asaas_id}`)
        await admin
          .from('cobranca_assinaturas')
          .update({ status: 'cancelada', cancelada_em: agoraIso, atualizada_em: agoraIso })
          .eq('id', a.id)
      }
      const { data: estado, error: aplErr } = await admin.rpc('cobranca_aplicar', { p_restaurante_id: rest.id })
      if (aplErr) throw new Error(`cobranca_aplicar: ${aplErr.message}`)
      if (estado === 'ativa') {
        const { data: depois } = await admin.from('restaurantes').select('assinatura_expira_em').eq('id', rest.id).single()
        return json({ modo: 'agendado', acesso_ate: depois?.assinatura_expira_em ?? null })
      }
      return json({ modo: 'encerrada' })
    }

    const agora = new Date()
    const expira = rest.assinatura_expira_em ? new Date(rest.assinatura_expira_em) : null
    const temAcessoFuturo = expira !== null && expira.getTime() > agora.getTime()

    if (temAcessoFuturo) {
      await admin
        .from('restaurantes')
        .update({ assinatura_cancelada_em: agora.toISOString() })
        .eq('id', rest.id)
      return json({ modo: 'agendado', acesso_ate: rest.assinatura_expira_em })
    }

    await admin
      .from('restaurantes')
      .update({ assinatura_status: 'cancelada', assinatura_cancelada_em: agora.toISOString() })
      .eq('id', rest.id)
    return json({ modo: 'encerrada' })
  } catch (err) {
    console.error('[cancelar-assinatura]', (err as Error).message)
    return json({ error: 'Não foi possível cancelar agora. Tente de novo em instantes.' }, 500)
  }
})
