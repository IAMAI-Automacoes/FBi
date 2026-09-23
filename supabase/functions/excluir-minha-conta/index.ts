// Exclusão reversível da PRÓPRIA conta, pedida pelo cliente.
//
// O trigger `proteger_colunas_assinatura` impede o usuário de mexer direto em
// `excluida_em` — por isso a marcação é feita aqui, com service_role, e SÓ na
// linha do próprio usuário (achada pelo id do JWT). É soft-delete: a pessoa
// perde o acesso e não recupera sozinha (nem recriando conta no mesmo email,
// pois o login continua existindo), mas os dados ficam no banco e o admin da
// plataforma pode restaurar.
//
// Ao excluir, também DERRUBA a instância do WhatsApp na uazapi (libera o slot
// pago — conta bloqueada não deve segurar uma instância) e limpa o token. Se a
// conta for restaurada depois, é só reconectar o WhatsApp.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'

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

// Base da uazapi: env (preferencial) ou tabela privada integracao_config.
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

// Apaga a instância na uazapi pelo token dela (DELETE /instance encerra a sessão
// E remove a instância do banco da uazapi, liberando o slot). Best-effort: se
// falhar, a exclusão da conta segue mesmo assim.
export async function apagarInstancia(admin: ReturnType<typeof createClient>, token: string | null) {
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

    // Quem está pedindo (a partir do JWT).
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Sessão inválida.' }, 401)

    // Soft-delete só da própria conta, e só se ainda não estiver excluída.
    const admin = createClient(url, service)

    // Na demonstração a conta é do vendedor, aberta no computador de outra pessoa.
    if (await ehSessaoDemo(admin, authHeader.replace('Bearer ', ''))) {
      return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)
    }
    const { data, error } = await admin
      .from('restaurantes')
      .update({ excluida_em: new Date().toISOString() })
      .eq('auth_user_id', user.id)
      .is('excluida_em', null)
      .select('id, whatsapp_token')

    if (error) return json({ error: error.message }, 500)
    if (!data || data.length === 0) {
      return json({ error: 'Conta não encontrada ou já excluída.' }, 404)
    }

    // Derruba a instância da uazapi e limpa as credenciais guardadas.
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
