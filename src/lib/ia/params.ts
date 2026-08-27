import { supabase } from '@/lib/supabase/client'

// A tabela agentes_ia não está nos tipos gerados; acesso destipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Parâmetros de inferência por agente, editáveis no painel de admin.
 *
 * Os padrões continuam no código (era ali que já viviam, chumbados em cada
 * chamada); o banco só sobrescreve o que o admin preencher. Como o cache é
 * carregado uma vez por sessão, quem nunca abrir o painel roda exatamente como
 * antes — a diferença é que agora dá para ajustar sem publicar versão nova.
 *
 * Espelha supabase/functions/_shared/params.ts, que faz o mesmo no servidor.
 */

export interface ParamsAgente {
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  min_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  /** Não é configurável pelo admin: faz parte do contrato do agente. */
  response_format?: { type: 'json_object' }
}

/** Parâmetros numéricos que o admin edita no painel. */
const NUMERICOS = [
  'temperature', 'max_tokens', 'top_p', 'top_k',
  'min_p', 'frequency_penalty', 'presence_penalty', 'seed',
] as const

/**
 * O bloco "avançado", como fica no banco.
 *
 * Não é só de números: `web` é booleano e `web_engine` é texto. Enquanto o tipo
 * era `Record<string, number>`, o painel não conseguia sequer guardar o
 * liga/desliga da busca na web — ela só existia chumbada no código do agente.
 *
 * Quem consome isto no navegador ignora as chaves de web (o `paramsDoAgente`
 * daqui só repassa as numéricas); quem as usa é a edge function, em
 * `supabase/functions/_shared/params.ts`.
 */
export type ValorAvancado = number | boolean | string

export interface ConfigAgente extends ParamsAgente {
  modelo?: string | null
  avancado?: Record<string, ValorAvancado>
  ativo?: boolean
}

let cache: Record<string, ConfigAgente> = {}
let carregado = false

/** true quando as configurações já foram buscadas do banco ao menos uma vez. */
export function paramsCarregados(): boolean {
  return carregado
}

/** Carrega todas as configurações para o cache. Nunca lança. */
export async function carregarParamsAgentes(): Promise<void> {
  try {
    const { data, error } = await db
      .from('agentes_ia')
      .select('id, modelo, temperature, max_tokens, top_p, avancado, ativo')
    if (error) return
    const novo: Record<string, ConfigAgente> = {}
    for (const linha of data || []) {
      novo[linha.id] = {
        modelo: linha.modelo,
        temperature: linha.temperature != null ? Number(linha.temperature) : undefined,
        max_tokens: linha.max_tokens ?? undefined,
        top_p: linha.top_p != null ? Number(linha.top_p) : undefined,
        avancado: (linha.avancado || {}) as Record<string, ValorAvancado>,
        ativo: linha.ativo !== false,
      }
    }
    cache = novo
    carregado = true
  } catch {
    /* silencioso: sem sobrescritas, os agentes usam os padrões do código */
  }
}

/** Configuração bruta de um agente, como está no banco. */
export function configDoAgente(id: string): ConfigAgente | null {
  return cache[id] ?? null
}

/** false só quando o admin desativou o agente explicitamente. */
export function agenteAtivo(id: string): boolean {
  return cache[id]?.ativo !== false
}

/**
 * Mescla as sobrescritas do admin sobre os padrões do código.
 *
 * O `modelo` fica de fora de propósito: quem decide o modelo é o servidor, que
 * ignora o que vier do cliente.
 */
export function paramsDoAgente(id: string, padrao: ParamsAgente = {}): ParamsAgente {
  const cfg = cache[id]
  if (!cfg) return padrao

  const resolvido: ParamsAgente = { ...padrao }
  if (cfg.temperature != null) resolvido.temperature = cfg.temperature
  if (cfg.max_tokens != null) resolvido.max_tokens = cfg.max_tokens
  if (cfg.top_p != null) resolvido.top_p = cfg.top_p

  // Só as chaves conhecidas viajam, e só quando preenchidas: parâmetro que o
  // provider do modelo não suporta não deve nem sair daqui.
  for (const [chave, valor] of Object.entries(cfg.avancado || {})) {
    if (!(NUMERICOS as readonly string[]).includes(chave)) continue
    if (valor != null && Number.isFinite(Number(valor))) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (resolvido as any)[chave] = Number(valor)
    }
  }
  return resolvido
}

/** Salva (ou limpa) a configuração de um agente. Só admin passa na RLS. */
export async function salvarConfigAgente(id: string, cfg: ConfigAgente): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const linha = {
    id,
    modelo: cfg.modelo || null,
    temperature: cfg.temperature ?? null,
    max_tokens: cfg.max_tokens ?? null,
    top_p: cfg.top_p ?? null,
    avancado: cfg.avancado ?? {},
    ativo: cfg.ativo !== false,
    updated_at: new Date().toISOString(),
    updated_by: user?.email ?? null,
  }
  const { error } = await db.from('agentes_ia').upsert(linha).select('id')
  if (error) throw new Error(error.message)
  cache[id] = { ...cfg, avancado: cfg.avancado ?? {}, ativo: cfg.ativo !== false }
}

/** Devolve o agente aos padrões do código, apagando a sobrescrita. */
export async function restaurarPadraoAgente(id: string): Promise<void> {
  const { error } = await db.from('agentes_ia').delete().eq('id', id)
  if (error) throw new Error(error.message)
  delete cache[id]
}
