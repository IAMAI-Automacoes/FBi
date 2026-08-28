/**
 * A nota de importância de um assunto, e o que o código garante em volta dela.
 *
 * ## A mudança de responsabilidade
 *
 * Antes, `gravidade.ts` decidia sozinho o quão importante era um assunto, por
 * dicionário de palavras. Funcionava e era estável, mas tinha um teto: nenhum
 * léxico cobre toda forma de reclamar, e ele não sabe NADA sobre este
 * restaurante em particular — não lê o perfil, as anotações da IA nem os
 * documentos de treinamento, então não tem como saber o que este dono valoriza.
 *
 * Agora quem dá a nota é a IA, lendo tudo isso. O código faz três coisas que a
 * IA não pode fazer bem:
 *
 *   1. **Garante o piso.** Risco sanitário não pode depender do humor do modelo
 *      numa rodada. Se o léxico reconhece corpo estranho ou intoxicação, a nota
 *      mínima é 10, doa a quem doer.
 *   2. **Converte nota em quantidade.** Quantas pessoas precisam ter relatado é
 *      uma conta, e conta tem que dar o mesmo resultado toda vez. Se a IA
 *      decidisse isso, o mesmo assunto pediria 3 pessoas hoje e 6 amanhã — que
 *      é exatamente o problema que existia antes de `limiar.ts`.
 *   3. **Amortece por elogios.** Comparar queixa com elogio é aritmética, não
 *      julgamento.
 */

import type { NivelGravidade } from './gravidade.ts'

/** A escala que a IA usa. 10 = risco sanitário; 0 = elogio. */
export const NOTA_MIN = 0
export const NOTA_MAX = 10

/**
 * Nota mínima que o léxico impõe, por nível reconhecido.
 *
 * Só os dois níveis severos têm piso. G2 para baixo fica inteiramente com a IA:
 * ali o léxico é fraco demais (o piso por sentimento coloca QUALQUER queixa em
 * G2) e travar a nota nesse patamar anularia o julgamento que se quer dela.
 *
 * A tabela é deliberadamente curta. Cada piso é uma decisão que a IA não pode
 * desfazer, e isso só se justifica quando errar tem custo real e irreversível.
 */
const PISO_POR_GRAVIDADE: Record<number, number> = {
  4: 10, // corpo estranho, intoxicação, agressão
  3: 7.5, // higiene visível, conduta grave, erro de conta
}

export interface ResultadoNota {
  /** A nota que vale, depois do piso. */
  nota: number
  /** O que a IA devolveu, antes de qualquer ajuste. */
  notaIA: number
  /** O piso aplicado, ou 0 se nenhum. */
  piso: number
  /** true quando o piso teve de corrigir a IA — vale logar. */
  pisoAplicado: boolean
}

/**
 * Junta a nota da IA com o piso do léxico.
 *
 * Nota fora da faixa é fixada nos limites em vez de rejeitada: um modelo que
 * devolve 11 quis dizer "o máximo", e descartar a resposta inteira por isso
 * custaria uma rodada de IA para reobter a mesma informação.
 */
export function consolidarNota(notaIA: number, gravidadeLexico: NivelGravidade): ResultadoNota {
  const bruta = Number.isFinite(notaIA) ? notaIA : 0
  const limitada = Math.min(Math.max(bruta, NOTA_MIN), NOTA_MAX)
  const piso = PISO_POR_GRAVIDADE[gravidadeLexico] ?? 0

  return {
    nota: Math.max(limitada, piso),
    notaIA: limitada,
    piso,
    pisoAplicado: piso > limitada,
  }
}

/**
 * Quantas PESSOAS distintas precisam ter relatado o assunto.
 *
 *     pessoas(nota) = ceil(12 / 2^(nota / 2.5))
 *
 *     nota 10 → 1     7,5 → 2     5 → 3     2,5 → 6     0 → 12
 *
 * A curva é a mesma que `limiar.ts` já usava com os níveis G0–G4 (`nota = G *
 * 2.5`), calibrada contra os feedbacks reais deste produto: a exigência cai pela
 * metade a cada degrau, um relato sanitário isolado basta, e uma queixa
 * operacional comum precisa de três pessoas antes de virar tarefa para a equipe.
 *
 * Manter a mesma curva é proposital. Trocar a escala de G0-4 por 0-10 dá mais
 * granularidade à IA sem jogar fora a calibração que já passou por dados de
 * verdade — a nota 6, que antes não existia, cai naturalmente entre 2 e 3
 * pessoas.
 */
export function pessoasNecessariasPorNota(nota: number): number {
  const n = Math.min(Math.max(Number.isFinite(nota) ? nota : 0, NOTA_MIN), NOTA_MAX)
  return Math.ceil(12 / Math.pow(2, n / 2.5))
}

export function assuntoElegivelPorNota(nota: number, pessoasDistintas: number): boolean {
  return pessoasDistintas >= pessoasNecessariasPorNota(nota)
}

/**
 * Acima desta nota, elogio nenhum amortece.
 *
 * É a mesma linha que `prioridadeAcaoManual` já traça para ação manual: um
 * relato de cabelo na comida é urgente mesmo num restaurante com 500 elogios.
 * Sem este corte, o amortecimento derrubaria justamente o caso que o produto
 * inteiro existe para não deixar passar — medido: nota 10 com 1 pessoa contra
 * 20 elogios cairia de 10 para 3,0.
 */
const NOTA_IMUNE_A_ELOGIO = 7.5

/** Suavização de Laplace. Sem ela, 1 queixa e 0 elogios daria razão 1,0. */
const SUAVIZACAO = 3

export interface EntradaAmortecimento {
  nota: number
  /** Pessoas distintas que relataram a queixa. */
  pessoas: number
  /** Pontos POSITIVOS do mesmo tema na janela. */
  positivos: number
}

/**
 * O quanto do assunto é queixa, de 0 a 1.
 *
 *     razao = N / (N + P + 3),  onde N = nota * pessoas
 *
 * Mesma forma já testada em `prioridadeAcaoManual` (`limiar.ts`), aplicada
 * agora também ao ranking dos insights — era o pedido de "se tem muitos
 * positivos não vai ser tão importante quanto um que não tem tantos negativos
 * mas também não tem nenhum positivo".
 */
export function razaoQueixa(e: EntradaAmortecimento): number {
  if (e.nota >= NOTA_IMUNE_A_ELOGIO) return 1

  const N = Math.max(0, e.nota) * Math.max(1, e.pessoas)
  const P = Math.max(0, e.positivos)
  if (N <= 0) return 0
  return N / (N + P + SUAVIZACAO)
}

export interface EntradaPontuacaoPorNota {
  nota: number
  pessoas: number
  positivos: number
  diasDesdeMaisRecente: number
  reincidente: boolean
}

/**
 * Nota final de ordenação — decide QUAIS assuntos viram insight quando há mais
 * elegíveis do que o teto da rodada.
 *
 *     S = nota * razao + min(log2(1+pessoas), 3.5) + recencia + 0.7*reincidencia
 *
 * `log2` e não contagem crua: a diferença entre 1 e 3 pessoas importa muito mais
 * que entre 20 e 22. O teto de 3,5 impede que volume banal atravesse a escala de
 * importância — sem ele, um "poderia ter opção vegana" com 12 pessoas passava na
 * frente de um cabelo na comida com 1.
 *
 * Reincidência pesa positivo de propósito: assunto que já virou insight, foi
 * encerrado e voltou é sinal de que a solução anterior não pegou.
 */
const TETO_VOLUME = 3.5

export function pontuarPorNota(e: EntradaPontuacaoPorNota): number {
  const razao = razaoQueixa({ nota: e.nota, pessoas: e.pessoas, positivos: e.positivos })
  const volume = Math.min(Math.log2(1 + Math.max(0, e.pessoas)), TETO_VOLUME)
  const recencia = e.diasDesdeMaisRecente < 3 ? 0.5 : e.diasDesdeMaisRecente < 7 ? 0 : -0.5
  return e.nota * razao + volume + recencia + (e.reincidente ? 0.7 : 0)
}

/**
 * Os campos que a avaliação acrescenta a um assunto.
 *
 * Separado do tipo `Assunto` de propósito: `assuntos.ts` é puro e não conhece
 * IA nenhuma, e continua servindo ao agrupamento mesmo se a avaliação falhar.
 */
export interface CamposAvaliacao {
  /** A nota que vale, depois do piso do léxico. */
  nota: number
  /** O que a IA devolveu antes do piso — só para log e depuração. */
  notaIA: number
  justificativaNota: string
  pisoAplicado: boolean
}
