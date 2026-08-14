/**
 * Linha real da tabela `acoes_operacionais` (colunas em português).
 *
 * Mesmo motivo do tipo `Insight`: o quadro de ações misturava o formato do mock
 * em inglês (`ActionTask`) com a linha do banco, e o modal chegava a ler uma
 * chave `_original` que não existia em lugar nenhum — por isso o Plano de Ação
 * aparecia sempre vazio.
 */
export type StatusAcao = 'SUGERIDA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'
export type PrioridadeAcao = 'NORMAL' | 'IMPORTANTE' | 'URGENTE'

export interface Acao {
  id: number // bigint
  restaurante_id: number | null // bigint
  titulo_acao: string | null
  /** O "plano de ação" mostrado e editado no modal. */
  plano_detalhado: string | null
  texto: string | null
  status: StatusAcao | null
  prioridade: PrioridadeAcao | null
  categoria: string | null
  feedback_id: number | null
  ordem: number
  /** Insight que originou a ação. Alimenta o botão "Feedbacks Relacionados". */
  insight_id: string | null // uuid
  /** Marca de arquivamento. O status continua 'CONCLUIDO' quando arquivada. */
  arquivada_em: string | null
  responsavel: string | null
  prazo: string | null // date (YYYY-MM-DD)
  created_at: string
}
