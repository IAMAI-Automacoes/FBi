/**
 * As avaliações do Google na página /google: os filtros da lista, as contagens
 * e o limite da resposta do dono. Sem React nem Supabase, para os testes
 * rodarem no Node.
 */

export interface AvaliacaoParaFiltro {
  nota: number
  comentario: string | null
  resposta: string | null
}

/** Os filtros da lista; um número = só as avaliações com aquelas estrelas. */
export type FiltroAvaliacoes = 'todas' | 'sem_resposta' | 'negativas' | 'com_comentario' | 1 | 2 | 3 | 4 | 5

export const FILTROS_FIXOS: ReadonlyArray<{ chave: Exclude<FiltroAvaliacoes, number>; rotulo: string }> = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'sem_resposta', rotulo: 'Sem resposta' },
  { chave: 'negativas', rotulo: 'Negativas' },
  { chave: 'com_comentario', rotulo: 'Com comentário' },
]

/** Negativa: de 1 a 3 estrelas — a que mais pede uma resposta. */
export const ehNegativa = (a: Pick<AvaliacaoParaFiltro, 'nota'>): boolean => a.nota <= 3

export function passaNoFiltro(a: AvaliacaoParaFiltro, f: FiltroAvaliacoes): boolean {
  if (typeof f === 'number') return a.nota === f
  if (f === 'sem_resposta') return !a.resposta
  if (f === 'negativas') return ehNegativa(a)
  if (f === 'com_comentario') return !!a.comentario
  return true
}

export const filtrarAvaliacoes = <T extends AvaliacaoParaFiltro>(lista: readonly T[], f: FiltroAvaliacoes): T[] =>
  lista.filter((a) => passaNoFiltro(a, f))

/** Quantas avaliações cada filtro fixo mostra (o número no botão). */
export function contarFiltros(lista: readonly AvaliacaoParaFiltro[]): Record<Exclude<FiltroAvaliacoes, number>, number> {
  return {
    todas: lista.length,
    sem_resposta: lista.filter((a) => passaNoFiltro(a, 'sem_resposta')).length,
    negativas: lista.filter((a) => passaNoFiltro(a, 'negativas')).length,
    com_comentario: lista.filter((a) => passaNoFiltro(a, 'com_comentario')).length,
  }
}

/** Parte das avaliações que já têm resposta (0 a 1); null sem avaliações. */
export function taxaDeResposta(lista: readonly AvaliacaoParaFiltro[]): number | null {
  if (lista.length === 0) return null
  return lista.filter((a) => !!a.resposta).length / lista.length
}

/** O Google aceita resposta de até 4096 bytes (UTF-8: acento conta 2). */
export const LIMITE_RESPOSTA_BYTES = 4096

export const bytesUtf8 = (t: string): number => new TextEncoder().encode(t).length

/** Quanto ainda cabe na resposta (negativo = passou do limite). */
export const restanteDaResposta = (texto: string): number => LIMITE_RESPOSTA_BYTES - bytesUtf8(texto.trim())

/** O texto pronto para publicar: tem conteúdo e cabe no limite. */
export const respostaPublicavel = (texto: string): boolean => texto.trim().length > 0 && restanteDaResposta(texto) >= 0
