import { supabase } from '@/lib/supabase/client'
import { lerNiveis, lerNumeros, type AreaDaIndicacao, type MinhaIndicacao, type StatusPremio } from '@/lib/indicacoes'

/* Indicações: tudo passa por funções do banco (migrations 20261017010000,
   20261027000000 e 20261030030000), que conferem por dentro quem pode. */

/** A subpágina Indicações: código, números e a escada de benefícios da conta logada. */
export async function buscarMinhaIndicacao(): Promise<MinhaIndicacao> {
  const { data, error } = await supabase.rpc('indicacao_minha')
  if (error) throw error
  const r = (data ?? {}) as Record<string, unknown>
  return {
    liberado: r.liberado === true,
    sem_restaurante: r.sem_restaurante === true,
    area: r.area === 'rh' ? 'rh' : 'restaurante',
    codigo: typeof r.codigo === 'string' ? r.codigo : null,
    ativo: r.ativo !== false,
    numeros: lerNumeros(r.numeros),
    niveis: lerNiveis(r.niveis),
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

/** A porcentagem que já vem em todo afiliado novo deste software. */
export async function buscarPorcentagemPadrao(area: AreaDaIndicacao): Promise<number> {
  const { data, error } = await supabase.from('afiliado_config').select('comissao_padrao').eq('area', area).maybeSingle()
  if (error) throw error
  return data ? Number(data.comissao_padrao) : 10
}

export async function salvarPorcentagemPadrao(area: AreaDaIndicacao, porcentagem: number): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('afiliado_config')
    .upsert({ area, comissao_padrao: porcentagem, atualizado_por: u.user?.email ?? null, atualizado_em: new Date().toISOString() })
  if (error) throw error
}

export interface PremioDoAfiliado {
  id: string; beneficio: string; status: StatusPremio; criado_em: string; aplicado_em: string | null
  /** O nível da escada que liberou (null = benefício antigo, por indicado). */
  nivel: number | null
  /** Por quem (só no benefício antigo, por indicado). */
  indicado: string | null
}
/** `contam`: indicados que já pagaram 2 meses (os que valem para a escada). */
export interface NumerosDoAfiliado { entraram: number; assinaram: number; usam: number; contam: number; premios: PremioDoAfiliado[] }

/** O que cada afiliado de um software trouxe (por id do afiliado). */
export async function buscarNumerosDosAfiliados(area: AreaDaIndicacao): Promise<Record<string, NumerosDoAfiliado>> {
  const { data, error } = await supabase.rpc('afiliados_numeros', { p_area: area })
  if (error) throw error
  return (data ?? {}) as unknown as Record<string, NumerosDoAfiliado>
}

// ── A escada de benefícios (Admin → Afiliados, por software) ─────────────────

export interface NivelDaEscada { indicacoes: number; beneficio: string }

export async function buscarNiveis(area: AreaDaIndicacao): Promise<NivelDaEscada[]> {
  const { data, error } = await supabase.from('indicacao_niveis').select('indicacoes, beneficio').eq('area', area).order('indicacoes')
  if (error) throw error
  return (data ?? []) as NivelDaEscada[]
}

/**
 * Grava um nível. `antes`: quantas indicações ele pedia (mudar o número troca
 * a chave, então sai o antigo e entra o novo).
 */
export async function salvarNivel(area: AreaDaIndicacao, nivel: NivelDaEscada, antes?: number): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('indicacao_niveis').upsert({
    area, indicacoes: nivel.indicacoes, beneficio: nivel.beneficio.trim(),
    atualizado_por: u.user?.email ?? null, atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
  if (antes != null && antes !== nivel.indicacoes) await removerNivel(area, antes)
}

export async function removerNivel(area: AreaDaIndicacao, indicacoes: number): Promise<void> {
  const { error } = await supabase.from('indicacao_niveis').delete().eq('area', area).eq('indicacoes', indicacoes)
  if (error) throw error
}

/** O admin marca que já deu o benefício, cancela ou volta para pendente. */
export async function mudarPremioDaIndicacao(id: string, status: StatusPremio): Promise<void> {
  const { data, error } = await supabase.rpc('indicacao_admin_premio', { p_id: id, p_status: status })
  if (error) throw error
  const r = (data ?? {}) as { ok?: boolean; motivo?: string }
  if (!r.ok) throw new Error(r.motivo ?? 'erro')
}
