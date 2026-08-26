/**
 * As contas que decidem o que vira insight e com que prioridade.
 *
 * Tudo aqui é determinístico e roda ANTES da IA. O modelo recebe os números
 * prontos ("este assunto tem 5 pessoas, o mínimo para gravidade 2 é 4, logo é
 * elegível") em vez de inventar o próprio critério a cada rodada — que era o
 * comportamento antigo e a razão de a mesma reclamação virar insight num dia e
 * não virar no outro.
 *
 * Separado de `gravidade.ts` porque são responsabilidades diferentes: lá se
 * decide "o quão grave é este texto"; aqui, "quanto disso é preciso para agir".
 */

import type { NivelGravidade } from './gravidade.ts'

/**
 * Quantas PESSOAS distintas precisam relatar um assunto para ele virar insight.
 *
 *     P_min(G) = ceil(BASE / 2^G)   →   G4:1  G3:2  G2:3  G1:6  G0:12
 *
 * Formato de matriz de risco: a exigência cai pela metade a cada nível de
 * gravidade. Os dois extremos são exatamente a regra de negócio pedida — um
 * único relato de cabelo na comida (G4) já basta, enquanto "comida fria" (G2)
 * precisa de padrão real antes de virar tarefa para a equipe.
 *
 * A base foi 16 na primeira versão e caiu para 12 depois de rodar contra os
 * feedbacks reais: exigir 4 pessoas distintas para uma queixa operacional
 * comum é alto demais no volume de um restaurante pequeno, onde uma semana
 * inteira rende poucas dezenas de mensagens. Com 12, um assunto ordinário
 * precisa de 3 relatos — o suficiente para separar padrão de coincidência sem
 * exigir que o problema já esteja generalizado.
 *
 * "Pessoas" é sempre contagem de ORIGINAIS DISTINTOS, nunca de pontos: o mesmo
 * cliente que escreve "achei razoável" e "não foi bom nem ruim" na mesma
 * mensagem gera dois pontos, mas continua sendo uma pessoa só.
 */
const BASE_LIMIAR = 12

export function pessoasNecessarias(G: NivelGravidade): number {
  return Math.ceil(BASE_LIMIAR / Math.pow(2, G))
}

export function assuntoElegivel(G: NivelGravidade, pessoasDistintas: number): boolean {
  return pessoasDistintas >= pessoasNecessarias(G)
}

export interface EntradaPontuacao {
  G: NivelGravidade
  /** Originais distintos que tocaram o assunto. */
  pessoas: number
  /** Dias desde o relato mais recente do assunto. */
  diasDesdeMaisRecente: number
  /** O mesmo tema já teve insight encerrado há menos de 30 dias. */
  reincidente: boolean
}

/**
 * Teto do termo de volume. Satura em ~10 pessoas: depois disso, mais gente
 * relatando não muda a posição na fila — o assunto já está claramente
 * estabelecido e quem decide o desempate passa a ser a gravidade.
 */
const TETO_VOLUME = 3.5

/**
 * Peso de cada degrau de gravidade. Com 2.5, um nível vale mais que o teto de
 * volume (3.5) somado à recência (±0.5) e à reincidência (0.7) não consegue
 * cobrir dois níveis inteiros (5.0) — na prática, um relato sanitário nunca é
 * empurrado para fora do top-5 por assunto banal, mas um problema realmente
 * massivo ainda consegue passar na frente de algo um degrau acima.
 */
const PESO_GRAVIDADE = 2.5

/**
 * Nota do assunto, usada para escolher quais gerar quando há mais assuntos
 * elegíveis do que o teto de insights por rodada.
 *
 *     S = 2.5*G + min(log2(1+pessoas), 3.5) + recencia + 0.7*reincidencia
 *
 * **Por que o peso 2.5 e por que o teto:** a primeira versão usava
 * `G + 1.2*log2(...)` sem teto, e o teste reprovou — um "poderia ter opção
 * vegana" (G1) com 12 pessoas dava 5,94 contra 5,70 de um cabelo na comida
 * (G4, 1 pessoa). O termo de volume sozinho valia mais que toda a escala de
 * gravidade, invertendo a regra central do produto.
 *
 * Note que a dominância aqui é FORTE, não absoluta, e isso é proposital: um
 * problema realmente massivo (dezenas de pessoas) ainda consegue ultrapassar
 * algo um degrau acima com relato único, o que é o comportamento certo. O que
 * não pode acontecer — e não acontece — é volume banal atravessar dois ou três
 * níveis de gravidade.
 *
 * Vale lembrar que esta nota só decide a ORDEM quando há mais assuntos
 * elegíveis que o teto da rodada. Se um assunto entra ou não na disputa é
 * decidido antes, por `assuntoElegivel` — e lá o relato sanitário isolado
 * sempre entra, porque `P_min(4) = 1`.
 *
 * `log2` e não contagem crua: a diferença entre 1 e 3 pessoas importa muito
 * mais que entre 20 e 22.
 *
 * Reincidência pesa positivo de propósito: assunto que já virou insight, foi
 * encerrado e voltou é sinal de que não foi resolvido de verdade.
 */
export function pontuarAssunto(e: EntradaPontuacao): number {
  const recencia = e.diasDesdeMaisRecente < 3 ? 0.5 : e.diasDesdeMaisRecente < 7 ? 0 : -0.5
  const volume = Math.min(Math.log2(1 + Math.max(0, e.pessoas)), TETO_VOLUME)
  return PESO_GRAVIDADE * e.G + volume + recencia + (e.reincidente ? 0.7 : 0)
}

export type PrioridadeAcao = 'URGENTE' | 'IMPORTANTE' | 'OBSERVACAO'

export interface EntradaPrioridade {
  /** Gravidade de CADA ponto negativo da categoria na janela. */
  gravidadesNegativos: NivelGravidade[]
  /** Quantos pontos positivos na mesma categoria e janela. */
  positivos: number
  /** Originais distintos entre os negativos (pessoas, não pontos). */
  originaisDistintos: number
}

export interface ResultadoPrioridade {
  prioridade: PrioridadeAcao
  indice: number
  /** Componentes expostos para o prompt e para depuração. */
  componentes: { N: number; P: number; n: number; Gmax: NivelGravidade; razao: number }
  /** Por que caiu nessa faixa — vai no log e no prompt. */
  motivo: string
}

/**
 * Prioridade de uma ação criada à mão, quando o dono deixa o campo em branco.
 *
 * Substitui a regra antiga (`negativos >= 5 → URGENTE`, `>= 2 → IMPORTANTE`),
 * que só contava reclamações e ignorava elogios por completo — três queixas num
 * restaurante com 200 elogios recebiam o mesmo peso que três queixas em vinte
 * avaliações.
 *
 *     N      = Σ gravidade dos negativos        (severidade acumulada)
 *     P      = quantidade de positivos
 *     n      = pessoas distintas entre os negativos
 *     razao  = N / (N + P + 3)                  (quanto do assunto é queixa)
 *     indice = (N/n) * (1 + log2(1+n)) * razao
 *
 * O `+3` no denominador é suavização de Laplace: sem ele, uma única queixa sem
 * nenhum elogio registrado daria razão 1.0 e estouraria a escala. Com ele, é
 * preciso volume real para a razão chegar perto de 1.
 *
 * Gravidade sempre vence volume: um relato G4 (cabelo, inseto, intoxicação) é
 * URGENTE sozinho, sem passar pela conta — é a regra que não pode ser diluída
 * por elogios, por mais que existam.
 *
 * Casos de sanidade (cobertos nos testes):
 *   5× comida fria (G2), 0 elogios, 5 pessoas  → indice ≈ 5,5  → IMPORTANTE
 *   1× cabelo (G4)                             → Gmax 4        → URGENTE
 *   3× G2 contra 20 elogios, 3 pessoas         → indice ≈ 1,2  → OBSERVACAO
 */
const CORTE_URGENTE = 6
const CORTE_IMPORTANTE = 2.5

export function prioridadeAcaoManual(e: EntradaPrioridade): ResultadoPrioridade {
  const N = e.gravidadesNegativos.reduce((soma, g) => soma + g, 0)
  const P = Math.max(0, e.positivos)
  const n = Math.max(1, e.originaisDistintos)
  const Gmax = (e.gravidadesNegativos.length > 0
    ? Math.max(...e.gravidadesNegativos)
    : 0) as NivelGravidade

  const razao = N > 0 ? N / (N + P + 3) : 0
  const indice = (N / n) * (1 + Math.log2(1 + n)) * razao

  const componentes = { N, P, n, Gmax, razao }

  if (Gmax >= 4) {
    return {
      prioridade: 'URGENTE',
      indice,
      componentes,
      motivo: 'risco sanitario ou de seguranca relatado (gravidade 4) — urgente independente do volume',
    }
  }
  if (indice >= CORTE_URGENTE) {
    return {
      prioridade: 'URGENTE',
      indice,
      componentes,
      motivo: `indice ${indice.toFixed(2)} >= ${CORTE_URGENTE}`,
    }
  }
  if (Gmax === 3) {
    return {
      prioridade: 'IMPORTANTE',
      indice,
      componentes,
      motivo: 'falha grave de higiene ou conduta relatada (gravidade 3)',
    }
  }
  if (indice >= CORTE_IMPORTANTE) {
    return {
      prioridade: 'IMPORTANTE',
      indice,
      componentes,
      motivo: `indice ${indice.toFixed(2)} >= ${CORTE_IMPORTANTE}`,
    }
  }
  return {
    prioridade: 'OBSERVACAO',
    indice,
    componentes,
    motivo:
      P > N
        ? `indice ${indice.toFixed(2)} baixo — os elogios (${P}) superam a severidade das queixas (${N})`
        : `indice ${indice.toFixed(2)} < ${CORTE_IMPORTANTE}`,
  }
}
