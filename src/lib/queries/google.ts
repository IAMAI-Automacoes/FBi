import { supabase } from '@/lib/supabase/client'
import type { FiltroAvaliacoes, NumerosDoPeriodo } from '@/lib/google-avaliacoes'

/**
 * Avaliações do Google (página /google).
 *
 * As avaliações em `google_avaliacoes` são uma cópia temporária (política da
 * API do Google: até 30 dias, sem agregar); as médias vêm calculadas na hora
 * pelas funções do banco. Quem busca no Google é a função `google-perfil`.
 */

export type StatusGoogle = 'escolher_local' | 'conectado' | 'precisa_reconectar' | 'sem_local' | 'aguardando_google'

export interface LocalGoogle {
  conta: string
  local: string
  titulo: string
  endereco: string | null
  placeId: string | null
  mapsUri: string | null
}

export interface ConexaoGoogle {
  status: StatusGoogle
  local_nome: string | null
  endereco: string | null
  maps_uri: string | null
  locais_disponiveis: LocalGoogle[] | null
  nota_media: number | null
  total_avaliacoes: number | null
  ultima_sincronizacao: string | null
  ultima_tentativa: string | null
  erro: string | null
  conectado_em: string
}

export interface MediaMensal {
  mes: string
  media: number | null
  quantidade: number
  media_acumulada: number | null
}

/** Os números do período do filtro de data (lib/google-avaliacoes.ts). */
export type ResumoGoogle = NumerosDoPeriodo

/** O recorte do filtro de data, em [de, ate). null = sem corte daquele lado. */
export interface IntervaloGoogle { de: Date | null; ate: Date | null }

export interface AvaliacaoGoogle {
  id: string
  nota: number
  comentario: string | null
  autor: string | null
  anonimo: boolean
  resposta: string | null
  resposta_em: string | null
  criada_em: string
}

const db = supabase as any

export async function buscarConexaoGoogle(restauranteId: number): Promise<ConexaoGoogle | null> {
  const { data, error } = await db
    .from('google_conexoes')
    .select('status, local_nome, endereco, maps_uri, locais_disponiveis, nota_media, total_avaliacoes, ultima_sincronizacao, ultima_tentativa, erro, conectado_em')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...data, nota_media: data.nota_media === null ? null : Number(data.nota_media) } as ConexaoGoogle
}

/** Mês a mês, desde a primeira avaliação (o gráfico rola para trás). */
export async function buscarMediasMensais(meses = 600): Promise<MediaMensal[]> {
  const { data, error } = await db.rpc('google_medias_mensais', { p_meses: meses })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    mes: r.mes,
    media: r.media === null ? null : Number(r.media),
    quantidade: Number(r.quantidade),
    media_acumulada: r.media_acumulada === null ? null : Number(r.media_acumulada),
  }))
}

/** Os números do período (calculados no banco: a lista vem aos poucos). */
export async function buscarResumoGoogle(intervalo: IntervaloGoogle): Promise<ResumoGoogle> {
  const { data, error } = await db.rpc('google_resumo_periodo', {
    p_de: intervalo.de?.toISOString() ?? null,
    p_ate: intervalo.ate?.toISOString() ?? null,
  })
  if (error) throw error
  const r = (Array.isArray(data) ? data[0] : data) ?? {}
  const n = (v: unknown) => Number(v ?? 0)
  return {
    estrelas: [r.estrelas_1, r.estrelas_2, r.estrelas_3, r.estrelas_4, r.estrelas_5].map(n),
    quantidade: n(r.quantidade),
    media: r.media === null || r.media === undefined ? null : Number(r.media),
    respondidas: n(r.respondidas),
    semResposta: n(r.sem_resposta),
    negativas: n(r.negativas),
    comComentario: n(r.com_comentario),
    ultimaEm: r.ultima_em ?? null,
  }
}

/**
 * As avaliações do período e do filtro da lista, da mais nova para a mais
 * antiga — as `limite` primeiras ("Mostrar mais" pede mais).
 */
export async function buscarAvaliacoes(
  restauranteId: number,
  op: IntervaloGoogle & { filtro: FiltroAvaliacoes; limite: number },
): Promise<AvaliacaoGoogle[]> {
  let q = db
    .from('google_avaliacoes')
    .select('id, nota, comentario, autor, anonimo, resposta, resposta_em, criada_em')
    .eq('restaurante_id', restauranteId)
  if (op.de) q = q.gte('criada_em', op.de.toISOString())
  if (op.ate) q = q.lt('criada_em', op.ate.toISOString())
  if (typeof op.filtro === 'number') q = q.eq('nota', op.filtro)
  else if (op.filtro === 'sem_resposta') q = q.is('resposta', null)
  else if (op.filtro === 'negativas') q = q.lte('nota', 3)
  else if (op.filtro === 'com_comentario') q = q.not('comentario', 'is', null)
  const { data, error } = await q
    .order('criada_em', { ascending: false })
    .order('id', { ascending: true })
    .limit(op.limite)
  if (error) throw error
  return (data ?? []) as AvaliacaoGoogle[]
}

export type AcaoGoogle = 'conectar' | 'escolher_local' | 'descobrir' | 'sincronizar' | 'responder' | 'apagar_resposta' | 'desconectar'

export interface RespostaGoogle {
  ok: boolean
  url?: string
  motivo?: string
  mensagem?: string
  status?: StatusGoogle
  /** responder / apagar_resposta: a resposta como ficou no Google (null = apagada). */
  resposta?: string | null
  resposta_em?: string | null
}

/** Chama a função google-perfil. Erros de rede viram { ok: false, motivo: 'rede' }. */
export async function acaoGoogle(acao: AcaoGoogle, extra: Record<string, unknown> = {}): Promise<RespostaGoogle> {
  const { data, error } = await supabase.functions.invoke('google-perfil', { body: { acao, ...extra } })
  if (error) {
    // Erros com corpo JSON (4xx/5xx) chegam aqui; tenta ler o motivo.
    try {
      const corpo = await (error as any).context?.json?.()
      if (corpo) return { ok: false, ...corpo }
    } catch { /* sem corpo */ }
    return { ok: false, motivo: 'rede', mensagem: error.message }
  }
  return data as RespostaGoogle
}

/** Mensagem para cada motivo que a função ou a volta do Google podem trazer. */
export const MENSAGENS_GOOGLE: Record<string, string> = {
  nao_configurado: 'A integração com o Google ainda não foi configurada.',
  acesso_nao_liberado: 'O Google ainda não liberou o acesso à API de avaliações para o EasyFeed. Assim que liberar, é só tentar de novo.',
  precisa_reconectar: 'A conexão com o Google expirou ou foi desfeita. Conecte de novo.',
  sem_permissao: 'Essa conta Google não tem permissão para ver esse perfil da empresa.',
  negado: 'A conexão foi cancelada na tela do Google.',
  permissao: 'Sem a permissão de acesso ao perfil da empresa não dá para ler as avaliações. Conecte de novo e deixe a permissão marcada.',
  estado: 'O link de conexão expirou. Clique em "Conectar com o Google" de novo.',
  sem_token: 'O Google não liberou o acesso contínuo. Conecte de novo.',
  sem_local: 'Essa conta Google não administra nenhum perfil de empresa.',
  aguarde: 'As avaliações acabaram de ser atualizadas. Tente de novo daqui a 1 minuto.',
  local_invalido: 'Esse restaurante não está na lista da sua conta Google.',
  resposta_vazia: 'Escreva a resposta antes de publicar.',
  resposta_longa: 'A resposta passou do tamanho que o Google aceita. Encurte um pouco.',
  avaliacao_nao_encontrada: 'O Google não encontrou essa avaliação. Ela pode ter sido apagada.',
  nao_conectado: 'O Google não está conectado. Conecte de novo.',
  demo: 'Responder fica bloqueado durante a demonstração.',
  nao_encontrado: 'O Google não encontrou esse perfil ou avaliação.',
  google: 'O Google respondeu com um erro. Tente de novo.',
  rede: 'Não foi possível falar com o servidor. Confira a internet.',
  erro: 'Algo deu errado. Tente de novo.',
}
