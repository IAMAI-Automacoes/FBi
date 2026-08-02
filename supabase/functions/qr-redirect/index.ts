import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    const redirectNotFound = () => {
      return Response.redirect('https://visao-geral-dashboard-ece46.goskip.app/404', 302)
    }

    if (!slug) {
      return redirectNotFound()
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials missing')
      return redirectNotFound()
    }

    // Instancia o cliente do Supabase utilizando service_role para contornar RLS e permitir inserção anônima
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // Verifica o slug no banco de dados e se está ativo
    const { data: qrCode, error: qrErr } = await supabaseAdmin
      .from('qr_codes')
      .select('id, restaurante_id, total_scans, ativo')
      .eq('slug', slug)
      .single()

    if (qrErr || !qrCode || !qrCode.ativo) {
      console.error('QR code não encontrado ou inativo:', slug)
      return redirectNotFound()
    }

    // Busca o número do WhatsApp do restaurante
    const { data: config, error: configErr } = await supabaseAdmin
      .from('restaurantes')
      .select('numero_whatsapp, excluida_em')
      .eq('id', qrCode.restaurante_id)
      .single()

    if (configErr || !config || !config.numero_whatsapp) {
      console.error('Número de WhatsApp não encontrado para o restaurante:', qrCode.restaurante_id)
      return redirectNotFound()
    }

    // Conta encerrada (soft delete): o QR impresso continua existindo nas mesas,
    // então o corte tem que ser aqui. Sem isto, cliente escaneia e ainda manda
    // feedback para um restaurante que não é mais cliente.
    if (config.excluida_em) {
      console.error('Restaurante com conta encerrada:', qrCode.restaurante_id)
      return redirectNotFound()
    }

    // Coleta dados para Analytics
    const forwardedFor = req.headers.get('x-forwarded-for')
    const ip = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Gera Hash do IP em SHA-256 para anonimização
    let ipHash = 'unknown'
    if (ip !== 'unknown') {
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        ipHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      } catch (e) {
        console.error('Erro ao fazer hash do IP:', e)
      }
    }

    // Registra o scan e incrementa o contador no banco
    await Promise.all([
      supabaseAdmin.from('qr_scans').insert({
        qr_code_id: qrCode.id,
        user_agent: userAgent,
        ip_hash: ipHash,
      }),
      supabaseAdmin
        .from('qr_codes')
        .update({ total_scans: (qrCode.total_scans || 0) + 1 })
        .eq('id', qrCode.id),
    ])

    // Sanitiza o número do WhatsApp removendo tudo que não for dígito
    const cleanNumber = config.numero_whatsapp.replace(/\D/g, '')
    // Garante o prefixo 55 para o Brasil sem duplicar se já existir
    const finalNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`

    // Redireciona para o WhatsApp
    return Response.redirect(`https://wa.me/${finalNumber}`, 302)
  } catch (err) {
    console.error('Erro no handler qr-redirect:', err)
    return Response.redirect('https://visao-geral-dashboard-ece46.goskip.app/404', 302)
  }
})
