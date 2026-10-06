import { supabase } from '@/lib/supabase/client'

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

export interface ResumoGoogle {
  /** Quantidade de avaliações com 1, 2, 3, 4 e 5 estrelas (índice 0 = 1 estrela). */
  estrelas: number[]
  media30d: number | null
  quantidade30d: number
}

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

export async function buscarMediasMensais(meses = 24): Promise<MediaMensal[]> {
  const { data, error } = await db.rpc('google_medias_mensais', { p_meses: meses })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    mes: r.mes,
    media: r.media === null ? null : Number(r.media),
    quantidade: Number(r.quantidade),
    media_acumulada: r.media_acumulada === null ? null : Number(r.media_acumulada),
  }))
}

export async function buscarResumoGoogle(): Promise<ResumoGoogle> {
  const { data, error } = await db.rpc('google_resumo')
  if (error) throw error
  const r = (Array.isArray(data) ? data[0] : data) ?? {}
  return {
    estrelas: [r.estrelas_1, r.estrelas_2, r.estrelas_3, r.estrelas_4, r.estrelas_5].map((n: unknown) => Number(n ?? 0)),
    media30d: r.media_30d === null || r.media_30d === undefined ? null : Number(r.media_30d),
    quantidade30d: Number(r.quantidade_30d ?? 0),
  }
}

export async function buscarUltimasAvaliacoes(restauranteId: number, limite = 20): Promise<AvaliacaoGoogle[]> {
  const { data, error } = await db
    .from('google_avaliacoes')
    .select('id, nota, comentario, autor, anonimo, resposta, resposta_em, criada_em')
    .eq('restaurante_id', restauranteId)
    .order('criada_em', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []) as AvaliacaoGoogle[]
}

export type AcaoGoogle = 'conectar' | 'escolher_local' | 'descobrir' | 'sincronizar' | 'desconectar'

export interface RespostaGoogle {
  ok: boolean
  url?: string
  motivo?: string
  mensagem?: string
  status?: StatusGoogle
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
  aguarde: 'As avaliações foram atualizadas há pouco. Tente de novo em alguns minutos.',
  local_invalido: 'Esse restaurante não está na lista da sua conta Google.',
  google: 'O Google respondeu com um erro. Tente de novo.',
  rede: 'Não foi possível falar com o servidor. Confira a internet.',
  erro: 'Algo deu errado. Tente de novo.',
}
