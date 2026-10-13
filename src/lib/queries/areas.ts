import { supabase } from '@/lib/supabase/client'
import { areaDe, type Area } from '@/lib/areas'

/* A versão do EasyFeed de cada conta: tudo passa por funções do banco
   (migration 20261019000000_area_da_conta.sql), que conferem por dentro. */

export interface OpcoesDeArea {
  /** A versão que a conta já tem; nulo = ainda não escolheu. */
  atual: Area | null
  /** As que este cadastro pode escolher (RH só com convite, por enquanto). */
  opcoes: Area[]
}

export async function buscarOpcoesDeArea(convite: string | null): Promise<OpcoesDeArea> {
  const { data, error } = await supabase.rpc('area_opcoes', { p_convite: convite ?? undefined })
  if (error) throw error
  const r = (data ?? {}) as { atual?: unknown; opcoes?: unknown[] }
  const opcoes = (r.opcoes ?? []).map(areaDe).filter((a): a is Area => a !== null)
  return { atual: areaDe(r.atual), opcoes: opcoes.length ? opcoes : ['restaurante'] }
}

/** A conta escolhe a versão (vale uma vez). Devolve o motivo quando o banco recusa. */
export async function escolherArea(area: Area, convite: string | null): Promise<{ ok: boolean; motivo?: string; area?: Area | null }> {
  const { data, error } = await supabase.rpc('escolher_area', { p_area: area, p_convite: convite ?? undefined })
  if (error) throw error
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; area?: unknown }
  return { ok: r.ok === true, motivo: r.motivo ?? undefined, area: areaDe(r.area) }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export type ModoDoRh = 'convite' | 'aberto'
export interface ConfigDeArea { rh_modo: ModoDoRh; rh_convite: string; contas_rh: number }

const lerConfig = (data: unknown): ConfigDeArea => {
  const r = (data ?? {}) as Partial<ConfigDeArea>
  return { rh_modo: r.rh_modo === 'aberto' ? 'aberto' : 'convite', rh_convite: r.rh_convite ?? '', contas_rh: Number(r.contas_rh ?? 0) }
}

export async function buscarConfigDeArea(): Promise<ConfigDeArea> {
  const { data, error } = await supabase.rpc('admin_area_config')
  if (error) throw error
  return lerConfig(data)
}

/** Muda o modo do RH e, se pedir, troca o código (o link antigo para de valer). */
export async function salvarConfigDeArea(modo: ModoDoRh, novoConvite = false): Promise<ConfigDeArea> {
  const { data, error } = await supabase.rpc('admin_area_salvar', { p_modo: modo, p_novo_convite: novoConvite })
  if (error) throw error
  return lerConfig(data)
}

/** O admin troca a versão de uma conta. */
export async function definirAreaDaConta(restauranteId: number, area: Area): Promise<void> {
  const { data, error } = await supabase.rpc('admin_definir_area', { p_restaurante_id: restauranteId, p_area: area })
  if (error) throw error
  if (!(data as { ok?: boolean } | null)?.ok) throw new Error((data as { motivo?: string } | null)?.motivo ?? 'erro')
}
