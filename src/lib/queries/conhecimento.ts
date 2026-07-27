import { supabase } from '@/lib/supabase/client'

export interface DocumentoIA {
  id: string
  titulo: string
  descricao: string | null
  origem: string
  url: string | null
  escopo: string
  status: string
  erro: string | null
  total_trechos: number
  created_at: string
}

export interface TrechoRelevante {
  conteudo: string
  titulo: string
  escopo: string
  url: string | null
  similaridade: number
}

const TAM_TRECHO = 900 // caracteres por trecho
const SOBREPOSICAO = 150 // repete um pedaço para não cortar ideia no meio
const LOTE_EMBED = 32

/** Quebra o texto em trechos, respeitando fim de frase quando possível. */
export function dividirEmTrechos(texto: string): string[] {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return []
  const trechos: string[] = []
  let inicio = 0

  while (inicio < limpo.length) {
    let fim = Math.min(inicio + TAM_TRECHO, limpo.length)
    if (fim < limpo.length) {
      // tenta terminar em ponto final para não cortar a frase
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

async function chamarConhecimento(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('conhecimento-ia', { body })
  if (error) {
    // invoke() só devolve "non-2xx status code"; a mensagem real vem no corpo
    let detalhe = error.message
    try {
      const corpo = await (error as any).context?.json?.()
      if (corpo?.error) detalhe = corpo.error
    } catch { /* mantém a mensagem original */ }
    throw new Error(detalhe)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export interface ResultadoPagina {
  ok: boolean
  titulo?: string
  texto?: string
  motivo?: string
}

/** Lê uma página. Nunca lança por página ruim — devolve ok:false com o motivo. */
export async function extrairTextoDeUrl(url: string): Promise<ResultadoPagina> {
  try {
    const data = await chamarConhecimento({ acao: 'extrair_url', url })
    if (data?.ok === false) return { ok: false, motivo: data.motivo }
    return { ok: true, titulo: data.titulo, texto: data.texto }
  } catch (err: any) {
    return { ok: false, motivo: err.message }
  }
}

/** Lê o texto de um PDF no próprio navegador. */
export async function extrairTextoDePdf(file: File): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const partes: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i)
    const conteudo = await pagina.getTextContent()
    partes.push(conteudo.items.map((it: any) => it.str ?? '').join(' '))
  }
  return partes.join('\n').replace(/\s+/g, ' ').trim()
}

export async function listarDocumentos(): Promise<DocumentoIA[]> {
  const { data, error } = await supabase
    .from('documentos_ia')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as DocumentoIA[]
}

/**
 * Indexa um texto: cria o documento, quebra em trechos, gera os embeddings
 * em lotes e grava. O progresso é informado pelo callback.
 */
export async function indexarDocumento(
  restauranteId: number,
  entrada: { titulo: string; descricao?: string; texto: string; origem?: string; url?: string },
  onProgresso?: (feito: number, total: number) => void,
): Promise<DocumentoIA> {
  const trechos = dividirEmTrechos(entrada.texto)
  if (!trechos.length) throw new Error('Não foi possível extrair texto suficiente.')

  const { data: doc, error: erroDoc } = await supabase
    .from('documentos_ia')
    .insert({
      restaurante_id: restauranteId,
      titulo: entrada.titulo.slice(0, 200),
      descricao: entrada.descricao || null,
      origem: entrada.origem || 'texto',
      url: entrada.url || null,
      escopo: 'restaurante',
      status: 'pendente',
    })
    .select()
    .single()
  if (erroDoc) throw erroDoc

  try {
    let gravados = 0
    for (let i = 0; i < trechos.length; i += LOTE_EMBED) {
      const lote = trechos.slice(i, i + LOTE_EMBED)
      // prefixa o título: dá âncora temática ao trecho e melhora a recuperação
      const { embeddings } = await chamarConhecimento({
        acao: 'embed',
        textos: lote.map((c) => `${entrada.titulo}. ${c}`),
      })

      const linhas = lote.map((conteudo, idx) => ({
        documento_id: doc.id,
        restaurante_id: restauranteId,
        conteudo,
        posicao: i + idx,
        embedding: embeddings[idx],
      }))
      const { error } = await supabase.from('documento_trechos').insert(linhas)
      if (error) throw error

      gravados += lote.length
      onProgresso?.(gravados, trechos.length)
    }

    const { data: atualizado } = await supabase
      .from('documentos_ia')
      .update({ status: 'indexado', total_trechos: trechos.length })
      .eq('id', doc.id)
      .select()
      .single()
    return (atualizado || doc) as DocumentoIA
  } catch (err: any) {
    await supabase
      .from('documentos_ia')
      .update({ status: 'erro', erro: String(err.message || err).slice(0, 500) })
      .eq('id', doc.id)
    throw err
  }
}

export async function removerDocumento(id: string): Promise<void> {
  const { error } = await supabase.from('documentos_ia').delete().eq('id', id)
  if (error) throw error
}

/**
 * Reconstrói o texto de um documento a partir dos trechos indexados (o original
 * não é guardado — só o texto extraído). Remove a sobreposição entre trechos.
 */
export async function buscarConteudoDocumento(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('documento_trechos')
    .select('conteudo, posicao')
    .eq('documento_id', id)
    .order('posicao', { ascending: true })
  if (error) throw error
  const trechos = (data || []) as { conteudo: string; posicao: number }[]
  if (!trechos.length) return ''

  let texto = trechos[0].conteudo
  for (let i = 1; i < trechos.length; i++) {
    const c = trechos[i].conteudo
    // acha o maior sufixo do acumulado que é prefixo do próximo e junta só o novo
    let overlap = Math.min(250, texto.length, c.length)
    while (overlap > 0 && !texto.endsWith(c.slice(0, overlap))) overlap--
    texto += c.slice(overlap)
  }
  return texto
}

/** Busca semântica: devolve os trechos mais parecidos com a pergunta. */
export async function buscarConhecimento(
  consulta: string,
  limite = 5,
): Promise<TrechoRelevante[]> {
  if (!consulta.trim()) return []
  try {
    const { embedding } = await chamarConhecimento({ acao: 'embed_consulta', consulta })
    const { data, error } = await supabase.rpc('buscar_conhecimento', {
      consulta_embedding: embedding,
      consulta_texto: consulta,
      limite,
    })
    if (error) throw error
    return (data || []) as TrechoRelevante[]
  } catch (err) {
    console.warn('Busca no conhecimento indisponível:', err)
    return []
  }
}
