import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Envia Web Push: para os admins quando chega mensagem de suporte, e para o
// dono do restaurante quando chega mensagem no WhatsApp dele (tipo 'whatsapp').
// Chamado pelos gatilhos do banco (net.http_post) com o header x-trigger-secret.
//
// PUBLICAR SEMPRE COM --no-verify-jwt:
//   npx supabase functions deploy enviar-push --no-verify-jwt --project-ref …
// O gatilho não manda login (só o segredo). Publicada sem a flag, o portão do
// Supabase devolve 401 antes de chegar aqui e NENHUM push sai — aconteceu em
// 01/10, por algumas horas.
// Resolve nome + foto do restaurante e manda { title, body, icon, url, tag }.

function resumo(t: string | null | undefined, fallback: string): string {
  const s = (t ?? '').trim()
  if (!s) return fallback
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

/** Manda o mesmo push para cada inscrição; inscrição morta (404/410 =
 *  app desinstalado / permissão revogada) é apagada. */
async function enviarPara(
  // deno-lint-ignore no-explicit-any
  admin: any,
  subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
  payload: string,
): Promise<{ enviados: number; removidos: number }> {
  let enviados = 0
  let removidos = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      enviados++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        removidos++
      }
    }
  }
  return { enviados, removidos }
}

/**
 * Total de mensagens de suporte não lidas pelo admin — mesmo cálculo de
 * `buscarTotalNaoLidas` em `src/lib/queries/admin.ts`, portado aqui para que
 * o número do badge do ícone do app (celular) bata com o que o painel mostra.
 * Mantenha os dois em sincronia se a regra de "não lida" mudar num dos lados.
 */
async function contarNaoLidas(
  // deno-lint-ignore no-explicit-any
  admin: any,
): Promise<number> {
  const { data, error } = await admin
    .from('sugestoes_plataforma')
    .select('id, created_at, admin_leu_em, respostas_sugestoes(autor, created_at)')
  if (error || !data) return 0

  let total = 0
  // deno-lint-ignore no-explicit-any
  for (const s of data as any[]) {
    const respostas = ((s.respostas_sugestoes ?? []) as { autor: string; created_at: string }[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (s.admin_leu_em) {
      const leuEm = new Date(s.admin_leu_em)
      total += respostas.filter((r) => r.autor === 'usuario' && new Date(r.created_at) > leuEm).length
    } else {
      // Nunca lida: mensagens do usuário após a última resposta do admin
      const adminReplies = respostas.filter((r) => r.autor !== 'usuario')
      if (adminReplies.length === 0) {
        total += 1 + respostas.filter((r) => r.autor === 'usuario').length
      } else {
        const lastAdmin = new Date(adminReplies[adminReplies.length - 1].created_at)
        total += respostas.filter((r) => r.autor === 'usuario' && new Date(r.created_at) > lastAdmin).length
      }
    }
  }
  return total
}

// ── WhatsApp do restaurante ────────────────────────────────────────────────
// Chamado pelo gatilho de mensagens_whatsapp (mensagem RECEBIDA). Vai para o
// dono do restaurante, abre /whatsapp na conversa, e o service worker suprime
// se essa conversa já estiver aberta na tela (usuarioId = 'wa:' + chat_id).

/** Prévia por tipo — mesma regra de `previaMensagem` em src/lib/whatsapp/formatacao.ts. */
function previaWhatsapp(m: {
  tipo: string; texto: string | null; midia_nome: string | null; reacao: string | null
}): string {
  const t = (m.texto ?? '').trim()
  switch (m.tipo) {
    case 'text': return t || 'Mensagem'
    case 'image': return t ? `📷 ${t}` : '📷 Foto'
    case 'video': return t ? `🎥 ${t}` : '🎥 Vídeo'
    case 'gif': return 'GIF'
    case 'audio': return '🎤 Áudio'
    case 'document': return `📄 ${m.midia_nome || t || 'Documento'}`
    case 'sticker': return 'Figurinha'
    case 'reaction': return `Reagiu ${m.reacao ?? ''} à sua mensagem`.replace('  ', ' ')
    case 'location': return '📍 Localização'
    case 'contact': return '👤 Contato'
    default: return t || 'Mensagem'
  }
}

async function payloadWhatsapp(
  // deno-lint-ignore no-explicit-any
  admin: any,
  id: number,
): Promise<{ authUserId: string; payload: string } | null> {
  const { data: m } = await admin
    .from('mensagens_whatsapp')
    .select('id, restaurante_id, chat_id, nome_exibicao, telefone, grupo, de_mim, tipo, texto, midia_nome, reacao, responde_message_id, remetente:payload->message->>senderName')
    .eq('id', id)
    .maybeSingle()
  if (!m || m.de_mim) return null

  // Reação: só avisa se foi numa mensagem do restaurante (como o WhatsApp), e
  // nunca quando é a pessoa tirando a reação (reacao nula).
  if (m.tipo === 'reaction') {
    if (!m.reacao || !m.responde_message_id) return null
    const { data: alvo } = await admin
      .from('mensagens_whatsapp')
      .select('de_mim')
      .eq('restaurante_id', m.restaurante_id)
      .eq('message_id', m.responde_message_id)
      .maybeSingle()
    if (!alvo?.de_mim) return null
  }

  const { data: rest } = await admin
    .from('restaurantes')
    .select('auth_user_id, logo_url')
    .eq('id', m.restaurante_id)
    .maybeSingle()
  if (!rest?.auth_user_id) return null

  const contato = m.nome_exibicao || (m.telefone ? `+${m.telefone}` : 'WhatsApp')
  const corpo = resumo(previaWhatsapp(m), 'Nova mensagem')
  return {
    authUserId: rest.auth_user_id,
    payload: JSON.stringify({
      title: contato,
      body: m.grupo ? `${m.remetente || 'Alguém'}: ${corpo}` : corpo,
      icon: rest.logo_url || '/icons/icon-192.png',
      url: `/whatsapp?chat=${encodeURIComponent(m.chat_id)}`,
      tag: `easyfeed-wa-${m.restaurante_id}-${m.chat_id}`,
      usuarioId: `wa:${m.chat_id}`,
    }),
  }
}

Deno.serve(async (req: Request) => {
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

    webpush.setVapidDetails(
      cfg.VAPID_SUBJECT || 'mailto:suporte@easyfeed.app',
      cfg.VAPID_PUBLIC_KEY,
      cfg.VAPID_PRIVATE_KEY,
    )

    // Mensagem do WhatsApp do restaurante: vai para o DONO, não para os admins.
    if (tipo === 'whatsapp') {
      const alvo = await payloadWhatsapp(admin, Number(body.id))
      if (!alvo) {
        return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'sem notificação' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const { data: subsDono } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('auth_user_id', alvo.authUserId)
      const r = await enviarPara(admin, subsDono ?? [], alvo.payload)
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
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

    // Total de não lidas (para o badge do ícone do app) — não pode derrubar o
    // envio se falhar, então cai em `undefined` e o SW simplesmente não mexe
    // no badge nessa notificação específica.
    const totalNaoLido = await contarNaoLidas(admin).catch(() => undefined)

    const payload = JSON.stringify({
      title: nome,
      body: resumo(texto || titulo, tipo === 'sugestao' ? 'Enviou uma nova dúvida.' : 'Enviou uma nova mensagem.'),
      icon: foto,
      url: '/admin',
      tag: `easyfeed-cliente-${usuarioId ?? 'x'}`,
      // Campo explícito (além da tag) — o Service Worker usa para saber se a
      // conversa desta mensagem é exatamente a que o admin está olhando agora.
      usuarioId: usuarioId ?? null,
      totalNaoLido,
    })

    // Inscrições só de admins (função security definer).
    const { data: subs } = await admin.rpc('admin_push_subscriptions')
    const { enviados, removidos } = await enviarPara(admin, subs ?? [], payload)

    return new Response(JSON.stringify({ ok: true, enviados, removidos }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
