import { supabase } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface ModeloIA {
  id: string
  nome: string
  modelo: string
  api_key: string
  ativo: boolean
  created_at: string
}

export async function listarModelos(): Promise<ModeloIA[]> {
  const { data, error } = await db
    .from('modelos_ia')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as ModeloIA[]
}

export async function adicionarModelo(entrada: { nome: string; modelo: string; api_key: string }): Promise<void> {
  const { error } = await db.from('modelos_ia').insert({
    nome: entrada.nome.trim(),
    modelo: entrada.modelo.trim(),
    api_key: entrada.api_key.trim(),
    ativo: false,
  })
  if (error) throw new Error(error.message)
}

/** Ativa um modelo (desativa os demais) via RPC — só 1 fica ativo. */
export async function ativarModelo(id: string): Promise<void> {
  const { error } = await db.rpc('ativar_modelo_ia', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function removerModelo(id: string): Promise<void> {
  const { error } = await db.from('modelos_ia').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
