import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
    const url = new URL(req.url)
    let slug = url.searchParams.get('slug')
    if (!slug && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      slug = body.slug ?? null
    }
    if (!slug) return json({ error: 'slug ausente' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const { data: qr } = await admin
      .from('qr_codes')
      .select('id, restaurante_id, garcom_id, total_scans, ativo')
      .eq('slug', slug)
      .maybeSingle()
    if (!qr || !qr.ativo) return json({ error: 'QR não encontrado' }, 404)

    const { data: rest } = await admin
      .from('restaurantes')
      .select('nome_restaurante, numero_whatsapp, qr_bg_modo, qr_bg_imagem, qr_estilo, qr_mensagem, qr_filtro, excluida_em')
      .eq('id', qr.restaurante_id)
      .maybeSingle()
    if (!rest) return json({ error: 'Restaurante não encontrado' }, 404)

    // Conta encerrada (soft delete): os QRs impressos continuam nas mesas, então
    // o corte precisa acontecer aqui. Sem isto o cliente escaneia e ainda envia
    // feedback para quem não é mais cliente da plataforma.
    if (rest.excluida_em) return json({ error: 'QR não encontrado' }, 404)

    let garcomNome: string | null = null
    if (qr.garcom_id) {
      const { data: g } = await admin.from('garcons').select('nome_garcon').eq('id', qr.garcom_id).maybeSingle()
      garcomNome = g?.nome_garcon ?? null
    }

    // Conta a abertura da página
    const fwd = req.headers.get('x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown')
    let ipHash = 'unknown'
    if (ip !== 'unknown') {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
        ipHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
      } catch { /* ignore */ }
    }
    await Promise.all([
      admin.from('qr_scans').insert({ qr_code_id: qr.id, user_agent: req.headers.get('user-agent') || 'unknown', ip_hash: ipHash }),
      admin.from('qr_codes').update({ total_scans: (qr.total_scans || 0) + 1 }).eq('id', qr.id),
    ])

    const clean = (rest.numero_whatsapp ?? '').replace(/\D/g, '')
    const whatsapp = clean ? (clean.startsWith('55') ? clean : `55${clean}`) : null

    return json({
      restauranteNome: rest.nome_restaurante ?? 'Restaurante',
      whatsapp,
      garcomNome,
      modo: rest.qr_bg_modo ?? 'estilo',
      imagem: rest.qr_bg_imagem ?? null,
      estilo: rest.qr_estilo ?? 'classico',
      filtro: rest.qr_filtro ?? 'nenhum',
      mensagem: rest.qr_mensagem ?? null,
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
