import { supabaseInfluencers } from '@/lib/supabase/cliente-influencers'
import type { DadosPainel } from '@/lib/painel-influencers'
import type { VideoDoInfluenciador } from '@/lib/influenciadores'

// Tudo da área /influencers passa por aqui, sempre com o login de lá.

export type SituacaoEntrada = 'sem_acesso' | 'entrar' | 'link_enviado'

/** Erro com a frase para a tela. */
export class ErroEntrada extends Error {}

async function chamarAcesso(acao: 'situacao' | 'esqueci', email: string): Promise<SituacaoEntrada> {
  const { data, error } = await supabaseInfluencers.functions.invoke('acesso-influencer', { body: { acao, email } })
  if (error) {
    let motivo: string | undefined
    try { motivo = (await (error as { context?: { json?: () => Promise<{ motivo?: string }> } }).context?.json?.())?.motivo } catch { /* sem corpo */ }
    if (motivo === 'muitas_tentativas') throw new ErroEntrada('Muitas tentativas seguidas. Espere alguns minutos e tente de novo.')
    if (motivo === 'email_invalido') throw new ErroEntrada('Confira o e-mail digitado.')
    throw new ErroEntrada('Não foi possível continuar agora. Tente de novo em instantes.')
  }
  return (data as { situacao: SituacaoEntrada }).situacao
}

export const consultarEntrada = (email: string) => chamarAcesso('situacao', email)
export const pedirLinkDeSenha = (email: string) => chamarAcesso('esqueci', email)

export async function entrarComSenha(email: string, senha: string): Promise<void> {
  const { error } = await supabaseInfluencers.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha })
  if (error) throw new ErroEntrada(/invalid/i.test(error.message) ? 'Senha incorreta.' : 'Não foi possível entrar agora. Tente de novo.')
}

export async function sair(): Promise<void> {
  // 'local': sai só daqui. O padrão ('global') derrubaria também o login dessa
  // pessoa no EasyFeed normal, se ela tiver conta de restaurante.
  await supabaseInfluencers.auth.signOut({ scope: 'local' }).catch(() => {})
}

export interface PerfilInfluencer {
  email: string
  nome: string | null
  arroba: string | null
  cidade: string | null
  onboarding_em: string | null
}

/** A própria linha na lista (a RLS só mostra a dela). `null` = fora da lista. */
export async function buscarMeuPerfil(email: string): Promise<PerfilInfluencer | null> {
  const { data, error } = await supabaseInfluencers
    .from('influenciadores')
    .select('email, nome, arroba, cidade, onboarding_em')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function salvarPerfil(nome: string, cidade: string): Promise<void> {
  // Sem @: o influenciador não precisa de nome de usuário.
  const { data, error } = await supabaseInfluencers.rpc('influencer_salvar_perfil', { p_nome: nome, p_arroba: '', p_cidade: cidade })
  if (error || data !== true) throw new Error('Não foi possível salvar agora. Tente de novo.')
}

export async function marcarAcesso(): Promise<void> {
  await supabaseInfluencers.rpc('influencer_marcar_acesso')
}

// ── O link e os vídeos ────────────────────────────────────────────────────────

export interface MeuLink {
  /** `null` = ainda sem link (ou o admin parou o link). */
  codigo: string | null
  comissaoPct: number | null
  comissaoMeses: number | null
  videosPorMes: number
  visitas30: number
  contas: number
  assinando: number
  videos: VideoDoInfluenciador[]
}

export async function buscarMeuLink(): Promise<MeuLink> {
  const { data, error } = await supabaseInfluencers.rpc('influencer_meu_link')
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (v == null ? null : Number(v))
  return {
    codigo: (d.codigo as string | null) ?? null,
    comissaoPct: num(d.comissao_pct),
    comissaoMeses: num(d.comissao_meses),
    videosPorMes: Number(d.videos_por_mes) || 0,
    visitas30: Number(d.visitas_30d) || 0,
    contas: Number(d.contas) || 0,
    assinando: Number(d.assinando) || 0,
    videos: Array.isArray(d.videos) ? (d.videos as VideoDoInfluenciador[]) : [],
  }
}

/** Avisa que postou um vídeo (o link dele). Volta a frase do problema, ou `null` se deu certo. */
export async function registrarVideo(url: string): Promise<string | null> {
  const { data, error } = await supabaseInfluencers.rpc('influencer_registrar_video', { p_url: url })
  if (error) return 'Não foi possível mandar agora. Tente de novo.'
  const r = (data ?? {}) as { ok?: boolean; motivo?: string }
  if (r.ok) return null
  if (r.motivo === 'repetido') return 'Esse vídeo já está na sua lista.'
  if (r.motivo === 'muitos_hoje') return 'Muitos vídeos hoje. Mande o resto amanhã.'
  return 'Confira o link: copie o endereço do vídeo no app e cole aqui.'
}

/** Tira um vídeo que ainda não foi conferido. */
export async function removerVideo(id: string): Promise<void> {
  const { error } = await supabaseInfluencers.rpc('influencer_remover_video', { p_id: id })
  if (error) throw error
}

// ── O painel ──────────────────────────────────────────────────────────────────

export async function buscarPainel(dias: number, culinaria: string | null): Promise<DadosPainel> {
  const { data, error } = await supabaseInfluencers.rpc('influencers_painel', { p_dias: dias, p_culinaria: culinaria ?? undefined })
  if (error) throw error
  return data as unknown as DadosPainel
}
