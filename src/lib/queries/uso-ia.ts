import { supabase } from '@/lib/supabase/client'
import { versaoDaConta } from '@/lib/admin-versoes'
import type { Area } from '@/lib/areas'

// As tabelas e RPCs de uso não estão nos tipos gerados; acesso destipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface UsoCiclo {
  gasto: number
  limite: number
  cicloInicio: string
  /** Quanto ainda pode ser gasto até o fim do ciclo. */
  restante: number
}

export interface LinhaUso {
  id: string
  restaurante_id: number | null
  origem: string
  agente_id: string | null
  modelo: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  custo_usd: number
  created_at: string
}

/**
 * Consumo de IA do restaurante no ciclo atual.
 *
 * Devolve null quando não dá para saber (sem sessão, falha de rede) — a
 * interface esconde a barra em vez de mostrar um número errado.
 */
export async function buscarUsoCiclo(): Promise<UsoCiclo | null> {
  try {
    const { data, error } = await db.rpc('meu_uso_ia')
    if (error) return null
    const linha = Array.isArray(data) ? data[0] : data
    if (!linha) return null
    const gasto = Number(linha.gasto ?? 0)
    const limite = Number(linha.limite ?? 0)
    return {
      gasto,
      limite,
      cicloInicio: linha.ciclo_inicio,
      restante: Math.max(limite - gasto, 0),
    }
  } catch {
    return null
  }
}

/**
 * As linhas de uso do período, só das contas da versão pedida. O uso sem conta
 * (rotinas agendadas) aparece nas duas: não é de nenhuma.
 */
async function linhasDeUso(dias: number, colunas: string, area?: Area): Promise<any[]> {
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  const { data, error } = await db
    .from('uso_ia')
    .select(colunas)
    .gte('created_at', desde.toISOString())
  if (error) throw new Error(error.message)
  const linhas = (data || []) as any[]
  if (!area) return linhas
  const ids = [...new Set(linhas.map((l) => l.restaurante_id).filter((id) => id != null))]
  const daVersao = new Set<number>()
  if (ids.length) {
    const { data: rest, error: erroRest } = await db.from('restaurantes').select('id, area').in('id', ids)
    if (erroRest) throw new Error(erroRest.message)
    for (const r of rest || []) if (versaoDaConta(r.area) === area) daVersao.add(r.id)
  }
  return linhas.filter((l) => l.restaurante_id == null || daVersao.has(l.restaurante_id))
}

/** Consumo por restaurante, para o painel de admin (só as contas da versão, se pedida). */
export async function buscarUsoPorRestaurante(dias = 30, area?: Area): Promise<
  Array<{ restaurante_id: number | null; nome: string; gasto: number; chamadas: number }>
> {
  const data = await linhasDeUso(dias, 'restaurante_id, custo_usd', area)

  const porId = new Map<number | null, { gasto: number; chamadas: number }>()
  for (const linha of data) {
    const atual = porId.get(linha.restaurante_id) ?? { gasto: 0, chamadas: 0 }
    atual.gasto += Number(linha.custo_usd || 0)
    atual.chamadas += 1
    porId.set(linha.restaurante_id, atual)
  }

  const ids = [...porId.keys()].filter((id): id is number => id != null)
  const nomes = new Map<number, string>()
  if (ids.length) {
    const { data: rest } = await db.from('restaurantes').select('id, nome_restaurante').in('id', ids)
    for (const r of rest || []) nomes.set(r.id, r.nome_restaurante)
  }

  return [...porId.entries()]
    .map(([id, v]) => ({
      restaurante_id: id,
      nome: id == null ? 'Sem conta (rotinas agendadas)' : (nomes.get(id) ?? `#${id}`),
      ...v,
    }))
    .sort((a, b) => b.gasto - a.gasto)
}

/** Consumo por agente, para saber onde o custo se concentra (só as contas da versão, se pedida). */
export async function buscarUsoPorAgente(dias = 30, area?: Area): Promise<
  Array<{ agente: string; gasto: number; chamadas: number }>
> {
  const data = await linhasDeUso(dias, 'restaurante_id, agente_id, origem, custo_usd', area)

  const mapa = new Map<string, { gasto: number; chamadas: number }>()
  for (const linha of data) {
    const chave = linha.agente_id || linha.origem || 'desconhecido'
    const atual = mapa.get(chave) ?? { gasto: 0, chamadas: 0 }
    atual.gasto += Number(linha.custo_usd || 0)
    atual.chamadas += 1
    mapa.set(chave, atual)
  }

  return [...mapa.entries()]
    .map(([agente, v]) => ({ agente, ...v }))
    .sort((a, b) => b.gasto - a.gasto)
}

/** Ajusta o teto de crédito de um restaurante (só admin passa na RLS). */
export async function definirLimiteCredito(restauranteId: number, limite: number): Promise<void> {
  const { error } = await db
    .from('restaurantes')
    .update({ credito_ia_limite_usd: limite })
    .eq('id', restauranteId)
  if (error) throw new Error(error.message)
}
