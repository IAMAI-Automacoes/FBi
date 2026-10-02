import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { fotoValida, linhaSuporte, linhaWhatsapp, resumo } from '../_shared/notificacoes.ts'

// Envia Web Push. Três avisos:
//   - 'whatsapp'          → mensagem recebida no WhatsApp do restaurante → DONO;
//   - 'suporte_resposta'  → o suporte respondeu → DONO da conversa;
//   - 'sugestao'/'resposta' → cliente escreveu no suporte → ADMINS.
// Chamado pelos gatilhos do banco (net.http_post) com o header x-trigger-secret.
//
// PUBLICAR SEMPRE COM --no-verify-jwt:
//   npx supabase functions deploy enviar-push --no-verify-jwt --project-ref …
// O gatilho não manda login (só o segredo). Publicada sem a flag, o portão do
// Supabase devolve 401 antes de chegar aqui e NENHUM push sai — aconteceu em
// 01/10, por algumas horas.
//
// Silenciar é por APARELHO (silencios_aparelho): cada inscrição tem o id do
// aparelho (push_subscriptions.aparelho) e é filtrada sozinha — silenciar no
// PC não cala o celular. Inscrição antiga, sem aparelho, recebe (ganha o id na
// próxima vez que o site abrir naquele aparelho).
//
// O que vai no push (o service worker monta a notificação — public/sw.js):
//   title   nome da conversa ("Raver Brandi", "Suporte EasyFeed"…)
//   linha   a mensagem; o SW junta as linhas da mesma conversa (tag)
//   icon    foto já quadrada (contato/grupo) — entra direto
//   logo    logo do restaurante: o SW recorta em quadrado pelo centro (como
//           o painel mostra); sem as duas, a logo do EasyFeed
//   soMarca a imagem é a logo do EasyFeed (suporte → dono): no Android não
//           repete, porque a bolinha da esquerda já é o símbolo do EasyFeed
//   chaves  conversas que, abertas na tela deste aparelho, dispensam o aviso
//   body/usuarioId: o mesmo, no formato do service worker antigo (aparelhos
//           que ainda não abriram o site depois da atualização)
//
// { simular: true } (com o segredo): devolve quem receberia e o quê, sem enviar.

interface Inscricao { auth_user_id: string; endpoint: string; p256dh: string; auth: string; aparelho: string | null }

interface Aviso {
  title: string
  linha: string
  icon?: string | null
  logo?: string | null
  /** A imagem é a marca do EasyFeed (o service worker não repete no Android). */
  soMarca?: boolean
  url: string
  tag: string
  chaves: string[]
  timestamp?: number
  totalNaoLido?: number
}

type Canal = 'whatsapp' | 'suporte' | 'suporte_admin'

function montarPayload(a: Aviso): string {
  return JSON.stringify({
    ...a,
    timestamp: a.timestamp ?? Date.now(),
    // Formato do service worker antigo.
    body: a.linha,
    usuarioId: a.chaves[0] ?? null,
  })
}

/** Manda o push para cada inscrição; inscrição morta (404/410 = app
 *  desinstalado / permissão revogada) é apagada. */
async function enviarPara(
  // deno-lint-ignore no-explicit-any
  admin: any,
  envios: Array<{ sub: Inscricao; payload: string }>,
  simular: boolean,
): Promise<Record<string, unknown>> {
  if (simular) {
    return {
      simulado: true,
      enviados: 0,
      envios: envios.map(({ sub, payload }) => ({
        auth_user_id: sub.auth_user_id,
        aparelho: sub.aparelho,
        endpoint: `…${sub.endpoint.slice(-10)}`,
        payload: JSON.parse(payload),
      })),
    }
  }
  let enviados = 0
  let removidos = 0
  for (const { sub, payload } of envios) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      enviados++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        removidos++
      }
    }
  }
  return { enviados, removidos }
}

/** Aparelhos desta pessoa que silenciaram o canal inteiro ou esta conversa. */
async function aparelhosSilenciados(
  // deno-lint-ignore no-explicit-any
  admin: any,
  authUserId: string,
  canal: Canal,
  conversa: string | null,
): Promise<Set<string>> {
  const chaves = conversa ? ['', conversa] : ['']
  const { data } = await admin
    .from('silencios_aparelho')
    .select('aparelho')
    .eq('auth_user_id', authUserId)
    .eq('canal', canal)
    .in('conversa', chaves)
  return new Set(((data ?? []) as Array<{ aparelho: string }>).map((r) => r.aparelho))
}

/** As inscrições que devem receber: as da pessoa, menos as dos aparelhos silenciados. */
async function filtrarSilenciados(
  // deno-lint-ignore no-explicit-any
  admin: any,
  subs: Inscricao[],
  canal: Canal,
  conversa: string | null,
): Promise<Inscricao[]> {
  const porPessoa = new Map<string, Set<string>>()
  for (const id of new Set(subs.map((s) => s.auth_user_id))) {
    porPessoa.set(id, await aparelhosSilenciados(admin, id, canal, conversa))
  }
  return subs.filter((s) => !s.aparelho || !porPessoa.get(s.auth_user_id)?.has(s.aparelho))
}

async function inscricoesDe(
  // deno-lint-ignore no-explicit-any
  admin: any,
  authUserId: string,
): Promise<Inscricao[]> {
  const { data } = await admin
    .from('push_subscriptions')
    .select('auth_user_id, endpoint, p256dh, auth, aparelho')
    .eq('auth_user_id', authUserId)
  return data ?? []
}

const jsonResp = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })

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
// Mensagem RECEBIDA → dono do restaurante. Abre /whatsapp na conversa; o
// service worker não mostra se essa conversa já estiver aberta na tela.

const FOTO_VALE_MS = 24 * 3600 * 1000 // mesmo cache da whatsapp-instancia (link do WhatsApp expira)

async function avisoWhatsapp(
  // deno-lint-ignore no-explicit-any
  admin: any,
  id: number,
): Promise<{ authUserId: string; chatId: string; aviso: Aviso } | null> {
  const { data: m } = await admin
    .from('mensagens_whatsapp')
    .select('id, restaurante_id, chat_id, nome_exibicao, telefone, grupo, de_mim, tipo, texto, midia_nome, reacao, responde_message_id, enviada_em, remetente:payload->message->>senderName, foto_chat:payload->chat->>imagePreview, foto_chat_grande:payload->chat->>image')
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

  // Foto: a do chat que veio no próprio evento (contato ou grupo, link novo);
  // sem ela, numa conversa individual, a do cache de fotos (até 24 h).
  let foto = fotoValida(m.foto_chat) ?? fotoValida(m.foto_chat_grande)
  if (!foto && !m.grupo && m.telefone) {
    const { data: f } = await admin
      .from('whatsapp_fotos')
      .select('foto_url, atualizada_em')
      .eq('restaurante_id', m.restaurante_id)
      .eq('telefone', m.telefone)
      .maybeSingle()
    if (f?.foto_url && Date.now() - new Date(f.atualizada_em).getTime() < FOTO_VALE_MS) foto = fotoValida(f.foto_url)
  }

  return {
    authUserId: rest.auth_user_id,
    chatId: m.chat_id,
    aviso: {
      title: m.nome_exibicao || (m.telefone ? `+${m.telefone}` : 'WhatsApp'),
      linha: linhaWhatsapp({ ...m, grupo: !!m.grupo, remetente: m.remetente ?? null }),
      icon: foto,
      logo: rest.logo_url || null,
      url: `/whatsapp?chat=${encodeURIComponent(m.chat_id)}`,
      tag: `easyfeed-wa-${m.restaurante_id}-${m.chat_id}`,
      chaves: [`wa:${m.chat_id}`],
      timestamp: m.enviada_em ? new Date(m.enviada_em).getTime() : undefined,
    },
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
    const simular = body.simular === true

    webpush.setVapidDetails(
      cfg.VAPID_SUBJECT || 'mailto:suporte@easyfeed.app',
      cfg.VAPID_PUBLIC_KEY,
      cfg.VAPID_PRIVATE_KEY,
    )

    // ── Mensagem do WhatsApp do restaurante: vai para o DONO.
    if (tipo === 'whatsapp') {
      const alvo = await avisoWhatsapp(admin, Number(body.id))
      if (!alvo) return jsonResp({ ok: true, enviados: 0, motivo: 'sem notificação' })
      const subs = await filtrarSilenciados(admin, await inscricoesDe(admin, alvo.authUserId), 'whatsapp', alvo.chatId)
      if (subs.length === 0) return jsonResp({ ok: true, enviados: 0, motivo: 'silenciada ou sem aparelho' })
      const payload = montarPayload(alvo.aviso)
      return jsonResp({ ok: true, ...(await enviarPara(admin, subs.map((sub) => ({ sub, payload })), simular)) })
    }

    // ── Resposta do SUPORTE: vai para o dono da conversa de suporte.
    if (tipo === 'suporte_resposta') {
      const { data: sug } = await admin
        .from('sugestoes_plataforma')
        .select('usuario_id')
        .eq('id', body.sugestao_id)
        .maybeSingle()
      const dono = sug?.usuario_id as string | undefined
      if (!dono) return jsonResp({ ok: true, enviados: 0, motivo: 'sem dono' })
      const subs = await filtrarSilenciados(admin, await inscricoesDe(admin, dono), 'suporte', null)
      if (subs.length === 0) return jsonResp({ ok: true, enviados: 0, motivo: 'silenciada ou sem aparelho' })
      const payload = montarPayload({
        title: 'Suporte EasyFeed',
        linha: linhaSuporte(body.texto, body.arquivos, 'Respondeu sua mensagem.'),
        // A imagem seria a logo do EasyFeed: no Android ela já está na bolinha
        // da esquerda (badge), então não repete à direita; no PC, aparece.
        soMarca: true,
        url: '/sugestoes',
        tag: 'easyfeed-suporte',
        // 'suporte': a página de Sugestões aberta. O id do dono: a mesma
        // conversa aberta no painel do admin (quando o dono também é admin,
        // o aparelho de onde ele respondeu não avisa a própria resposta).
        chaves: ['suporte', dono],
      })
      return jsonResp({ ok: true, ...(await enviarPara(admin, subs.map((sub) => ({ sub, payload })), simular)) })
    }

    // ── Cliente escreveu no suporte: vai para os ADMINS.
    let usuarioId: string | null = body.usuario_id ?? null
    const sugestaoId: string | null = body.sugestao_id ?? null

    // Resposta do cliente: descobre o dono da conversa pela sugestão.
    if (tipo === 'resposta' && sugestaoId) {
      const { data: sug } = await admin
        .from('sugestoes_plataforma')
        .select('usuario_id')
        .eq('id', sugestaoId)
        .maybeSingle()
      usuarioId = sug?.usuario_id ?? null
    }

    // Nome (restaurante, com fallback pra pessoa) + logo do cliente.
    let nome = 'Cliente'
    let logo: string | null = null
    if (usuarioId) {
      const { data: rest } = await admin
        .from('restaurantes')
        .select('nome_restaurante, logo_url')
        .eq('auth_user_id', usuarioId)
        .maybeSingle()
      if (rest?.nome_restaurante) nome = rest.nome_restaurante
      if (rest?.logo_url) logo = rest.logo_url
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

    const aviso: Aviso = {
      title: `Suporte · ${nome}`,
      linha: linhaSuporte(
        body.texto || body.titulo,
        body.arquivos,
        tipo === 'sugestao' ? 'Começou uma conversa.' : 'Enviou uma mensagem.',
      ),
      logo,
      // Abre direto na conversa (Admin.tsx lê ?conversa=).
      url: sugestaoId ? `/admin?conversa=${encodeURIComponent(sugestaoId)}` : '/admin',
      tag: `easyfeed-cliente-${usuarioId ?? 'x'}`,
      chaves: usuarioId ? [usuarioId] : [],
      totalNaoLido,
    }
    const payload = montarPayload(aviso)
    // Admin que também é o cliente (escreveu pelo /sugestoes): o aparelho de
    // onde ele escreveu, com a página de Sugestões aberta, não se avisa.
    const payloadProprio = montarPayload({ ...aviso, chaves: [...aviso.chaves, 'suporte'] })

    // Inscrições só de admins (função security definer), menos os aparelhos
    // que silenciaram o suporte inteiro ou esta conversa.
    const { data: todas } = await admin.rpc('admin_push_subscriptions')
    const subs = await filtrarSilenciados(admin, (todas ?? []) as Inscricao[], 'suporte_admin', usuarioId)
    const envios = subs.map((sub) => ({ sub, payload: sub.auth_user_id === usuarioId ? payloadProprio : payload }))
    return jsonResp({ ok: true, ...(await enviarPara(admin, envios, simular)) })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
