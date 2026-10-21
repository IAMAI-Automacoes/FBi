/**
 * As avaliações do Google na página /google: os filtros da lista, o filtro de
 * data e o limite da resposta do dono. Quem filtra e conta é o banco
 * (google_resumo_periodo e a consulta da lista); aqui fica a regra que a tela
 * usa para montar o pedido. Sem React nem Supabase, para os testes rodarem no Node.
 */

/** Os filtros da lista; um número = só as avaliações com aquelas estrelas. */
export type FiltroAvaliacoes = 'todas' | 'sem_resposta' | 'negativas' | 'com_comentario' | 1 | 2 | 3 | 4 | 5

export const FILTROS_FIXOS: ReadonlyArray<{ chave: Exclude<FiltroAvaliacoes, number>; rotulo: string }> = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'sem_resposta', rotulo: 'Sem resposta' },
  { chave: 'negativas', rotulo: 'Negativas' },
  { chave: 'com_comentario', rotulo: 'Com comentário' },
]

// ── Filtro de data (o mesmo das outras telas) ───────────────────────────────

export type PeriodoGoogle = 'all' | '7d' | '30d' | '90d'
const DIAS_DO_PERIODO: Record<Exclude<PeriodoGoogle, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * O recorte do filtro em [de, ate), igual a /feedbacks: o atalho conta do
 * início do dia de N dias atrás; o intervalo do calendário vai do início do
 * primeiro dia até o fim do último. null = sem corte daquele lado.
 */
export function intervaloDoPeriodo(
  periodo: PeriodoGoogle,
  datas?: { from: Date; to?: Date },
  agora: Date = new Date(),
): { de: Date | null; ate: Date | null } {
  const inicioDoDia = (d: Date, mais = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + mais)
  if (datas) return { de: inicioDoDia(datas.from), ate: inicioDoDia(datas.to ?? datas.from, 1) }
  if (periodo === 'all') return { de: null, ate: null }
  return { de: inicioDoDia(agora, -DIAS_DO_PERIODO[periodo]), ate: null }
}

/** Os números do período (vêm do banco: google_resumo_periodo). */
export interface NumerosDoPeriodo {
  /** Índice 0 = 1 estrela. */
  estrelas: number[]
  quantidade: number
  media: number | null
  respondidas: number
  semResposta: number
  negativas: number
  comComentario: number
  /** A avaliação mais recente de todas, sem o filtro. */
  ultimaEm: string | null
}

/** Quantas avaliações o filtro mostra no período (o número no botão e o "restam N"). */
export function totalDoFiltro(n: NumerosDoPeriodo, f: FiltroAvaliacoes): number {
  if (typeof f === 'number') return n.estrelas[f - 1] ?? 0
  if (f === 'sem_resposta') return n.semResposta
  if (f === 'negativas') return n.negativas
  if (f === 'com_comentario') return n.comComentario
  return n.quantidade
}

/** O Google aceita resposta de até 4096 bytes (UTF-8: acento conta 2). */
export const LIMITE_RESPOSTA_BYTES = 4096

export const bytesUtf8 = (t: string): number => new TextEncoder().encode(t).length

/** Quanto ainda cabe na resposta (negativo = passou do limite). */
export const restanteDaResposta = (texto: string): number => LIMITE_RESPOSTA_BYTES - bytesUtf8(texto.trim())

/** O texto pronto para publicar: tem conteúdo e cabe no limite. */
export const respostaPublicavel = (texto: string): boolean => texto.trim().length > 0 && restanteDaResposta(texto) >= 0
