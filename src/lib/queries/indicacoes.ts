import { supabase } from '@/lib/supabase/client'
import type { IndicacaoAdmin, MinhaIndicacao, StatusPremio } from '@/lib/indicacoes'

/* Indicação entre restaurantes: tudo passa por funções do banco
   (migration 20261017010000_indicacoes.sql), que conferem por dentro quem pode. */

/** A subpágina Indicações: benefício, código, contagens e prêmios da conta logada. */
export async function buscarMinhaIndicacao(): Promise<MinhaIndicacao> {
  const { data, error } = await supabase.rpc('indicacao_minha')
  if (error) throw error
  const r = (data ?? {}) as Partial<MinhaIndicacao>
  return {
    liberado: r.liberado === true,
    sem_restaurante: r.sem_restaurante === true,
    ativo: r.ativo === true,
    beneficio: r.beneficio ?? '',
    codigo: r.codigo ?? null,
    indicados: Number(r.indicados ?? 0),
    assinaram: Number(r.assinaram ?? 0),
    premios: r.premios ?? [],
  }
}

/**
 * A conta logada diz quem a indicou (código do link `?ref=` ou digitado).
 * Nunca lança: indicação não pode atrapalhar o cadastro nem a compra.
 */
export async function registrarIndicacao(codigo: string): Promise<{ ok: boolean; motivo?: string }> {
  const limpo = codigo.trim().toUpperCase()
  if (!limpo) return { ok: false, motivo: 'codigo_invalido' }
  try {
    const { data, error } = await supabase.rpc('indicacao_registrar', { p_codigo: limpo })
    if (error) return { ok: false, motivo: 'erro' }
    return (data ?? { ok: false, motivo: 'erro' }) as { ok: boolean; motivo?: string }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

// ── Admin (Admin → Afiliados) ────────────────────────────────────────────────

export async function buscarIndicacaoAdmin(): Promise<IndicacaoAdmin> {
  const { data, error } = await supabase.rpc('indicacao_admin')
  if (error) throw error
  const r = (data ?? {}) as Partial<IndicacaoAdmin>
  return {
    ativo: r.ativo === true,
    beneficio: r.beneficio ?? '',
    atualizado_em: r.atualizado_em ?? null,
    premios: r.premios ?? [],
    indicadores: r.indicadores ?? [],
  }
}

/** Liga, desliga e muda o texto do benefício. Devolve o motivo quando o banco recusa. */
export async function salvarIndicacaoAdmin(ativo: boolean, beneficio: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data, error } = await supabase.rpc('indicacao_admin_salvar', { p_ativo: ativo, p_beneficio: beneficio })
  if (error) throw error
  return (data ?? { ok: false }) as { ok: boolean; motivo?: string }
}

/** O admin marca que já deu o benefício, cancela ou volta para pendente. */
export async function mudarPremioDaIndicacao(id: string, status: StatusPremio): Promise<void> {
  const { data, error } = await supabase.rpc('indicacao_admin_premio', { p_id: id, p_status: status })
  if (error) throw error
  const r = (data ?? {}) as { ok?: boolean; motivo?: string }
  if (!r.ok) throw new Error(r.motivo ?? 'erro')
}
