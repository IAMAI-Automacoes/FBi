/**
 * Missões de vídeo: regras puras da tela (sem Supabase), testadas em
 * __testes__/missoes.teste.ts. Os limites são os mesmos da função
 * videos-missao (supabase/functions/_shared/videos-missao.ts).
 */

export const LIMITE_BYTES = 300 * 1024 * 1024
/** Duração máxima quando a missão não define a dela. */
export const DURACAO_PADRAO_MAX_S = 180
/** Nenhuma missão aceita mais que isto. */
export const DURACAO_TETO_S = 300
export const MAX_REPROVADOS = 5

const POR_EXTENSAO: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime', webm: 'video/webm',
  m4v: 'video/x-m4v', '3gp': 'video/3gpp', mpeg: 'video/mpeg', mpg: 'video/mpeg',
}
export const TIPOS_ACEITOS = [...new Set(Object.values(POR_EXTENSAO))]

export interface Requisito { id: string; texto: string }
export interface Missao {
  id: number
  titulo: string
  descricao: string
  requisitos: Requisito[]
  ordem: number
  ativa: boolean
  /** Passo a passo para gravar (um por linha). */
  roteiro: string
  duracao_min_s: number | null
  duracao_max_s: number | null
  /** 'AAAA-MM-DD' (horário de Brasília), inclusive. */
  disponivel_de: string | null
  disponivel_ate: string | null
}
export interface RequisitoAvaliado extends Requisito { cumpriu: boolean; motivo: string }
export interface AnaliseVideo {
  requisitos?: RequisitoAvaliado[]
  conteudo_adequado?: boolean
  problema_conteudo?: string
  resumo?: string
  erro?: string
  roteiro?: { seguido: boolean; comentario: string }
}
export type StatusEnvio = 'enviando' | 'analisando' | 'aprovado' | 'reprovado' | 'erro'
export interface EnvioVideo {
  id: string
  restaurante_id: number
  missao_id: number
  caminho: string
  nome_arquivo: string
  tamanho_bytes: number
  duracao_segundos: number | null
  status: StatusEnvio
  analise: AnaliseVideo | null
  motivo: string | null
  analisado_em: string | null
  revisado_por: string | null
  aprovado_em: string | null
  criado_em: string
}
export interface Recompensa { ordem: number; descricao: string }
export type StatusPremio = 'pendente' | 'aplicado' | 'cancelado'
export interface PremioVideo {
  id: string
  restaurante_id: number
  recompensa_ordem: number
  /** A escada recomeça todo ano: o ano em que ganhou. */
  ano: number
  descricao: string
  envio_id: string
  status: StatusPremio
  aplicado_em: string | null
  criado_em: string
}

/** Os requisitos como vêm do jsonb: só os que têm texto. */
export function lerRequisitos(bruto: unknown): Requisito[] {
  return (Array.isArray(bruto) ? bruto : [])
    .map((r, i) => ({ id: String((r as { id?: unknown })?.id ?? '').trim() || `r${i + 1}`, texto: String((r as { texto?: unknown })?.texto ?? '').trim() }))
    .filter((r) => r.texto)
}

/** Um id curto a partir do texto do requisito (para o admin não precisar digitar). */
export function idDoRequisito(texto: string, usados: string[] = []): string {
  const base = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'requisito'
  let id = base
  for (let n = 2; usados.includes(id); n++) id = `${base}_${n}`
  return id
}

/** O tipo do vídeo: o do navegador ou, se vier vazio (acontece com .mov), pela extensão. */
export function mimeDoArquivo(nome: string, tipo: string): string {
  const t = (tipo || '').toLowerCase()
  if (TIPOS_ACEITOS.includes(t)) return t
  return POR_EXTENSAO[(nome.toLowerCase().split('.').pop() ?? '')] ?? ''
}

/** Quanto o vídeo desta missão pode durar, em segundos. */
export function duracaoDaMissao(m: Pick<Missao, 'duracao_min_s' | 'duracao_max_s'>): { min: number | null; max: number } {
  const max = Math.min(DURACAO_TETO_S, m.duracao_max_s ?? DURACAO_PADRAO_MAX_S)
  return { min: m.duracao_min_s ? Math.min(m.duracao_min_s, max) : null, max }
}

/** "De 30 s a 2 min", "Até 3 min". */
export function rotuloDuracao(m: Pick<Missao, 'duracao_min_s' | 'duracao_max_s'>): string {
  const { min, max } = duracaoDaMissao(m)
  return min ? `De ${formatarDuracao(min)} a ${formatarDuracao(max)}` : `Até ${formatarDuracao(max)}`
}

/** O que impede mandar este arquivo nesta missão (null = pode). */
export function problemaDoArquivo(
  a: { nome: string; tipo: string; tamanho: number; duracao: number | null },
  limites: { min: number | null; max: number } = { min: null, max: DURACAO_PADRAO_MAX_S },
): string | null {
  if (!mimeDoArquivo(a.nome, a.tipo)) return 'Esse arquivo não é um vídeo aceito. Use MP4, MOV ou WEBM.'
  if (!(a.tamanho > 0)) return 'O arquivo está vazio.'
  if (a.tamanho > LIMITE_BYTES) return `O vídeo tem ${formatarTamanho(a.tamanho)} e o limite é 300 MB. Grave um mais curto ou em qualidade menor.`
  if (a.duracao != null && limites.min != null && a.duracao < limites.min) return `O vídeo tem ${formatarDuracao(a.duracao)} e esta missão pede pelo menos ${formatarDuracao(limites.min)}.`
  if (a.duracao != null && a.duracao > limites.max) return `O vídeo tem ${formatarDuracao(a.duracao)} e o máximo desta missão é ${formatarDuracao(limites.max)}. Grave um mais curto.`
  return null
}

// ── Datas no horário de Brasília (-03:00) ────────────────────────────────────

/** Hoje em Brasília, 'AAAA-MM-DD'. */
export function hojeSP(agora = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agora))
}
export const anoSP = (agora = Date.now()) => Number(hojeSP(agora).slice(0, 4))
/** 1º de janeiro deste ano, meia-noite em Brasília (a escada e o limite recomeçam aí). */
export const inicioDoAnoSP = (agora = Date.now()) => `${anoSP(agora)}-01-01T00:00:00-03:00`

/** A missão está no período dela hoje? (sem datas = sempre) */
export function noPeriodo(m: Pick<Missao, 'disponivel_de' | 'disponivel_ate'>, hoje: string): boolean {
  return (!m.disponivel_de || hoje >= m.disponivel_de) && (!m.disponivel_ate || hoje <= m.disponivel_ate)
}

/** A missão aparece para o restaurante agora? */
export const missaoDisponivel = (m: Missao, hoje: string) => m.ativa && noPeriodo(m, hoje)

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** "Até 31/10", "De 01/11 a 30/11", "A partir de 01/11" (null = sem período). */
export function rotuloPeriodo(m: Pick<Missao, 'disponivel_de' | 'disponivel_ate'>): string | null {
  if (m.disponivel_de && m.disponivel_ate) return `De ${diaMes(m.disponivel_de)} a ${diaMes(m.disponivel_ate)}`
  if (m.disponivel_ate) return `Até ${diaMes(m.disponivel_ate)}`
  if (m.disponivel_de) return `A partir de ${diaMes(m.disponivel_de)}`
  return null
}

/** Para o admin: em que pé está o período da missão. */
export function estadoDoPeriodo(m: Pick<Missao, 'disponivel_de' | 'disponivel_ate'>, hoje: string): 'sempre' | 'agendada' | 'no_ar' | 'encerrada' {
  if (!m.disponivel_de && !m.disponivel_ate) return 'sempre'
  if (m.disponivel_de && hoje < m.disponivel_de) return 'agendada'
  if (m.disponivel_ate && hoje > m.disponivel_ate) return 'encerrada'
  return 'no_ar'
}

/** Os passos do roteiro (um por linha, sem a numeração que o admin digitou). */
export function passosDoRoteiro(roteiro: string | null | undefined): string[] {
  return String(roteiro ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*(\d+[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
}

/** Vídeos aprovados neste ano (contam para o limite e para a escada). */
export function aprovadosNoAno(envios: EnvioVideo[], inicioDoAno: string): number {
  const desde = new Date(inicioDoAno).getTime()
  return envios.filter((e) => e.status === 'aprovado' && e.aprovado_em && new Date(e.aprovado_em).getTime() >= desde).length
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`
}

export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`
}

export const ROTULO_STATUS: Record<StatusEnvio, string> = {
  enviando: 'Enviando',
  analisando: 'Analisando',
  aprovado: 'Aprovado',
  reprovado: 'Não aprovado',
  erro: 'Em revisão',
}

/** A situação de uma missão para o restaurante, pelo último envio dela. */
export type Situacao = 'nao_enviada' | 'analisando' | 'aprovada' | 'reprovada' | 'em_revisao' | 'sem_tentativas'
export function situacaoDaMissao(missaoId: number, envios: EnvioVideo[]): { situacao: Situacao; ultimo: EnvioVideo | null; tentativasRestantes: number } {
  const daMissao = envios.filter((e) => e.missao_id === missaoId && e.status !== 'enviando')
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  const reprovados = daMissao.filter((e) => e.status === 'reprovado').length
  const tentativasRestantes = Math.max(0, MAX_REPROVADOS - reprovados)
  const aprovado = daMissao.find((e) => e.status === 'aprovado')
  if (aprovado) return { situacao: 'aprovada', ultimo: aprovado, tentativasRestantes }
  const ultimo = daMissao[0] ?? null
  if (!ultimo) return { situacao: 'nao_enviada', ultimo: null, tentativasRestantes }
  if (ultimo.status === 'analisando') return { situacao: 'analisando', ultimo, tentativasRestantes }
  if (ultimo.status === 'erro') return { situacao: 'em_revisao', ultimo, tentativasRestantes }
  return { situacao: tentativasRestantes ? 'reprovada' : 'sem_tentativas', ultimo, tentativasRestantes }
}

/** Pode mandar (ou mandar de novo) um vídeo para a missão? */
export function podeMandar(s: Situacao): boolean {
  return s === 'nao_enviada' || s === 'reprovada' || s === 'em_revisao'
}

/**
 * As missões são uma fila: o restaurante só vê a primeira (pela ordem do
 * admin) que ainda não cumpriu, e só ela aceita vídeo. Pula as desativadas, as
 * fora do período e as que esgotaram as tentativas. null = não sobrou nenhuma.
 * A função videos-missao confere a mesma regra (proximaMissao no _shared).
 */
export function proximaMissao(missoes: Missao[], envios: Pick<EnvioVideo, 'missao_id' | 'status'>[], hoje: string): Missao | null {
  return missoes
    .filter((m) => missaoDisponivel(m, hoje))
    .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
    .find((m) => {
      const daMissao = envios.filter((e) => e.missao_id === m.id)
      return !daMissao.some((e) => e.status === 'aprovado') && daMissao.filter((e) => e.status === 'reprovado').length < MAX_REPROVADOS
    }) ?? null
}

/**
 * A escada de prêmios do restaurante: cada degrau ganho (com a situação do
 * prêmio), o próximo e os que vêm depois.
 */
export interface Degrau {
  ordem: number
  descricao: string
  estado: 'aplicado' | 'pendente' | 'proximo' | 'futuro'
  /** Missões que ainda faltam para chegar neste degrau (0 nos ganhos). */
  faltam: number
}
export function escadaDePremios(recompensas: Recompensa[], premios: PremioVideo[], aprovadas: number, ano: number): Degrau[] {
  // A escada recomeça todo ano: só contam os prêmios deste ano.
  const vivos = premios.filter((p) => p.status !== 'cancelado' && p.ano === ano)
  return [...recompensas].sort((a, b) => a.ordem - b.ordem).map((r) => {
    const ganho = vivos.find((p) => p.recompensa_ordem === r.ordem)
    if (ganho) return { ordem: r.ordem, descricao: ganho.descricao, estado: ganho.status === 'aplicado' ? 'aplicado' : 'pendente', faltam: 0 }
    const faltam = Math.max(1, r.ordem - aprovadas)
    return { ordem: r.ordem, descricao: r.descricao, estado: r.ordem === aprovadas + 1 ? 'proximo' : 'futuro', faltam }
  })
}

/** "1ª missão", "2ª missão"… */
export const ordinal = (n: number) => `${n}ª missão`
