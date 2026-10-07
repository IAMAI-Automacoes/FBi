import { supabaseInfluencers } from '@/lib/supabase/cliente-influencers'
import type { DadosPainel } from '@/lib/painel-influencers'

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

export async function salvarPerfil(nome: string, arroba: string, cidade: string): Promise<void> {
  const { data, error } = await supabaseInfluencers.rpc('influencer_salvar_perfil', { p_nome: nome, p_arroba: arroba, p_cidade: cidade })
  if (error || data !== true) throw new Error('Não foi possível salvar agora. Tente de novo.')
}

export async function marcarAcesso(): Promise<void> {
  await supabaseInfluencers.rpc('influencer_marcar_acesso')
}

// ── O painel ──────────────────────────────────────────────────────────────────

export async function buscarPainel(dias: number, culinaria: string | null): Promise<DadosPainel> {
  const { data, error } = await supabaseInfluencers.rpc('influencers_painel', { p_dias: dias, p_culinaria: culinaria ?? undefined })
  if (error) throw error
  return data as unknown as DadosPainel
}
