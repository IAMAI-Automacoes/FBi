/**
 * EasyFeed Influencers: o link, a comissão e o acompanhamento (pedido do
 * Raver, 21/10/2026).
 *
 * A troca: o influenciador usa os dados anônimos dos restaurantes e, em
 * troca, posta vídeos vendendo o EasyFeed com o link dele. Quem assina pelo
 * link rende a ele X% de cada mensalidade líquida, da 2ª em diante, por N
 * mensalidades. X e N são de cada influenciador (mudam com o tamanho dele). O
 * servidor faz a conta em supabase/functions/_shared/asaas/regras.ts
 * (`regraDoInfluenciador`).
 *
 * Para saber se ele divulga ou só usa os dados, olhamos os últimos 30 dias:
 * os vídeos que ele registrou (o admin confere cada um), as visitas no link e
 * os dias em que ele entrou no painel.
 */

const DIA_MS = 24 * 60 * 60 * 1000
/** A janela do acompanhamento. */
export const DIAS_DA_JANELA = 30
/** Quem entrou há menos que isso ainda está começando. */
export const DIAS_DE_COMECO = 7

// ── Vídeos ───────────────────────────────────────────────────────────────────

export type SituacaoDoVideo = 'pendente' | 'aprovado' | 'recusado'

export interface VideoDoInfluenciador {
  id: string
  url: string
  situacao: SituacaoDoVideo
  /** O porquê de não contar (o influenciador vê). */
  recado: string | null
  criado_em: string
  conferido_em: string | null
}

/** Como o admin vê a situação do vídeo. */
export const ROTULO_VIDEO_ADMIN: Record<SituacaoDoVideo, string> = { pendente: 'Para conferir', aprovado: 'Conta', recusado: 'Não conta' }
/** Como o influenciador vê. */
export const ROTULO_VIDEO: Record<SituacaoDoVideo, string> = { pendente: 'Em conferência', aprovado: 'Contou', recusado: 'Não contou' }
export const COR_VIDEO: Record<SituacaoDoVideo, string> = {
  pendente: 'bg-amber-50 text-amber-700',
  aprovado: 'bg-emerald-50 text-emerald-700',
  recusado: 'bg-rose-50 text-rose-700',
}

/** Vídeos da janela que contam ou ainda vão ser conferidos (o recusado não conta). */
export function videosNaJanela(videos: readonly Pick<VideoDoInfluenciador, 'situacao' | 'criado_em'>[], agora: Date = new Date()): number {
  const desde = agora.getTime() - DIAS_DA_JANELA * DIA_MS
  return videos.filter((v) => v.situacao !== 'recusado' && Date.parse(v.criado_em) >= desde).length
}

/**
 * O link colado pelo influenciador, limpo: aceita sem o "https://"
 * (instagram.com/reel/…). `null` = não é um link.
 */
export function urlDoVideo(texto: string): string | null {
  let t = texto.trim()
  if (!t || /\s/.test(t)) return null
  if (!/^https?:\/\//i.test(t)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)) return null
    t = `https://${t}`
  }
  if (t.length > 500) return null
  try {
    const u = new URL(t)
    return u.hostname.includes('.') ? t : null
  } catch {
    return null
  }
}

/** A rede do vídeo, para mostrar na lista. */
export function redeDoVideo(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
  } catch {
    return null
  }
  if (host.endsWith('instagram.com')) return 'Instagram'
  if (host.endsWith('tiktok.com')) return 'TikTok'
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube'
  if (host.endsWith('kwai.com')) return 'Kwai'
  if (host.endsWith('facebook.com') || host === 'fb.watch') return 'Facebook'
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'X'
  return null
}

// ── A situação do influenciador ──────────────────────────────────────────────

export interface NumerosDoInfluenciador {
  /** Quando terminou o primeiro acesso (`onboarding_em`). */
  entrouEm: string | null
  /** Dias em que entrou no painel, na janela. */
  acessos30: number
  /** Visitas no link, na janela. */
  visitas30: number
  videos: readonly Pick<VideoDoInfluenciador, 'situacao' | 'criado_em'>[]
  /** Quantos vídeos por mês foram combinados (0 = sem meta). */
  videosPorMes: number
}

export type SituacaoDoInfluenciador = 'nao_entrou' | 'comecando' | 'divulgando' | 'abaixo' | 'so_usa_dados' | 'parado'

export function situacaoDoInfluenciador(n: NumerosDoInfluenciador, agora: Date = new Date()): SituacaoDoInfluenciador {
  if (!n.entrouEm) return 'nao_entrou'
  const videos = videosNaJanela(n.videos, agora)
  const divulga = videos > 0 || n.visitas30 > 0
  if (n.videosPorMes > 0 ? videos >= n.videosPorMes : divulga) return 'divulgando'
  if (agora.getTime() - Date.parse(n.entrouEm) < DIAS_DE_COMECO * DIA_MS) return 'comecando'
  if (divulga) return 'abaixo'
  if (n.acessos30 > 0) return 'so_usa_dados'
  return 'parado'
}

export const SITUACOES: Record<SituacaoDoInfluenciador, { rotulo: string; cor: string; ponto: string; explica: string }> = {
  nao_entrou: {
    rotulo: 'Ainda não entrou', cor: 'bg-gray-100 text-gray-600', ponto: 'bg-gray-400',
    explica: 'No primeiro acesso, a pessoa recebe no e-mail o link para criar a senha.',
  },
  comecando: {
    rotulo: 'Começando', cor: 'bg-blue-50 text-blue-700', ponto: 'bg-blue-500',
    explica: `Entrou há menos de ${DIAS_DE_COMECO} dias.`,
  },
  divulgando: {
    rotulo: 'Divulgando', cor: 'bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500',
    explica: 'Está postando o combinado com o link.',
  },
  abaixo: {
    rotulo: 'Abaixo do combinado', cor: 'bg-amber-50 text-amber-700', ponto: 'bg-amber-500',
    explica: `Divulga, mas postou menos vídeos que o combinado nos últimos ${DIAS_DA_JANELA} dias.`,
  },
  so_usa_dados: {
    rotulo: 'Só usa os dados', cor: 'bg-rose-50 text-rose-700', ponto: 'bg-rose-500',
    explica: `Entra no painel, mas não postou vídeo e ninguém abriu o link nos últimos ${DIAS_DA_JANELA} dias.`,
  },
  parado: {
    rotulo: 'Parado', cor: 'bg-gray-100 text-gray-600', ponto: 'bg-gray-400',
    explica: `Não entrou, não postou e ninguém abriu o link nos últimos ${DIAS_DA_JANELA} dias.`,
  },
}

// ── O tamanho e a comissão ───────────────────────────────────────────────────

/** Sugestão de % pelo tamanho (só preenche o campo; cada um pode ter a sua). */
export const FAIXAS: readonly { ate: number; rotulo: string; pct: number }[] = [
  { ate: 10_000, rotulo: 'Até 10 mil', pct: 10 },
  { ate: 100_000, rotulo: '10 a 100 mil', pct: 15 },
  { ate: Number.POSITIVE_INFINITY, rotulo: 'Mais de 100 mil', pct: 20 },
]

export function faixaDosSeguidores(seguidores: number | null): number | null {
  if (seguidores == null || !Number.isFinite(seguidores) || seguidores < 0) return null
  const i = FAIXAS.findIndex((f) => seguidores <= f.ate)
  return i < 0 ? FAIXAS.length - 1 : i
}

/**
 * Seguidores digitados do jeito que a pessoa fala: "25000", "25.000",
 * "25 mil", "12,5k", "1,2 mi". Vazio = `null`; não deu para ler = `NaN`.
 */
export function lerSeguidores(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  const m = /^(\d+(?:[.,]\d+)*)\s?(mil|k|mi|m|milh[aã]o|milh[oõ]es)?$/.exec(t)
  if (!m) return Number.NaN
  const [, num, unidade] = m
  if (!unidade) {
    // Sem unidade, ponto e vírgula são de milhar: "25.000" = 25000.
    const n = Number(num.replace(/[.,]/g, ''))
    return Number.isFinite(n) ? n : Number.NaN
  }
  const n = Number(num.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return Number.NaN
  const mult = unidade === 'mil' || unidade === 'k' ? 1_000 : 1_000_000
  return Math.round(n * mult)
}

/** "980", "12,5 mil", "1,2 mi". */
export function formatarSeguidores(n: number): string {
  const curto = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${curto(n / 1_000)} mil`
  return `${curto(n / 1_000_000)} mi`
}

/** "@ana.come" a partir do que for colado: "@ana.come", "ana.come" ou o link do perfil. */
export function lerArroba(texto: string): string {
  let t = texto.trim()
  const doLink = /(?:instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|kwai\.com)\/@?([A-Za-z0-9._-]+)/i.exec(t)
  if (doLink) t = doLink[1]
  return t.replace(/^@+/, '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40)
}

const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}%`

/** A comissão em uma frase: "15% de cada mensalidade, da 2ª em diante, por 12 meses". */
export function textoDaComissao(comissaoPct: number, meses: number): string {
  return `${pct(comissaoPct)} de cada mensalidade, da 2ª em diante, por ${meses === 1 ? '1 mês' : `${meses} meses`}`
}

/** Quanto um assinante mensal que fica rende ao influenciador (centavos), com a mensalidade líquida dada. */
export function exemploDaComissao(comissaoPct: number, meses: number, mensalidadeCentavos: number): { porMes: number; total: number } {
  const porMes = Math.round(mensalidadeCentavos * comissaoPct / 100)
  return { porMes, total: porMes * meses }
}

export interface CadastroDoInfluenciador {
  email: string
  nome: string
  arroba: string
  seguidores: number | null
  comissaoPct: number
  comissaoMeses: number
  videosPorMes: number
}

/** O que está errado no cadastro (`null` = pode salvar). O e-mail só conta no cadastro novo. */
export function problemaDoCadastro(c: CadastroDoInfluenciador, novo: boolean): string | null {
  if (novo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) return 'Confira o e-mail: é com ele que a pessoa entra.'
  if (c.seguidores != null && (!Number.isFinite(c.seguidores) || c.seguidores < 0)) return 'Seguidores: só o número, como 25000 ou 25 mil.'
  if (!Number.isFinite(c.comissaoPct) || c.comissaoPct < 0 || c.comissaoPct > 100) return 'A comissão vai de 0 a 100%.'
  if (!Number.isInteger(c.comissaoMeses) || c.comissaoMeses < 1 || c.comissaoMeses > 120) return 'Os meses de comissão vão de 1 a 120.'
  if (!Number.isInteger(c.videosPorMes) || c.videosPorMes < 0 || c.videosPorMes > 60) return 'Os vídeos por mês vão de 0 a 60.'
  return null
}
