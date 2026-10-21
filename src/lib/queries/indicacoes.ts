import { supabase } from '@/lib/supabase/client'
import { lerBonus, lerNumeros, type AreaDaIndicacao, type MinhaIndicacao, type StatusPremio } from '@/lib/indicacoes'
import { REGRA_PADRAO, type RegraDeComissao } from '@/lib/vendedores'

/* Indicações: tudo passa por funções do banco (migrations 20261017010000,
   20261027000000 e 20261030040000), que conferem por dentro quem pode. */

/** A subpágina Indicações: código, números e os meses grátis da conta logada. */
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
    bonus: lerBonus(r.bonus),
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

// ── Admin → Vendedores ───────────────────────────────────────────────────────

/** A regra de comissão dos vendedores deste software (`afiliado_config`). */
export async function buscarRegraDeComissao(area: AreaDaIndicacao): Promise<RegraDeComissao> {
  const { data, error } = await supabase.from('afiliado_config')
    .select('comissao_entrada_pct, comissao_recorrente_pct, comissao_recorrente_meses').eq('area', area).maybeSingle()
  if (error) throw error
  if (!data) return { ...REGRA_PADRAO }
  return {
    entradaPct: Number(data.comissao_entrada_pct),
    recorrentePct: Number(data.comissao_recorrente_pct),
    recorrenteMeses: Number(data.comissao_recorrente_meses),
  }
}

export async function salvarRegraDeComissao(area: AreaDaIndicacao, r: RegraDeComissao): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('afiliado_config').upsert({
    area,
    comissao_entrada_pct: r.entradaPct,
    comissao_recorrente_pct: r.recorrentePct,
    comissao_recorrente_meses: r.recorrenteMeses,
    atualizado_por: u.user?.email ?? null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'area' })
  if (error) throw error
}

export interface PremioDoAfiliado {
  id: string; beneficio: string; status: StatusPremio; criado_em: string; aplicado_em: string | null
  descartado_em: string | null
  /** 'indicado_cancelou' ou 'admin'. */
  motivo: string | null
  /** Já está numa cobrança do Asaas ainda não paga. */
  reservado: boolean
  /** 'asaas' (automático) ou o e-mail do admin. */
  aplicado_por: string | null
  /** O indicado que gerou o mês grátis. */
  indicado: string
}
/** `contam`: indicados que já pagaram 2 meses (cada um virou 1 mês grátis). */
export interface NumerosDoAfiliado { entraram: number; assinaram: number; usam: number; contam: number; premios: PremioDoAfiliado[] }

/** O que cada afiliado de um software trouxe (por id do afiliado). */
export async function buscarNumerosDosAfiliados(area: AreaDaIndicacao): Promise<Record<string, NumerosDoAfiliado>> {
  const { data, error } = await supabase.rpc('afiliados_numeros', { p_area: area })
  if (error) throw error
  return (data ?? {}) as unknown as Record<string, NumerosDoAfiliado>
}
