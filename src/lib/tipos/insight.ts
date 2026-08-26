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
  /**
   * @deprecated Contagem legada, derivada de `feedback_ids` (originais). Use
   * `totalPontos`, que conta os PONTOS SEPARADOS — que é o que a tela lista.
   * Contar originais aqui e listar pontos na telinha era a origem do número
   * que não batia.
   */
  feedbacks_relacionados: number | null
  /**
   * @deprecated IDs de `feedbacks_originais`. Mantido só para compatibilidade
   * enquanto código antigo ainda lê. O vínculo autoritativo agora é a tabela
   * `insight_feedback`, que guarda o PONTO — um original vira vários pontos de
   * assuntos diferentes, então guardar o original é impreciso por construção.
   */
  feedback_ids: string[] | null
  gerado_por: string | null
  ativo: boolean | null
  /** Fixado no topo da lista, por cima da ordenação por data de criação. */
  fixado: boolean | null
  created_at: string | null

  // --- ciclo de vida (migration 20260826010000) ---------------------------
  /** Excluído à mão pelo dono. Insight nunca é apagado do banco. */
  deletado_em: string | null
  /** Saiu de cena: substituído por uma rodada nova, ou virou ação. */
  desativado_em: string | null
  /** Quando `motivo_encerramento = 'virou_acao'`, a ação que ele virou. */
  acao_id: number | null
  motivo_encerramento: 'substituido' | 'excluido' | 'virou_acao' | null

  /**
   * Contagem de pontos vinda do embed `insight_feedback(count)` do PostgREST,
   * que devolve `[{ count: N }]`. É a MESMA fonte que a telinha lista, então o
   * número do card e o da lista não têm como divergir.
   */
  insight_feedback?: { count: number }[] | null
}

/**
 * Quantos pontos separados sustentam este insight.
 *
 * Cai em `feedbacks_relacionados` só para insight antigo, gerado antes de
 * `insight_feedback` existir — aí o número é o legado mesmo, e a telinha não
 * terá o que mostrar.
 */
export function totalPontos(insight: Insight): number {
  const doEmbed = insight.insight_feedback?.[0]?.count
  if (typeof doEmbed === 'number') return doEmbed
  return insight.feedbacks_relacionados ?? 0
}
