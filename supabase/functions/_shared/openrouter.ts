/**
 * Chamada ao OpenRouter com cota e registro de custo.
 *
 * Antes o fetch estava copiado em seis edge functions e o objeto `usage` da
 * resposta — que traz o custo em dólares — era descartado em todas elas, então
 * não havia como saber quanto cada restaurante consumia nem impor limite.
 * Toda chamada de IA do servidor passa por aqui.
 */
import type { ParamsAgente } from './params.ts'

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

// deno-lint-ignore no-explicit-any
type Db = any

export interface Mensagem {
  role: 'system' | 'user' | 'assistant'
  // deno-lint-ignore no-explicit-any
  content: string | any[]
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
function corpoDaChamada(messages: Mensagem[], params: ParamsAgente) {
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
  },
): Promise<RespostaIA> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new ErroIA(500, 'OPENROUTER_API_KEY não configurada')

  const restauranteId = opcoes.restauranteId ?? null
  if (opcoes.checarCotaAntes !== false) await checarCota(db, restauranteId)

  const body = corpoDaChamada(opcoes.messages, opcoes.params)

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
  const content = message.content ?? ''
  const modelo = data.model || body.model
  const custo = Number(data.usage?.cost ?? 0)

  await registrarUso(db, {
    restauranteId,
    origem: opcoes.origem,
    agenteId: opcoes.agenteId,
    modelo,
    usage: data.usage,
    custo,
  })

  const fontes: FonteWeb[] = Array.isArray(message.annotations)
    // deno-lint-ignore no-explicit-any
    ? message.annotations
        .filter((a: any) => a?.type === 'url_citation' && a?.url_citation?.url)
        .map((a: any) => ({ url: a.url_citation.url, titulo: a.url_citation.title ?? '' }))
    : []

  let result = content
  if (opcoes.params.response_format?.type === 'json_object') {
    try {
      result = JSON.parse(String(content).replace(/^```(?:json)?|```$/g, '').trim())
    } catch {
      result = content
    }
  }

  return { result, fontes, modelo, custo }
}

/** Atalho para as funções que só querem o texto da resposta. */
export async function textoDaIA(
  db: Db,
  opcoes: Parameters<typeof chamarIA>[1],
): Promise<string> {
  const { result } = await chamarIA(db, opcoes)
  return typeof result === 'string' ? result : JSON.stringify(result)
}
