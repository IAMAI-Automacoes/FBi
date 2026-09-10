/**
 * Em quais % de uma meta de aberturas avisar o garçom do progresso.
 *
 * Puro e testável de propósito — sem `Deno`, sem banco — mesmo padrão de
 * `limiar.ts`/`gravidade.ts`. Quem dispara o webhook é `aviso-garcom.ts`.
 *
 * ## A pesquisa por trás dos números
 *
 * - **Goal-gradient effect** (Hull, 1932; retomado por Kivetz, Urminsky &
 *   Zheng, 2006): esforço e engajamento crescem conforme o fim se aproxima —
 *   no estudo dos cartões de selo de café, o cliente comprava 2,4x mais
 *   rápido perto do 10º selo do que do 1º. Por isso os marcos ficam mais
 *   DENSOS perto de 100% (75/90/100, intervalos de 15 e 10 pontos) do que no
 *   começo (0→25→50, intervalos de 25).
 * - **Inserção de marcos intermediários / endowed progress** (Nunes & Drèze,
 *   2006): quebrar uma meta longa em sub-metas visíveis faz ela parecer mais
 *   alcançável. Vale mais pra metas GRANDES — é nelas que a distância entre
 *   "zero" e "bateu" é grande o bastante pra precisar de marcos no meio.
 * - **Fadiga de notificação**: pra metas curtas, cada abertura já representa
 *   um salto grande de %, e um aviso no meio do caminho não soma nada — só
 *   teria motivo de avisar perto do fim. Meta de 7, por exemplo: 50% são só
 *   3-4 aberturas, o garçom bate a meta inteira em poucos dias de qualquer
 *   jeito, e um "você está na metade!" nesse tamanho soa mais como spam do
 *   que como incentivo.
 * - **Números redondos como referência** (Heath, Larrick & Wu, 1999 —
 *   "Goals as reference points"): os marcos escolhidos são sempre múltiplos
 *   de 25 (ou 50/90), nunca frações como 33% ou 60% — combina com a forma
 *   como as pessoas naturalmente pensam em progresso.
 *
 * As quatro faixas abaixo NÃO vêm de um número mágico — são o ponto de
 * corte que fez os exemplos discutidos com o Raver caírem no lugar certo
 * (meta 7 → só 100%; meta 50 → vários marcos, incluindo 50 e 75) mantendo a
 * lógica acima. Ajustar os limiares das faixas é seguro; a FORMA (mais denso
 * perto de 100%) é o que carrega a pesquisa.
 */
export function marcosParaMeta(meta: number): number[] {
  if (!Number.isFinite(meta) || meta <= 0) return []
  if (meta <= 7) return [100]
  if (meta <= 14) return [50, 100]
  if (meta <= 29) return [50, 75, 100]
  return [25, 50, 75, 90, 100]
}

/** Quantas aberturas correspondem a um marco (%) de uma meta — sempre
 *  arredondado pra cima e nunca menor que 1, pra "50% de uma meta de 3"
 *  virar a 2ª abertura em vez de virar 1,5. */
export function contagemDoMarco(meta: number, marco: number): number {
  return Math.max(1, Math.ceil((meta * marco) / 100))
}

/**
 * Todos os marcos cujo alvo a contagem ATUAL já atingiu — não só "o que
 * cruzou agora".
 *
 * De propósito não compara com uma contagem "de antes": calcular só o que
 * cruzou nesta abertura (via subtração) é uma armadilha sob concorrência.
 * Duas aberturas do MESMO garçom quase simultâneas (duas mesas escaneando
 * junto) cada uma lê a contagem depois de as duas já terem sido gravadas —
 * as duas veem o mesmo "depois" e, se cada uma assumir que só a sua própria
 * abertura é a diferença, as duas podem concluir (erradas) que não cruzaram
 * nada, e o marco nunca dispara.
 *
 * Aqui a função devolve TODOS os marcos já batidos, sempre — inclusive os
 * que já foram avisados antes. Repetir não tem custo: quem impede o aviso
 * em dobro é a UNIQUE do banco (por garçom + regra + período + marco), não
 * esta função. Assim, mesmo sob concorrência, todo marco atingido tem
 * garantia de ser reivindicado por ALGUMA das aberturas que passaram por
 * ele — nunca falta, na pior das hipóteses tenta de novo à toa.
 */
export function marcosAtingidos(meta: number, contagem: number): number[] {
  return marcosParaMeta(meta).filter((marco) => contagemDoMarco(meta, marco) <= contagem)
}

/** Compara dois timestamps ISO como instantes de verdade — mesmo motivo de
 *  `antesDe` em `src/lib/queries/bonificacao-garcons.ts`: `scanned_at` vem
 *  do Postgres com formato diferente de `periodo_inicio` (que sai do JS). */
export function antesDe(a: string, b: string): boolean {
  return new Date(a).getTime() < new Date(b).getTime()
}

function somarDias(data: Date, dias: number): Date {
  const d = new Date(data.getTime())
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

/** Mesma regra do `addMonths` do date-fns: se o dia original não existe no
 *  mês de destino (31 de janeiro + 1 mês), cai pro último dia daquele mês em
 *  vez de estourar pro mês seguinte. Precisa concordar EXATAMENTE com
 *  `avancarPeriodo` de `src/lib/queries/bonificacao-garcons.ts` — tela e
 *  função server-side têm que decidir a mesma data de fim de período. */
function somarMeses(data: Date, meses: number): Date {
  const diaOriginal = data.getUTCDate()
  const d = new Date(data.getTime())
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimoDiaDoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(diaOriginal, ultimoDiaDoMes))
  return d
}

export interface RegraPeriodo {
  frequencia: 'semanal' | 'mensal' | 'trimestral' | 'personalizado'
  dias_personalizados?: number | null
}

export function avancarPeriodo(inicio: Date, regra: RegraPeriodo): Date {
  if (regra.frequencia === 'semanal') return somarDias(inicio, 7)
  if (regra.frequencia === 'trimestral') return somarMeses(inicio, 3)
  if (regra.frequencia === 'personalizado') return somarDias(inicio, Math.max(1, regra.dias_personalizados || 1))
  return somarMeses(inicio, 1)
}

/** Uma regra vale pra um garçom específico? `null`/lista vazia = vale pra
 *  todos — mesma semântica de `garcomParticipaDaRegra` em
 *  `bonificacao-garcons.ts`. */
export function garcomParticipaDaRegra(participantes: number[] | null | undefined, garcomId: number): boolean {
  return !participantes || participantes.length === 0 || participantes.includes(garcomId)
}
