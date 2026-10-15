// Sobe os textos desta pasta para a base de conhecimento GLOBAL do RH
// (documentos_ia com escopo 'global' e area 'rh'): o material que a IA das
// contas RH consulta.
//
// Uso:
//   node docs/conhecimento-rh/subir.cjs <saida.sql>
//   npx supabase db query --linked -f <saida.sql>
//
// O script corta cada texto em trechos do mesmo jeito que a tela do admin
// (dividirEmTrechos, em src/lib/queries/conhecimento.ts), gera os vetores pela
// função `conhecimento-ia` (o mesmo modelo gte-small da busca) e escreve o SQL.
// Ele não fala com o banco: quem grava é o `supabase db query`.
//
// A `conhecimento-ia` exige alguém logado. Passe o token de uma sessão de
// admin em EASYFEED_TOKEN (no site: Application → Local Storage → o token de
// acesso). Documento com o mesmo título que já está na base do RH é pulado.
const fs = require('node:fs')
const path = require('node:path')

const PASTA = __dirname
const URL_DA_FUNCAO = 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/conhecimento-ia'
// A chave pública do site (src/lib/supabase/client.ts): o portão da Supabase pede.
const CHAVE_PUBLICA = (fs.readFileSync(path.join(PASTA, '../../src/lib/supabase/client.ts'), 'utf8').match(/eyJ[A-Za-z0-9_.-]+/) || [''])[0]
const TOKEN = process.env.EASYFEED_TOKEN || CHAVE_PUBLICA

// Os mesmos números de src/lib/queries/conhecimento.ts.
const TAM_TRECHO = 900
const SOBREPOSICAO = 150
const LOTE = 8

function dividirEmTrechos(texto) {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return []
  const trechos = []
  let inicio = 0
  while (inicio < limpo.length) {
    let fim = Math.min(inicio + TAM_TRECHO, limpo.length)
    if (fim < limpo.length) {
      const corte = limpo.lastIndexOf('. ', fim)
      if (corte > inicio + TAM_TRECHO * 0.5) fim = corte + 1
    }
    const parte = limpo.slice(inicio, fim).trim()
    if (parte.length > 40) trechos.push(parte)
    if (fim >= limpo.length) break
    inicio = fim - SOBREPOSICAO
  }
  return trechos
}

/** O markdown vira texto corrido: o subtítulo vira frase, a lista vira frase. */
function lerDocumento(arquivo) {
  const bruto = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n')
  const linhas = bruto.split('\n')
  const titulo = (linhas.find((l) => l.startsWith('# ')) || '').replace(/^# /, '').trim()
  const corpo = linhas
    .filter((l) => !l.startsWith('# '))
    .map((l) => l.replace(/^##+\s*(.+)$/, '$1.').replace(/^\s*(?:-|\d+\.)\s+/, ''))
    .join('\n')
  const descricao = (corpo.split('\n').find((l) => l.trim()) || '').trim().slice(0, 300)
  return { titulo, texto: corpo, descricao }
}

async function vetores(textos) {
  const r = await fetch(URL_DA_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, apikey: CHAVE_PUBLICA },
    body: JSON.stringify({ acao: 'embed', textos }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok || !Array.isArray(corpo.embeddings)) {
    throw new Error(`conhecimento-ia respondeu ${r.status}: ${JSON.stringify(corpo).slice(0, 200)}` +
      (r.status === 401 ? ' (passe o token de uma sessão de admin em EASYFEED_TOKEN)' : ''))
  }
  return corpo.embeddings
}

/** Texto dentro do SQL sem risco de fechar a string antes da hora. */
function literal(texto) {
  if (texto.includes('$txt$')) throw new Error('o texto tem "$txt$"')
  return `$txt$${texto}$txt$`
}

async function main() {
  const saida = process.argv[2]
  if (!saida) throw new Error('uso: node docs/conhecimento-rh/subir.cjs <saida.sql>')
  const arquivos = fs.readdirSync(PASTA).filter((a) => a.endsWith('.md')).sort()
  const blocos = []
  for (const nome of arquivos) {
    const doc = lerDocumento(path.join(PASTA, nome))
    if (!doc.titulo || doc.texto.trim().length < 200) throw new Error(`${nome}: sem título ou texto curto`)
    const trechos = dividirEmTrechos(doc.texto)
    const embs = []
    for (let i = 0; i < trechos.length; i += LOTE) {
      // Com o título na frente, como a tela do admin: dá âncora ao trecho na busca.
      embs.push(...(await vetores(trechos.slice(i, i + LOTE).map((t) => `${doc.titulo}. ${t}`))))
    }
    if (embs.length !== trechos.length) throw new Error(`${nome}: ${embs.length} vetores para ${trechos.length} trechos`)
    const linhas = trechos.map((t, i) => `(d, null, ${literal(t)}, ${i}, '[${embs[i].join(',')}]'::vector)`).join(',\n    ')
    blocos.push(`-- ${nome}: ${trechos.length} trechos
do $doc$
declare d uuid;
begin
  if exists (select 1 from public.documentos_ia where restaurante_id is null and escopo = 'global' and area = 'rh' and titulo = ${literal(doc.titulo)}) then
    raise notice 'já existe: %', ${literal(doc.titulo)};
    return;
  end if;
  insert into public.documentos_ia (restaurante_id, titulo, descricao, origem, escopo, area, status, total_trechos)
  values (null, ${literal(doc.titulo)}, ${literal(doc.descricao)}, 'texto', 'global', 'rh', 'indexado', ${trechos.length})
  returning id into d;
  insert into public.documento_trechos (documento_id, restaurante_id, conteudo, posicao, embedding) values
    ${linhas};
end $doc$;
`)
    console.log(`${nome}: "${doc.titulo}" — ${trechos.length} trechos`)
  }
  fs.writeFileSync(saida, blocos.join('\n'), 'utf8')
  console.log(`SQL em ${saida}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
