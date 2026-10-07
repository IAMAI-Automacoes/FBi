import { supabase } from '@/lib/supabase/client'

/*
 * EasyFeed Influencers. Duas metades:
 *   · admin (painel do admin → Influenciadores): usa o login normal (`supabase`);
 *   · a área /influencers: usa o login de lá (`supabaseInfluencers`), separado.
 * As funções da área ficam em `src/pages/influencers/dados.ts`, para este
 * arquivo não carregar o cliente da área nas páginas do admin.
 */

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface InfluenciadorAdmin {
  id: string
  email: string
  /** Quanto paga por mês ao EasyFeed. `null` = não definido. */
  valor_mensal: number | null
  nome: string | null
  arroba: string | null
  cidade: string | null
  onboarding_em: string | null
  ultimo_acesso_em: string | null
  criado_em: string
}

export async function listarInfluenciadores(): Promise<InfluenciadorAdmin[]> {
  const { data, error } = await supabase
    .from('influenciadores')
    .select('id, email, valor_mensal, nome, arroba, cidade, onboarding_em, ultimo_acesso_em, criado_em')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []).map((l) => ({ ...l, valor_mensal: l.valor_mensal == null ? null : Number(l.valor_mensal) }))
}

export async function adicionarInfluenciador(email: string, valorMensal: number | null): Promise<void> {
  const { error } = await supabase
    .from('influenciadores')
    .insert({ email: email.trim().toLowerCase(), valor_mensal: valorMensal })
  if (error) {
    if (error.code === '23505') throw new Error('Esse e-mail já está na lista.')
    if (error.code === '23514') throw new Error('Confira o e-mail digitado.')
    throw error
  }
}

export async function atualizarValorInfluenciador(id: string, valorMensal: number | null): Promise<void> {
  const { error } = await supabase.from('influenciadores').update({ valor_mensal: valorMensal }).eq('id', id)
  if (error) throw error
}

export async function removerInfluenciador(id: string): Promise<void> {
  const { error } = await supabase.from('influenciadores').delete().eq('id', id)
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
