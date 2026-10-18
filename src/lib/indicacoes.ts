/* Indicações (Descontos → Indicações), nos dois softwares: as regras que a tela
 * usa. Sem banco aqui.
 *
 * Decisões do Raver: a conta pega o link de cadastro dela e manda para outro
 * restaurante (ou empresa, no RH). Desde 17/10/2026 ("proteção de caixa"):
 * cada indicado que paga o 2º mês dá ao padrinho 1 mensalidade grátis, numa
 * FILA; a cobrança do Asaas usa um por mês, só se o indicado daquele bônus
 * segue assinando (o de quem cancelou é descartado). No semestral/anual, a
 * renovação abate de uma vez os bônus de indicados que já pagaram o mínimo de
 * meses. Quem guarda e decide é o banco (migration 20261030040000) e o
 * webhook do Asaas.
 */

export type StatusPremio = 'pendente' | 'aplicado' | 'cancelado'
export type AreaDaIndicacao = 'restaurante' | 'rh'

export interface PremioIndicacao {
  id: string
  /** O benefício como texto ("10% de desconto na mensalidade"). */
  beneficio: string
  porcentagem: number | null
  status: StatusPremio
  criado_em: string
  aplicado_em: string | null
}

/** O que aconteceu com quem entrou pelo link. */
export interface NumerosDaIndicacao {
  /** Criaram conta pelo link (ou digitaram o código). */
  entraram: number
  /** Entraram e ainda não pagaram nenhuma mensalidade. */
  nao_pagaram: number
  /** Pagaram 1 mês e seguem assinando: contam quando pagarem o 2º. */
  a_caminho: number
  /** Já pagaram 2 meses: cada um virou 1 mês grátis na fila. */
  contam: number
  /** Benefícios já liberados (a receber ou recebidos). */
  liberados: number
}

/** Um mês grátis da fila (um por indicado que pagou o 2º mês). */
export interface BonusDaIndicacao {
  id: string
  /** pendente = na fila; aplicado = usado; cancelado = descartado. */
  status: StatusPremio
  criado_em: string
  aplicado_em: string | null
  descartado_em: string | null
  /** 'indicado_cancelou' ou 'admin'. */
  motivo: string | null
  /** Já está na próxima cobrança (ainda não paga). */
  reservado: boolean
}

/** O que a subpágina Indicações recebe (função `indicacao_minha`). */
export interface MinhaIndicacao {
  /** Falso = a página ainda não foi aberta para esta conta. */
  liberado: boolean
  sem_restaurante?: boolean
  area: AreaDaIndicacao
  codigo: string | null
  /** O código está ativo (o admin pode desligar um afiliado). */
  ativo: boolean
  numeros: NumerosDaIndicacao
  /** A fila primeiro (na ordem de uso), depois os usados e os descartados. */
  bonus: BonusDaIndicacao[]
}

const NUMEROS_ZERO: NumerosDaIndicacao = { entraram: 0, nao_pagaram: 0, a_caminho: 0, contam: 0, liberados: 0 }

/** Lê os números do banco sem confiar no formato. */
export function lerNumeros(v: unknown): NumerosDaIndicacao {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const n = (k: keyof NumerosDaIndicacao) => {
    const x = Number(o[k])
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0
  }
  return { ...NUMEROS_ZERO, entraram: n('entraram'), nao_pagaram: n('nao_pagaram'), a_caminho: n('a_caminho'), contam: n('contam'), liberados: n('liberados') }
}

const STATUS_VALIDOS: readonly StatusPremio[] = ['pendente', 'aplicado', 'cancelado']

/** Lê os meses grátis do banco sem confiar no formato (mantém a ordem que veio). */
export function lerBonus(v: unknown): BonusDaIndicacao[] {
  const lista = Array.isArray(v) ? v : []
  const texto = (x: unknown) => (typeof x === 'string' && x ? x : null)
  return lista
    .map((x) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>)
    .filter((o) => typeof o.id === 'string' && STATUS_VALIDOS.includes(o.status as StatusPremio) && typeof o.criado_em === 'string')
    .map((o) => ({
      id: o.id as string,
      status: o.status as StatusPremio,
      criado_em: o.criado_em as string,
      aplicado_em: texto(o.aplicado_em),
      descartado_em: texto(o.descartado_em),
      motivo: texto(o.motivo),
      reservado: o.reservado === true,
    }))
}

/** Quantos meses grátis estão na fila. */
export const mesesNaFila = (bonus: readonly Pick<BonusDaIndicacao, 'status'>[]): number => bonus.filter((b) => b.status === 'pendente').length

/** O código como o link e o checkout aceitam. */
export const CODIGO_VALIDO = /^[A-Z0-9_-]{2,30}$/

/**
 * O link que a conta manda: abre a CRIAÇÃO DE CONTA já com o código de quem
 * indicou (o site guarda o `ref` por 30 dias). No RH, o mesmo código vale como
 * convite para escolher a versão RH.
 */
export function linkDeIndicacao(site: string, codigo: string, area: AreaDaIndicacao = 'restaurante'): string {
  const c = encodeURIComponent(codigo)
  const base = `${site.replace(/\/+$/, '')}/cadastro?ref=${c}`
  return area === 'rh' ? `${base}&area=rh&convite=${c}` : base
}

/** "10%" ou "12,5%". */
export const textoDaPorcentagem = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}%`

/** A situação do mês grátis, do jeito que a conta entende. */
export const ROTULO_PREMIO: Record<StatusPremio, string> = { pendente: 'Na fila', aplicado: 'Usado', cancelado: 'Descartado' }
/** A mesma situação, do lado do admin. */
export const ROTULO_PREMIO_ADMIN: Record<StatusPremio, string> = { pendente: 'Na fila', aplicado: 'Usado', cancelado: 'Descartado' }

/** Quantos benefícios ainda faltam ser aplicados. */
export function premiosPendentes(premios: readonly { status: StatusPremio }[]): number {
  return premios.filter((p) => p.status === 'pendente').length
}

/**
 * O que dizer quando o banco não aceita o código de quem está assinando
 * (função `indicacao_registrar`). Só o próprio código trava a compra; o resto
 * é conferido de novo pelo checkout ou simplesmente não vale.
 */
export const RECUSA_QUE_TRAVA: Record<string, string> = {
  proprio_codigo: 'Este é o seu próprio código de indicação. Use o de quem indicou você ou deixe em branco.',
}

// ── Admin → Afiliados ────────────────────────────────────────────────────────

/** Um código novo para copiar um afiliado para o outro software (o código é único no geral). */
export function codigoParaCopia(codigo: string, area: AreaDaIndicacao, ocupados: ReadonlySet<string>): string {
  const sufixo = area === 'rh' ? 'RH' : 'R'
  const base = codigo.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30 - sufixo.length - 3)
  let candidato = `${base}${sufixo}`
  for (let i = 2; ocupados.has(candidato); i++) candidato = `${base}${sufixo}${i}`
  return candidato
}
