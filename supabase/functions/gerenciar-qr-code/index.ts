import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = userData.user.id

    const { data: restaurante, error: restauranteErr } = await supabaseAdmin
      .from('restaurantes')
      .select('id')
      .eq('auth_user_id', userId)
      .single()

    if (restauranteErr || !restaurante?.id) {
      return new Response(JSON.stringify({ error: 'User does not belong to a restaurant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const restauranteId = restaurante.id

    // Derivado do ambiente em vez de fixo: a URL do projeto estava escrita à
    // mão aqui, o que quebraria em qualquer outro projeto Supabase (staging,
    // um fork, uma migração de conta). `SUPABASE_URL` já é lido por todas as
    // outras edge functions.
    const qrRedirectBaseUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/qr-redirect`

    if (req.method === 'GET') {
      const { data: qrCode, error: qrErr } = await supabaseAdmin
        .from('qr_codes')
        .select('id, slug, total_scans, papel_fundo')
        .eq('restaurante_id', restauranteId)
        .eq('ativo', true)
        .maybeSingle()

      if (qrErr) {
        throw qrErr
      }

      if (!qrCode) {
        return new Response(JSON.stringify({ error: 'No active QR code found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          ...qrCode,
          url_redirect: `${qrRedirectBaseUrl}?slug=${qrCode.slug}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const papel_fundo = body.papel_fundo || 'padrao'

      // Generate unique slug
      let uniqueSlug = ''
      let isUnique = false
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      while (!isUnique) {
        uniqueSlug = ''
        for (let i = 0; i < 8; i++) {
          uniqueSlug += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        const { count } = await supabaseAdmin
          .from('qr_codes')
          .select('id', { count: 'exact', head: true })
          .eq('slug', uniqueSlug)

        if (count === 0) isUnique = true
      }

      // Deactivate old ones
      await supabaseAdmin
        .from('qr_codes')
        .update({ ativo: false })
        .eq('restaurante_id', restauranteId)
        .eq('ativo', true)

      // Insert new one
      const { data: newQr, error: insertErr } = await supabaseAdmin
        .from('qr_codes')
        .insert({
          restaurante_id: restauranteId,
          slug: uniqueSlug,
          papel_fundo,
          ativo: true,
          total_scans: 0,
        })
        .select('id, slug, total_scans, papel_fundo')
        .single()

      if (insertErr) throw insertErr

      return new Response(
        JSON.stringify({
          ...newQr,
          url_redirect: `${qrRedirectBaseUrl}?slug=${newQr.slug}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))
      const papel_fundo = body.papel_fundo

      if (!['padrao', 'rustico', 'moderno'].includes(papel_fundo)) {
        return new Response(JSON.stringify({ error: 'Invalid papel_fundo' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: updatedQr, error: updateErr } = await supabaseAdmin
        .from('qr_codes')
        .update({ papel_fundo })
        .eq('restaurante_id', restauranteId)
        .eq('ativo', true)
        .select('id, slug, total_scans, papel_fundo')
        .maybeSingle()

      if (updateErr) throw updateErr

      if (!updatedQr) {
        return new Response(JSON.stringify({ error: 'No active QR code found to update' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          ...updatedQr,
          url_redirect: `${qrRedirectBaseUrl}?slug=${updatedQr.slug}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
