import { supabase } from '@/lib/supabase/client'
import type { ConversaWa, MensagemWa } from '@/lib/whatsapp/formatacao'

/**
 * Dados da tela WhatsApp. Só leitura: quem grava mensagens_whatsapp é o n8n;
 * a tela só lê, gera URL assinada das mídias e marca como lida (função
 * whatsapp-instancia, que também marca no WhatsApp de verdade).
 */

// Nunca o payload inteiro: ele traz o evento cru da uazapi (miniatura em
// base64, dados do chat…). Só o nome de quem mandou, que a tela usa em grupo.
const COLUNAS =
  'id, message_id, chat_id, telefone, nome_exibicao, de_mim, por_api, grupo, tipo, texto, transcricao, reacao, ' +
  'responde_message_id, midia_caminho, midia_mime, midia_nome, status, editada_em, enviada_em, ' +
  'remetente:payload->message->>senderName'

export const TAMANHO_PAGINA = 60

export async function listarConversas(restauranteId: number): Promise<ConversaWa[]> {
  const { data, error } = await supabase.rpc('conversas_whatsapp', { p_restaurante_id: restauranteId })
  if (error) throw error
  return (data ?? []) as ConversaWa[]
}

/** Uma página da conversa, da mais nova para trás. Devolve em ordem cronológica. */
export async function buscarMensagens(
  restauranteId: number,
  chatId: string,
  antesDe?: string,
): Promise<{ mensagens: MensagemWa[]; temMais: boolean }> {
  let q = supabase
    .from('mensagens_whatsapp')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .eq('chat_id', chatId)
    .order('enviada_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(TAMANHO_PAGINA + 1)
  if (antesDe) q = q.lt('enviada_em', antesDe)
  const { data, error } = await q
  if (error) throw error
  const linhas = (data ?? []) as unknown as MensagemWa[]
  const temMais = linhas.length > TAMANHO_PAGINA
  return { mensagens: linhas.slice(0, TAMANHO_PAGINA).reverse(), temMais }
}

/** Mensagens citadas que ficaram fora das páginas carregadas. */
export async function buscarPorIds(restauranteId: number, ids: string[]): Promise<MensagemWa[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('mensagens_whatsapp')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .in('message_id', ids)
  if (error) throw error
  return (data ?? []) as unknown as MensagemWa[]
}

/** Uma mensagem pelo id, com tudo (usada quando chega pelo Realtime sem o remetente). */
export async function buscarMensagem(id: number): Promise<MensagemWa | null> {
  const { data } = await supabase.from('mensagens_whatsapp').select(COLUNAS).eq('id', id).maybeSingle()
  return (data as unknown as MensagemWa) ?? null
}

/**
 * Fotos, vídeos, gifs e documentos da conversa + textos com link (painel do
 * contato). Com `telefone`, só o que essa pessoa mandou (participante de grupo).
 */
export async function buscarMidiasDaConversa(restauranteId: number, chatId: string, telefone?: string | null): Promise<MensagemWa[]> {
  let q = supabase
    .from('mensagens_whatsapp')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .eq('chat_id', chatId)
  if (telefone) q = q.eq('telefone', telefone).eq('de_mim', false)
  const { data, error } = await q
    .or('tipo.in.(image,video,gif,document),texto.ilike.*http*,texto.ilike.*www.*')
    .order('enviada_em', { ascending: false })
    .limit(300)
  if (error) throw error
  // Apagada sai aqui, não no filtro: `status <> 'DELETED'` no SQL descartaria
  // também as de status nulo (todas as recebidas).
  return ((data ?? []) as unknown as MensagemWa[]).filter((m) => m.status !== 'DELETED')
}

export type ResultadoBusca = MensagemWa & {
  /** 1 = exatamente como escrito; 2 = sem acento/maiúscula/pontuação; 3 = parecido. */
  relevancia: 1 | 2 | 3
  semelhanca: number
}

/**
 * Pesquisa em texto, transcrição e nome de arquivo — exatos primeiro, depois
 * parecidos (função pesquisar_mensagens_whatsapp). Sem `chatId`, em todas as
 * conversas (pesquisa da lista).
 */
export async function pesquisarMensagens(restauranteId: number, termo: string, chatId?: string | null): Promise<ResultadoBusca[]> {
  const t = termo.trim()
  if (t.length < 2) return []
  const { data, error } = await supabase.rpc('pesquisar_mensagens_whatsapp', {
    p_restaurante_id: restauranteId,
    p_termo: t,
    p_chat_id: chatId ?? undefined,
    p_limite: chatId ? 80 : 40,
  })
  if (error) throw error
  return (data ?? []) as unknown as ResultadoBusca[]
}

/** Localização / contato: os dados só existem no payload, então vêm sob demanda. */
export async function buscarConteudo(id: number): Promise<Record<string, unknown> | null> {
  // Tipo do resultado dado à mão: inferir o caminho JSON estoura o limite de
  // profundidade do TypeScript.
  const { data } = await supabase
    .from('mensagens_whatsapp')
    .select<string, { conteudo: unknown }>('conteudo:payload->message->content')
    .eq('id', id)
    .maybeSingle()
  const c = data?.conteudo
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : null
}

/**
 * Marca a conversa como lida: zera o contador da tela e manda o "lido" para o
 * WhatsApp (o cliente vê os tiques azuis). Erro aqui não pode atrapalhar a
 * leitura da conversa, então só é registrado no console.
 */
export async function marcarLidas(chatId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('whatsapp-instancia', { body: { action: 'marcar-lidas', chat_id: chatId } })
  if (error) console.warn('[whatsapp] não consegui marcar como lida:', error.message)
}

/** O número do restaurante é WhatsApp Business? (decide qual app o "Enviar mensagem" abre no Android) */
export async function restauranteEhBusiness(): Promise<boolean | null> {
  try {
    const { data } = await supabase.functions.invoke('whatsapp-instancia', { body: { action: 'status' } })
    const b = (data as { business?: unknown } | null)?.business
    return typeof b === 'boolean' ? b : null
  } catch {
    return null
  }
}

// ── URLs assinadas (bucket privado "mensagens") ─────────────────────────────

const VALIDADE_S = 3600
// Renova com folga: uma URL que vence no meio de um vídeo quebra o player.
const FOLGA_MS = 5 * 60_000
const cacheUrls = new Map<string, { url: string; vence: number }>()

/** URLs assinadas em lote, com cache. Caminho sem URL (falhou) volta vazio. */
export async function urlsAssinadas(caminhos: string[]): Promise<Record<string, string>> {
  const agora = Date.now()
  const faltam = Array.from(new Set(caminhos.filter((c) => {
    const cache = cacheUrls.get(c)
    return !cache || cache.vence - FOLGA_MS < agora
  })))
  if (faltam.length > 0) {
    const { data } = await supabase.storage.from('mensagens').createSignedUrls(faltam, VALIDADE_S)
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) cacheUrls.set(item.path, { url: item.signedUrl, vence: agora + VALIDADE_S * 1000 })
    }
  }
  const out: Record<string, string> = {}
  for (const c of caminhos) out[c] = cacheUrls.get(c)?.url ?? ''
  return out
}

/** URL que baixa com o nome original (documentos). */
export async function urlParaBaixar(caminho: string, nome: string | null): Promise<string | null> {
  const { data } = await supabase.storage.from('mensagens').createSignedUrl(caminho, 600, { download: nome || true })
  return data?.signedUrl ?? null
}

// ── Prévia de link (função previa-link, com cache no banco e aqui) ───────────

export interface PreviaLink { ok: boolean; titulo: string | null; descricao: string | null; imagem: string | null; site: string | null }
const previas = new Map<string, Promise<PreviaLink>>()

export function buscarPreviaLink(url: string): Promise<PreviaLink> {
  let p = previas.get(url)
  if (!p) {
    p = supabase.functions
      .invoke('previa-link', { body: { url } })
      .then(({ data, error }) => (error || !data ? { ok: false, titulo: null, descricao: null, imagem: null, site: null } : (data as PreviaLink)))
      .catch(() => ({ ok: false, titulo: null, descricao: null, imagem: null, site: null }))
    previas.set(url, p)
  }
  return p
}

// ── Foto de perfil dos participantes (grupos) ───────────────────────────────

const fotosEmMemoria = new Map<string, string | null>()

const chaveFoto = (telefone: string, restauranteId?: number) => `${restauranteId ?? ''}|${telefone}`

/**
 * Foto de cada telefone (whatsapp-instancia, ação "fotos": cache de 24 h no
 * banco + /chat/details da uazapi). null = a pessoa esconde ou não tem foto.
 * Aqui guarda também em memória, para a mesma tela não pedir de novo.
 * `restauranteId`: só no painel do admin (aba WhatsApp) — busca pela
 * instância daquele restaurante; sem ele, a do restaurante da própria conta.
 */
export async function fotosDeParticipantes(telefones: string[], restauranteId?: number): Promise<Record<string, string | null>> {
  const unicos = Array.from(new Set(telefones.filter(Boolean)))
  const faltam = unicos.filter((t) => !fotosEmMemoria.has(chaveFoto(t, restauranteId)))
  for (let i = 0; i < faltam.length; i += 40) {
    const lote = faltam.slice(i, i + 40)
    try {
      const corpo = restauranteId != null ? { action: 'fotos', telefones: lote, restaurante_id: restauranteId } : { action: 'fotos', telefones: lote }
      const { data } = await supabase.functions.invoke('whatsapp-instancia', { body: corpo })
      const fotos = ((data as { fotos?: Record<string, string | null> } | null)?.fotos) ?? {}
      for (const t of lote) fotosEmMemoria.set(chaveFoto(t, restauranteId), fotos[t] ?? null)
    } catch {
      for (const t of lote) fotosEmMemoria.set(chaveFoto(t, restauranteId), null)
    }
  }
  const out: Record<string, string | null> = {}
  for (const t of unicos) out[t] = fotosEmMemoria.get(chaveFoto(t, restauranteId)) ?? null
  return out
}

/** A foto já conhecida (sem pedir), para o perfil abrir com ela na hora. */
export function fotoConhecida(telefone: string | null | undefined, restauranteId?: number): string | null {
  return telefone ? fotosEmMemoria.get(chaveFoto(telefone, restauranteId)) ?? null : null
}

/** Painel do admin: as conversas que o DONO fixou (RPC só para o admin da plataforma). */
export async function fixadasDoRestaurante(restauranteId: number): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('fixadas_whatsapp_do_restaurante', { p_restaurante_id: restauranteId })
  if (error) throw error
  return new Map(((data ?? []) as Array<{ conversa: string; fixada_em: string }>).map((f) => [f.conversa, f.fixada_em]))
}
