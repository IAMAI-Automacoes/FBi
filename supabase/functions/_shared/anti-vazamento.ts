/**
 * Detector de contaminação entre assuntos — a rede que não depende da IA.
 *
 * ## O problema concreto
 *
 * Uma mensagem de cliente costuma tratar de vários assuntos ao mesmo tempo. Um
 * caso real do banco:
 *
 *   "A comida até que é boa, mas demorou quase 50 minutos pra chegar, ficamos
 *    com muita fome esperando. Quando chegou, o prato principal já estava frio.
 *    O ambiente pelo menos é bonito e aconchegante."
 *
 * O n8n quebra isso em três pontos separados (Tempo de Espera negativo, Comida
 * negativo, Ambiente POSITIVO). Quando a IA está redigindo o insight sobre
 * DEMORA e pede para ler a mensagem original, ela recebe o texto inteiro — e
 * "prato frio" e "ambiente bonito" vêm junto. A regra do produto é que nada
 * disso pode vazar para o insight de demora.
 *
 * ## Por que a checagem é feita contra os PONTOS IRMÃOS, não contra o original
 *
 * Só 42,9% dos pontos aparecem literalmente dentro do original (medido em
 * produção: o n8n reescreve o resto). Ou seja: não dá para localizar, dentro da
 * mensagem original, qual trecho pertence a qual assunto — logo, não dá para
 * tapar os trechos alheios com confiança.
 *
 * Mas o texto EXATO de cada ponto irmão está em `feedbacks_restaurante`. Então
 * a pergunta muda de "que parte do original é proibida?" (indecidível) para
 * "o insight contém vocabulário que só existe nos assuntos irmãos?" (decidível,
 * barato e sem IA nenhuma).
 *
 * ## Camadas
 *
 * - **Trigrama** (3 palavras de conteúdo em sequência): cópia literal. Não tem
 *   como ser coincidência — rejeita direto.
 * - **Tokens distintivos**: palavras que aparecem só nos irmãos, nunca no
 *   assunto, descontando o vocabulário genérico do domínio. Duas já levantam
 *   suspeita; três ou mais rejeitam. O limiar em 2/3 existe porque uma palavra
 *   isolada em comum acontece por acaso o tempo todo.
 *
 * Isto é uma REDE, não a única defesa: pega cópia e paráfrase próxima, não
 * captura uma reescrita completamente diferente com o mesmo sentido. Para essa,
 * existe a chamada de verificação com IA. As duas juntas.
 */

import { normalizar } from './gravidade.ts'

/**
 * Palavras de função do português + termos tão universais no domínio de
 * restaurante que aparecer em dois assuntos não significa nada. Sem esta lista,
 * "o cliente relatou que o prato demorou" e "o cliente relatou que o prato
 * estava frio" pareceriam contaminação um do outro.
 *
 * Deliberadamente CURTA: cada palavra aqui é um buraco na rede. Só entra o que
 * é genérico de verdade — nomes de categoria (ambiente, higiene, música) ficam
 * de fora justamente porque são o sinal que se quer capturar.
 */
const IRRELEVANTES = new Set([
  // artigos, preposições, conjunções, pronomes
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'pro', 'com', 'sem',
  'e', 'ou', 'mas', 'que', 'se', 'ao', 'aos', 'à', 'as', 'the',
  'eu', 'me', 'meu', 'minha', 'nos', 'nosso', 'nossa', 'ele', 'ela', 'eles',
  'elas', 'isso', 'isto', 'esse', 'essa', 'este', 'esta', 'aquele', 'aquela',
  'muito', 'muita', 'pouco', 'pouca', 'mais', 'menos', 'bem', 'mal', 'ja',
  'quando', 'onde', 'como', 'porque', 'tambem', 'ainda', 'so', 'todo', 'toda',
  'nao', 'sim', 'foi', 'era', 'esta', 'estava', 'ser', 'estar', 'ter', 'tem',
  'tinha', 'fica', 'ficou', 'ficamos', 'vai', 'foi', 'sao', 'e',
  // genéricos do domínio — presentes em praticamente qualquer feedback
  'restaurante', 'lugar', 'local', 'cliente', 'clientes', 'gente', 'pessoal',
  'experiencia', 'atendimento', 'servico', 'equipe', 'funcionario',
  'pedido', 'conta', 'visita', 'vez', 'dia', 'noite', 'hoje', 'ontem',
])

/** Tokens com menos que isto são ruído ("de", "os", "ai"). */
const TAMANHO_MINIMO = 4

/** Quantos tokens distintivos levantam suspeita / rejeitam de vez. */
const TOKENS_SUSPEITO = 2
const TOKENS_VAZOU = 3

export interface VocabularioProibido {
  /** Sequências de 3 palavras de conteúdo exclusivas dos assuntos irmãos. */
  trigramas: Set<string>
  /** Palavras exclusivas dos assuntos irmãos. */
  tokens: Set<string>
}

export type NivelVazamento = 'limpo' | 'suspeito' | 'vazou'

export interface ResultadoVazamento {
  nivel: NivelVazamento
  /** O que bateu — vai para o log e para a rodada de reparo. */
  trigramas: string[]
  tokens: string[]
}

/**
 * Reduz plural a singular. Stemming mínimo de propósito: o objetivo é só fazer
 * "pratos"/"prato" e "frios"/"frio" casarem, não construir um analisador
 * morfológico. Stemming agressivo geraria falso positivo, e falso positivo aqui
 * significa descartar um insight legítimo.
 */
function radical(token: string): string {
  if (token.length > TAMANHO_MINIMO && token.endsWith('s')) return token.slice(0, -1)
  return token
}

/** Palavras de conteúdo de um texto, normalizadas e sem as irrelevantes. */
function tokensDeConteudo(texto: string): string[] {
  return normalizar(texto)
    .trim()
    .split(' ')
    .filter(Boolean)
    .filter((t) => t.length >= TAMANHO_MINIMO && !IRRELEVANTES.has(t))
    .map(radical)
}

function trigramasDe(tokens: string[]): string[] {
  const saida: string[] = []
  for (let i = 0; i + 2 < tokens.length; i++) {
    saida.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
  }
  return saida
}

/**
 * Monta o que é proibido dizer num insight deste assunto.
 *
 * `pontosDoAssunto` são os textos que o insight PODE usar; `pontosIrmaos` são
 * os outros assuntos das mesmas mensagens originais. O proibido é a diferença:
 * o que só existe do lado de lá.
 */
export function construirVocabularioProibido(
  pontosDoAssunto: string[],
  pontosIrmaos: string[],
): VocabularioProibido {
  const permitidos = new Set<string>()
  const permitidosTri = new Set<string>()
  for (const texto of pontosDoAssunto) {
    const toks = tokensDeConteudo(texto)
    for (const t of toks) permitidos.add(t)
    for (const tri of trigramasDe(toks)) permitidosTri.add(tri)
  }

  const tokens = new Set<string>()
  const trigramas = new Set<string>()
  for (const texto of pontosIrmaos) {
    const toks = tokensDeConteudo(texto)
    for (const t of toks) if (!permitidos.has(t)) tokens.add(t)
    for (const tri of trigramasDe(toks)) if (!permitidosTri.has(tri)) trigramas.add(tri)
  }

  return { trigramas, tokens }
}

/**
 * O texto gerado pela IA contém vocabulário que só podia vir de outro assunto?
 *
 * Passe o insight inteiro concatenado (título + descrição + sugestão): a
 * contaminação pode aparecer em qualquer um dos três campos.
 */
export function detectarVazamento(
  texto: string,
  vocabulario: VocabularioProibido,
): ResultadoVazamento {
  const toks = tokensDeConteudo(texto)

  const trigramasAchados = trigramasDe(toks).filter((tri) => vocabulario.trigramas.has(tri))
  const tokensAchados = [...new Set(toks.filter((t) => vocabulario.tokens.has(t)))]

  // Cópia literal de três palavras seguidas não é coincidência.
  if (trigramasAchados.length > 0) {
    return { nivel: 'vazou', trigramas: trigramasAchados, tokens: tokensAchados }
  }
  if (tokensAchados.length >= TOKENS_VAZOU) {
    return { nivel: 'vazou', trigramas: [], tokens: tokensAchados }
  }
  if (tokensAchados.length >= TOKENS_SUSPEITO) {
    return { nivel: 'suspeito', trigramas: [], tokens: tokensAchados }
  }
  return { nivel: 'limpo', trigramas: [], tokens: tokensAchados }
}
