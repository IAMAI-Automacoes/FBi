import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Prévia de link (imagem, título, descrição) para a tela WhatsApp.
 *
 * O WhatsApp manda no evento só uma miniatura minúscula (~500 bytes) e, para
 * muitos sites (ex.: links do Mercado Livre), título e descrição vazios. Aqui
 * a página do link é lida do jeito que o WhatsApp/Facebook leem (tags Open
 * Graph), e o resultado fica guardado em previas_link por 7 dias.
 *
 * POST { url } com a sessão do usuário → { ok, titulo, descricao, imagem, site }
 *
 * Segurança: a função busca URLs que vieram de mensagens de terceiros, então
 * só http/https, nunca endereço interno (localhost, IPs privados, metadados
 * da nuvem), no máximo 5 redirecionamentos (cada um checado), 6 s e 400 KB.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const VALIDADE_MS = 7 * 24 * 3600 * 1000
const LIMITE_BYTES = 400 * 1024

function hostProibido(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return false
}

function urlPermitida(bruta: string): URL | null {
  try {
    const u = new URL(bruta)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    if (u.port && !['80', '443'].includes(u.port)) return null
    if (hostProibido(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

async function baixarPagina(inicio: URL): Promise<{ html: string; final: URL } | null> {
  let atual = inicio
  for (let salto = 0; salto < 6; salto++) {
    const resp = await fetch(atual, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
      headers: {
        // O mesmo robô que o WhatsApp/Facebook usam: os sites entregam as
        // tags Open Graph para ele (alguns bloqueiam navegador "anônimo").
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (resp.status >= 300 && resp.status < 400) {
      const destino = resp.headers.get('location')
      await resp.body?.cancel()
      if (!destino) return null
      const prox = urlPermitida(new URL(destino, atual).toString())
      if (!prox) return null
      atual = prox
      continue
    }
    if (!resp.ok || !(resp.headers.get('content-type') ?? '').includes('html')) {
      await resp.body?.cancel()
      return null
    }
    const leitor = resp.body?.getReader()
    if (!leitor) return null
    const partes: Uint8Array[] = []
    let total = 0
    while (total < LIMITE_BYTES) {
      const { done, value } = await leitor.read()
      if (done || !value) break
      partes.push(value)
      total += value.length
    }
    await leitor.cancel().catch(() => {})
    const tudo = new Uint8Array(total)
    let pos = 0
    for (const p of partes) { tudo.set(p.subarray(0, Math.min(p.length, total - pos)), pos); pos += p.length }
    return { html: new TextDecoder('utf-8', { fatal: false }).decode(tudo), final: atual }
  }
  return null
}

function decodificar(t: string): string {
  return t
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

function meta(html: string, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const n = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i')
    const m = html.match(re1) ?? html.match(re2)
    if (m?.[1]?.trim()) return decodificar(m[1])
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  // Só usuário logado (o portão já exige o JWT; isto confere que é válido).
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: quem } = await admin.auth.getUser(jwt)
  if (!quem?.user) return json({ error: 'Não autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const url = urlPermitida(String(body.url ?? '').trim())
  if (!url) return json({ ok: false })
  const chave = url.toString()

  const { data: cache } = await admin.from('previas_link').select('*').eq('url', chave).maybeSingle()
  if (cache && Date.now() - new Date(cache.buscado_em).getTime() < VALIDADE_MS) {
    return json({ ok: cache.ok, titulo: cache.titulo, descricao: cache.descricao, imagem: cache.imagem, site: cache.site })
  }

  let resultado = { ok: false, titulo: null as string | null, descricao: null as string | null, imagem: null as string | null, site: null as string | null, url_final: null as string | null }
  try {
    const pagina = await baixarPagina(url)
    if (pagina) {
      const { html, final } = pagina
      const titulo = meta(html, 'og:title', 'twitter:title') ?? decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')
      const descricao = meta(html, 'og:description', 'twitter:description', 'description')
      const imgBruta = meta(html, 'og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src')
      let imagem: string | null = null
      if (imgBruta) {
        const abs = urlPermitida(new URL(imgBruta, final).toString())
        imagem = abs && abs.protocol === 'https:' ? abs.toString() : null
      }
      const site = meta(html, 'og:site_name') ?? final.hostname.replace(/^www\./, '')
      resultado = {
        ok: !!(titulo || imagem),
        titulo: titulo ? titulo.slice(0, 300) : null,
        descricao: descricao ? descricao.slice(0, 500) : null,
        imagem,
        site,
        url_final: final.toString(),
      }
    }
  } catch { /* site fora do ar, lento demais, etc.: fica sem prévia */ }

  await admin.from('previas_link').upsert({ url: chave, ...resultado, buscado_em: new Date().toISOString() })
  return json({ ok: resultado.ok, titulo: resultado.titulo, descricao: resultado.descricao, imagem: resultado.imagem, site: resultado.site })
})
