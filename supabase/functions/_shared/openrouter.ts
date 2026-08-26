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
/**
 * Uma ferramenta que a IA pode chamar durante a conversa.
 *
 * Antes só existia a calculadora, despachada por um `if` com o nome fixo. Com
 * o registro, cada agente injeta as suas — ler um feedback original, contar
 * pessoas de um assunto, buscar boas práticas — sem tocar neste arquivo.
 */
export interface Ferramenta {
  /** Definição em formato de function-calling (ver `FERRAMENTA_CALCULADORA`). */
  // deno-lint-ignore no-explicit-any
  definicao: { type: 'function'; function: { name: string; [chave: string]: any } }
  /** Recebe os argumentos crus (string JSON vinda da IA) e devolve o resultado. */
  executar: (argumentos: string) => string | Promise<string>
  /**
   * Teto de chamadas desta ferramenta por invocação. Existe porque uma
   * ferramenta cara (consulta ao banco, embedding) pode ser chamada em loop
   * por um modelo indeciso e estourar tempo e cota.
   */
  maxChamadas?: number
}

/**
 * Saída estruturada entregue POR UMA FERRAMENTA, em vez de `response_format`.
 *
 * É mais forte que `json_object`, que só garante JSON sintaticamente válido —
 * nada impede o modelo de devolver um objeto com as chaves erradas. Um schema
 * de ferramenta descreve o formato inteiro, e de quebra convive com outras
 * ferramentas na mesma chamada (o que `json_object` não faz, ver abaixo).
 */
export interface SaidaEstruturada {
  nome: string
  descricao?: string
  /** JSON Schema do objeto de saída (`type: 'object'`, `properties`, `required`). */
  // deno-lint-ignore no-explicit-any
  schema: Record<string, any>
}

function definicaoDaSaida(saida: SaidaEstruturada) {
  return {
    type: 'function' as const,
    function: {
      name: saida.nome,
      description: saida.descricao ??
        'Registra o resultado final. Chame exatamente uma vez, quando tiver terminado a analise.',
      parameters: saida.schema,
    },
  }
}

function corpoDaChamada(
  messages: Mensagem[],
  params: ParamsAgente,
  ferramentas: Ferramenta[],
  saida: SaidaEstruturada | null,
  forcarSaida: boolean,
) {
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

  // `saida` e `response_format` são mutuamente exclusivos: quando a resposta
  // vem por ferramenta, forçar json_object junto reintroduz exatamente a
  // incompatibilidade que estamos contornando.
  if (params.response_format && !saida) body.response_format = params.response_format

  // Em `json_object` alguns modelos, ao rotearem por provedores diferentes no
  // OpenRouter, não combinam bem tool-calling com saída JSON forçada. Por isso
  // quem chama com `response_format` recebe a lista de ferramentas VAZIA (a
  // decisão é tomada em `chamarIA`) e este bloco não anexa nada — comportamento
  // idêntico ao de antes deste refactor.
  const tools = ferramentas.map((f) => f.definicao)
  if (saida) tools.push(definicaoDaSaida(saida))
  if (tools.length > 0) {
    body.tools = tools
    // Forçar a ferramenta de saída é o que garante término: sem isso um modelo
    // indeciso pode pedir ferramenta até acabar as rodadas e não devolver nada.
    body.tool_choice = forcarSaida && saida
      ? { type: 'function', function: { name: saida.nome } }
      : 'auto'
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
 * caso específico.
 *
 * FERRAMENTAS (`opcoes.ferramentas`): qualquer agente pode registrar as suas.
 * O despacho é por nome, num `Map` — antes havia um `if` com `'calcular'`
 * escrito no código, e nenhuma outra ferramenta tinha como existir. Uma
 * ferramenta que lança vira erro PARA A IA (ela segue sem aquele dado), não
 * exceção que derruba a geração.
 *
 * SAÍDA ESTRUTURADA (`opcoes.saida`): a resposta final vem por uma ferramenta
 * com JSON Schema, e `result` já é o objeto parseado. Existe porque
 * `response_format: json_object` **desliga tool-calling** — a combinação não é
 * confiável entre provedores, e por isso um agente que precisasse consultar
 * dados no meio da análise simplesmente não podia usar ferramenta nenhuma.
 * Com `saida`, as duas coisas convivem, e de quebra o formato passa a ser
 * validado pelo schema (o `json_object` só garantia JSON válido, não o formato
 * certo). Quem continuar usando `response_format` segue no caminho antigo,
 * sem ferramenta e sem mudança de comportamento.
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
    /** Ferramentas extras disponíveis nesta invocação (além da calculadora). */
    ferramentas?: Ferramenta[]
    /**
     * Quando presente, a resposta final vem por esta ferramenta em vez de
     * `response_format`, e `result` é o objeto já parseado dos argumentos.
     */
    saida?: SaidaEstruturada
  },
): Promise<RespostaIA> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new ErroIA(500, 'OPENROUTER_API_KEY não configurada')

  const restauranteId = opcoes.restauranteId ?? null
  if (opcoes.checarCotaAntes !== false) await checarCota(db, restauranteId)

  const saida = opcoes.saida ?? null

  // O modo legado (`response_format: json_object` sem `saida`) continua sem
  // ferramenta nenhuma, exatamente como antes — é o que mantém as funções que
  // ainda não migraram rodando com o mesmo comportamento.
  const modoJsonLegado = !saida && opcoes.params.response_format?.type === 'json_object'

  const ferramentas: Ferramenta[] = []
  if (!modoJsonLegado) {
    if (opcoes.calculadora !== false) {
      ferramentas.push({
        definicao: FERRAMENTA_CALCULADORA,
        executar: executarFerramentaCalculadora,
      })
    }
    ferramentas.push(...(opcoes.ferramentas ?? []))
  }
  const registro = new Map(ferramentas.map((f) => [f.definicao.function.name, f]))
  const usosPorFerramenta = new Map<string, number>()

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

  // Mais rodadas só quando há de fato uma conversa de ferramentas acontecendo;
  // o caminho antigo (só calculadora, ou nada) mantém o teto de 4.
  const MAX_RODADAS = saida || (opcoes.ferramentas?.length ?? 0) > 0 ? 8 : 4
  const MAX_CHAMADAS_FERRAMENTA = 12
  let totalChamadasFerramenta = 0

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    // Na última rodada — ou com o orçamento estourado — a saída é forçada,
    // senão a invocação inteira morre sem devolver nada.
    const forcarSaida = !!saida &&
      (rodada === MAX_RODADAS - 1 || totalChamadasFerramenta >= MAX_CHAMADAS_FERRAMENTA)
    const body = corpoDaChamada(mensagens, opcoes.params, ferramentas, saida, forcarSaida)

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

    // A ferramenta de saída encerra a conversa: é a resposta final.
    if (saida) {
      const chamadaFinal = toolCalls.find((tc) => tc?.function?.name === saida.nome)
      if (chamadaFinal) {
        try {
          const result = JSON.parse(chamadaFinal.function?.arguments ?? '{}')
          return { result, fontes, modelo, custo: custoTotal }
        } catch {
          throw new ErroIA(
            500,
            `A IA devolveu argumentos invalidos em ${saida.nome}`,
            String(chamadaFinal.function?.arguments ?? '').slice(0, 500),
          )
        }
      }
    }

    if (toolCalls.length > 0 && registro.size > 0) {
      // A IA pediu ferramentas: resolve cada uma em código e devolve o
      // resultado para ela seguir na próxima rodada. Essa troca fica só dentro
      // desta função — quem chamou `chamarIA` nunca vê as mensagens
      // intermediárias, só a resposta final.
      mensagens.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls })

      for (const tc of toolCalls) {
        const nome = String(tc?.function?.name ?? '')
        const ferramenta = registro.get(nome)
        const jaUsou = usosPorFerramenta.get(nome) ?? 0
        let saidaFerramenta: string

        if (!ferramenta) {
          saidaFerramenta = JSON.stringify({ erro: 'ferramenta desconhecida' })
        } else if (jaUsou >= (ferramenta.maxChamadas ?? Infinity)) {
          // Devolver o erro (em vez de simplesmente ignorar) é o que faz a IA
          // parar de insistir e seguir com o que já tem.
          saidaFerramenta = JSON.stringify({
            erro: `limite de ${ferramenta.maxChamadas} chamadas de ${nome} atingido nesta analise`,
          })
        } else {
          usosPorFerramenta.set(nome, jaUsou + 1)
          totalChamadasFerramenta++
          try {
            saidaFerramenta = await ferramenta.executar(tc.function?.arguments ?? '{}')
          } catch (err) {
            // Ferramenta que quebra vira erro PARA A IA, não exceção que
            // derruba a geração inteira: ela consegue seguir sem aquele dado.
            saidaFerramenta = JSON.stringify({
              erro: err instanceof Error ? err.message : String(err),
            })
          }
        }

        mensagens.push({ role: 'tool', tool_call_id: tc.id, content: saidaFerramenta })
      }
      continue
    }

    const content = message.content ?? ''

    // Esperava-se a ferramenta de saída e veio texto solto: alguns provedores
    // escorregam e respondem em prosa. Tenta aproveitar o conteúdo como JSON;
    // não dando, cutuca e tenta de novo — na última rodada o `tool_choice`
    // forçado já terá impedido este caminho.
    if (saida) {
      try {
        const result = JSON.parse(String(content).replace(/^```(?:json)?|```$/g, '').trim())
        return { result, fontes, modelo, custo: custoTotal }
      } catch {
        mensagens.push({ role: 'assistant', content })
        mensagens.push({
          role: 'user',
          content: `Responda chamando a ferramenta ${saida.nome}, nao em texto.`,
        })
        continue
      }
    }

    let result = content
    if (modoJsonLegado) {
      try {
        result = JSON.parse(String(content).replace(/^```(?:json)?|```$/g, '').trim())
      } catch {
        result = content
      }
    }

    return { result, fontes, modelo, custo: custoTotal }
  }

  throw new ErroIA(
    500,
    saida
      ? `A IA nao chamou ${saida.nome} em ${MAX_RODADAS} rodadas`
      : 'A IA ficou presa chamando ferramentas repetidamente',
  )
}

/** Atalho para as funções que só querem o texto da resposta. */
export async function textoDaIA(
  db: Db,
  opcoes: Parameters<typeof chamarIA>[1],
): Promise<string> {
  const { result } = await chamarIA(db, opcoes)
  return typeof result === 'string' ? result : JSON.stringify(result)
}
