import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Envia Web Push para os admins da plataforma quando chega mensagem de cliente.
// Chamado pelo gatilho do banco (net.http_post) com o header x-trigger-secret.
// Resolve nome + foto do restaurante e manda { title, body, icon, url, tag }.

function resumo(t: string | null | undefined, fallback: string): string {
  const s = (t ?? '').trim()
  if (!s) return fallback
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    // Config (VAPID + segredo) — mesma tabela privada usada pela integração UAZAPI.
    const { data: cfgRows } = await admin
      .from('integracao_config')
      .select('chave, valor')
      .in('chave', ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_TRIGGER_SECRET'])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows ?? []) cfg[r.chave as string] = String(r.valor)

    // Autoriza pelo segredo do gatilho (a função não é chamada por usuário).
    const secret = req.headers.get('x-trigger-secret') ?? ''
    if (!cfg.PUSH_TRIGGER_SECRET || secret !== cfg.PUSH_TRIGGER_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    if (!cfg.VAPID_PUBLIC_KEY || !cfg.VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID keys ausentes' }), { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const tipo = String(body.tipo ?? '')
    let usuarioId: string | null = body.usuario_id ?? null
    const texto: string = body.texto ?? ''
    const titulo: string | null = body.titulo ?? null

    // Resposta do cliente: descobre o dono da conversa pela sugestão.
    if (tipo === 'resposta' && body.sugestao_id) {
      const { data: sug } = await admin
        .from('sugestoes_plataforma')
        .select('usuario_id')
        .eq('id', body.sugestao_id)
        .maybeSingle()
      usuarioId = sug?.usuario_id ?? null
    }

    // Nome (restaurante, com fallback pra pessoa) + foto (logo) do cliente.
    let nome = 'Cliente'
    let foto = '/icons/icon-192.png'
    if (usuarioId) {
      const { data: rest } = await admin
        .from('restaurantes')
        .select('nome_restaurante, logo_url')
        .eq('auth_user_id', usuarioId)
        .maybeSingle()
      if (rest?.nome_restaurante) nome = rest.nome_restaurante
      if (rest?.logo_url) foto = rest.logo_url
      if (nome === 'Cliente') {
        const { data: pessoa } = await admin
          .from('usuarios')
          .select('nome')
          .eq('id', usuarioId)
          .maybeSingle()
        if (pessoa?.nome) nome = pessoa.nome
      }
    }

    const payload = JSON.stringify({
      title: nome,
      body: resumo(texto || titulo, tipo === 'sugestao' ? 'Enviou uma nova dúvida.' : 'Enviou uma nova mensagem.'),
      icon: foto,
      url: '/admin',
      tag: `easyfeed-cliente-${usuarioId ?? 'x'}`,
    })

    // Inscrições só de admins (função security definer).
    const { data: subs } = await admin.rpc('admin_push_subscriptions')

    webpush.setVapidDetails(
      cfg.VAPID_SUBJECT || 'mailto:suporte@easyfeed.app',
      cfg.VAPID_PUBLIC_KEY,
      cfg.VAPID_PRIVATE_KEY,
    )

    let enviados = 0
    let removidos = 0
    for (const s of (subs ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        enviados++
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode
        // 404/410 = inscrição morta (app desinstalado / permissão revogada): limpa.
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          removidos++
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, enviados, removidos }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
