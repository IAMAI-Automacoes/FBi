/**
 * Estágio 0 da geração de insights: agrupar os feedbacks livres em ASSUNTOS,
 * sem gastar IA.
 *
 * ## Por que agrupar antes de chamar o modelo
 *
 * Duas razões, e as duas são estruturais:
 *
 * 1. **Isolamento.** Cada assunto vira uma chamada de IA própria, com o
 *    histórico de mensagens zerado. A IA que escreve sobre "demora" nunca vê os
 *    pontos de "comida fria" — não há como um assunto contaminar o outro,
 *    porque eles nunca estão na mesma conversa. É também o que atende ao pedido
 *    de a IA "esquecer as memórias entre a criação de cada insight".
 *
 * 2. **A conta vem antes do texto.** Quantas pessoas relataram, o quão grave é,
 *    e quantas seriam necessárias — tudo isso é calculado aqui e entregue
 *    pronto. Antes a IA estimava relevância sozinha, e a mesma reclamação virava
 *    insight num dia e não virava no outro.
 *
 * ## Como o agrupamento acontece
 *
 * Por `tema_id`, que a edge function `classificar-feedback` já atribui a cada
 * ponto no momento em que ele nasce. Reaproveitar esse trabalho sai de graça e
 * é mais fino que agrupar por categoria: nos dados reais, 143 pontos livres se
 * dividem em 34 temas contra apenas 10 categorias. Ponto sem tema cai no
 * agrupamento por categoria.
 */

import { avaliarGravidade, type NivelGravidade } from './gravidade.ts'
import { assuntoElegivel, pessoasNecessarias, pontuarAssunto } from './limiar.ts'

export interface PontoBruto {
  id: number
  texto_original: string | null
  resumo: string | null
  categoria: string | null
  sentimento: string | null
  origem_id: string | null
  tema_id: string | null
  created_at: string
}

export interface PontoDoAssunto {
  id: number
  texto: string
  categoria: string | null
  sentimento: string | null
  origem_id: string | null
  created_at: string
}

export interface Assunto {
  /** `tema:<uuid>` ou `categoria:<nome>` — estável, serve de chave de log. */
  chave: string
  categoria: string | null
  pontos: PontoDoAssunto[]
  gravidade: NivelGravidade
  /** Expressões que determinaram a gravidade — vão no prompt como justificativa. */
  termosGravidade: string[]
  /** 'baixa' = vale a IA consultar a mensagem original antes de concluir. */
  confianca: 'alta' | 'baixa'
  /** Originais distintos. É a contagem de PESSOAS, não de pontos. */
  pessoas: number
  pessoasNecessarias: number
  elegivel: boolean
  diasDesdeMaisRecente: number
  score: number
}

function textoDoPonto(p: PontoBruto): string {
  return (p.texto_original || p.resumo || '').trim()
}

/** Mesma leitura por substring usada no resto do produto: 'Positivo e Negativo' conta como queixa. */
function ehNegativo(sentimento: string | null): boolean {
  return (sentimento || '').toLowerCase().includes('negativ')
}

function diasDesde(iso: string, agora: Date): number {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 999
  return Math.max(0, (agora.getTime() - t) / 86_400_000)
}

/**
 * Agrupa, pontua e ordena.
 *
 * `reincidentes` traz as chaves de assunto que já tiveram insight encerrado nos
 * últimos 30 dias — vem do banco, por isso é parâmetro em vez de consulta aqui
 * dentro (este módulo é puro de propósito, para poder ser testado sem banco).
 */
export function agruparEmAssuntos(
  pontos: PontoBruto[],
  opcoes: { agora?: Date; reincidentes?: Set<string> } = {},
): Assunto[] {
  const agora = opcoes.agora ?? new Date()
  const reincidentes = opcoes.reincidentes ?? new Set<string>()

  const grupos = new Map<string, PontoBruto[]>()
  for (const p of pontos) {
    if (!textoDoPonto(p)) continue // ponto sem texto não sustenta nada
    const base = p.tema_id ? `tema:${p.tema_id}` : `categoria:${p.categoria ?? 'Outros'}`
    // Queixa e elogio do mesmo tema são assuntos DIFERENTES.
    //
    // Sem esta separação, o tema "Ambiente" juntava "o ambiente era ruim" com
    // "o ambiente é bem agradável" num assunto só. Duas consequências ruins:
    // a IA receberia material contraditório para redigir um insight, e — pior
    // — quem ELOGIOU entraria na contagem de pessoas que sustenta o limiar da
    // QUEIXA. Nos dados reais isso dava 8 pessoas a um assunto onde só 2
    // haviam reclamado.
    const chave = `${base}|${ehNegativo(p.sentimento) ? 'neg' : 'pos'}`
    const atual = grupos.get(chave)
    if (atual) atual.push(p)
    else grupos.set(chave, [p])
  }

  const assuntos: Assunto[] = []

  for (const [chave, brutos] of grupos) {
    const textos = brutos.map(textoDoPonto)

    // Gravidade do assunto = a do pior relato dele. Um único "cabelo na comida"
    // no meio de reclamações de demora torna o assunto inteiro sanitário.
    let gravidade: NivelGravidade = 0
    let termosGravidade: string[] = []
    let confianca: 'alta' | 'baixa' = 'baixa'
    for (const p of brutos) {
      // O sentimento entra junto: é ele que impede uma queixa escrita fora do
      // léxico ("o sistema de reserva ficava travando") de virar G0.
      const r = avaliarGravidade(textoDoPonto(p), p.sentimento)
      if (r.G > gravidade) {
        gravidade = r.G
        termosGravidade = r.termos
        confianca = r.confianca
      }
    }

    // PESSOAS, não pontos. O mesmo cliente que escreve "achei razoável" e "não
    // foi bom nem ruim" na mesma mensagem gera dois pontos e continua sendo uma
    // pessoa — contar pontos inflaria o volume e furaria o limiar sozinho.
    const origens = new Set(brutos.map((p) => p.origem_id).filter(Boolean))
    const pessoas = origens.size > 0 ? origens.size : brutos.length

    const diasDesdeMaisRecente = Math.min(...brutos.map((p) => diasDesde(p.created_at, agora)))

    const categoria = brutos.find((p) => p.categoria)?.categoria ?? null

    assuntos.push({
      chave,
      categoria,
      pontos: brutos.map((p) => ({
        id: p.id,
        texto: textoDoPonto(p),
        categoria: p.categoria,
        sentimento: p.sentimento,
        origem_id: p.origem_id,
        created_at: p.created_at,
      })),
      gravidade,
      termosGravidade,
      confianca,
      pessoas,
      pessoasNecessarias: pessoasNecessarias(gravidade),
      elegivel: assuntoElegivel(gravidade, pessoas),
      diasDesdeMaisRecente,
      score: pontuarAssunto({
        G: gravidade,
        pessoas,
        diasDesdeMaisRecente,
        reincidente: reincidentes.has(chave),
      }),
    })
  }

  return assuntos.sort((a, b) => b.score - a.score)
}

/**
 * Os assuntos que vão virar insight nesta rodada.
 *
 * Cortar aqui, ANTES de gastar IA, é o que mantém o custo previsível: sem teto,
 * 300 pontos livres viram ~40 assuntos e ~80 chamadas de modelo. Nada é
 * bloqueado — o que não passou continua livre e disputa a próxima rodada, agora
 * possivelmente com mais gente tendo reclamado (e portanto nota maior).
 *
 * O teto é de CANDIDATOS, um pouco acima do teto de insights: a verificação
 * descarta alguns, e sobrar candidato é melhor que devolver menos insights do
 * que o dono poderia ter.
 */
export function selecionarCandidatos(assuntos: Assunto[], maxCandidatos: number): Assunto[] {
  return assuntos.filter((a) => a.elegivel).slice(0, maxCandidatos)
}
