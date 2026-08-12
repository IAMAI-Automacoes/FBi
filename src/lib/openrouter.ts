import { supabase } from '@/lib/supabase/client'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface EnviarMensagemOptions {
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
  /** Liga a busca na web (tem custo por requisição — usar só quando necessário) */
  web?: boolean
  web_max_results?: number
}

export interface FonteWeb {
  url: string
  titulo: string
}

/**
 * Erro que a interface precisa tratar de forma específica, em vez de mostrar
 * como falha técnica: crédito esgotado, assinatura inativa, agente desligado.
 */
export class ErroIA extends Error {
  constructor(
    mensagem: string,
    public codigo?: string,
    public detalhes?: { gasto?: number; limite?: number },
  ) {
    super(mensagem)
    this.name = 'ErroIA'
  }
}

/**
 * O `data` do invoke traz os campos de erro do servidor; erros HTTP (402, 403)
 * chegam pelo `error`, e aí o corpo precisa ser lido do contexto da resposta.
 */
async function tratarErro(error: unknown, data: unknown): Promise<void> {
  const corpo = (data ?? {}) as Record<string, unknown>

  // supabase-js embrulha respostas não-2xx; o JSON original fica no contexto.
  const ctx = (error as { context?: Response })?.context
  let doServidor: Record<string, unknown> = {}
  if (ctx && typeof ctx.json === 'function') {
    try {
      doServidor = await ctx.clone().json()
    } catch {
      /* corpo não-JSON: cai no erro genérico abaixo */
    }
  }

  const info = { ...corpo, ...doServidor }
  const codigo = typeof info.codigo === 'string' ? info.codigo : undefined
  const mensagem = typeof info.error === 'string' ? info.error : null

  if (codigo || mensagem) {
    throw new ErroIA(mensagem ?? 'Não foi possível falar com a IA', codigo, {
      gasto: typeof info.gasto === 'number' ? info.gasto : undefined,
      limite: typeof info.limite === 'number' ? info.limite : undefined,
    })
  }

  if (error) throw new Error(`Erro ao chamar Edge Function: ${(error as Error).message}`)
}

// Mude para true para testar o visual sem gastar créditos da IA
const MOCK_IA = false

/**
 * `agenteId` diz ao servidor de qual agente são os parâmetros de inferência —
 * temperatura, limite de tokens e modelo saem de `agentes_ia`, editável no
 * painel de admin. O que o cliente manda em `options` é só o padrão do código,
 * que o banco sobrescreve quando o admin configurou algo.
 */
export async function enviarMensagem(
  messages: ChatMessage[],
  options: EnviarMensagemOptions = {},
  agenteId = 'assistente',
): Promise<string | Record<string, unknown>> {
  if (MOCK_IA) {
    if (options.response_format?.type === 'json_object') {
      return { tipo: null, dadosSugeridos: null }
    }
    return 'Resposta simulada (MOCK_IA ativo).'
  }

  const { data, error } = await supabase.functions.invoke('chamar-ia', {
    body: { messages, options, agente_id: agenteId },
  })

  await tratarErro(error, data)

  return data?.result ?? ''
}

/** Igual a enviarMensagem, mas devolve também as fontes citadas pela busca web. */
export async function enviarMensagemComFontes(
  messages: ChatMessage[],
  options: EnviarMensagemOptions = {},
  agenteId = 'assistente',
): Promise<{ texto: string; fontes: FonteWeb[] }> {
  if (MOCK_IA) return { texto: 'Resposta simulada (MOCK_IA ativo).', fontes: [] }

  const { data, error } = await supabase.functions.invoke('chamar-ia', {
    body: { messages, options, agente_id: agenteId },
  })

  await tratarErro(error, data)

  const bruto = data?.result ?? ''
  return {
    texto: typeof bruto === 'string' ? bruto : JSON.stringify(bruto),
    fontes: Array.isArray(data?.fontes) ? data.fontes : [],
  }
}
