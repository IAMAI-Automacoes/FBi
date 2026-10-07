// Webhooks da Salvy: conferir a assinatura e ler o evento de SMS recebido.
//
// A Salvy entrega os webhooks pela Svix. Cada requisição traz os cabeçalhos
// `svix-id`, `svix-timestamp` e `svix-signature`; a assinatura é o HMAC-SHA256,
// em base64, de `{svix-id}.{svix-timestamp}.{corpo bruto}`, com a chave do
// endpoint (`whsec_` + base64, no painel da Salvy em Configurações > Webhooks).
// Conferência manual, como a documentação descreve
// (docs.salvy.com.br/api-reference/v3/webhooks/verifying-payloads), com
// WebCrypto: funciona no Deno e no Node, sem instalar a SDK da Svix.

import { codigoDoWhatsapp } from './salvy-codigo.ts'
import type { Deteccoes } from './salvy.ts'

/** Mesma tolerância das SDKs da Svix: impede reenviar uma mensagem capturada depois. */
export const TOLERANCIA_SEGUNDOS = 5 * 60

const codificador = new TextEncoder()

// Devolve ArrayBuffer (e não Uint8Array): é o tipo que o WebCrypto aceita em
// qualquer versão do TypeScript, inclusive a do Deno do Supabase.
function base64ParaBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buffer = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return buffer
}

function bytesParaBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Comparação que leva o mesmo tempo acerte ou erre — não entrega a assinatura por tentativa. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/** A assinatura (só o base64, sem o "v1,") de um conteúdo. */
export async function assinar(segredo: string, id: string, timestamp: string | number, corpo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    base64ParaBuffer(segredo.startsWith('whsec_') ? segredo.slice(6) : segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', chave, codificador.encode(`${id}.${timestamp}.${corpo}`))
  return bytesParaBase64(new Uint8Array(assinatura))
}

type Cabecalhos = Headers | Record<string, string | null | undefined>

function cabecalho(c: Cabecalhos, nome: string): string | null {
  if (typeof (c as Headers).get === 'function') return (c as Headers).get(nome)
  const achado = Object.entries(c).find(([k]) => k.toLowerCase() === nome)
  return achado?.[1] ?? null
}

export type ResultadoAssinatura = { ok: true; id: string } | { ok: false; motivo: string }

/**
 * Confere se a requisição veio mesmo da Salvy. `corpoBruto` é o corpo
 * exatamente como chegou: converter para JSON e de volta muda espaços e ordem
 * das chaves, e a assinatura deixa de bater.
 */
export async function verificarAssinatura(
  segredo: string,
  cabecalhos: Cabecalhos,
  corpoBruto: string,
  agoraMs: number = Date.now(),
): Promise<ResultadoAssinatura> {
  const id = cabecalho(cabecalhos, 'svix-id')
  const timestamp = cabecalho(cabecalhos, 'svix-timestamp')
  const assinaturas = cabecalho(cabecalhos, 'svix-signature')
  if (!id || !timestamp || !assinaturas) return { ok: false, motivo: 'cabeçalhos da Svix ausentes' }

  const segundos = Number(timestamp)
  if (!Number.isFinite(segundos)) return { ok: false, motivo: 'svix-timestamp inválido' }
  if (Math.abs(agoraMs / 1000 - segundos) > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: 'svix-timestamp fora da tolerância' }

  let esperada: string
  try {
    esperada = await assinar(segredo, id, timestamp, corpoBruto)
  } catch {
    return { ok: false, motivo: 'segredo do webhook inválido' }
  }
  // Pode vir mais de uma assinatura, separadas por espaço (troca de chave):
  // vale se qualquer uma "v1,..." bater.
  for (const item of assinaturas.split(' ')) {
    const [versao, valor] = item.split(',')
    if (versao === 'v1' && valor && iguais(valor, esperada)) return { ok: true, id }
  }
  return { ok: false, motivo: 'assinatura não confere' }
}

export interface SmsRecebido {
  /** ID da mensagem na Salvy — único: usado para não gravar a mesma duas vezes. */
  smsId: string
  linhaId: string
  /** Número virtual que recebeu (E.164). */
  numero: string
  origem: string
  mensagem: string
  recebidoEm: string
  deteccoes: Deteccoes
  /** Código do WhatsApp, quando o SMS é do WhatsApp. */
  codigoWhatsapp: string | null
}

/** Lê um evento `sms.received`. Outro tipo de evento (ou formato quebrado) dá null. */
export function lerSmsRecebido(evento: unknown): SmsRecebido | null {
  const e = evento as { type?: unknown; data?: Record<string, unknown> } | null
  if (!e || e.type !== 'sms.received' || !e.data || typeof e.data !== 'object') return null
  const d = e.data
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const smsId = texto(d.id)
  // `virtualPhoneAccountId` é o nome antigo (deprecado) do mesmo campo.
  const linhaId = texto(d.phoneAccountId) || texto(d.virtualPhoneAccountId)
  if (!smsId || !linhaId) return null
  const deteccoes = (d.detections && typeof d.detections === 'object' ? d.detections : {}) as Deteccoes
  const mensagem = texto(d.message)
  return {
    smsId,
    linhaId,
    numero: texto(d.destinationPhoneNumber),
    origem: texto(d.originPhoneNumber),
    mensagem,
    recebidoEm: texto(d.receivedAt),
    deteccoes,
    codigoWhatsapp: codigoDoWhatsapp({ message: mensagem, detections: deteccoes }),
  }
}
