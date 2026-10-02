import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ehSessaoDemo, MENSAGEM_BLOQUEADO_NA_DEMO } from '../_shared/demo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Extração dos campos da resposta da uazapiGO ───────────────────────────────
// status  → { instance: {...}, status: { connected, loggedIn, jid } }
// connect → { connected, loggedIn, jid, instance: { qrcode, ... } }
// create  → { instance: {...}, connected, loggedIn, token }
function extractConnected(d: any): boolean {
  if (d?.status && typeof d.status === 'object') {
    return d.status.connected === true || d.status.loggedIn === true
  }
  return d?.connected === true || d?.loggedIn === true
}
function extractQr(d: any): string | null {
  const c = [d?.instance?.qrcode, d?.qrcode, d?.instance?.qrCode, d?.qrCode]
  for (const v of c) if (typeof v === 'string' && v.length > 20) return v
  return null
}
function digitsOnly(s: string): string | null {
  const only = s.replace(/\D/g, '')
  return only.length >= 8 ? only : null
}
function jidToNumero(j: any): string | null {
  if (!j) return null
  if (typeof j === 'string') return digitsOnly(j.split('@')[0].split(':')[0])
  if (typeof j === 'object') {
    const u = j.user ?? j.number ?? null
    if (typeof u === 'string') return digitsOnly(u.split(':')[0])
  }
  return null
}
function extractNumero(d: any): string | null {
  return jidToNumero(d?.jid) ?? jidToNumero(d?.status?.jid) ?? jidToNumero(d?.instance?.owner) ?? jidToNumero(d?.owner) ?? null
}
// Mesma chave de src/lib/telefone.ts (chaveWhatsapp) e de public.telefone_chave:
// o WhatsApp conhece o mesmo celular com e sem o 9 da frente.
function chaveWhatsapp(n: string | null | undefined): string {
  const d = (n ?? '').replace(/\D/g, '')
  return /^55\d{2}9\d{8}$/.test(d) ? d.slice(0, 4) + d.slice(5) : d
}
// O que a tela precisa para abrir o app certo no celular do dono: se o número
// do restaurante está no WhatsApp Business e em que aparelho (`plataform`, com
// o erro de digitação da uazapi: smba = Business Android, android = WhatsApp
// comum Android, etc.).
function extractAparelho(d: any): { business: boolean | null; plataforma: string | null } {
  const i = d?.instance ?? d ?? {}
  return {
    business: typeof i.isBusiness === 'boolean' ? i.isBusiness : null,
    plataforma: typeof i.plataform === 'string' && i.plataform ? i.plataform : null,
  }
}
function extractToken(d: any): string | null {
  const raw = d?.token ?? d?.instance?.token ?? d?.hash ?? null
  return typeof raw === 'string' && raw ? raw : null
}

// Nome da instância na uazapi = nome do restaurante (é o que aparece no painel
// da uazapi). Sanitiza espaços e tamanho; cai num rótulo estável e único quando
// o nome ainda é o placeholder do cadastro ou está vazio, pra não criar uma
// instância genérica "Meu Restaurante". A identidade real da instância é o token
// (whatsapp_token) e o adminField01 (id) — o name é só um rótulo, então nomes
// repetidos entre restaurantes não quebram o roteamento.
function nomeInstancia(nome: string | null | undefined, id: number): string {
  const limpo = (nome ?? '').replace(/\s+/g, ' ').trim()
  if (!limpo || limpo.toLowerCase() === 'meu restaurante') return `Restaurante ${id}`
  return limpo.slice(0, 60)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const jwt = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // Config da uazapiGO: env (preferencial) ou tabela privada integracao_config
    let BASE = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/+$/, '')
    let ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''
    if (!BASE || !ADMIN_TOKEN) {
      const { data: cfg } = await admin
        .from('integracao_config')
        .select('chave, valor')
        .in('chave', ['UAZAPI_BASE_URL', 'UAZAPI_ADMIN_TOKEN'])
      for (const row of cfg ?? []) {
        if (row.chave === 'UAZAPI_BASE_URL' && !BASE) BASE = String(row.valor).replace(/\/+$/, '')
        if (row.chave === 'UAZAPI_ADMIN_TOKEN' && !ADMIN_TOKEN) ADMIN_TOKEN = String(row.valor)
      }
    }
    if (!BASE || !ADMIN_TOKEN) {
      return json({ error: 'Configuração da API do WhatsApp ausente (UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).' }, 500)
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    // Na demonstração o WhatsApp é o da conta de verdade do vendedor.
    if (await ehSessaoDemo(admin, jwt)) return json({ error: MENSAGEM_BLOQUEADO_NA_DEMO }, 403)
    const userId = userData.user.id
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')

    // Painel do admin, aba WhatsApp: o admin da plataforma vê o WhatsApp de
    // qualquer restaurante. Só a ação "fotos" (leitura) aceita outro
    // restaurante (restaurante_id), e só para quem está em platform_admins.
    // Todas as outras ações seguem presas ao restaurante da própria conta.
    const outroRestaurante = body.restaurante_id != null ? Number(body.restaurante_id) : null
    if (outroRestaurante != null) {
      if (action !== 'fotos' || !Number.isInteger(outroRestaurante)) return json({ error: 'Ação não permitida' }, 403)
      const { data: adm } = await admin
        .from('platform_admins')
        .select('email')
        .eq('email', userData.user.email ?? '')
        .maybeSingle()
      if (!adm) return json({ error: 'Só o admin da plataforma' }, 403)
    }

    const { data: rest, error: restErr } = outroRestaurante != null
      ? await admin
          .from('restaurantes')
          .select('id, nome_restaurante, whatsapp_token, numero_whatsapp, whatsapp_dono')
          .eq('id', outroRestaurante)
          .single()
      : await admin
          .from('restaurantes')
          .select('id, nome_restaurante, whatsapp_token, numero_whatsapp, whatsapp_dono')
          .eq('auth_user_id', userId)
          .single()
    if (restErr || !rest?.id) return json({ error: 'Restaurante não encontrado' }, 403)
    let token: string | null = rest.whatsapp_token ?? null

    async function setNumero(numero: string | null) {
      await admin.from('restaurantes').update({ numero_whatsapp: numero }).eq('id', rest.id)
    }
    async function setToken(novo: string | null) {
      token = novo
      await admin.from('restaurantes').update({ whatsapp_token: novo }).eq('id', rest.id)
    }

    // Cria a instância (admintoken). adminField01 = id do restaurante → roteamento no n8n.
    async function criarInstancia(): Promise<'ok' | 'limite'> {
      const resp = await fetch(`${BASE}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', admintoken: ADMIN_TOKEN },
        body: JSON.stringify({
          name: nomeInstancia(rest.nome_restaurante, rest.id), // nome = nome do restaurante
          systemName: 'iamai-ia',
          adminField01: String(rest.id), // id do restaurante → roteamento no n8n (NÃO remover)
          adminField02: rest.nome_restaurante ?? '',
        }),
      })
      if (resp.status === 429) return 'limite'
      const data = await resp.json().catch(() => ({}))
      const novo = extractToken(data)
      if (!novo) throw new Error('Falha ao criar instância (token não retornado pela uazapi).')
      await setToken(novo)
      return 'ok'
    }

    // ── Webhooks da instância (uazapi → n8n) ───────────────────────────────────
    //
    // São webhooks DE INSTÂNCIA, não o global da conta. O global é único (um
    // `POST /globalwebhook` sobrescreve o anterior) e foi desligado: cada
    // instância carrega os próprios destinos, que é o que a uazapiGO permite
    // com `action: "add"` no `POST /webhook`.
    //
    // São dois destinos, com filtros opostos de propósito:
    //
    // - FEEDBACK: só `messages`, excluindo o que a própria API enviou e os
    //   grupos. Sem esse filtro o fluxo entraria em laço respondendo as
    //   próprias respostas.
    // - REGISTRO: `messages` e `messages_update`, sem exclusão nenhuma, porque
    //   a tela de histórico quer tudo — o que o cliente mandou, o que o sistema
    //   respondeu, o que o dono digitou no celular, e as mudanças de status
    //   (entregue, lido, apagada).
    //
    // Idempotente porque roda a cada conexão: instância antiga se acerta sozinha
    // na próxima vez que o dono conectar o WhatsApp.
    const URL_FEEDBACK = (Deno.env.get('N8N_FEEDBACK_ENTRADA') ?? '').trim()
    const URL_REGISTRO = (Deno.env.get('N8N_REGISTRO_MENSAGENS') ?? '').trim()

    async function configurarWebhooks(): Promise<void> {
      if (!token) return
      const destinos = [
        URL_FEEDBACK && {
          url: URL_FEEDBACK,
          events: ['messages'],
          excludeMessages: ['wasSentByApi', 'isGroupYes'],
        },
        URL_REGISTRO && {
          url: URL_REGISTRO,
          events: ['messages', 'messages_update'],
          excludeMessages: [] as string[],
        },
      ].filter(Boolean) as Array<{ url: string; events: string[]; excludeMessages: string[] }>
      if (destinos.length === 0) return

      try {
        const resp = await fetch(`${BASE}/webhook`, { headers: { token: token as string } })
        const atuais = await resp.json().catch(() => null)
        // GET /webhook devolve um array (mesmo com um destino só), ou null.
        const jaTem = (url: string) =>
          Array.isArray(atuais) && atuais.some((w: any) => w?.url === url)

        for (const destino of destinos) {
          if (jaTem(destino.url)) continue
          await fetch(`${BASE}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: token as string },
            body: JSON.stringify({
              action: 'add',
              enabled: true,
              addUrlEvents: false,
              addUrlTypesMessages: false,
              ...destino,
            }),
          })
        }
      } catch (err) {
        // Best-effort de propósito: falhar aqui não pode impedir o dono de
        // conectar o WhatsApp — sem webhook o produto perde recurso, sem
        // conexão não existe produto.
        console.warn('[whatsapp-instancia] webhooks da instância não configurados:', err)
      }
    }

    // O número do dono (avisos urgentes) não pode virar o WhatsApp do
    // restaurante: o aviso sai de um e vai para o outro. Só dá para saber qual
    // número foi conectado DEPOIS do QR escaneado, então a recusa é desfazer a
    // conexão na hora — apaga a instância, como no "desconectar", e a tela
    // mostra o motivo. O banco também recusa (trg_restaurantes_numero_dono_diferente).
    const MOTIVO_NUMERO_DO_DONO =
      'Este é o número que você cadastrou para os avisos urgentes. Conecte aqui o WhatsApp do restaurante, que precisa ser outro número.'
    const ehNumeroDoDono = (numero: string | null) =>
      Boolean(numero && rest.whatsapp_dono && chaveWhatsapp(numero) === chaveWhatsapp(rest.whatsapp_dono))

    async function recusarNumeroDoDono() {
      try {
        await fetch(`${BASE}/instance`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', token: token as string } })
      } catch { /* best-effort: as credenciais são limpas de qualquer forma */ }
      await setToken(null)
      await setNumero(null)
      return json({ hasInstance: false, connected: false, qrcode: null, numero: null, recusado: MOTIVO_NUMERO_DO_DONO })
    }

    async function callInstance(path: string, method = 'POST'): Promise<{ status: number; data: any }> {
      const resp = await fetch(`${BASE}/instance/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', token: token as string },
      })
      const data = await resp.json().catch(() => ({}))
      return { status: resp.status, data }
    }

    // ── status: consulta estado atual (usado no polling) ────────────────────────
    if (action === 'status') {
      if (!token) return json({ hasInstance: false, connected: false, qrcode: null, numero: rest.numero_whatsapp ?? null })
      const { status, data } = await callInstance('status', 'GET')
      if (status === 404 || status === 401) {
        // Instância inexistente/token inválido → limpa para permitir recriar
        await setToken(null)
        return json({ hasInstance: false, connected: false, qrcode: null, numero: null })
      }
      const connected = extractConnected(data)
      const numero = extractNumero(data)
      // Só na conexão NOVA (número ainda não gravado): um restaurante que já
      // está funcionando não é derrubado por esta checagem.
      if (connected && numero && numero !== rest.numero_whatsapp) {
        if (ehNumeroDoDono(numero)) return await recusarNumeroDoDono()
        await setNumero(numero)
      }
      return json({
        hasInstance: true,
        connected,
        qrcode: connected ? null : extractQr(data),
        numero: connected ? (numero ?? rest.numero_whatsapp ?? null) : rest.numero_whatsapp ?? null,
        ...(connected ? extractAparelho(data) : { business: null, plataforma: null }),
      })
    }

    // ── iniciar: garante instância e dispara o QR ───────────────────────────────
    if (action === 'iniciar') {
      if (!token) {
        const r = await criarInstancia()
        if (r === 'limite') {
          return json({ error: 'Limite de instâncias atingido na uazapi. Compre mais instâncias ou libere uma antes de conectar.' }, 429)
        }
      }
      let { status, data } = await callInstance('connect', 'POST')
      if (status === 404 || status === 401) {
        // Token velho/instância removida → recria e reconecta uma vez
        await setToken(null)
        const r = await criarInstancia()
        if (r === 'limite') {
          return json({ error: 'Limite de instâncias atingido na uazapi. Compre mais instâncias ou libere uma antes de conectar.' }, 429)
        }
        ;({ status, data } = await callInstance('connect', 'POST'))
      }
      if (status === 429) {
        return json({ error: 'Limite de conexões simultâneas atingido. Tente novamente em instantes.' }, 429)
      }
      // Depois de garantir a instância: o webhook de registro. Fica aqui, e não
      // só na criação, para as instâncias antigas se acertarem ao reconectar.
      await configurarWebhooks()

      const connected = extractConnected(data)
      const numero = extractNumero(data)
      if (connected && numero && numero !== rest.numero_whatsapp && ehNumeroDoDono(numero)) {
        return await recusarNumeroDoDono()
      }
      if (connected && numero) await setNumero(numero)
      return json({ hasInstance: true, connected, qrcode: connected ? null : extractQr(data), numero: connected ? numero : null })
    }

    // ── desconectar: apaga a instância na uazapi (libera o slot) e limpa as
    //    credenciais guardadas (token + número). ────────────────────────────────
    if (action === 'desconectar') {
      if (token) {
        // DELETE /instance (na raiz) encerra a sessão E remove a instância do
        // banco da uazapi — é o endpoint correto para liberar o slot.
        try {
          await fetch(`${BASE}/instance`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', token },
          })
        } catch { /* best-effort: as credenciais são limpas de qualquer forma */ }
      }
      await setToken(null)
      await setNumero(null)
      return json({ hasInstance: false, connected: false, qrcode: null, numero: null })
    }

    // ── reset: reinicia o runtime (para sessões travadas) ───────────────────────
    if (action === 'reset') {
      if (!token) return json({ error: 'Nenhuma instância para reiniciar.' }, 400)
      const { status } = await callInstance('reset', 'POST')
      if (status >= 400 && status !== 409) return json({ error: `Falha ao reiniciar (HTTP ${status}).` }, 500)
      return json({ ok: true })
    }

    // ── marcar-lidas: o dono abriu a conversa na tela WhatsApp ─────────────────
    // Marca como lida no WhatsApp de verdade (o cliente vê os tiques azuis —
    // decisão do Raver) e grava até onde foi lido, que é o que zera o contador
    // da tela. A uazapi falhar não impede o contador de zerar: a leitura no
    // painel aconteceu de qualquer jeito.
    if (action === 'marcar-lidas') {
      const chatId = String(body.chat_id ?? '').trim()
      if (!chatId) return json({ error: 'chat_id obrigatório' }, 400)

      const { data: leitura } = await admin
        .from('mensagens_whatsapp_leitura')
        .select('lido_ate')
        .eq('restaurante_id', rest.id)
        .eq('chat_id', chatId)
        .maybeSingle()

      let consulta = admin
        .from('mensagens_whatsapp')
        .select('message_id, enviada_em')
        .eq('restaurante_id', rest.id)
        .eq('chat_id', chatId)
        .eq('de_mim', false)
        .neq('tipo', 'reaction')
        .order('enviada_em', { ascending: false })
        .limit(200)
      if (leitura?.lido_ate) consulta = consulta.gt('enviada_em', leitura.lido_ate)
      const { data: novas } = await consulta
      if (!novas || novas.length === 0) return json({ ok: true, lidas: 0, marcadas_no_whatsapp: 0 })

      let marcadas = 0
      if (token) {
        const ids = novas.map((m: { message_id: string }) => m.message_id)
        for (let i = 0; i < ids.length; i += 50) {
          const lote = ids.slice(i, i + 50)
          try {
            const r = await fetch(`${BASE}/message/markread`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token },
              body: JSON.stringify({ id: lote }),
            })
            if (r.ok) marcadas += lote.length
          } catch { /* best-effort */ }
        }
      }

      // Até a mais nova que existia AGORA — não `now()`: uma mensagem que chegar
      // durante esta chamada continua contando como não lida.
      await admin.from('mensagens_whatsapp_leitura').upsert(
        { restaurante_id: rest.id, chat_id: chatId, lido_ate: novas[0].enviada_em, atualizado_em: new Date().toISOString() },
        { onConflict: 'restaurante_id,chat_id' },
      )
      return json({ ok: true, lidas: novas.length, marcadas_no_whatsapp: marcadas })
    }

    // ── fotos: foto de perfil dos participantes (tela WhatsApp, grupos) ──────────
    // O evento só traz a foto do grupo; a de quem mandou vem de /chat/details.
    // Cache de 24 h em whatsapp_fotos (o link do WhatsApp expira). null = a
    // pessoa esconde a foto ou não tem — a tela não mostra nada.
    if (action === 'fotos') {
      const telefones = Array.from(new Set(
        (Array.isArray(body.telefones) ? body.telefones : [])
          .map((t: unknown) => String(t ?? '').replace(/\D/g, ''))
          .filter((t: string) => t.length >= 10 && t.length <= 15),
      )).slice(0, 40) as string[]
      if (telefones.length === 0) return json({ fotos: {} })

      const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data: guardadas } = await admin
        .from('whatsapp_fotos')
        .select('telefone, foto_url, atualizada_em')
        .eq('restaurante_id', rest.id)
        .in('telefone', telefones)
      const fotos: Record<string, string | null> = {}
      for (const g of guardadas ?? []) {
        if (g.atualizada_em >= limite) fotos[g.telefone] = g.foto_url
      }

      const faltam = telefones.filter((t) => !(t in fotos))
      if (faltam.length > 0 && token) {
        const buscar = async (numero: string): Promise<string | null> => {
          try {
            const r = await fetch(`${BASE}/chat/details`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token: token as string },
              body: JSON.stringify({ number: numero, preview: true }),
              signal: AbortSignal.timeout(8000),
            })
            if (!r.ok) return null
            const d = await r.json().catch(() => ({}))
            const url = String(d?.imagePreview || d?.image || '').trim()
            return /^https:\/\//.test(url) ? url : null
          } catch {
            return null
          }
        }
        // 5 de cada vez: não sobrecarrega a instância do restaurante.
        for (let i = 0; i < faltam.length; i += 5) {
          const lote = faltam.slice(i, i + 5)
          const achadas = await Promise.all(lote.map(buscar))
          lote.forEach((t, j) => { fotos[t] = achadas[j] })
        }
        await admin.from('whatsapp_fotos').upsert(
          faltam.map((t) => ({ restaurante_id: rest.id, telefone: t, foto_url: fotos[t], atualizada_em: new Date().toISOString() })),
          { onConflict: 'restaurante_id,telefone' },
        )
      }
      return json({ fotos })
    }

    return json({ error: 'Ação inválida' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
