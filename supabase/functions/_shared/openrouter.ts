/**
 * Chamada ao OpenRouter com cota e registro de custo.
 *
 * Antes o fetch estava copiado em seis edge functions e o objeto `usage` da
 * resposta — que traz o custo em dólares — era descartado em todas elas, então
 * não havia como saber quanto cada restaurante consumia nem impor limite.
 * Toda chamada de IA do servidor passa por aqui.
 */
import type { ParamsAgente } from './params.ts'
import { FERRAMENTA_CALCULADORA, executarFerramentaCalculadora } from './calculadora.ts'

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

// deno-lint-ignore no-explicit-any
type Db = any

export interface Mensagem {
  role: 'system' | 'user' | 'assistant' | 'tool'
  // deno-lint-ignore no-explicit-any
  content: string | any[] | null
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[]
  tool_call_id?: string
}

export interface FonteWeb {
  url: string
  titulo: string
}

export interface RespostaIA {
  // deno-lint-ignore no-explicit-any
  result: any
  fontes: FonteWeb[]
  modelo: string
  custo: number
}

export class ErroIA extends Error {
  constructor(public status: number, mensagem: string, public detalhe?: string) {
    super(mensagem)
  }
}

/** Estouro de cota: quem chama devolve 402 e a interface bloqueia o envio. */
export class ErroCota extends Error {
  constructor(public gasto: number, public limite: number) {
    super('Crédito de IA esgotado')
  }
}

/**
 * Verifica a cota do restaurante antes de gastar.
 *
 * Chamadas sem restaurante conhecido (crons que varrem todos) não são
 * bloqueadas aqui — quem itera é responsável por checar cada um.
 */
export async function checarCota(db: Db, restauranteId: number | null): Promise<void> {
  if (!restauranteId) return
  const { data, error } = await db.rpc('consumir_credito_ia', {
    p_restaurante_id: restauranteId,
    p_custo: 0,
  })
  if (error) return // falha ao consultar não pode derrubar a geração
  const linha = Array.isArray(data) ? data[0] : data
  if (linha && linha.permitido === false) {
    throw new ErroCota(Number(linha.gasto ?? 0), Number(linha.limite ?? 0))
  }
}

/** Grava o consumo. Nunca lança: perder o registro não pode quebrar a resposta. */
async function registrarUso(
  db: Db,
  dados: {
    restauranteId: number | null
    origem: string
    agenteId?: string | null
    modelo: string
    // deno-lint-ignore no-explicit-any
    usage: any
    custo: number
  },
): Promise<void> {
  try {
    await db.from('uso_ia').insert({
      restaurante_id: dados.restauranteId,
      origem: dados.origem,
      agente_id: dados.agenteId ?? null,
      modelo: dados.modelo,
      prompt_tokens: dados.usage?.prompt_tokens ?? null,
      completion_tokens: dados.usage?.completion_tokens ?? null,
      custo_usd: dados.custo,
    })
  } catch (err) {
    console.warn('Falha ao registrar uso de IA:', err)
  }
}

/** Só os parâmetros que o OpenRouter aceita, sem as chaves vazias. */
function corpoDaChamada(messages: Mensagem[], params: ParamsAgente, usarCalculadora: boolean) {
  // deno-lint-ignore no-explicit-any
  const body: Record<string, any> = {
    model: params.model,
    messages,
    // `usage: { include: true }` faz o OpenRouter devolver o custo real em
    // dólares junto da resposta — é o que alimenta a cota.
    usage: { include: true },
  }

  const numericos = [
    'temperature', 'max_tokens', 'top_p', 'top_k',
    'min_p', 'frequency_penalty', 'presence_penalty', 'seed',
  ] as const
  for (const chave of numericos) {
    const v = params[chave]
    if (v != null) body[chave] = v
  }

  if (params.response_format) body.response_format = params.response_format

  // Calculadora: só em respostas de texto livre. Em `json_object` alguns
  // modelos, ao rotearem por provedores diferentes no OpenRouter, não
  // combinam bem tool-calling com saída JSON forçada — nesses agentes os
  // números já chegam prontos no prompt (não pedimos conta à IA), então a
  // ferramenta não faz falta e preferimos não arriscar a combinação.
  if (usarCalculadora) {
    body.tools = [FERRAMENTA_CALCULADORA]
    body.tool_choice = 'auto'
  }

  if (params.web) {
    const max = Math.min(Math.max(Number(params.web_max_results) || 4, 1), 8)
    body.plugins = [{
      id: 'web',
      max_results: max,
      search_prompt:
        'Uma busca na web foi feita hoje. Use os resultados abaixo para responder com informacao atual. Escreva apenas a resposta, sem citar links, sem nomear os sites e sem lista de fontes no final.',
    }]
  }

  return body
}

/**
 * Chama o modelo e registra o consumo.
 *
 * `restauranteId` nulo significa chamada sem dono identificável (cron); nesse
 * caso o uso é gravado sem vínculo, para o custo continuar visível no total.
 *
 * CALCULADORA: por padrão toda chamada ganha uma ferramenta `calcular` (ver
 * `./calculadora.ts`) que a IA pode invocar sempre que precisar fazer conta —
 * porcentagem, soma, diferença de dias etc. — em vez de calcular de cabeça e
 * arriscar alucinar um número. Quando o modelo pede a ferramenta, resolvemos
 * em código (determinístico) e devolvemos o resultado para ele terminar a
 * resposta; isso é invisível para quem chamou `chamarIA` — o retorno continua
 * sendo só a resposta final. Passe `calculadora: false` para desativar num
 * caso específico (não deveria ser necessário hoje).
 */
export async function chamarIA(
  db: Db,
  opcoes: {
    messages: Mensagem[]
    params: ParamsAgente
    origem: string
    restauranteId?: number | null
    agenteId?: string | null
    checarCotaAntes?: boolean
    calculadora?: boolean
  },
): Promise<RespostaIA> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new ErroIA(500, 'OPENROUTER_API_KEY não configurada')

  const restauranteId = opcoes.restauranteId ?? null
  if (opcoes.checarCotaAntes !== false) await checarCota(db, restauranteId)

  const usarCalculadora =
    opcoes.calculadora !== false && opcoes.params.response_format?.type !== 'json_object'

  // A IA sempre sabe a data/hora real de "hoje" — sem isso ela não tem como
  // calcular diferença de dias ou julgar "recente" de forma confiável, e
  // tenderia a supor a data do próprio treinamento.
  const agora = new Date()
  const mensagens: Mensagem[] = [
    {
      role: 'system',
      content: `Contexto: agora é ${agora.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })} (${agora.toISOString().slice(0, 10)}, fuso de Brasília).`,
    },
    ...opcoes.messages,
  ]

  let modelo = opcoes.params.model || ''
  let custoTotal = 0
  const fontes: FonteWeb[] = []

  const MAX_RODADAS = 4
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const body = corpoDaChamada(mensagens, opcoes.params, usarCalculadora)

    const resposta = await fetch(URL_OPENROUTER, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://feedbackinteligente.app',
      },
      body: JSON.stringify(body),
    })

    if (!resposta.ok) {
      const detalhe = await resposta.text()
      throw new ErroIA(resposta.status, `OpenRouter error: ${resposta.status}`, detalhe)
    }

    const data = await resposta.json()
    const message = data.choices?.[0]?.message ?? {}
    modelo = data.model || body.model
    const custoRodada = Number(data.usage?.cost ?? 0)
    custoTotal += custoRodada

    await registrarUso(db, {
      restauranteId,
      origem: opcoes.origem,
      agenteId: opcoes.agenteId,
      modelo,
      usage: data.usage,
      custo: custoRodada,
    })

    if (Array.isArray(message.annotations)) {
      for (const a of message.annotations) {
        if (a?.type === 'url_citation' && a?.url_citation?.url) {
          fontes.push({ url: a.url_citation.url, titulo: a.url_citation.title ?? '' })
        }
      }
    }

    // deno-lint-ignore no-explicit-any
    const toolCalls: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : []
    if (usarCalculadora && toolCalls.length > 0) {
      // A IA pediu a calculadora: resolve cada chamada em código e devolve o
      // resultado para ela terminar a resposta na próxima rodada. Essa
      // troca fica só dentro desta função — quem chamou `chamarIA` nunca vê
      // as mensagens intermediárias, só a resposta final.
      mensagens.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls })
      for (const tc of toolCalls) {
        const resultadoFerramenta =
          tc?.function?.name === 'calcular'
            ? executarFerramentaCalculadora(tc.function?.arguments ?? '{}')
            : JSON.stringify({ erro: 'ferramenta desconhecida' })
        mensagens.push({ role: 'tool', tool_call_id: tc.id, content: resultadoFerramenta })
      }
      continue
    }

    const content = message.content ?? ''
    let result = content
    if (opcoes.params.response_format?.type === 'json_object') {
      try {
        result = JSON.parse(String(content).replace(/^```(?:json)?|```$/g, '').trim())
      } catch {
        result = content
      }
    }

    return { result, fontes, modelo, custo: custoTotal }
  }

  throw new ErroIA(500, 'A IA ficou presa chamando a calculadora repetidamente')
}

/** Atalho para as funções que só querem o texto da resposta. */
export async function textoDaIA(
  db: Db,
  opcoes: Parameters<typeof chamarIA>[1],
): Promise<string> {
  const { result } = await chamarIA(db, opcoes)
  return typeof result === 'string' ? result : JSON.stringify(result)
}
