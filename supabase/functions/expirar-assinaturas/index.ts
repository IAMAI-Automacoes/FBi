// Cron diário de fim de assinatura.
//
//   1) Assinatura 'ativa' com data vencida (assinatura_expira_em < agora) vira
//      'cancelada' — é o "mantém até a data paga, depois perde acesso".
//   2) Todo restaurante que NÃO está 'ativa' e ainda tem instância no WhatsApp
//      tem a instância da uazapi DERRUBADA e o token limpo — não dá pra segurar
//      slot pago de quem não paga. Ao reassinar, é só reconectar.
//
// Protegida por segredo (x-cron-secret == integracao_config.PUSH_TRIGGER_SECRET),
// então só o cron do banco consegue disparar. verify_jwt=false.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Apaga a instância na uazapi (DELETE /instance encerra a sessão E remove do
// banco da uazapi, liberando o slot). Best-effort. Usa a base do restaurante
// (whatsapp_base_url) e cai na global se faltar.
async function apagarInstancia(
  globalBase: string,
  restauranteBase: string | null,
  token: string,
) {
  const base = (restauranteBase || globalBase || '').replace(/\/+$/, '')
  if (!base || !token) return
  try {
    await fetch(`${base}/instance`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', token },
    })
  } catch { /* best-effort */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    // Autorização: só o cron do banco (que conhece o segredo) chama.
    const { data: cfgSecret } = await admin
      .from('integracao_config').select('valor').eq('chave', 'PUSH_TRIGGER_SECRET').maybeSingle()
    if (!cfgSecret?.valor || req.headers.get('x-cron-secret') !== cfgSecret.valor) {
      return json({ error: 'unauthorized' }, 401)
    }

    const { data: cfgBase } = await admin
      .from('integracao_config').select('valor').eq('chave', 'UAZAPI_BASE_URL').maybeSingle()
    const globalBase = String(cfgBase?.valor ?? '')

    // 1) Expira as vencidas.
    const { data: expiradas } = await admin
      .from('restaurantes')
      .update({ assinatura_status: 'cancelada' })
      .eq('assinatura_status', 'ativa')
      .not('assinatura_expira_em', 'is', null)
      .lt('assinatura_expira_em', new Date().toISOString())
      .select('id')

    // 2) Derruba a instância de quem não está mais ativo e ainda tem token.
    const { data: comInstancia } = await admin
      .from('restaurantes')
      .select('id, whatsapp_token, whatsapp_base_url')
      .neq('assinatura_status', 'ativa')
      .not('whatsapp_token', 'is', null)

    let removidas = 0
    for (const r of comInstancia ?? []) {
      await apagarInstancia(globalBase, (r as any).whatsapp_base_url, (r as any).whatsapp_token)
      await admin
        .from('restaurantes')
        .update({ whatsapp_token: null, numero_whatsapp: null })
        .eq('id', (r as any).id)
      removidas++
    }

    return json({ ok: true, expiradas: expiradas?.length ?? 0, instancias_removidas: removidas })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
