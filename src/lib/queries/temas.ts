import { supabase } from '@/lib/supabase/client'

export interface TemaFeedback {
  id: string
  rotulo: string
  tipo: 'elogio' | 'reclamacao' | 'neutro' | 'sugestao' | string
  quantidade: number
}

export type SentimentoFiltro = 'todos' | 'positivo' | 'negativo' | 'neutro' | 'sugestao'

/** Tipo do tema (feedback_temas.tipo) de cada filtro. */
const TIPO_DO_FILTRO: Record<Exclude<SentimentoFiltro, 'todos'>, string> = {
  positivo: 'elogio',
  negativo: 'reclamacao',
  neutro: 'neutro',
  sugestao: 'sugestao',
}

/**
 * Temas agrupados do restaurante, contando os feedbacks dentro do período
 * (últimos `dias`; 0 = tudo) e do sentimento escolhido, do mais falado pro menos.
 */
export async function buscarTemas(
  restauranteId: number | null,
  dias: number,
  sentimento: SentimentoFiltro,
): Promise<TemaFeedback[]> {
  if (!restauranteId) return []
  const desde = dias > 0 ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString() : null
  const tipo = sentimento === 'todos' ? null : TIPO_DO_FILTRO[sentimento]

  const { data, error } = await supabase.rpc('temas_agrupados', {
    p_restaurante_id: restauranteId,
    p_desde: desde,
    p_tipo: tipo,
  })
  if (error) throw error
  return (data || []).map((r: any) => ({
    id: r.id,
    rotulo: r.rotulo,
    tipo: r.tipo,
    quantidade: Number(r.quantidade),
  })) as TemaFeedback[]
}
