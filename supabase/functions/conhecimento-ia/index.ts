// Gera embeddings (modelo gte-small embutido no runtime do Supabase) e extrai
// texto de paginas web. Sem acesso ao banco: quem grava e o cliente, sob RLS.
//
// Estava publicada só no painel do Supabase (versão 16), sem fonte no
// repositório; este arquivo é o que rodava, trazido para cá em 15/10/2026.
// Mudança: agora exige alguém logado. Antes, a chave pública do site bastava,
// e qualquer pessoa usava a função para gerar vetores ou para baixar qualquer
// página da internet por este servidor. Só o site chama (src/lib/queries/
// conhecimento.ts), sempre com alguém logado.
import { clienteAdmin } from '../_shared/auth.ts'
import { quemChama } from '../_shared/quem-chama.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore - Supabase.ai existe no runtime das Edge Functions
const session = new Supabase.ai.Session('gte-small')

// Limite de HTML a processar. Paginas gigantes estouravam o limite de CPU do
// runtime (retornava 546) — cortamos antes de rodar as regex.
const MAX_HTML = 500_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Aceita "site.com.br" e normaliza para https://site.com.br */
function normalizarUrl(bruta: string): string | null {
  let u = String(bruta || '').trim().replace(/^[<(\[]|[>)\].,;]$/g, '')
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** Remove scripts/estilos/tags e normaliza espacos. */
function htmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Junta o que da para aproveitar de meta tags (util em sites feitos em JS). */
function metaDescricoes(html: string): string {
  const pegar = (re: RegExp) => html.match(re)?.[1]?.trim() ?? ''
  const partes = [
    pegar(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
    pegar(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
    pegar(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
  ].filter(Boolean)
  return [...new Set(partes)].join('. ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Alguém logado (dono, admin) ou o próprio servidor. A chave pública sozinha não passa.
  const quem = await quemChama(req, clienteAdmin())
  if (quem.ok === false) return json({ error: quem.erro }, quem.status)

  try {
    const { acao, textos, url, consulta } = await req.json()

    // 1) Embeddings de uma lista de trechos
    if (acao === 'embed') {
      const lista: string[] = Array.isArray(textos) ? textos : []
      if (!lista.length) return json({ error: 'Nenhum texto enviado' }, 400)
      if (lista.length > 64) return json({ error: 'Maximo de 64 trechos por chamada' }, 400)

      const embeddings: number[][] = []
      for (const t of lista) {
        const vetor = await session.run(String(t).slice(0, 8000), {
          mean_pool: true,
          normalize: true,
        })
        embeddings.push(vetor as number[])
      }
      return json({ embeddings })
    }

    // 2) Embedding de uma pergunta (busca)
    if (acao === 'embed_consulta') {
      if (!consulta) return json({ error: 'Consulta vazia' }, 400)
      const vetor = await session.run(String(consulta).slice(0, 8000), {
        mean_pool: true,
        normalize: true,
      })
      return json({ embedding: vetor })
    }

    // 3) Extrai o texto de uma pagina (o navegador nao consegue por causa do CORS)
    if (acao === 'extrair_url') {
      const alvo = normalizarUrl(url)
      if (!alvo) return json({ ok: false, motivo: `Endereco invalido: ${url}` }, 200)

      let resposta: Response
      // Timeout: alguns sites penduram a conexao e estouravam o tempo do runtime.
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12_000)
      try {
        resposta = await fetch(alvo, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
          signal: ctrl.signal,
        })
      } catch (e) {
        clearTimeout(timer)
        const motivo = String(e).includes('abort')
          ? 'O site demorou demais para responder.'
          : `O site recusou a conexao (${String(e).slice(0, 120)})`
        return json({ ok: false, motivo }, 200)
      }
      clearTimeout(timer)

      if (!resposta.ok) {
        return json({ ok: false, motivo: `A pagina respondeu ${resposta.status}` }, 200)
      }

      const tipo = resposta.headers.get('content-type') || ''
      if (tipo.includes('application/pdf')) {
        return json({ ok: false, motivo: 'E um PDF. Baixe o arquivo e envie na Base de conhecimento.' }, 200)
      }
      // So processamos HTML/texto; outros binarios sao descartados.
      if (tipo && !/(text\/html|text\/plain|application\/xhtml)/i.test(tipo)) {
        return json({ ok: false, motivo: 'A pagina nao e um documento de texto legivel.' }, 200)
      }

      // Corta o HTML antes de processar: evita estourar o limite de CPU (546).
      const html = (await resposta.text()).slice(0, MAX_HTML)
      const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || alvo).trim()
      let texto = htmlParaTexto(html)

      // Sites feitos em JavaScript vem quase vazios no HTML: usa as meta tags
      if (texto.length < 400) {
        const meta = metaDescricoes(html)
        if (meta) texto = `${titulo}. ${meta}`
      }

      if (texto.length < 80) {
        return json(
          {
            ok: false,
            motivo:
              'A pagina carrega o conteudo por JavaScript e nao devolve texto direto. Vale pesquisar na web em vez de ler o site.',
          },
          200,
        )
      }

      return json({ ok: true, titulo: titulo.slice(0, 200), texto: texto.slice(0, 200000) })
    }

    return json({ error: 'Acao desconhecida' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
