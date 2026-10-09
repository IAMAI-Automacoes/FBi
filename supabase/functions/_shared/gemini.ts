/**
 * Gemini direto (Google AI Studio), para a IA assistir vídeos: o OpenRouter só
 * aceita vídeo pequeno embutido. Usado pela função videos-missao.
 *
 * Chave em GEMINI_API_KEY (env da função); modelo em GEMINI_MODELO
 * (padrão gemini-2.5-flash, que vê a imagem e ouve o áudio).
 *
 * Fluxo: sobe o arquivo na Files API (upload resumable em blocos de 8 MB, lendo
 * do Storage em stream: o vídeo nunca fica inteiro na memória), espera ficar
 * ACTIVE, pede a resposta em JSON (responseSchema) e apaga o arquivo.
 */
import { emBlocos } from './videos-missao.ts'

const BASE = 'https://generativelanguage.googleapis.com'
/** A Files API quer os blocos do upload em múltiplos de 8 MB. */
const BLOCO = 8 * 1024 * 1024

export class ErroGemini extends Error {
  constructor(public codigo: 'sem_chave' | 'upload' | 'processamento' | 'timeout' | 'resposta', mensagem: string) {
    super(mensagem)
  }
}

export interface ConfigGemini { chave: string; modelo: string }

export function configGemini(): ConfigGemini | null {
  const chave = (Deno.env.get('GEMINI_API_KEY') ?? '').trim()
  if (!chave) return null
  return { chave, modelo: (Deno.env.get('GEMINI_MODELO') ?? '').trim() || 'gemini-2.5-flash' }
}

const cabecalho = (cfg: ConfigGemini, extra: Record<string, string> = {}) => ({ 'x-goog-api-key': cfg.chave, ...extra })

async function textoDoErro(r: Response): Promise<string> {
  const t = await r.text().catch(() => '')
  return `${r.status} ${t.slice(0, 300)}`
}

export interface ArquivoGemini { name: string; uri: string; mimeType: string; state?: string }

/** Sobe o vídeo (stream de `tamanho` bytes) e devolve o arquivo do Gemini. */
export async function subirParaGemini(
  cfg: ConfigGemini, corpo: ReadableStream<Uint8Array>, tamanho: number, mime: string, nome: string,
): Promise<ArquivoGemini> {
  const inicio = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: cabecalho(cfg, {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(tamanho),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ file: { display_name: nome.slice(0, 120) } }),
  })
  const url = inicio.headers.get('x-goog-upload-url')
  if (!inicio.ok || !url) throw new ErroGemini('upload', `Gemini não abriu o upload: ${await textoDoErro(inicio)}`)

  let enviado = 0
  let resposta: Response | null = null
  for await (const pedaco of emBlocos(corpo, BLOCO)) {
    const ultimo = enviado + pedaco.length >= tamanho
    resposta = await fetch(url, {
      method: 'POST',
      // O Content-Length sai do próprio bloco (Uint8Array).
      headers: {
        'X-Goog-Upload-Offset': String(enviado),
        'X-Goog-Upload-Command': ultimo ? 'upload, finalize' : 'upload',
      },
      body: pedaco,
    })
    if (!resposta.ok) throw new ErroGemini('upload', `Gemini recusou o bloco em ${enviado}: ${await textoDoErro(resposta)}`)
    enviado += pedaco.length
    if (ultimo) break
  }
  if (!resposta || enviado !== tamanho) throw new ErroGemini('upload', `Upload incompleto (${enviado} de ${tamanho} bytes).`)
  const dados = await resposta.json().catch(() => null)
  const arquivo = dados?.file
  if (!arquivo?.name || !arquivo?.uri) throw new ErroGemini('upload', 'Gemini não devolveu o arquivo.')
  return arquivo
}

/** Espera o Gemini terminar de processar o vídeo (state ACTIVE). */
export async function esperarAtivo(cfg: ConfigGemini, arquivo: ArquivoGemini, limiteMs = 150_000): Promise<ArquivoGemini> {
  const fim = Date.now() + limiteMs
  let atual = arquivo
  while (atual.state !== 'ACTIVE') {
    if (atual.state === 'FAILED') throw new ErroGemini('processamento', 'O Gemini não conseguiu processar o vídeo.')
    if (Date.now() > fim) throw new ErroGemini('timeout', 'O Gemini demorou demais para processar o vídeo.')
    await new Promise((r) => setTimeout(r, 3000))
    const r = await fetch(`${BASE}/v1beta/${atual.name}`, { headers: cabecalho(cfg) })
    if (!r.ok) throw new ErroGemini('processamento', `Gemini: ${await textoDoErro(r)}`)
    atual = await r.json()
  }
  return atual
}

/** Pede a resposta em JSON (no formato do `schema`) sobre o vídeo. */
export async function perguntarSobreVideo(cfg: ConfigGemini, arquivo: ArquivoGemini, prompt: string, schema: unknown): Promise<unknown> {
  const r = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent`, {
    method: 'POST',
    headers: cabecalho(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { file_data: { mime_type: arquivo.mimeType, file_uri: arquivo.uri } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema },
    }),
  })
  if (!r.ok) throw new ErroGemini('resposta', `Gemini: ${await textoDoErro(r)}`)
  const dados = await r.json().catch(() => null)
  const texto = (dados?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p?.text ?? '').join('')
  if (!texto) throw new ErroGemini('resposta', 'O Gemini não respondeu nada.')
  return texto
}

/** Apaga o arquivo do Gemini (de qualquer jeito ele some sozinho em 48 h). */
export async function apagarDoGemini(cfg: ConfigGemini, arquivo: ArquivoGemini): Promise<void> {
  await fetch(`${BASE}/v1beta/${arquivo.name}`, { method: 'DELETE', headers: cabecalho(cfg) }).catch(() => undefined)
}
