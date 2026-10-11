/**
 * O número só do EasyFeed que fala com a equipe dos restaurantes: onde ficam
 * o token da instância, o número e o segredo do webhook (integracao_config, a
 * tabela privada), e as três operações da instância (status, conectar,
 * desconectar). Usado pelas funções equipe e equipe-webhook.
 *
 * Não é o WhatsApp de nenhum restaurante: a instância não tem os webhooks do
 * n8n, e o número conectado não pode ser o de um restaurante.
 */
import { chaveWhatsapp } from './equipe.ts'
import {
  apagarInstancia, chamarInstancia, configUazapi, criarInstancia, extrairConectado, extrairNumero, extrairQr, garantirWebhook,
} from './uazapi.ts'

// deno-lint-ignore no-explicit-any
type Db = any

const CHAVES = { token: 'EQUIPE_WHATSAPP_TOKEN', numero: 'EQUIPE_WHATSAPP_NUMERO', segredo: 'EQUIPE_WEBHOOK_SEGREDO' } as const

export interface ConfigNumero { token: string | null; numero: string | null; segredo: string | null }
export interface EstadoNumero { temInstancia: boolean; conectado: boolean; qrcode: string | null; numero: string | null; recusado?: string }

export async function lerConfigNumero(db: Db): Promise<ConfigNumero> {
  const { data } = await db.from('integracao_config').select('chave, valor').in('chave', Object.values(CHAVES))
  const de = (chave: string) => (data ?? []).find((l: { chave: string }) => l.chave === chave)?.valor || null
  return { token: de(CHAVES.token), numero: de(CHAVES.numero), segredo: de(CHAVES.segredo) }
}

async function gravar(db: Db, chave: string, valor: string | null): Promise<void> {
  if (valor === null) await db.from('integracao_config').delete().eq('chave', chave)
  else await db.from('integracao_config').upsert({ chave, valor, updated_at: new Date().toISOString() })
}

const SEM_INSTANCIA: EstadoNumero = { temInstancia: false, conectado: false, qrcode: null, numero: null }
const MOTIVO_NUMERO_DE_RESTAURANTE =
  'Este número é o WhatsApp de um restaurante. Conecte aqui um número só do EasyFeed, que nenhum restaurante usa.'

/** Lança com `motivo` (sem_uazapi, limite) quando não dá para seguir. */
export class ErroNumero extends Error {
  motivo: string
  constructor(motivo: string, mensagem: string) {
    super(mensagem)
    this.motivo = motivo
  }
}

async function uazapi(db: Db) {
  const cfg = await configUazapi(db)
  if (!cfg) throw new ErroNumero('sem_uazapi', 'Configuração da API do WhatsApp ausente (UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).')
  return cfg
}

/** O número conectado é o WhatsApp de algum restaurante? (as duas instâncias brigariam) */
async function ehDeRestaurante(db: Db, numero: string): Promise<boolean> {
  const { data } = await db.from('restaurantes').select('numero_whatsapp').not('numero_whatsapp', 'is', null)
  const chave = chaveWhatsapp(numero)
  return (data ?? []).some((r: { numero_whatsapp: string }) => chaveWhatsapp(r.numero_whatsapp) === chave)
}

// deno-lint-ignore no-explicit-any
async function lerEstado(db: Db, base: string, token: string, data: any, numeroGravado: string | null): Promise<EstadoNumero> {
  const conectado = extrairConectado(data)
  const numero = extrairNumero(data)
  if (conectado && numero && (await ehDeRestaurante(db, numero))) {
    await apagarInstancia(base, token)
    await gravar(db, CHAVES.token, null)
    await gravar(db, CHAVES.numero, null)
    return { ...SEM_INSTANCIA, recusado: MOTIVO_NUMERO_DE_RESTAURANTE }
  }
  if (conectado && numero && numero !== numeroGravado) await gravar(db, CHAVES.numero, numero)
  return { temInstancia: true, conectado, qrcode: conectado ? null : extrairQr(data), numero: conectado ? numero : numeroGravado }
}

export async function statusDoNumero(db: Db): Promise<EstadoNumero> {
  const cfg = await lerConfigNumero(db)
  if (!cfg.token) return SEM_INSTANCIA
  const { base } = await uazapi(db)
  const { status, data } = await chamarInstancia(base, cfg.token, 'status')
  if (status === 404 || status === 401) {
    // A instância não existe mais: limpa para poder criar de novo.
    await gravar(db, CHAVES.token, null)
    return SEM_INSTANCIA
  }
  // uazapi com erro: não muda nada do que estava gravado.
  if (status >= 400) return { temInstancia: true, conectado: false, qrcode: null, numero: cfg.numero }
  return await lerEstado(db, base, cfg.token, data, cfg.numero)
}

/** Garante a instância e o webhook e devolve o QR Code (ou "conectado"). */
export async function conectarNumero(db: Db, urlDoWebhook: string): Promise<EstadoNumero> {
  const u = await uazapi(db)
  const cfg = await lerConfigNumero(db)
  let token = cfg.token
  const criar = async () => {
    const novo = await criarInstancia(u, { nome: 'EasyFeed Equipe', campo1: 'equipe', campo2: 'Número do EasyFeed para a equipe' })
    if (novo === 'limite') throw new ErroNumero('limite', 'Limite de instâncias atingido na uazapi. Compre mais uma ou libere uma antes de conectar.')
    await gravar(db, CHAVES.token, novo)
    return novo
  }
  if (!token) token = await criar()
  let { status, data } = await chamarInstancia(u.base, token, 'connect')
  if (status === 404 || status === 401) {
    token = await criar()
    ;({ status, data } = await chamarInstancia(u.base, token, 'connect'))
  }
  if (status === 429) throw new ErroNumero('limite', 'Limite de conexões simultâneas atingido. Tente de novo em instantes.')

  // O webhook leva um segredo na URL: só a nossa instância consegue chamar.
  let segredo = cfg.segredo
  if (!segredo) {
    segredo = crypto.randomUUID().replace(/-/g, '')
    await gravar(db, CHAVES.segredo, segredo)
  }
  await garantirWebhook(u.base, token, {
    url: `${urlDoWebhook}?s=${segredo}`,
    events: ['messages'],
    // Sem o que a própria API mandou (senão ela leria as próprias respostas) e sem grupos.
    excludeMessages: ['wasSentByApi', 'isGroupYes'],
  }).catch((e) => console.warn('[equipe] webhook da instância não configurado:', e))

  return await lerEstado(db, u.base, token, data, cfg.numero)
}

export async function desconectarNumero(db: Db): Promise<EstadoNumero> {
  const cfg = await lerConfigNumero(db)
  if (cfg.token) {
    const u = await configUazapi(db)
    if (u) await apagarInstancia(u.base, cfg.token)
  }
  await gravar(db, CHAVES.token, null)
  await gravar(db, CHAVES.numero, null)
  return SEM_INSTANCIA
}
