// Admin da plataforma exclui/restaura a conta de um restaurante (soft-delete).
//
// Ao EXCLUIR: marca `excluida_em`, derruba a instância do WhatsApp na uazapi
// (libera o slot pago) e limpa o token. Ao RESTAURAR: só zera `excluida_em`
// (a instância não volta — é só reconectar o WhatsApp depois).
//
// Só quem está em `platform_admins` (casado por email) pode chamar. verify_jwt=true.
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

async function baseUazapi(admin: ReturnType<typeof createClient>): Promise<string> {
  let base = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/+$/, '')
  if (!base) {
    const { data } = await admin
      .from('integracao_config')
      .select('valor')
      .eq('chave', 'UAZAPI_BASE_URL')
      .maybeSingle()
    if (data?.valor) base = String(data.valor).replace(/\/+$/, '')
  }
  return base
}

async function apagarInstancia(admin: ReturnType<typeof createClient>, token: string | null) {
  if (!token) return
  const base = await baseUazapi(admin)
  if (!base) return
  try {
    await fetch(`${base}/instance`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', token },
    })
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user?.email) return json({ error: 'Sessão inválida.' }, 401)

    const admin = createClient(url, service)

    // Confere que quem chama é admin da plataforma.
    const { data: ehAdmin } = await admin
      .from('platform_admins')
      .select('email')
      .ilike('email', user.email)
      .maybeSingle()
    if (!ehAdmin) return json({ error: 'Sem permissão.' }, 403)

    const { restaurante_id, excluir } = await req.json().catch(() => ({}))
    if (typeof restaurante_id !== 'number' || typeof excluir !== 'boolean') {
      return json({ error: 'Parâmetros inválidos (restaurante_id, excluir).' }, 400)
    }

    if (!excluir) {
      // Restaurar: só limpa a marca de exclusão.
      const { error } = await admin
        .from('restaurantes')
        .update({ excluida_em: null })
        .eq('id', restaurante_id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // Excluir: marca a data e derruba a instância da uazapi.
    const { data, error } = await admin
      .from('restaurantes')
      .update({ excluida_em: new Date().toISOString() })
      .eq('id', restaurante_id)
      .select('id, whatsapp_token')
    if (error) return json({ error: error.message }, 500)
    if (!data || data.length === 0) return json({ error: 'Restaurante não encontrado.' }, 404)

    const rest = data[0] as { id: number; whatsapp_token: string | null }
    if (rest.whatsapp_token) {
      await apagarInstancia(admin, rest.whatsapp_token)
      await admin
        .from('restaurantes')
        .update({ whatsapp_token: null, numero_whatsapp: null })
        .eq('id', rest.id)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
