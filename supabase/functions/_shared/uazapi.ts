/**
 * Cliente da uazapiGO para as funções do Supabase: enviar texto com
 * "digitando…", do jeito que o n8n faz com o nó HTTP. Usado pela função
 * `equipe` (o pedido de feedback sai pelo WhatsApp do restaurante). Só usa
 * fetch.
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

export function extrairIdDaMensagem(d: Json): string | null {
  for (const v of [d?.messageid, d?.messageId, d?.id, d?.message?.messageid, d?.message?.id, d?.key?.id]) if (typeof v === 'string' && v) return v
  return null
}

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
      headers: { 'Content-Type': 'application/json', token },
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
