import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/client'
import type { Area } from '@/lib/areas'
import {
  lerRequisitos, type AnaliseVideo, type EnvioVideo, type Missao, type PremioVideo, type Requisito,
} from '@/lib/missoes'

/* Missões de vídeo: o restaurante manda um vídeo falando do EasyFeed e a IA
   (Gemini, pela função videos-missao) confere os requisitos. Aprovado, o banco
   dá o saldo do vídeo (desde 21/10/2026, X% de uma mensalidade; antes era a
   escada de prêmios).
   Cada software (Restaurante e RH) tem as suas missões, o seu saldo por vídeo
   e o seu limite por ano: tudo aqui recebe a versão (`area`). */

const BUCKET = 'videos-clientes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paraMissao = (l: any): Missao => ({
  id: Number(l.id), titulo: l.titulo, descricao: l.descricao ?? '', requisitos: lerRequisitos(l.requisitos), ordem: l.ordem ?? 0, ativa: !!l.ativa,
  duracao_min_s: l.duracao_min_s ?? null, duracao_max_s: l.duracao_max_s ?? null,
  disponivel_de: l.disponivel_de ?? null, disponivel_ate: l.disponivel_ate ?? null,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paraEnvio = (l: any): EnvioVideo => ({
  ...l, restaurante_id: Number(l.restaurante_id), missao_id: Number(l.missao_id), tamanho_bytes: Number(l.tamanho_bytes),
  duracao_segundos: l.duracao_segundos == null ? null : Number(l.duracao_segundos), analise: (l.analise ?? null) as AnaliseVideo | null,
})

/**
 * As missões que o restaurante enxerga: as ativas e as que ele já mandou vídeo
 * (a RLS decide). Quais aparecem para enviar agora é com missaoDisponivel.
 */
export async function buscarMissoes(): Promise<Missao[]> {
  const { data, error } = await supabase.from('video_missoes').select('*').order('ordem').order('id')
  if (error) throw error
  return (data ?? []).map(paraMissao)
}

/** O limite de vídeos aprovados por conta (somando todas as missões): o máximo
    (null = sem limite) em cada período de `meses` (12 = ano, 6 = semestre, 3 = trimestre). */
export async function buscarLimiteDosVideos(area: Area): Promise<{ max: number | null; meses: number }> {
  const { data, error } = await supabase.from('video_config').select('max_por_ano, periodo_meses').eq('area', area).maybeSingle()
  if (error) throw error
  return { max: data?.max_por_ano ?? null, meses: Number(data?.periodo_meses) || 12 }
}

/** Admin → Descontos → Configurações: o saldo de cada vídeo e o limite por período. */
export interface ConfigDosVideos {
  /** % de UMA mensalidade que cada vídeo aprovado vale de saldo. */
  saldoPct: number
  /** Vídeos aprovados por período, por conta; null = sem limite. (Coluna max_por_ano.) */
  maxPorAno: number | null
  /** O período do limite: 12 = ano, 6 = semestre, 3 = trimestre. */
  periodoMeses: number
}

export async function buscarConfigDosVideos(area: Area): Promise<ConfigDosVideos> {
  const { data, error } = await supabase.from('video_config').select('max_por_ano, saldo_pct_mensalidade, periodo_meses').eq('area', area).maybeSingle()
  if (error) throw error
  return {
    saldoPct: data ? Number(data.saldo_pct_mensalidade) : 50,
    maxPorAno: data ? data.max_por_ano ?? null : 6,
    periodoMeses: Number(data?.periodo_meses) || 12,
  }
}

export async function salvarConfigDosVideos(area: Area, c: ConfigDosVideos): Promise<void> {
  const { error } = await supabase.from('video_config')
    .upsert({ id: true, area, max_por_ano: c.maxPorAno, saldo_pct_mensalidade: c.saldoPct, periodo_meses: c.periodoMeses }, { onConflict: 'area' })
  if (error) throw error
}

export async function buscarEnvios(restauranteId: number): Promise<EnvioVideo[]> {
  const { data, error } = await supabase.from('video_envios').select('*').eq('restaurante_id', restauranteId).order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []).map(paraEnvio)
}

export async function buscarPremios(restauranteId: number): Promise<PremioVideo[]> {
  const { data, error } = await supabase.from('video_premios').select('*').eq('restaurante_id', restauranteId).order('recompensa_ordem')
  if (error) throw error
  return (data ?? []) as PremioVideo[]
}

/** Link para assistir (vale 1 hora). O restaurante só abre os dele; o admin, todos. */
export async function linkDoVideo(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

export interface RespostaVideos { ok: boolean; motivo?: string; error?: string; envio_id?: string; caminho?: string; mime?: string; status?: string }

/** Chama a função videos-missao. Erro com corpo (4xx/5xx) vem com o motivo dela. */
export async function acaoVideos(acao: string, extra: Record<string, unknown> = {}): Promise<RespostaVideos> {
  const { data, error } = await supabase.functions.invoke('videos-missao', { body: { acao, ...extra } })
  if (error) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const corpo = await (error as any).context?.json?.()
      if (corpo) return { ok: false, ...corpo }
    } catch { /* sem corpo */ }
    return { ok: false, motivo: 'rede', error: 'Sem conexão com o servidor. Tente de novo.' }
  }
  return data as RespostaVideos
}

/**
 * Sobe o vídeo direto no Storage, com progresso (o supabase.storage.upload não
 * avisa o progresso). Só passa se a função já abriu o envio (status enviando)
 * neste caminho: é a regra do bucket.
 */
export async function subirVideo(caminho: string, arquivo: File, mime: string, aoProgredir: (fracao: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Entre de novo na sua conta.')
  await new Promise<void>((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir(e.loaded / e.total) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver()
      rejeitar(new Error(xhr.status === 413
        ? 'O vídeo é maior do que o servidor aceita agora. Grave um mais curto.'
        : 'Não foi possível enviar o vídeo. Tente de novo.'))
    }
    xhr.onerror = () => rejeitar(new Error('A conexão caiu durante o envio. Tente de novo.'))
    xhr.send(arquivo)
  })
}

// ── Admin (aba Vídeos) ───────────────────────────────────────────────────────

export async function buscarTodasMissoes(area: Area): Promise<Missao[]> {
  const { data, error } = await supabase.from('video_missoes').select('*').eq('area', area).order('ordem').order('id')
  if (error) throw error
  return (data ?? []).map(paraMissao)
}

export interface MissaoParaSalvar {
  id?: number
  titulo: string
  descricao: string
  requisitos: Requisito[]
  ordem: number
  ativa: boolean
  duracao_min_s: number | null
  duracao_max_s: number | null
  disponivel_de: string | null
  disponivel_ate: string | null
}

export async function salvarMissao(area: Area, m: MissaoParaSalvar): Promise<void> {
  const linha = {
    area,
    titulo: m.titulo.trim(), descricao: m.descricao.trim(), requisitos: m.requisitos as unknown as never, ordem: m.ordem, ativa: m.ativa,
    // A tela só deixa salvar com as duas durações definidas (o banco exige).
    duracao_min_s: m.duracao_min_s ?? 0, duracao_max_s: m.duracao_max_s ?? 0,
    disponivel_de: m.disponivel_de || null, disponivel_ate: m.disponivel_ate || null,
  }
  const { error } = m.id
    ? await supabase.from('video_missoes').update(linha).eq('id', m.id)
    : await supabase.from('video_missoes').insert(linha)
  if (error) throw error
}


export interface EnvioAdmin extends EnvioVideo { restaurante: string; missao: string }

/** Os vídeos das contas de um software. */
export async function buscarTodosEnvios(area: Area): Promise<EnvioAdmin[]> {
  const { data, error } = await supabase.from('video_envios')
    .select('*, restaurantes(nome_restaurante), video_missoes!inner(titulo, area)')
    .eq('video_missoes.area', area)
    .neq('status', 'enviando')
    .order('criado_em', { ascending: false })
    .limit(300)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((l: any) => ({
    ...paraEnvio(l),
    restaurante: l.restaurantes?.nome_restaurante || `Restaurante ${l.restaurante_id}`,
    missao: l.video_missoes?.titulo || `Missão ${l.missao_id}`,
  }))
}

export interface PremioAdmin extends PremioVideo { restaurante: string }

/** Os prêmios das contas de um software (conta sem versão conta como restaurante). */
export async function buscarTodosPremios(area: Area): Promise<PremioAdmin[]> {
  const { data, error } = await supabase.from('video_premios')
    .select('*, restaurantes!inner(nome_restaurante, area)')
    .neq('status', 'cancelado')
    .order('criado_em', { ascending: false })
    .limit(300)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).filter((l: any) => (l.restaurantes?.area === 'rh' ? 'rh' : 'restaurante') === area)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((l: any) => ({ ...l, restaurante: l.restaurantes?.nome_restaurante || `Restaurante ${l.restaurante_id}` }))
}
