/* Indicações (Descontos → Indicações), nos dois softwares: as regras que a tela
 * usa. Sem banco aqui.
 *
 * Decisões do Raver (15/10/2026): a conta pega o link de cadastro dela e manda
 * para outro restaurante (ou empresa, no RH). Quem indica ganha a porcentagem
 * do afiliado dele como DESCONTO na própria mensalidade, por indicado, depois
 * que o indicado paga o 2º mês. Até o pagamento novo (Asaas), o admin aplica à
 * mão. A página mostra quantos entraram, usam até hoje, usaram e pararam, e
 * quantos ainda esperam o 2º mês.
 * Quem guarda e decide é o banco (migration 20261027000000).
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
  /** Já pagaram e usam até hoje. */
  usam: number
  /** Já pagaram e pararam. */
  pararam: number
  /** Usam, mas o benefício ainda não saiu: só conta depois do 2º mês pago. */
  aguardando: number
  /** Benefícios já liberados (a receber ou recebidos). */
  liberados: number
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
  /** O desconto, em %, por indicado que pagar o 2º mês. */
  porcentagem: number
  numeros: NumerosDaIndicacao
  premios: PremioIndicacao[]
}

const NUMEROS_ZERO: NumerosDaIndicacao = { entraram: 0, nao_pagaram: 0, usam: 0, pararam: 0, aguardando: 0, liberados: 0 }

/** Lê os números do banco sem confiar no formato. */
export function lerNumeros(v: unknown): NumerosDaIndicacao {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const n = (k: keyof NumerosDaIndicacao) => {
    const x = Number(o[k])
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0
  }
  return { ...NUMEROS_ZERO, entraram: n('entraram'), nao_pagaram: n('nao_pagaram'), usam: n('usam'), pararam: n('pararam'), aguardando: n('aguardando'), liberados: n('liberados') }
}

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

/** A mensagem pronta para mandar junto com o link. */
export function mensagemDeIndicacao(link: string, area: AreaDaIndicacao = 'restaurante'): string {
  return area === 'rh'
    ? `Estou usando o EasyFeed para ouvir a minha equipe pelo WhatsApp, com a opção de cada um ficar anônimo, e recomendo. Crie a sua conta por aqui: ${link}`
    : `Estou usando o EasyFeed para ouvir os clientes do meu restaurante pelo WhatsApp e recomendo. Crie a sua conta por aqui: ${link}`
}

/** Abre o WhatsApp com a mensagem escrita, para a pessoa escolher para quem mandar. */
export function linkDoWhatsapp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`
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
