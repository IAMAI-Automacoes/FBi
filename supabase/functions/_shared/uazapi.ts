/**
 * Cliente da uazapiGO para as funções do Supabase: o que o n8n faz com nós
 * HTTP (enviar texto com "digitando…", marcar como lida, baixar áudio) e o que
 * a whatsapp-instancia faz com a instância (criar, conectar, status, apagar).
 * Usado pela função equipe (o número só do EasyFeed). Só usa fetch.
 *
 * Sem retry no envio: a uazapi avisa que um timeout deixa o resultado incerto
 * (a mensagem pode ter saído) e repetir duplicaria.
 */

// deno-lint-ignore no-explicit-any
type Db = any
// deno-lint-ignore no-explicit-any
type Json = any

export interface ConfigUazapi { base: string; adminToken: string }

/** Endereço e token de admin: env (preferencial) ou a tabela privada integracao_config. */
export async function configUazapi(db: Db): Promise<ConfigUazapi | null> {
  let base = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/+$/, '')
  let adminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''
  if (!base || !adminToken) {
    const { data } = await db.from('integracao_config').select('chave, valor').in('chave', ['UAZAPI_BASE_URL', 'UAZAPI_ADMIN_TOKEN'])
    for (const linha of data ?? []) {
      if (linha.chave === 'UAZAPI_BASE_URL' && !base) base = String(linha.valor).replace(/\/+$/, '')
      if (linha.chave === 'UAZAPI_ADMIN_TOKEN' && !adminToken) adminToken = String(linha.valor)
    }
  }
  return base && adminToken ? { base, adminToken } : null
}

// ── Leitura das respostas (os formatos mudam entre status, connect e create) ─
export function extrairConectado(d: Json): boolean {
  if (d?.status && typeof d.status === 'object') return d.status.connected === true || d.status.loggedIn === true
  return d?.connected === true || d?.loggedIn === true
}
export function extrairQr(d: Json): string | null {
  for (const v of [d?.instance?.qrcode, d?.qrcode, d?.instance?.qrCode, d?.qrCode]) if (typeof v === 'string' && v.length > 20) return v
  return null
}
const soDigitos = (s: string) => { const d = s.replace(/\D/g, ''); return d.length >= 8 ? d : null }
function jidParaNumero(j: Json): string | null {
  if (!j) return null
  if (typeof j === 'string') return soDigitos(j.split('@')[0].split(':')[0])
  const u = j.user ?? j.number ?? null
  return typeof u === 'string' ? soDigitos(u.split(':')[0]) : null
}
export function extrairNumero(d: Json): string | null {
  return jidParaNumero(d?.jid) ?? jidParaNumero(d?.status?.jid) ?? jidParaNumero(d?.instance?.owner) ?? jidParaNumero(d?.owner) ?? null
}
export function extrairToken(d: Json): string | null {
  const t = d?.token ?? d?.instance?.token ?? d?.hash ?? null
  return typeof t === 'string' && t ? t : null
}
export function extrairIdDaMensagem(d: Json): string | null {
  for (const v of [d?.messageid, d?.messageId, d?.id, d?.message?.messageid, d?.message?.id, d?.key?.id]) if (typeof v === 'string' && v) return v
  return null
}

const cabecalho = (token: string) => ({ 'Content-Type': 'application/json', token })

// ── Mensagens ────────────────────────────────────────────────────────────────

export interface ResultadoEnvio {
  ok: boolean
  /** Não deu para saber se saiu (timeout, conexão caiu): NÃO repetir. */
  incerto: boolean
  messageId: string | null
  erro: string | null
}

/**
 * Manda um texto com "digitando…" por `digitandoMs`, marcando a conversa como
 * lida, e (se vier `replyId`) citando uma mensagem. A uazapi só responde
 * depois do "digitando", então o limite de espera cresce junto.
 */
export async function enviarTexto(
  base: string, token: string,
  p: { numero: string; texto: string; digitandoMs?: number; replyId?: string | null },
): Promise<ResultadoEnvio> {
  const digitando = Math.max(0, Math.round(p.digitandoMs ?? 0))
  try {
    const r = await fetch(`${base}/send/text`, {
      method: 'POST',
      headers: cabecalho(token),
      body: JSON.stringify({
        number: p.numero, text: p.texto, delay: digitando, readchat: true, readmessages: true, replyid: p.replyId || undefined,
      }),
      signal: AbortSignal.timeout(digitando + 30_000),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, incerto: false, messageId: null, erro: `${r.status} ${String(d?.error ?? d?.message ?? '').slice(0, 200)}`.trim() }
    return { ok: true, incerto: false, messageId: extrairIdDaMensagem(d), erro: null }
  } catch (e) {
    return { ok: false, incerto: true, messageId: null, erro: String((e as Error)?.message ?? e).slice(0, 200) }
  }
}

/** Os dois tiques azuis. Falhar aqui não atrapalha nada. */
export async function marcarLidas(base: string, token: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  await fetch(`${base}/message/markread`, {
    method: 'POST', headers: cabecalho(token), body: JSON.stringify({ id: ids }), signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined)
}

/** O áudio de uma mensagem, em MP3 (base64). null = não deu para baixar. */
export async function baixarAudio(base: string, token: string, messageId: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const r = await fetch(`${base}/message/download`, {
      method: 'POST',
      headers: cabecalho(token),
      body: JSON.stringify({ id: messageId, return_base64: true, generate_mp3: true }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    const base64 = typeof d?.base64Data === 'string' ? d.base64Data : ''
    // generate_mp3 devolve MP3 mesmo quando o áudio chegou em OGG.
    return base64 ? { base64, mime: 'audio/mpeg' } : null
  } catch {
    return null
  }
}

// ── A instância ──────────────────────────────────────────────────────────────

/** Cria a instância. `campo1` vira o adminField01 (o que identifica de quem ela é). */
export async function criarInstancia(cfg: ConfigUazapi, p: { nome: string; campo1: string; campo2?: string }): Promise<string | 'limite'> {
  const r = await fetch(`${cfg.base}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', admintoken: cfg.adminToken },
    body: JSON.stringify({ name: p.nome, systemName: 'iamai-ia', adminField01: p.campo1, adminField02: p.campo2 ?? '' }),
  })
  if (r.status === 429) return 'limite'
  const token = extrairToken(await r.json().catch(() => ({})))
  if (!token) throw new Error('A uazapi não devolveu o token da instância.')
  return token
}

/** `status` (GET), `connect` e `reset` (POST) da instância. */
export async function chamarInstancia(base: string, token: string, caminho: 'status' | 'connect' | 'reset'): Promise<{ status: number; data: Json }> {
  const r = await fetch(`${base}/instance/${caminho}`, {
    method: caminho === 'status' ? 'GET' : 'POST', headers: cabecalho(token), signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}

/** Encerra a sessão e remove a instância (libera a vaga). */
export async function apagarInstancia(base: string, token: string): Promise<void> {
  await fetch(`${base}/instance`, { method: 'DELETE', headers: cabecalho(token) }).catch(() => undefined)
}

/** Garante o webhook de instância (não o global). Não repete o que já existe. */
export async function garantirWebhook(base: string, token: string, destino: { url: string; events: string[]; excludeMessages: string[] }): Promise<void> {
  const atuais = await fetch(`${base}/webhook`, { headers: { token } }).then((r) => r.json()).catch(() => null)
  if (Array.isArray(atuais) && atuais.some((w: Json) => w?.url === destino.url)) return
  await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: cabecalho(token),
    body: JSON.stringify({ action: 'add', enabled: true, addUrlEvents: false, addUrlTypesMessages: false, ...destino }),
  })
}
