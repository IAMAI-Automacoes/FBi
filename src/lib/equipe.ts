/**
 * Feedback da equipe: regras puras da tela (sem Supabase), testadas em
 * __testes__/equipe.teste.ts. As regras do servidor (convite, análise, PARAR)
 * ficam em supabase/functions/_shared/equipe.ts.
 */
import { chaveWhatsapp, paraCanonico, paraDigitosNacionais, telefoneNacionalValido } from './telefone.ts'

/** Com menos gente que isto num envio, dá para adivinhar quem falou (igual ao servidor). */
export const MINIMO_ANONIMO = 4
export const PERGUNTA_MIN = 10
export const PERGUNTA_MAX = 400

export interface Funcionario {
  id: number
  restaurante_id: number
  nome: string
  /** "55" + DDD + número. */
  telefone: string
  funcao: string
  ativo: boolean
  /** Respondeu PARAR: não recebe mais pedido de feedback. */
  opt_out_em: string | null
  criado_em: string
}

export interface ResumoEquipe {
  clima: string
  vai_bem: string[]
  incomoda: string[]
  sugestoes: string[]
  por_onde_comecar: string
  /** Quantas respostas existiam quando o resumo foi gerado. */
  respostas?: number
}
export type StatusEnvio = 'na_fila' | 'enviando' | 'concluido' | 'cancelado'
export interface Envio {
  id: number
  restaurante_id: number
  pergunta: string
  status: StatusEnvio
  resumo: ResumoEquipe | null
  resumo_em: string | null
  criado_em: string
  concluido_em: string | null
}
export type StatusConvite = 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'
/** O convite como a página do restaurante vê: sem dizer de quem é. */
export interface ConviteAnonimo { envio_id: number; status: StatusConvite; respondeu: boolean }

/** Sem funcionário e sem hora: é o que a página pode mostrar. */
export interface RespostaAnonima {
  id: string
  envio_id: number | null
  texto_original: string
  sentimento: string | null
  sensivel: boolean
  /** 'AAAA-MM-DD' (Brasília). */
  dia: string
}
export interface PontoEquipe {
  id: number
  resposta_id: string
  texto_original: string
  resumo: string
  categoria: string
  sentimento: string
}

export const ROTULO_ENVIO: Record<StatusEnvio, string> = {
  na_fila: 'Na fila',
  enviando: 'Enviando',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

// ── Funcionários ─────────────────────────────────────────────────────────────

export type SituacaoFuncionario = 'recebe' | 'parou' | 'inativo'
export function situacaoDoFuncionario(f: Pick<Funcionario, 'ativo' | 'opt_out_em'>): SituacaoFuncionario {
  if (f.opt_out_em) return 'parou'
  return f.ativo ? 'recebe' : 'inativo'
}
/** Entra no próximo pedido de feedback? */
export const podeReceber = (f: Pick<Funcionario, 'ativo' | 'opt_out_em'>) => situacaoDoFuncionario(f) === 'recebe'

export interface LinhaColada {
  nome: string
  /** Canônico ("55" + DDD + número), ou '' quando não deu para ler. */
  telefone: string
  funcao: string
  /** O que impede de cadastrar esta linha (null = pode). */
  problema: string | null
}

// O número no meio da linha: de 10 dígitos para cima, com ou sem +55, parênteses, espaço e hífen.
const NUMERO_NA_LINHA = /\+?\(?\d[\d\s().-]{8,}\d/g
const limpar = (s: string) => s.replace(/[\t;,|]+/g, ' ').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:–-]+|[\s:–-]+$/g, '').trim()

/**
 * Lê uma lista colada, uma pessoa por linha: "Nome, número" e, se quiser, a
 * função depois ("Ana Paula, 11 98765-4321, cozinha"). Aceita vírgula, ponto e
 * vírgula, traço ou tabulação (colado de planilha). `jaCadastrados`: os
 * telefones que o restaurante já tem.
 */
export function lerListaColada(texto: string, jaCadastrados: string[] = []): LinhaColada[] {
  const existentes = new Set(jaCadastrados.map(chaveWhatsapp))
  const vistos = new Set<string>()
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((linha) => {
    const achados = [...linha.matchAll(NUMERO_NA_LINHA)]
    const achado = achados[achados.length - 1]
    if (!achado) return { nome: limpar(linha), telefone: '', funcao: '', problema: 'Sem número' }
    const nome = limpar(linha.slice(0, achado.index))
    const funcao = limpar(linha.slice((achado.index ?? 0) + achado[0].length))
    const nacionais = paraDigitosNacionais(achado[0])
    const telefone = paraCanonico(nacionais.slice(0, 2), nacionais.slice(2))
    const chave = chaveWhatsapp(telefone)
    let problema: string | null = null
    if (!nome) problema = 'Sem nome'
    else if (!telefoneNacionalValido(telefone)) problema = 'Número incompleto (confira o DDD)'
    else if (vistos.has(chave)) problema = 'Repetido na lista'
    else if (existentes.has(chave)) problema = 'Já cadastrado'
    if (!problema) vistos.add(chave)
    return { nome, telefone, funcao, problema }
  })
}

// ── Envios e respostas ───────────────────────────────────────────────────────

export interface ContasDoEnvio {
  /** Convites que valem (os cancelados não contam). */
  total: number
  naFila: number
  enviados: number
  falharam: number
  responderam: number
  /** De 0 a 1, sobre os que receberam. */
  taxa: number
}
export function contasDoEnvio(convites: ConviteAnonimo[]): ContasDoEnvio {
  const validos = convites.filter((c) => c.status !== 'cancelado')
  const enviados = validos.filter((c) => c.status === 'enviado').length
  const responderam = validos.filter((c) => c.respondeu).length
  return {
    total: validos.length,
    naFila: validos.filter((c) => c.status === 'na_fila' || c.status === 'enviando').length,
    enviados,
    falharam: validos.filter((c) => c.status === 'falhou').length,
    responderam,
    taxa: enviados ? responderam / enviados : 0,
  }
}

const semAcento = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
export type ChaveSentimento = 'positivo' | 'negativo' | 'neutro' | 'sugestao'
/** O sentimento de um PONTO (nunca é misto: os dois viram dois pontos). */
export function chaveDoSentimento(valor: string | null | undefined): ChaveSentimento {
  const v = semAcento(valor)
  if (v.includes('negativ')) return 'negativo'
  if (v.includes('positiv')) return 'positivo'
  if (v.includes('sugest')) return 'sugestao'
  return 'neutro'
}

export interface Clima { positivo: number; negativo: number; neutro: number; sugestao: number; total: number }
/** Quantos pontos de cada sentimento. */
export function climaDosPontos(pontos: Pick<PontoEquipe, 'sentimento'>[]): Clima {
  const c: Clima = { positivo: 0, negativo: 0, neutro: 0, sugestao: 0, total: pontos.length }
  for (const p of pontos) c[chaveDoSentimento(p.sentimento)]++
  return c
}

export interface Tema extends Clima { categoria: string }
/** Os assuntos mais falados, do mais citado para o menos (empate: o que tem mais crítica). */
export function temasDosPontos(pontos: Pick<PontoEquipe, 'categoria' | 'sentimento'>[]): Tema[] {
  const por = new Map<string, Pick<PontoEquipe, 'sentimento'>[]>()
  for (const p of pontos) por.set(p.categoria, [...(por.get(p.categoria) ?? []), p])
  return [...por.entries()].map(([categoria, lista]) => ({ categoria, ...climaDosPontos(lista) }))
    .sort((a, b) => b.total - a.total || b.negativo - a.negativo || a.categoria.localeCompare(b.categoria))
}

/** '2026-10-12' → '12/10/2026'. */
export const formatarDia = (dia: string) => (/^\d{4}-\d{2}-\d{2}/.test(dia) ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : dia)

/** "8 de 12 responderam (67%)". */
export function fraseDeRespostas(c: ContasDoEnvio): string {
  if (!c.enviados) return c.naFila ? 'Ainda saindo' : 'Ninguém recebeu'
  return `${c.responderam} de ${c.enviados} ${c.responderam === 1 ? 'respondeu' : 'responderam'} (${Math.round(c.taxa * 100)}%)`
}
