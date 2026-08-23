/**
 * Linha real da tabela `insights` (colunas em português).
 *
 * Existe porque os componentes que leem do banco estavam tipados contra
 * `InsightData` (o mock em inglês de `@/lib/mock-data`). O descompasso fazia
 * `insight.category` ser sempre `undefined` em dados reais — o que matava, em
 * silêncio, a busca de feedbacks relacionados no chat de insights.
 *
 * `InsightData` continua existindo para os dados mock; só não deve mais ser
 * usado por quem lê do Supabase.
 */
export type PrioridadeInsight = 'URGENTE' | 'IMPORTANTE' | 'OBSERVACAO'

export interface Insight {
  id: string // uuid
  restaurante_id: number | null // bigint
  prioridade: PrioridadeInsight | null
  categoria: string | null
  titulo: string | null
  descricao: string | null
  sugestao: string | null
  /** Contagem derivada de `feedback_ids` (antes era um número inventado pela IA). */
  feedbacks_relacionados: number | null
  /** IDs de `feedbacks_originais` que sustentam este insight. Vazio nos insights
   *  criados antes da migration `20260813010000_insights_feedback_ids`. */
  feedback_ids: string[] | null
  gerado_por: string | null
  ativo: boolean | null
  /** Fixado no topo da lista, por cima da ordenação por data de criação. */
  fixado: boolean | null
  created_at: string | null
}
