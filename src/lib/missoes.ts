/**
 * Missões de vídeo: regras puras da tela (sem Supabase), testadas em
 * __testes__/missoes.teste.ts. Os limites são os mesmos da função
 * videos-missao (supabase/functions/_shared/videos-missao.ts).
 */

export const LIMITE_BYTES = 300 * 1024 * 1024
export const DURACAO_MAXIMA_S = 180
export const MAX_REPROVADOS = 5

const POR_EXTENSAO: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime', webm: 'video/webm',
  m4v: 'video/x-m4v', '3gp': 'video/3gpp', mpeg: 'video/mpeg', mpg: 'video/mpeg',
}
export const TIPOS_ACEITOS = [...new Set(Object.values(POR_EXTENSAO))]

export interface Requisito { id: string; texto: string }
export interface Missao { id: number; titulo: string; descricao: string; requisitos: Requisito[]; ordem: number; ativa: boolean }
export interface RequisitoAvaliado extends Requisito { cumpriu: boolean; motivo: string }
export interface AnaliseVideo {
  requisitos?: RequisitoAvaliado[]
  conteudo_adequado?: boolean
  problema_conteudo?: string
  resumo?: string
  erro?: string
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
  criado_em: string
}
export interface Recompensa { ordem: number; descricao: string }
export type StatusPremio = 'pendente' | 'aplicado' | 'cancelado'
export interface PremioVideo {
  id: string
  restaurante_id: number
  recompensa_ordem: number
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

/** O que impede mandar este arquivo (null = pode). */
export function problemaDoArquivo(a: { nome: string; tipo: string; tamanho: number; duracao: number | null }): string | null {
  if (!mimeDoArquivo(a.nome, a.tipo)) return 'Esse arquivo não é um vídeo aceito. Use MP4, MOV ou WEBM.'
  if (!(a.tamanho > 0)) return 'O arquivo está vazio.'
  if (a.tamanho > LIMITE_BYTES) return `O vídeo tem ${formatarTamanho(a.tamanho)} e o limite é 300 MB. Grave um mais curto ou em qualidade menor.`
  if (a.duracao != null && a.duracao > DURACAO_MAXIMA_S) return `O vídeo tem ${formatarDuracao(a.duracao)} e o limite é 3 minutos. Grave um mais curto.`
  return null
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
export function escadaDePremios(recompensas: Recompensa[], premios: PremioVideo[], aprovadas: number): Degrau[] {
  const vivos = premios.filter((p) => p.status !== 'cancelado')
  return [...recompensas].sort((a, b) => a.ordem - b.ordem).map((r) => {
    const ganho = vivos.find((p) => p.recompensa_ordem === r.ordem)
    if (ganho) return { ordem: r.ordem, descricao: ganho.descricao, estado: ganho.status === 'aplicado' ? 'aplicado' : 'pendente', faltam: 0 }
    const faltam = Math.max(1, r.ordem - aprovadas)
    return { ordem: r.ordem, descricao: r.descricao, estado: r.ordem === aprovadas + 1 ? 'proximo' : 'futuro', faltam }
  })
}

/** "1ª missão", "2ª missão"… */
export const ordinal = (n: number) => `${n}ª missão`
