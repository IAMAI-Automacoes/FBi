import { supabase } from '@/lib/supabase/client'
import type { CadastroDoInfluenciador, SituacaoDoVideo, VideoDoInfluenciador } from '@/lib/influenciadores'

/*
 * EasyFeed Influencers. Duas metades:
 *   · admin (painel do admin → Influenciadores): usa o login normal (`supabase`);
 *   · a área /influencers: usa o login de lá (`supabaseInfluencers`), separado.
 * As funções da área ficam em `src/pages/influencers/dados.ts`, para este
 * arquivo não carregar o cliente da área nas páginas do admin.
 */

// ── Admin ─────────────────────────────────────────────────────────────────────

/** Uma linha de Admin → Influenciadores (`admin_influenciadores`). */
export interface InfluenciadorAdmin {
  id: string
  email: string
  nome: string | null
  arroba: string | null
  cidade: string | null
  seguidores: number | null
  /** Vídeos por mês combinados (0 = sem meta). */
  videos_por_mes: number
  onboarding_em: string | null
  ultimo_acesso_em: string | null
  criado_em: string
  /** O código do link (`/cadastro?ref=`). */
  codigo: string | null
  link_ativo: boolean
  comissao_pct: number | null
  comissao_meses: number | null
  /** Dias em que entrou no painel, nos últimos 30. */
  acessos_30d: number
  visitas_30d: number
  /** Contas que entraram pelo link (todas) e as que assinam hoje. */
  contas: number
  assinando: number
  videos: VideoDoInfluenciador[]
}

export async function listarInfluenciadores(): Promise<InfluenciadorAdmin[]> {
  const { data, error } = await supabase.rpc('admin_influenciadores')
  if (error) throw error
  const lista = (Array.isArray(data) ? data : []) as unknown as InfluenciadorAdmin[]
  const num = (v: unknown) => (v == null ? null : Number(v))
  return lista.map((l) => ({
    ...l,
    seguidores: num(l.seguidores),
    videos_por_mes: Number(l.videos_por_mes) || 0,
    comissao_pct: num(l.comissao_pct),
    comissao_meses: num(l.comissao_meses),
    acessos_30d: Number(l.acessos_30d) || 0,
    visitas_30d: Number(l.visitas_30d) || 0,
    contas: Number(l.contas) || 0,
    assinando: Number(l.assinando) || 0,
    videos: Array.isArray(l.videos) ? l.videos : [],
  }))
}

/** Adiciona (`id` nulo, já cria o link) ou edita. O e-mail não muda depois: é o login da pessoa. */
export async function salvarInfluenciador(id: string | null, c: CadastroDoInfluenciador): Promise<string> {
  const { data, error } = await supabase.rpc('admin_salvar_influenciador', {
    p_id: id as string,
    p_email: c.email.trim().toLowerCase(),
    p_nome: c.nome.trim(),
    p_arroba: c.arroba.trim(),
    p_seguidores: c.seguidores as number,
    p_comissao_pct: c.comissaoPct,
    p_comissao_meses: c.comissaoMeses,
    p_videos_por_mes: c.videosPorMes,
  })
  if (error) {
    const m = error.message ?? ''
    if (m.includes('JA_NA_LISTA') || error.code === '23505') throw new Error('Esse e-mail já está na lista.')
    // EasyFeed e Influencers não compartilham login: o mesmo e-mail não pode ser das duas coisas.
    if (m.includes('EMAIL_DE_RESTAURANTE')) {
      throw new Error('Esse e-mail já é de uma conta do EasyFeed. Use outro e-mail para o acesso de influenciador.')
    }
    if (m.includes('EMAIL_INVALIDO') || error.code === '23514') throw new Error('Confira o e-mail digitado.')
    if (m.includes('_INVALID')) throw new Error('Confira a comissão, os meses e os vídeos por mês.')
    throw error
  }
  return data as string
}

/** Tira o acesso; o link para de valer (quem já entrou por ele continua contado). */
export async function removerInfluenciador(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remover_influenciador', { p_id: id })
  if (error) throw error
}

/** Conta, não conta (com o porquê, que o influenciador vê) ou volta para conferir. */
export async function conferirVideo(id: string, situacao: SituacaoDoVideo, recado = ''): Promise<void> {
  const { error } = await supabase.rpc('admin_conferir_video', { p_id: id, p_situacao: situacao, p_recado: recado })
  if (error) throw error
}

/** As contas de teste (dos admins e as de demonstração dos vendedores) entram nos dados da área? */
export async function lerIncluiTestes(): Promise<boolean> {
  const { data, error } = await supabase.rpc('influencers_incluem_testes')
  if (error) throw error
  return data !== false
}

export async function definirIncluiTestes(incluir: boolean): Promise<void> {
  const { error } = await supabase.rpc('influencers_definir_incluir_testes', { p_incluir: incluir })
  if (error) throw error
}
