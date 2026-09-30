import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Copia uma mídia do WhatsApp para o nosso bucket, para ela não sumir.
 *
 * ## Por que existe
 *
 * O `POST /message/download` da uazapi devolve um link que morre em ~2 dias:
 * eles limpam o storage automaticamente. Uma tela de histórico com imagem
 * quebrada depois de dois dias não é histórico. Então o arquivo é copiado para
 * o bucket privado `mensagens` no momento em que a mensagem chega.
 *
 * ## Por que é uma função e não um node do n8n
 *
 * O n8n precisaria baixar o binário, converter e subir com a chave de serviço
 * dentro do workflow. Aqui é uma chamada só, a chave nunca sai do Supabase, e
 * quando um arquivo falhar dá para reprocessar sem mexer no fluxo.
 *
 * ## Contrato
 *
 * POST, com a chave de serviço no Authorization (é o que a credencial Supabase
 * do n8n já manda):
 *
 *   { restaurante_id, message_id, file_url, mime?, nome? }
 *
 * Responde sempre 200 com `{ caminho }` ou `{ caminho: null, erro }`. Erro de
 * mídia nunca pode derrubar o registro da mensagem: melhor a linha existir sem
 * o arquivo do que a mensagem sumir do histórico.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** Extensão a partir do mime — o nome do arquivo do WhatsApp nem sempre tem uma. */
const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
}

function extensao(mime: string | null, nome: string | null): string {
  const limpo = (mime ?? '').split(';')[0].trim().toLowerCase()
  if (EXTENSOES[limpo]) return EXTENSOES[limpo]
  const doNome = (nome ?? '').split('.').pop()
  if (doNome && doNome.length <= 5 && /^[a-z0-9]+$/i.test(doNome)) return doNome.toLowerCase()
  return 'bin'
}

// 40 MB. O WhatsApp aceita arquivo maior, mas a função roda com memória
// limitada — acima disso o certo é falhar avisando, não estourar no meio.
const LIMITE_BYTES = 40 * 1024 * 1024

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const autorizacao = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  // Só o n8n (chave de serviço) grava mídia. Sem isso, qualquer um com o link
  // da função encheria o bucket.
  if (!serviceKey || autorizacao !== serviceKey) return json({ erro: 'Não autorizado' }, 401)

  try {
    const body = await req.json().catch(() => ({}))
    const restauranteId = Number(body.restaurante_id)
    const messageId = String(body.message_id ?? '').trim()
    const fileUrl = String(body.file_url ?? '').trim()
    const mime = body.mime ? String(body.mime) : null
    const nome = body.nome ? String(body.nome) : null

    if (!restauranteId || !messageId || !fileUrl) {
      return json({ caminho: null, erro: 'restaurante_id, message_id e file_url são obrigatórios' })
    }

    const resp = await fetch(fileUrl)
    if (!resp.ok) return json({ caminho: null, erro: `download respondeu ${resp.status}` })

    const bytes = new Uint8Array(await resp.arrayBuffer())
    if (bytes.byteLength > LIMITE_BYTES) {
      return json({ caminho: null, erro: `arquivo grande demais (${Math.round(bytes.byteLength / 1048576)} MB)` })
    }

    const tipo = mime ?? resp.headers.get('content-type') ?? 'application/octet-stream'
    // `message_id` na chave torna a cópia idempotente: reentrega do webhook
    // sobrescreve o mesmo arquivo em vez de criar um segundo.
    const caminho = `restaurante_${restauranteId}/${messageId.replace(/[^\w.-]/g, '_')}.${extensao(tipo, nome)}`

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
      auth: { persistSession: false },
    })
    const { error } = await admin.storage
      .from('mensagens')
      .upload(caminho, bytes, { contentType: tipo, upsert: true })

    if (error) return json({ caminho: null, erro: error.message })
    return json({ caminho, mime: tipo, bytes: bytes.byteLength })
  } catch (err) {
    return json({ caminho: null, erro: (err as Error).message })
  }
})
