/**
 * Cliente HTTP da API do Asaas, por conta.
 *
 * Cada conta do Asaas (`contas_cobranca.id`, hoje só `mei`) tem os seus
 * secrets: `ASAAS_CONTA_<ID>_API_KEY` e `ASAAS_CONTA_<ID>_AMBIENTE`
 * (`sandbox` ou `producao`). Passar do sandbox para a produção é trocar esses
 * secrets — nenhum código muda.
 *
 * Só GET e DELETE tentam de novo em erro 5xx: repetir um POST poderia criar
 * duas cobranças.
 */

// deno-lint-ignore no-explicit-any
type Db = any

export class ErroAsaas extends Error {
  constructor(
    mensagem: string,
    public readonly status: number,
    public readonly erros: { code?: string; description?: string }[] = [],
  ) {
    super(mensagem)
    this.name = 'ErroAsaas'
  }
}

export interface ClienteAsaas {
  contaId: string
  ambiente: 'sandbox' | 'producao'
  // deno-lint-ignore no-explicit-any
  get: (caminho: string) => Promise<any>
  // deno-lint-ignore no-explicit-any
  post: (caminho: string, corpo: unknown) => Promise<any>
  // deno-lint-ignore no-explicit-any
  put: (caminho: string, corpo: unknown) => Promise<any>
  // deno-lint-ignore no-explicit-any
  del: (caminho: string) => Promise<any>
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function asaas(contaId: string): ClienteAsaas {
  const prefixo = `ASAAS_CONTA_${contaId.toUpperCase()}_`
  const chave = Deno.env.get(`${prefixo}API_KEY`)?.trim()
  if (!chave) throw new Error(`Asaas não configurado: falta o secret ${prefixo}API_KEY`)
  const ambiente = Deno.env.get(`${prefixo}AMBIENTE`)?.trim() === 'producao' ? 'producao' : 'sandbox'
  const base = ambiente === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'

  async function chamar(metodo: string, caminho: string, corpo?: unknown) {
    const repetivel = metodo === 'GET' || metodo === 'DELETE'
    for (let tentativa = 0; ; tentativa++) {
      const res = await fetch(base + caminho, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EasyFeed',
          access_token: chave!,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      if (res.status >= 500 && repetivel && tentativa < 2) {
        await espera(400 * (tentativa + 1))
        continue
      }
      const texto = await res.text()
      // deno-lint-ignore no-explicit-any
      let dados: any = {}
      try {
        dados = texto ? JSON.parse(texto) : {}
      } catch {
        dados = { bruto: texto.slice(0, 300) }
      }
      if (!res.ok) {
        const erros = Array.isArray(dados?.errors) ? dados.errors : []
        const desc = erros.map((e: { description?: string }) => e.description).filter(Boolean).join('; ')
        throw new ErroAsaas(`Asaas ${metodo} ${caminho}: ${res.status}${desc ? ` — ${desc}` : ''}`, res.status, erros)
      }
      return dados
    }
  }

  return {
    contaId,
    ambiente,
    get: (c) => chamar('GET', c),
    post: (c, corpo) => chamar('POST', c, corpo),
    put: (c, corpo) => chamar('PUT', c, corpo),
    del: (c) => chamar('DELETE', c),
  }
}

/** A conta que recebe as vendas novas (`contas_cobranca.recebe_novas_vendas`). */
export async function contaDasVendasNovas(db: Db): Promise<string> {
  const { data, error } = await db
    .from('contas_cobranca')
    .select('id')
    .eq('recebe_novas_vendas', true)
    .eq('ativa', true)
    .maybeSingle()
  if (error) throw new Error(`contas_cobranca: ${error.message}`)
  if (!data?.id) throw new Error('Nenhuma conta do Asaas recebendo vendas novas (contas_cobranca)')
  return String(data.id)
}

/** 404 do Asaas ao remover = já não existe: para nós, removido. */
export async function removerNoAsaas(cli: ClienteAsaas, caminho: string): Promise<void> {
  try {
    await cli.del(caminho)
  } catch (e) {
    if (e instanceof ErroAsaas && e.status === 404) return
    throw e
  }
}
