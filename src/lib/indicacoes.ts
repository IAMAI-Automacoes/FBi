/* Indicações (Descontos → Indicações), nos dois softwares: as regras que a tela
 * usa. Sem banco aqui.
 *
 * Decisões do Raver: a conta pega o link de cadastro dela e manda para outro
 * restaurante (ou empresa, no RH). Uma indicação conta depois que o indicado
 * paga o 2º mês. Desde 17/10/2026 o que a conta ganha é uma ESCADA de níveis
 * por software ("com N indicações, tal benefício"), cadastrada no Admin →
 * Afiliados; até a cobrança aplicar sozinha, o admin dá o benefício à mão.
 * Quem guarda e decide é o banco (migrations 20261027000000 e 20261030030000).
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
  /** Já pagaram 2 meses: contam para a escada. */
  contam: number
  /** Benefícios já liberados (a receber ou recebidos). */
  liberados: number
}

/** Um degrau da escada, com o que a conta já ganhou nele. */
export interface NivelDaIndicacao {
  /** Quantas indicações o nível pede. */
  indicacoes: number
  beneficio: string
  /** Situação do benefício, quando já foi liberado; null = ainda não alcançou. */
  status: StatusPremio | null
  liberado_em: string | null
  aplicado_em: string | null
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
  /** A escada do software, do menor para o maior. */
  niveis: NivelDaIndicacao[]
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

/** Lê a escada do banco sem confiar no formato; fica em ordem e sem repetir o nível. */
export function lerNiveis(v: unknown): NivelDaIndicacao[] {
  const lista = Array.isArray(v) ? v : []
  const vistos = new Set<number>()
  return lista
    .map((x) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>)
    .map((o) => ({
      indicacoes: Math.floor(Number(o.indicacoes)),
      beneficio: typeof o.beneficio === 'string' ? o.beneficio.trim() : '',
      status: STATUS_VALIDOS.includes(o.status as StatusPremio) ? (o.status as StatusPremio) : null,
      liberado_em: typeof o.liberado_em === 'string' ? o.liberado_em : null,
      aplicado_em: typeof o.aplicado_em === 'string' ? o.aplicado_em : null,
    }))
    .filter((n) => Number.isFinite(n.indicacoes) && n.indicacoes > 0 && n.beneficio && !vistos.has(n.indicacoes) && vistos.add(n.indicacoes))
    .sort((a, b) => a.indicacoes - b.indicacoes)
}

/**
 * Já alcançou o nível? O benefício liberado manda (cancelado pelo admin = não);
 * sem ele, vale a conta de quantas indicações já contam.
 */
export function nivelAlcancado(n: Pick<NivelDaIndicacao, 'indicacoes' | 'status'>, contam: number): boolean {
  if (n.status) return n.status !== 'cancelado'
  return contam >= n.indicacoes
}

/** Quantas indicações faltam para o nível (0 = já alcançou). */
export const faltamParaONivel = (n: Pick<NivelDaIndicacao, 'indicacoes'>, contam: number): number => Math.max(0, n.indicacoes - contam)

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

/** A situação do benefício, do jeito que a conta entende. */
export const ROTULO_PREMIO: Record<StatusPremio, string> = { pendente: 'A receber', aplicado: 'Recebido', cancelado: 'Cancelado' }
/** A mesma situação, do lado de quem aplica. */
export const ROTULO_PREMIO_ADMIN: Record<StatusPremio, string> = { pendente: 'Pendente', aplicado: 'Aplicado', cancelado: 'Cancelado' }

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
