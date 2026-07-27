import { supabase } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface RestauranteRef {
  id: number
  nome_restaurante: string | null
}

export interface FatoMemoriaAdmin {
  id: string
  fato: string
  categoria: string | null
  created_at: string
}

/** Restaurantes visíveis (admin lê todos via política de plataforma). */
export async function listarRestaurantesRef(): Promise<RestauranteRef[]> {
  const { data, error } = await db
    .from('restaurantes')
    .select('id, nome_restaurante')
    .order('nome_restaurante', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as RestauranteRef[]
}

/** Memória de longo prazo (fatos que a IA aprendeu) de um restaurante. */
export async function listarMemoria(restauranteId: number): Promise<FatoMemoriaAdmin[]> {
  const { data, error } = await db
    .from('memoria_assistente')
    .select('id, fato, categoria, created_at')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as FatoMemoriaAdmin[]
}

export async function adicionarFato(restauranteId: number, fato: string, categoria: string): Promise<void> {
  const { error } = await db.from('memoria_assistente').insert({
    restaurante_id: restauranteId,
    fato: fato.trim(),
    categoria: categoria.trim() || 'geral',
  })
  if (error) throw new Error(error.message)
}

export async function editarFato(id: string, fato: string, categoria: string): Promise<void> {
  const { data, error } = await db
    .from('memoria_assistente')
    .update({ fato: fato.trim(), categoria: categoria.trim() || 'geral' })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Nada foi alterado (permissão?).')
}

export async function apagarFato(id: string): Promise<void> {
  const { error } = await db.from('memoria_assistente').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
