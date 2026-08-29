import { createClient } from 'jsr:@supabase/supabase-js@2'

/* Quem vê esta página é o CLIENTE do restaurante, com o celular na mão, depois
   de escanear um adesivo na mesa. Não sabe o que é slug nem QR desativado —
   então a mensagem fala do que ele pode fazer a respeito. */
const PAGINA_NAO_ENCONTRADO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QR code não encontrado</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:24px;font-family:Inter,system-ui,-apple-system,sans-serif;
       background:linear-gradient(165deg,#F5F9FF 0%,#EEF6FF 50%,#F0FBFF 100%);color:#0F172A}
  .cartao{background:#fff;border-radius:20px;padding:36px 28px;max-width:400px;width:100%;
          text-align:center;box-shadow:0 20px 50px rgba(37,99,235,.12),0 4px 12px rgba(15,23,42,.06)}
  .icone{width:52px;height:52px;border-radius:50%;background:rgba(245,158,11,.14);
         display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:26px}
  h1{font-size:19px;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}
  p{font-size:14.5px;line-height:1.6;color:#64748B;margin:0}
</style>
</head>
<body>
  <div class="cartao">
    <div class="icone">🔍</div>
    <h1>QR code não encontrado</h1>
    <p>Este código pode ter sido desativado ou substituído. Fale com o restaurante para deixar sua avaliação.</p>
  </div>
</body>
</html>`

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    // Antes isto redirecionava para um /404 no domínio do goskip, onde o app
    // era hospedado. Aquele host morreu, então quem escaneava um QR inválido
    // caía num endereço inexistente. Servir a própria página de erro dispensa
    // saber o domínio do app — funciona em localhost e em produção, sem precisar
    // atualizar nada quando o site for publicado.
    const redirectNotFound = () => {
      return new Response(PAGINA_NAO_ENCONTRADO, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
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
    return new Response(PAGINA_NAO_ENCONTRADO, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
})
