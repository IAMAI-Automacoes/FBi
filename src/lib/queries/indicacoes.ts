import { supabase } from '@/lib/supabase/client'
import { lerBonus, lerNumeros, type AreaDaIndicacao, type MinhaIndicacao, type StatusPremio } from '@/lib/indicacoes'
import { REGRA_PADRAO, type CustoDaComissao, type RegraDeComissao } from '@/lib/vendedores'

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

/** O desconto que um código (vendedor, influenciador ou restaurante) dá a quem compra (0 = nenhum), para a tela de compra. */
export async function buscarDescontoDoCodigo(codigo: string): Promise<{ pct: number; cobrancas: number }> {
  const limpo = codigo.trim().toUpperCase()
  if (!limpo) return { pct: 0, cobrancas: 0 }
  const { data, error } = await supabase.rpc('indicacao_desconto_do_codigo', { p_codigo: limpo })
  if (error) return { pct: 0, cobrancas: 0 }
  const r = (data ?? {}) as { pct?: number; cobrancas?: number }
  return { pct: Number(r.pct) || 0, cobrancas: Number(r.cobrancas) || 0 }
}

// ── Admin → Descontos → Indicação ────────────────────────────────────────────

/** Quanto cada indicado vale para quem indicou, o mínimo de meses pagos que
    conta na renovação semestral/anual, e o desconto de quem compra com o
    código de um restaurante (`indicacao_config`). */
export interface ConfigDaIndicacao {
  bonusPct: number
  mesesParaRenovacao: number
  /** % de desconto para quem compra com o código de um restaurante (0 = nenhum)… */
  descontoIndicadoPct: number
  /** …nas N primeiras cobranças. */
  descontoIndicadoCobrancas: number
}

export async function buscarConfigDaIndicacao(): Promise<ConfigDaIndicacao> {
  const { data, error } = await supabase.from('indicacao_config')
    .select('bonus_pct, meses_para_renovacao, desconto_indicado_pct, desconto_indicado_cobrancas').limit(1).maybeSingle()
  if (error) throw error
  return {
    bonusPct: Number(data?.bonus_pct) || 100,
    mesesParaRenovacao: Number(data?.meses_para_renovacao) || 4,
    descontoIndicadoPct: Number(data?.desconto_indicado_pct) || 0,
    descontoIndicadoCobrancas: Number(data?.desconto_indicado_cobrancas) || 1,
  }
}

export async function salvarConfigDaIndicacao(c: ConfigDaIndicacao): Promise<void> {
  const { error: e1 } = await supabase.rpc('indicacao_admin_bonus_pct', { p_pct: c.bonusPct })
  if (e1) throw e1
  const { error: e2 } = await supabase.rpc('indicacao_admin_meses_renovacao', { p_meses: c.mesesParaRenovacao })
  if (e2) throw e2
  const { error: e3 } = await supabase.rpc('indicacao_admin_desconto_indicado', {
    p_pct: c.descontoIndicadoPct,
    p_cobrancas: c.descontoIndicadoCobrancas,
  })
  if (e3) throw e3
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

/** Os nossos custos deste software, que saem antes da comissão (`comissao_custos`). */
export async function buscarCustosDaComissao(area: AreaDaIndicacao): Promise<CustoDaComissao[]> {
  const { data, error } = await supabase.from('comissao_custos')
    .select('id, nome, tipo, valor, ativo').eq('area', area).order('criado_em')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo === 'porcentagem' ? 'porcentagem' : 'valor', valor: Number(c.valor), ativo: c.ativo }))
}

export async function criarCustoDaComissao(area: AreaDaIndicacao, c: Omit<CustoDaComissao, 'id' | 'ativo'>): Promise<void> {
  const { error } = await supabase.from('comissao_custos').insert({ area, nome: c.nome, tipo: c.tipo, valor: c.valor })
  if (error) throw error
}

export async function mudarCustoDaComissao(id: string, campos: Partial<Omit<CustoDaComissao, 'id'>>): Promise<void> {
  const { error } = await supabase.from('comissao_custos').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function excluirCustoDaComissao(id: string): Promise<void> {
  const { error } = await supabase.from('comissao_custos').delete().eq('id', id)
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
