// Google Business Profile: login (OAuth 2.0) e leitura das avaliações.
//
// Só usa `fetch`, então roda no Deno (funções) e no Node (testes, com um
// fetch de mentira). As APIs:
//   - contas: My Business Account Management API v1
//   - locais (restaurantes): My Business Business Information API v1
//   - avaliações: Google My Business API v4 (accounts.locations.reviews)
// Escopo único: business.manage (sensível — o app passa pela verificação do Google).
//
// Política da API ("Content storage"): o conteúdo só pode ficar guardado como
// cópia temporária de até 30 dias, sem ser agregado. Por isso quem chama grava
// as avaliações numa cópia que o cron apaga, e as médias são calculadas na hora.

export const ESCOPO = 'https://www.googleapis.com/auth/business.manage'
export const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth'
export const URL_TOKEN = 'https://oauth2.googleapis.com/token'
export const URL_REVOGAR = 'https://oauth2.googleapis.com/revoke'
const API_CONTAS = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const API_LOCAIS = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const API_AVALIACOES = 'https://mybusiness.googleapis.com/v4'

/** O que deu errado, do jeito que a tela precisa saber. */
export type MotivoErroGoogle =
  | 'precisa_reconectar' // token de renovação revogado, vencido ou inválido
  | 'acesso_nao_liberado' // API ainda não liberada pelo Google (cota 0) ou desativada no projeto
  | 'sem_permissao' // a conta não administra esse perfil
  | 'outro'

export class ErroGoogle extends Error {
  status: number
  motivo: MotivoErroGoogle
  constructor(status: number, motivo: MotivoErroGoogle, mensagem: string) {
    super(mensagem)
    this.name = 'ErroGoogle'
    this.status = status
    this.motivo = motivo
  }
}

/** URL da tela do Google onde o dono escolhe a conta e autoriza. */
export function urlAutorizacao(p: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(URL_AUTORIZACAO)
  u.searchParams.set('client_id', p.clientId)
  u.searchParams.set('redirect_uri', p.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', ESCOPO)
  // offline + consent: garante o token de renovação, que é o que deixa o
  // EasyFeed buscar as avaliações sem o dono entrar de novo.
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', p.state)
  return u.toString()
}

/** Classifica a resposta de erro do Google. */
export function motivoDoErro(status: number, corpo: any): MotivoErroGoogle {
  const texto = JSON.stringify(corpo ?? '').toLowerCase()
  // Token: {"error":"invalid_grant"} na renovação; 401 nas APIs.
  if (corpo?.error === 'invalid_grant' || status === 401) return 'precisa_reconectar'
  // Cota 0 (projeto ainda não aprovado) vem como 429 RESOURCE_EXHAUSTED; API
  // não ativada no projeto vem como 403 SERVICE_DISABLED.
  if (status === 429 || texto.includes('quota') || texto.includes('service_disabled') || texto.includes('has not been used')) {
    return 'acesso_nao_liberado'
  }
  if (status === 403) return 'sem_permissao'
  return 'outro'
}

const MENSAGENS: Record<MotivoErroGoogle, string> = {
  precisa_reconectar: 'A conexão com o Google expirou ou foi desfeita. Conecte de novo.',
  acesso_nao_liberado: 'O acesso à API do Google Business Profile ainda não foi liberado pelo Google.',
  sem_permissao: 'Esta conta Google não tem permissão para ver esse perfil da empresa.',
  outro: 'O Google respondeu com um erro.',
}

/** Nota em palavras ("FOUR") vira número (4). Nota não informada vira null. */
export function notaEmNumero(estrelas: unknown): number | null {
  const mapa: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  return mapa[String(estrelas)] ?? null
}

/**
 * O texto do cliente, sem a tradução automática. Avaliação em outra língua
 * vem como "<tradução> (Translated by Google) ... (Original) <texto original>";
 * fica só o original, que é o que o cliente escreveu.
 */
export function textoOriginal(comentario: unknown): string | null {
  const t = typeof comentario === 'string' ? comentario.trim() : ''
  if (!t) return null
  const iOriginal = t.indexOf('(Original)')
  if (iOriginal >= 0) return t.slice(iOriginal + '(Original)'.length).trim() || null
  const iTraducao = t.indexOf('(Translated by Google)')
  if (iTraducao >= 0) return t.slice(0, iTraducao).trim() || null
  return t
}

export interface Tokens {
  accessToken: string
  refreshToken: string | null
  escopos: string[]
}

export interface ContaGoogle { name: string; nome: string }

export interface LocalGoogle {
  /** accounts/123 */
  conta: string
  /** locations/456 */
  local: string
  titulo: string
  endereco: string | null
  placeId: string | null
  mapsUri: string | null
}

export interface AvaliacaoGoogle {
  id: string
  nota: number
  comentario: string | null
  autor: string | null
  anonimo: boolean
  resposta: string | null
  resposta_em: string | null
  criada_em: string
  atualizada_em: string | null
}

export interface ResultadoAvaliacoes {
  avaliacoes: AvaliacaoGoogle[]
  notaMedia: number | null
  total: number | null
  /** true se parou no limite de páginas (não leu tudo). */
  cortado: boolean
  /** true se leu o histórico inteiro (sem `desde` e sem cortar). */
  completo: boolean
}

/** Uma avaliação da API (Review) no formato da tabela. Sem id, data ou nota válida: null. */
export function lerAvaliacao(r: any): AvaliacaoGoogle | null {
  const nota = notaEmNumero(r?.starRating)
  const id = typeof r?.reviewId === 'string' ? r.reviewId : ''
  const criada = typeof r?.createTime === 'string' ? r.createTime : ''
  if (!id || !criada || nota === null) return null
  const anonimo = r?.reviewer?.isAnonymous === true
  return {
    id,
    nota,
    comentario: textoOriginal(r?.comment),
    autor: anonimo ? null : (typeof r?.reviewer?.displayName === 'string' ? r.reviewer.displayName : null),
    anonimo,
    resposta: typeof r?.reviewReply?.comment === 'string' ? r.reviewReply.comment : null,
    resposta_em: typeof r?.reviewReply?.updateTime === 'string' ? r.reviewReply.updateTime : null,
    criada_em: criada,
    atualizada_em: typeof r?.updateTime === 'string' ? r.updateTime : null,
  }
}

function enderecoLegivel(a: any): string | null {
  if (!a) return null
  const partes = [...(Array.isArray(a.addressLines) ? a.addressLines : []), a.locality, a.administrativeArea]
    .filter((x) => typeof x === 'string' && x.trim())
  return partes.length ? partes.join(', ') : null
}

export function criarClienteGoogle(op: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  /** Teto de páginas de avaliações (50 por página). 200 = 10 mil avaliações. */
  maxPaginas?: number
}) {
  const buscar = op.fetch ?? fetch
  const maxPaginas = op.maxPaginas ?? 200

  async function lerJson(resp: Response): Promise<any> {
    const texto = await resp.text()
    try { return texto ? JSON.parse(texto) : null } catch { return { texto } }
  }

  async function token(corpo: Record<string, string>): Promise<any> {
    const resp = await buscar(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: op.clientId, client_secret: op.clientSecret, ...corpo }).toString(),
    })
    const json = await lerJson(resp)
    if (!resp.ok) {
      const motivo = motivoDoErro(resp.status, json)
      throw new ErroGoogle(resp.status, motivo, MENSAGENS[motivo])
    }
    return json
  }

  async function get(url: string, accessToken: string): Promise<any> {
    const resp = await buscar(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const json = await lerJson(resp)
    if (!resp.ok) {
      const motivo = motivoDoErro(resp.status, json)
      throw new ErroGoogle(resp.status, motivo, MENSAGENS[motivo])
    }
    return json
  }

  return {
    /** Troca o código de uso único (volta do Google) pelos tokens. */
    async trocarCodigo(codigo: string, redirectUri: string): Promise<Tokens> {
      const j = await token({ code: codigo, grant_type: 'authorization_code', redirect_uri: redirectUri })
      return {
        accessToken: String(j?.access_token ?? ''),
        refreshToken: typeof j?.refresh_token === 'string' ? j.refresh_token : null,
        // O dono pode desmarcar a permissão na tela do Google: confere o que veio.
        escopos: String(j?.scope ?? '').split(' ').filter(Boolean),
      }
    },

    /** Token de acesso novo (dura ~1 h) a partir do token de renovação. */
    async renovar(refreshToken: string): Promise<string> {
      const j = await token({ refresh_token: refreshToken, grant_type: 'refresh_token' })
      return String(j?.access_token ?? '')
    },

    /** Desfaz a autorização no Google. Token já inválido não é erro. */
    async revogar(tokenQualquer: string): Promise<void> {
      await buscar(URL_REVOGAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokenQualquer }).toString(),
      }).catch(() => {})
    },

    async contas(accessToken: string): Promise<ContaGoogle[]> {
      const contas: ContaGoogle[] = []
      let pagina = ''
      for (let i = 0; i < 20; i++) {
        const u = new URL(`${API_CONTAS}/accounts`)
        u.searchParams.set('pageSize', '20')
        if (pagina) u.searchParams.set('pageToken', pagina)
        const j = await get(u.toString(), accessToken)
        for (const a of j?.accounts ?? []) {
          if (typeof a?.name === 'string') contas.push({ name: a.name, nome: String(a.accountName ?? a.name) })
        }
        pagina = j?.nextPageToken ?? ''
        if (!pagina) break
      }
      return contas
    },

    async locais(accessToken: string, conta: string): Promise<LocalGoogle[]> {
      const locais: LocalGoogle[] = []
      let pagina = ''
      for (let i = 0; i < 50; i++) {
        const u = new URL(`${API_LOCAIS}/${conta}/locations`)
        u.searchParams.set('pageSize', '100')
        u.searchParams.set('readMask', 'name,title,storefrontAddress,metadata')
        if (pagina) u.searchParams.set('pageToken', pagina)
        const j = await get(u.toString(), accessToken)
        for (const l of j?.locations ?? []) {
          if (typeof l?.name !== 'string') continue
          locais.push({
            conta,
            local: l.name,
            titulo: String(l.title ?? l.name),
            endereco: enderecoLegivel(l.storefrontAddress),
            placeId: l?.metadata?.placeId ?? null,
            mapsUri: l?.metadata?.mapsUri ?? null,
          })
        }
        pagina = j?.nextPageToken ?? ''
        if (!pagina) break
      }
      return locais
    },

    /**
     * Avaliações do local (50 por página), mais a nota média e o total do Google.
     * Sem `desde`: o histórico inteiro. Com `desde` (ISO): só as criadas ou
     * editadas depois — vêm da mais recente para a mais antiga (updateTime),
     * então a leitura para na primeira mais velha que isso. Na maioria das
     * vezes é uma chamada só.
     */
    async avaliacoes(accessToken: string, conta: string, local: string, desde?: string): Promise<ResultadoAvaliacoes> {
      const limite = desde ? new Date(desde).getTime() : null
      const idLocal = local.replace(/^locations\//, '')
      const avaliacoes: AvaliacaoGoogle[] = []
      let notaMedia: number | null = null
      let total: number | null = null
      let pagina = ''
      let cortado = false
      let chegouNoLimite = false
      for (let i = 0; ; i++) {
        if (i >= maxPaginas) { cortado = true; break }
        const u = new URL(`${API_AVALIACOES}/${conta}/locations/${idLocal}/reviews`)
        u.searchParams.set('pageSize', '50')
        u.searchParams.set('orderBy', 'updateTime desc')
        if (pagina) u.searchParams.set('pageToken', pagina)
        const j = await get(u.toString(), accessToken)
        if (notaMedia === null && typeof j?.averageRating === 'number') notaMedia = j.averageRating
        if (total === null && j?.totalReviewCount != null) total = Number(j.totalReviewCount)
        for (const r of j?.reviews ?? []) {
          const quando = new Date(r?.updateTime ?? r?.createTime ?? 0).getTime()
          if (limite !== null && quando <= limite) { chegouNoLimite = true; break }
          const a = lerAvaliacao(r)
          if (a) avaliacoes.push(a)
        }
        pagina = j?.nextPageToken ?? ''
        if (!pagina || chegouNoLimite) break
      }
      return { avaliacoes, notaMedia, total, cortado, completo: !desde && !cortado }
    },
  }
}

export type ClienteGoogle = ReturnType<typeof criarClienteGoogle>

/** Todos os locais (restaurantes) de todas as contas que o dono administra. */
export async function locaisDeTodasAsContas(
  google: Pick<ClienteGoogle, 'contas' | 'locais'>,
  accessToken: string,
): Promise<LocalGoogle[]> {
  const locais: LocalGoogle[] = []
  for (const conta of await google.contas(accessToken)) {
    locais.push(...(await google.locais(accessToken, conta.name)))
  }
  // O mesmo local pode aparecer em duas contas (pessoal e de organização).
  return locais.filter((l, i) => locais.findIndex((x) => x.local === l.local) === i)
}
