/**
 * Feedback da equipe: regras puras da tela (sem Supabase), testadas em
 * __testes__/equipe.teste.ts. As regras do pedido de feedback ficam em
 * supabase/functions/_shared/equipe.ts; o que a equipe responde entra pelo n8n
 * e aparece nas páginas /equipe/feedbacks, /equipe/insights e /equipe/acoes
 * (as mesmas dos clientes, com `publico = 'equipe'`).
 */
import { chaveWhatsapp, paraCanonico, paraDigitosNacionais, telefoneNacionalValido } from './telefone.ts'

export const PERGUNTA_MIN = 10
export const PERGUNTA_MAX = 400
/** O aviso de ação concluída (mesmos limites da função equipe). */
export const AVISO_MIN = 20
export const AVISO_MAX = 600

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

export type StatusEnvio = 'na_fila' | 'enviando' | 'concluido' | 'cancelado'
/** 'pedido' pede a opinião da equipe; 'aviso' conta o que mudou quando uma ação é concluída. */
export type TipoEnvio = 'pedido' | 'aviso'
export interface Envio {
  id: number
  restaurante_id: number
  /** A pergunta do pedido, ou o texto do aviso. */
  pergunta: string
  status: StatusEnvio
  tipo: TipoEnvio
  /** Só no aviso: a ação concluída. */
  acao_id: number | null
  /** E-mail de quem criou, ou 'automatico'. */
  criado_por: string
  criado_em: string
  concluido_em: string | null
}

/** De quanto em quanto tempo o pedido automático sai (dias). */
export const FREQUENCIAS = [7, 14, 30] as const
export type Frequencia = (typeof FREQUENCIAS)[number]
export const ROTULO_FREQUENCIA: Record<Frequencia, string> = { 7: 'Toda semana', 14: 'A cada 15 dias', 30: 'Todo mês' }
/** A frequência que anda pelo calendário: sai num dia do mês, não a cada N dias. */
export const MENSAL = 30
/** O dia do pedido mensal quando o dono não escolhe: o começo do mês. */
export const DIA_COMECO_DO_MES = 1
/** Os dias que a tela oferece em "Em um dia específico" (o dia 1 é o "começo do mês"). */
export const DIAS_ESPECIFICOS = Array.from({ length: 30 }, (_, i) => i + 2)
/** Dia que a tela sugere ao trocar para "Em um dia específico". */
export const DIA_ESPECIFICO_SUGERIDO = 15
/** O dia do mês que veio do servidor, de 1 a 31; qualquer outra coisa vira o começo do mês. */
export function diaDoMesDe(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : DIA_COMECO_DO_MES
}
/** "Toda semana", "Todo mês, no começo do mês", "Todo mês, no dia 15". */
export function resumoDaFrequencia(cada: Frequencia, diaDoMes?: number | null): string {
  if (cada !== MENSAL) return ROTULO_FREQUENCIA[cada]
  const dia = diaDoMesDe(diaDoMes)
  return dia === DIA_COMECO_DO_MES ? 'Todo mês, no começo do mês' : `Todo mês, no dia ${dia}`
}
/** O aviso de quando o dia não existe em todos os meses (29, 30 e 31). */
export function avisoDoDiaDoMes(dia: number): string | null {
  return dia >= 29 ? `Nos meses que não têm dia ${dia}, sai no último dia do mês.` : null
}
export type StatusConvite = 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'
/** O convite como a página do restaurante vê: sem dizer de quem é. */
export interface ConviteAnonimo { envio_id: number; status: StatusConvite; respondeu: boolean }

/**
 * Quem deu um feedback da equipe, como o banco deixa a tela saber
 * (`equipe_autoria_visivel`): o nome só vem quando a pessoa deixou mostrar ou
 * não respondeu a pergunta do anonimato no prazo.
 */
export interface Autoria {
  situacao: 'identificado' | 'pendente' | 'anonimo'
  nome?: string
  funcao?: string | null
  /** Até quando a pessoa pode escolher (só em 'pendente'). */
  ate?: string | null
  /** Relato de assédio, discriminação, ameaça, risco ou algo ilegal. */
  sensivel?: boolean
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

// ── Pedidos de feedback ──────────────────────────────────────────────────────

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

/** "12/10 às 14:30" (horário de Brasília): até quando a pessoa pode escolher ficar anônima. */
/** "24 horas", "1 hora", "3 dias": o prazo da pergunta do anonimato, por extenso. */
export function fraseDoPrazo(horas: number | null | undefined): string {
  const h = Number.isFinite(horas) && Number(horas) >= 1 ? Math.round(Number(horas)) : 24
  if (h >= 48 && h % 24 === 0) return `${h / 24} dias`
  return h === 1 ? '1 hora' : `${h} horas`
}

export function formatarAteQuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d)
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${v('day')}/${v('month')} às ${v('hour')}:${v('minute')}`
}

/** "8 de 12 responderam (67%)". */
/**
 * Os números dos PEDIDOS de feedback para a Visão Geral da equipe: o último
 * pedido e a taxa de resposta de todos. Aviso de ação concluída não entra: ele
 * não pede resposta.
 */
export function resumoDosPedidos(envios: Pick<Envio, 'id' | 'tipo' | 'status' | 'criado_em'>[], convites: ConviteAnonimo[]) {
  const pedidos = envios.filter((e) => e.tipo === 'pedido' && e.status !== 'cancelado')
  const ids = new Set(pedidos.map((e) => e.id))
  const ultimo = [...pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0] ?? null
  return {
    pedidos: pedidos.length,
    geral: contasDoEnvio(convites.filter((c) => ids.has(c.envio_id))),
    ultimo: ultimo ? { criado_em: ultimo.criado_em, contas: contasDoEnvio(convites.filter((c) => c.envio_id === ultimo.id)) } : null,
  }
}

export function fraseDeRespostas(c: ContasDoEnvio): string {
  if (!c.enviados) return c.naFila ? 'Ainda saindo' : 'Ninguém recebeu'
  return `${c.responderam} de ${c.enviados} ${c.responderam === 1 ? 'respondeu' : 'responderam'} (${Math.round(c.taxa * 100)}%)`
}
