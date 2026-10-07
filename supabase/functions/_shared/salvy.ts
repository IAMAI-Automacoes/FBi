// Cliente da API v3 da Salvy — https://docs.salvy.com.br/api-reference/v3
//
// Só usa `fetch`, então roda igual no Node (testes) e no Deno (funções do
// Supabase). O ambiente é a própria chave: `salvy_test_` é o sandbox (nada é
// real, nada é cobrado) e `salvy_prod_` é produção (cria número de verdade e
// cobra). Por isso o cliente recusa chave de produção, a menos que quem chama
// peça explicitamente (`permitirProducao: true`).

export const BASE_URL = 'https://api.salvy.com.br/api/v3'

export type Ambiente = 'sandbox' | 'producao'

/** Tipo de linha: número virtual para o WhatsApp é `mobile-did`. */
export type TipoLinha = 'mobile' | 'mobile-did' | 'landline-did' | 'global'
export type StatusLinha = 'pending' | 'available' | 'active' | 'partial-block' | 'blocked' | 'canceled'
export type MotivoCancelamento =
  | 'employee-fired' | 'unnecessary' | 'no-coverage' | 'technical-problems'
  | 'whatsapp-problems' | 'whatsapp-blocked' | 'sim-card-swap' | 'other'

export interface Linha {
  id: string
  companyId: string
  productType: string
  simType: string
  name: string | null
  /** E.164 (+5541963475701). Nulo enquanto a linha não tem número. */
  phoneNumber: string | null
  /** "available" = número virtual pronto para uso; a cobrança começa quando ele é validado num app. */
  status: string
  activatedAt: string | null
  canceledAt: string | null
  cancellationScheduledFor: string | null
  createdAt: string
  plan: { id: string; name: string; priceCents: number; availableDataAmountGB: number } | null
}

/** Detecções da Salvy por serviço — no WhatsApp: `{ verificationCode: "123456" }`. */
export type Deteccoes = Record<string, Record<string, string> | undefined>

export interface SmsSalvy {
  id: string
  receivedAt: string
  originPhoneNumber: string
  destinationPhoneNumber: string
  message: string
  detections: Deteccoes
}

export interface Pagina<T> {
  data: T[]
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number }
}

/** Mensagens em português para os códigos de erro documentados da v3. */
const MENSAGENS: Record<string, string> = {
  unauthorized: 'Chave da Salvy inválida, revogada ou ausente.',
  forbidden: 'A chave não tem permissão para esta operação.',
  'insufficient-scope': 'A chave não tem o escopo necessário para esta operação.',
  'resource-not-found': 'Não encontrado na Salvy.',
  'did-area-code-out-of-stock': 'Sem número disponível neste DDD agora. Tente outro DDD ou mais tarde.',
  'phone-account-area-code-invalid': 'DDD inválido.',
  'virtual-phone-account-area-code-inventory-config-missing': 'Este DDD não está configurado para números virtuais na Salvy.',
  'company-has-pending-verification': 'A empresa ainda está em verificação na Salvy.',
  'company-not-active': 'A empresa não está ativa na Salvy.',
  'company-tier-limit-exceeded': 'A empresa atingiu o limite de linhas do plano na Salvy.',
  'cost-center-disabled': 'O centro de custo está desativado.',
  'too-many-attempts': 'Muitas requisições seguidas para a Salvy. Aguarde um instante e tente de novo.',
  'too-many-requests': 'Muitas requisições seguidas para a Salvy. Aguarde um instante e tente de novo.',
  'input-validation-error': 'Dados inválidos para a Salvy.',
  'phone-account-status-invalid': 'A linha não está num status que permite esta operação.',
  'phone-account-ongoing-portability': 'A linha tem uma portabilidade em andamento.',
  'phone-account-provider-operation-not-allowed': 'Operação não permitida para esta linha.',
  'idempotency-parameters-mismatch-error': 'A mesma chave de idempotência foi usada com dados diferentes.',
  'idempotency-invalid-header-error': 'Chave de idempotência inválida.',
  'payload-too-large': 'Requisição grande demais.',
}

export class ErroSalvy extends Error {
  status: number
  codigo: string
  detalhes: Array<{ key: string; message: string }>
  constructor(status: number, codigo: string, mensagem: string, detalhes: Array<{ key: string; message: string }> = []) {
    super(mensagem)
    this.name = 'ErroSalvy'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

/** Ambiente da chave pelo prefixo. Chave antiga (sem prefixo, de antes de 07/2026) conta como produção. */
export function ambienteDaChave(chave: string): Ambiente {
  return chave.startsWith('salvy_test_') ? 'sandbox' : 'producao'
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>

export interface OpcoesCliente {
  chave: string
  /** Sem isto, chave de produção é recusada — produção cria número e cobra de verdade. */
  permitirProducao?: boolean
  /** Para testes: troca o fetch e a espera. */
  fetch?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  /** Quantas vezes tentar quando a Salvy responde 429 (limite de 300 por minuto). */
  tentativas?: number
}

export function criarClienteSalvy(opcoes: OpcoesCliente) {
  const chave = (opcoes.chave ?? '').trim()
  if (!chave) throw new Error('Falta a chave da Salvy.')
  const ambiente = ambienteDaChave(chave)
  if (ambiente === 'producao' && !opcoes.permitirProducao) {
    throw new Error(
      'Chave de produção da Salvy recusada: ela cria número de verdade e cobra. ' +
        'Use uma chave de sandbox (salvy_test_) ou passe permitirProducao: true.',
    )
  }
  const buscar = opcoes.fetch ?? fetch
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const tentativas = opcoes.tentativas ?? 5

  async function requisitar<T>(
    metodo: string,
    caminho: string,
    extra: { query?: Query; corpo?: unknown; cabecalhos?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(BASE_URL + caminho)
    for (const [k, v] of Object.entries(extra.query ?? {})) {
      if (v === undefined || v === null) continue
      // Filtros de lista repetem o parâmetro: ?status=active&status=blocked
      for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item))
    }
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${chave}`,
      Accept: 'application/json',
      ...extra.cabecalhos,
    }
    if (extra.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'

    for (let tentativa = 0; ; tentativa++) {
      const resp = await buscar(url.toString(), {
        method: metodo,
        headers: cabecalhos,
        body: extra.corpo !== undefined ? JSON.stringify(extra.corpo) : undefined,
      })
      const texto = resp.status === 204 ? '' : await resp.text()
      let json: any = null
      try { json = texto ? JSON.parse(texto) : null } catch { json = null }

      // 429: nada foi executado, então repetir é seguro — inclusive numa criação.
      // `Retry-After` (ou `retryAfterSeconds` no corpo) diz quanto esperar; sem
      // ele (proteção de borda, código too-many-requests), espera crescente.
      if (resp.status === 429 && tentativa + 1 < tentativas) {
        const segundos = Number(resp.headers.get('Retry-After')) || Number(json?.retryAfterSeconds) || 2 ** tentativa
        await esperar(segundos * 1000)
        continue
      }
      if (!resp.ok) {
        const codigo = String(json?.code ?? `http-${resp.status}`)
        const mensagem = MENSAGENS[codigo] ?? String(json?.message ?? `A Salvy respondeu ${resp.status}.`)
        throw new ErroSalvy(resp.status, codigo, mensagem, Array.isArray(json?.details) ? json.details : [])
      }
      return json as T
    }
  }

  const id = (v: string) => encodeURIComponent(v)

  return {
    ambiente,

    /** Empresa(s) da chave — serve para conferir que a chave funciona. */
    empresas: () =>
      requisitar<Pagina<{ id: string; name?: string; [k: string]: unknown }>>('GET', '/companies', { query: { page: 1, pageSize: 50 } }),

    /** DDDs em que dá para criar a linha; `available` diz se há número agora. */
    ddds: (tipo: 'mobile' | 'mobile-did' = 'mobile-did', soDisponiveis?: boolean) =>
      requisitar<{ data: Array<{ areaCode: number; available: boolean }> }>('GET', '/area-codes', {
        query: { productType: tipo, available: soDisponiveis },
      }),

    /**
     * Cria um número virtual (mobile-did). Nasce "available"; a cobrança começa
     * quando o número é validado num app (ex.: WhatsApp). `chaveIdempotencia`
     * garante que repetir a requisição devolve o mesmo número, sem criar outro.
     */
    criarNumeroVirtual: (p: { ddd: number; nome?: string | null; chaveIdempotencia: string }) =>
      requisitar<Linha>('POST', '/phone-accounts/mobile-did', {
        corpo: { areaCode: p.ddd, ...(p.nome !== undefined ? { name: p.nome } : {}) },
        cabecalhos: { 'idempotency-key': p.chaveIdempotencia },
      }),

    linha: (linhaId: string) => requisitar<Linha>('GET', `/phone-accounts/${id(linhaId)}`),

    linhas: (f: { tipo?: TipoLinha[]; status?: StatusLinha[]; numero?: string; pagina?: number; porPagina?: number } = {}) =>
      requisitar<Pagina<Linha>>('GET', '/phone-accounts', {
        query: {
          page: f.pagina ?? 1,
          pageSize: f.porPagina ?? 50,
          productType: f.tipo,
          status: f.status,
          phoneNumber: f.numero,
        },
      }),

    /** SMS recebidos pela linha, do mais novo para o mais velho. `servicos: ['whatsapp']` filtra pelo detectado. */
    sms: (linhaId: string, f: { pagina?: number; porPagina?: number; desde?: string; ate?: string; servicos?: string[] } = {}) =>
      requisitar<Pagina<SmsSalvy>>('GET', `/phone-accounts/${id(linhaId)}/sms-messages`, {
        query: {
          page: f.pagina ?? 1,
          pageSize: f.porPagina ?? 50,
          receivedAtFrom: f.desde,
          receivedAtTo: f.ate,
          service: f.servicos,
        },
      }),

    /** Simula a chegada de um SMS. Só existe no sandbox. Texto até 160 caracteres; origem alfanumérica. */
    simularSms: async (linhaId: string, p: { texto: string; origem: string }) => {
      if (ambiente !== 'sandbox') throw new Error('Simular SMS só existe no sandbox da Salvy.')
      await requisitar<null>('POST', `/phone-accounts/${id(linhaId)}/sms`, {
        corpo: { rawText: p.texto, originPhoneNumber: p.origem },
      })
    },

    /**
     * Cancela a linha. Atenção em produção: o mês corrente é cobrado inteiro, e
     * a Salvy recomenda reaproveitar números em vez de cancelar e criar outro.
     */
    cancelar: (linhaId: string, p: { motivo: MotivoCancelamento; detalhe?: string; quando?: 'immediate' | 'scheduled' }) =>
      requisitar<Linha>('POST', `/phone-accounts/${id(linhaId)}/cancel`, {
        corpo: { type: p.quando ?? 'immediate', reason: p.motivo, ...(p.detalhe ? { reasonDetail: p.detalhe } : {}) },
      }),
  }
}

export type ClienteSalvy = ReturnType<typeof criarClienteSalvy>
