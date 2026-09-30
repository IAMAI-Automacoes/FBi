import { supabase } from '@/lib/supabase/client'
import type { Ciclo } from '@/components/vendas/ciclos-plano'

/* Camada de acesso às edge functions do Stripe.
   O client nunca vê chave secreta nem price ID: manda o CICLO, recebe URL.
   Preços vêm do `get-prices` (Stripe por lookup_key) — nada de valor fixo aqui. */

export interface PrecoPublico {
  ciclo: Ciclo
  lookup_key: string
  moeda: string
  total_centavos: number
  mensal_equivalente_centavos: number
  intervalo: string
  intervalo_qtd: number
  desconto_percentual: number | null
}

export interface RespostaPrecos {
  precos: PrecoPublico[]
  atualizado_em: string
}

/** Extrai a mensagem real do corpo quando `invoke` devolve "non-2xx". */
async function mensagemDoErro(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: { json?: () => Promise<{ error?: string }> } }
  try {
    const corpo = await e.context?.json?.()
    if (corpo?.error) return corpo.error
  } catch {
    /* mantém a mensagem padrão */
  }
  return e.message ?? 'Erro inesperado'
}

/** Erro tipado das funções: carrega o corpo para a tela decidir o que fazer
    (ex.: `email_diferente` no vínculo da compra). */
export class ErroStripe extends Error {
  constructor(
    mensagem: string,
    public readonly status: number | null,
    public readonly corpo: Record<string, unknown> | null,
  ) {
    super(mensagem)
    this.name = 'ErroStripe'
  }
}

async function invocar<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body })
  if (error) {
    const e = error as {
      context?: { status?: number; json?: () => Promise<Record<string, unknown>> }
    }
    let corpo: Record<string, unknown> | null = null
    try {
      corpo = (await e.context?.json?.()) ?? null
    } catch {
      /* sem corpo */
    }
    throw new ErroStripe(await mensagemDoErro(error), e.context?.status ?? null, corpo)
  }
  if ((data as { error?: string })?.error)
    throw new ErroStripe((data as { error: string }).error, null, data as Record<string, unknown>)
  return data as T
}

/** Preços atuais. GET simples (sem JWT) para o cache HTTP do navegador valer. */
export async function buscarPrecos(): Promise<RespostaPrecos> {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
  const r = await fetch(`${base}/functions/v1/get-prices`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  })
  if (!r.ok) throw new Error('Não foi possível carregar os preços.')
  return (await r.json()) as RespostaPrecos
}

/** Abre o Stripe Checkout. Com sessão logada, o servidor liga a compra ao
    restaurante; sem, é a compra da landing (conta vem depois). */
export async function criarCheckout(
  ciclo: Ciclo,
  opcoes: { email?: string; codigoAfiliado?: string } = {},
): Promise<string> {
  const chave = chaveIdempotencia(ciclo)
  const r = await invocar<{ url: string }>('create-checkout-session', {
    ciclo,
    email: opcoes.email || undefined,
    chave_idempotencia: chave,
    codigo_afiliado: opcoes.codigoAfiliado?.trim().toUpperCase() || undefined,
  })
  return r.url
}

/* ── Código de indicação (afiliado) ──
   Vem do link `?ref=CODIGO` divulgado pelo afiliado. Fica guardado por 30 dias
   no navegador: a pessoa pode entrar pelo link hoje e assinar na semana que
   vem. Quem digitar outro código no campo sobrescreve. A validação de verdade
   é no servidor (`create-checkout-session`), contra `afiliados.codigo`. */
const CHAVE_REF = 'easyfeed_ref'
const REF_DIAS = 30

export function lerCodigoIndicacao(): string {
  const daUrl = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
  if (daUrl && /^[A-Z0-9_-]{2,30}$/.test(daUrl)) {
    guardarCodigoIndicacao(daUrl)
    return daUrl
  }
  try {
    const raw = localStorage.getItem(CHAVE_REF)
    if (!raw) return ''
    const { codigo, expira } = JSON.parse(raw) as { codigo: string; expira: number }
    if (Date.now() > expira) {
      localStorage.removeItem(CHAVE_REF)
      return ''
    }
    return codigo
  } catch {
    return ''
  }
}

export function guardarCodigoIndicacao(codigo: string) {
  try {
    const limpo = codigo.trim().toUpperCase()
    if (!limpo) localStorage.removeItem(CHAVE_REF)
    else
      localStorage.setItem(
        CHAVE_REF,
        JSON.stringify({ codigo: limpo, expira: Date.now() + REF_DIAS * 24 * 60 * 60 * 1000 }),
      )
  } catch {
    /* sem storage */
  }
}

/* ── Faturas do restaurante logado (RLS: só as dele) ── */
export interface FaturaResumo {
  id: string
  numero: string | null
  status: string
  total_centavos: number
  pago_centavos: number
  pago_em: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  created_at: string
}

export async function buscarMinhasFaturas(limite = 12): Promise<FaturaResumo[]> {
  const { data, error } = await supabase
    .from('stripe_faturas')
    .select(
      'id, numero, status, total_centavos, pago_centavos, pago_em, periodo_inicio, periodo_fim, hosted_invoice_url, invoice_pdf, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []) as FaturaResumo[]
}

/* ── Stripe Connect do afiliado (só admin da plataforma) ── */
export async function conectarAfiliado(afiliadoId: string): Promise<string> {
  const r = await invocar<{ url: string }>('conectar-afiliado', {
    afiliado_id: afiliadoId,
    acao: 'onboarding',
  })
  return r.url
}

export async function statusConnectAfiliado(
  afiliadoId: string,
): Promise<{ status: string; pendencias?: string[] }> {
  return invocar('conectar-afiliado', { afiliado_id: afiliadoId, acao: 'status' })
}

/* Um uuid por (ciclo, aba, ~10 min): clicar duas vezes ou repetir depois de um
   erro de rede reaproveita a mesma sessão no Stripe em vez de abrir duas. */
function chaveIdempotencia(ciclo: Ciclo): string {
  const janela = Math.floor(Date.now() / (10 * 60 * 1000))
  const k = `easyfeed_checkout_${ciclo}_${janela}`
  try {
    const existente = sessionStorage.getItem(k)
    if (existente) return existente
    const nova = crypto.randomUUID()
    sessionStorage.setItem(k, nova)
    return nova
  } catch {
    return crypto.randomUUID()
  }
}

export type EstadoCompra = 'paga' | 'pendente' | 'vinculada' | 'expirada' | 'nao_encontrada'

export interface Compra {
  estado: EstadoCompra
  email: string | null
  ciclo: Ciclo | null
}

/** Estado de uma Checkout Session (tela de cadastro pós-pagamento). */
export async function consultarCompra(sessaoId: string): Promise<Compra> {
  return invocar<Compra>('consultar-compra', { sessao_id: sessaoId })
}

export interface ResultadoVinculo {
  ok: boolean
  status: string
  ciclo: Ciclo | null
  ja_vinculada?: boolean
}

/** Liga a compra paga à conta logada. Sem `sessaoId`, tenta pelo e-mail
    (só funciona com confirmação de e-mail ligada no servidor). */
export async function vincularCompra(sessaoId?: string): Promise<ResultadoVinculo> {
  return invocar<ResultadoVinculo>('vincular-compra', sessaoId ? { sessao_id: sessaoId } : {})
}

/** URL do Customer Portal (trocar ciclo, cartão, cancelar, faturas). */
export async function abrirPortal(
  fluxo?: 'atualizar_cartao' | 'trocar_plano' | 'cancelar',
): Promise<string> {
  const r = await invocar<{ url: string }>('create-portal-session', fluxo ? { fluxo } : {})
  return r.url
}

/* Guarda/recupera a sessão de checkout entre telas (a pessoa pode ir do
   /cadastro para o /login quando o e-mail já existe). */
const CHAVE_SESSAO = 'easyfeed_sessao_checkout'
export function guardarSessaoCheckout(id: string) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, id)
  } catch {
    /* sem storage */
  }
}
export function lerSessaoCheckout(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO)
  } catch {
    return null
  }
}
export function limparSessaoCheckout() {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO)
  } catch {
    /* sem storage */
  }
}
