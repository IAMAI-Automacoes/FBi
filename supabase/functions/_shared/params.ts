/**
 * Modelo ativo e parâmetros de inferência por agente.
 *
 * Antes o modelo vinha só de uma variável de ambiente e o seletor do painel de
 * admin não tinha efeito nenhum: a tabela modelos_ia era lida apenas pela
 * própria tela. Agora quem manda é o banco, com a env como reserva.
 */
// deno-lint-ignore no-explicit-any
type Db = any

const MODELO_RESERVA = 'google/gemini-2.5-flash-lite'

/** Parâmetros aceitos pelo OpenRouter que expomos por agente. */
export interface ParamsAgente {
  model?: string
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  min_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  response_format?: { type: 'json_object' }
  web?: boolean
  web_max_results?: number
}

/** Chaves do bloco "avançado" repassadas ao OpenRouter quando preenchidas. */
const AVANCADOS = [
  'top_k',
  'min_p',
  'frequency_penalty',
  'presence_penalty',
  'seed',
] as const

/**
 * Modelo escolhido pelo admin. Cai na env e, por fim, num literal — nunca
 * lança, porque ficar sem modelo pararia a geração inteira.
 */
export async function modeloAtivo(db: Db): Promise<string> {
  try {
    const { data } = await db.from('modelos_ia').select('modelo').eq('ativo', true).maybeSingle()
    if (data?.modelo) return data.modelo as string
  } catch {
    /* segue para a reserva */
  }
  return Deno.env.get('OPENROUTER_MODELO') || MODELO_RESERVA
}

/**
 * Mescla as sobrescritas de `agentes_ia` sobre os padrões do código.
 *
 * Precedência: banco → padrão do agente → modelo ativo global. Coluna nula no
 * banco significa "usa o padrão", igual ao que já vale para os prompts.
 * Devolve `null` quando o agente foi desativado pelo admin.
 */
export async function paramsDoAgente(
  db: Db,
  agenteId: string,
  padrao: ParamsAgente = {},
): Promise<ParamsAgente | null> {
  const resolvido: ParamsAgente = { ...padrao }

  try {
    const { data } = await db
      .from('agentes_ia')
      .select('modelo, temperature, max_tokens, top_p, avancado, ativo')
      .eq('id', agenteId)
      .maybeSingle()

    if (data) {
      if (data.ativo === false) return null
      if (data.modelo) resolvido.model = data.modelo
      if (data.temperature != null) resolvido.temperature = Number(data.temperature)
      if (data.max_tokens != null) resolvido.max_tokens = Number(data.max_tokens)
      if (data.top_p != null) resolvido.top_p = Number(data.top_p)

      // Só as chaves preenchidas viajam: parâmetro não suportado pelo provider
      // do modelo não deve nem sair daqui.
      const av = (data.avancado || {}) as Record<string, unknown>
      for (const chave of AVANCADOS) {
        const v = av[chave]
        if (v != null && v !== '' && Number.isFinite(Number(v))) {
          resolvido[chave] = Number(v)
        }
      }
    }
  } catch {
    /* sem sobrescrita: seguem os padrões do código */
  }

  if (!resolvido.model) resolvido.model = await modeloAtivo(db)
  return resolvido
}
