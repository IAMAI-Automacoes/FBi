/**
 * Linha real da tabela `acoes_operacionais` (colunas em português).
 *
 * Mesmo motivo do tipo `Insight`: o quadro de ações misturava o formato do mock
 * em inglês (`ActionTask`) com a linha do banco, e o modal chegava a ler uma
 * chave `_original` que não existia em lugar nenhum — por isso o Plano de Ação
 * aparecia sempre vazio.
 */
export type StatusAcao = 'SUGERIDA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'

/**
 * `OBSERVACAO` é o nível mais baixo, igual ao dos insights — a ação herda a
 * prioridade do insight que a originou, então os dois vocabulários precisam ser
 * o mesmo.
 *
 * `NORMAL` é legado e só aparece em linhas antigas: este tipo declarava
 * `'NORMAL' | 'IMPORTANTE' | 'URGENTE'` enquanto o banco, o TaskModal, os
 * prompts da IA e `src/lib/prioridade.ts` já falavam `OBSERVACAO`. O
 * `TaskBoard` chegava a usar os dois no mesmo arquivo, um em cada fallback.
 * Fica aceito na leitura para não quebrar essas linhas; nada novo escreve.
 */
export type PrioridadeAcao = 'OBSERVACAO' | 'IMPORTANTE' | 'URGENTE' | 'NORMAL'

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
