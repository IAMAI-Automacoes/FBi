/**
 * Regras puras da cobrança pelo Asaas: ciclos, valores, descontos, datas,
 * status e documento. Usadas por `criar-cobranca` e `asaas-webhook`.
 *
 * Sem import de fora: dá para testar com `node --experimental-strip-types`
 * (ver `_shared/__testes__/asaas.teste.ts`).
 */

export type Ciclo = 'mensal' | 'semestral' | 'anual'
export type Modalidade = 'recorrente' | 'parcelado'

export const MESES: Record<Ciclo, number> = { mensal: 1, semestral: 6, anual: 12 }
export const CICLO_ASAAS: Record<Ciclo, 'MONTHLY' | 'SEMIANNUALLY' | 'YEARLY'> = {
  mensal: 'MONTHLY',
  semestral: 'SEMIANNUALLY',
  anual: 'YEARLY',
}

export const ehCiclo = (v: unknown): v is Ciclo => v === 'mensal' || v === 'semestral' || v === 'anual'
export const ehModalidade = (v: unknown): v is Modalidade => v === 'recorrente' || v === 'parcelado'

/** Menor cobrança que o Asaas aceita (R$ 5,00). */
export const VALOR_MINIMO_CENTAVOS = 500

/**
 * Onde cada desconto entra (regra do dono, 23/10/2026: não acumulam, é um
 * ou outro — só o vídeo soma por cima):
 *   - cupom ou código (vendedor, influenciador ou restaurante): na 1ª cobrança
 *     vale o maior dos dois; o do código continua nas renovações até acabarem
 *     as suas cobranças com desconto;
 *   - saldo de vídeo aprovado: abate a próxima cobrança (compra ou renovação),
 *     somado ao do código, sem deixar a cobrança abaixo de R$ 5; o que não cabe
 *     fica para a próxima;
 *   - bônus de indicação ("proteção de caixa", regra do Raver em 17/10/2026):
 *     cada indicado que paga o 2º mês dá 1 mensalidade grátis ao padrinho,
 *     numa fila. Na renovação recorrente, o banco confere os indicados
 *     (`indicacao_reservar_bonus`): no mensal, 1 bônus por mês (indicado
 *     ativo); no semestral/anual, todos os de indicado ativo que já pagou o
 *     mínimo de meses, até os meses do plano. Cada bônus abate 1 mensalidade
 *     (`valorComMesesGratis`). Na cobrança com mês grátis não entra o código
 *     nem o vídeo: esperam a seguinte.
 */
export const POLITICA_DESCONTOS = {
  cupom: 'primeira_cobranca',
  bonusIndicacao: 'fila_validada_pelo_indicado',
} as const

export interface Desconto {
  tipo: 'porcentagem' | 'valor'
  /** % (0–100) ou R$ (reais, não centavos — como está em `cupons_usos`). */
  valor: number
}

export const reais = (centavos: number): number => Math.round(centavos) / 100
export const centavos = (valorEmReais: number): number => Math.round(Number(valorEmReais) * 100)

/** Valor da cobrança com o desconto do cupom, sem passar do total nem ficar
    abaixo do mínimo do Asaas. */
export function comDescontoDoCupom(totalCentavos: number, desconto: Desconto | null): number {
  if (!desconto || !(desconto.valor > 0)) return totalCentavos
  const abatido =
    desconto.tipo === 'porcentagem'
      ? Math.round((totalCentavos * Math.min(desconto.valor, 100)) / 100)
      : centavos(desconto.valor)
  return limitar(totalCentavos - abatido, totalCentavos)
}

/** Bônus de indicação: `pct`% de uma mensalidade (o total do ciclo dividido
    pelos meses), abatido de uma cobrança. */
export function comBonusDeIndicacao(valorCentavos: number, totalCicloCentavos: number, ciclo: Ciclo, pct: number): number {
  if (!(pct > 0)) return valorCentavos
  const mensalidade = Math.round(totalCicloCentavos / MESES[ciclo])
  const abatido = Math.round((mensalidade * Math.min(pct, 100)) / 100)
  return limitar(valorCentavos - abatido, valorCentavos)
}

/**
 * A cobrança com `meses` mensalidades grátis (o total do ciclo dividido pelos
 * meses, até os meses do ciclo). Pode ser fração: bônus de indicação de 50%
 * = 0,5 mensalidade (`indicacao_config.bonus_pct`). 0 = a cobrança inteira sai:
 * o Asaas não aceita valor abaixo de R$ 5, então ela é removida e o período
 * anda como se tivesse sido paga. Sobra entre R$ 0 e R$ 5 vira R$ 5.
 */
export function valorComMesesGratis(valorCentavos: number, totalCicloCentavos: number, ciclo: Ciclo, meses: number): number {
  const n = Math.min(Math.max(0, Number(meses) || 0), MESES[ciclo])
  if (n === 0) return valorCentavos
  if (n >= MESES[ciclo]) return 0
  const mensalidade = Math.round(totalCicloCentavos / MESES[ciclo])
  const resto = Math.round(valorCentavos - mensalidade * n)
  if (resto <= 0) return 0
  return Math.min(valorCentavos, Math.max(VALOR_MINIMO_CENTAVOS, resto))
}

function limitar(valor: number, teto: number): number {
  return Math.min(teto, Math.max(VALOR_MINIMO_CENTAVOS, Math.round(valor)))
}

/** O que cabe de saldo (vídeo) numa cobrança sem ela ficar abaixo do mínimo do Asaas. */
export const espacoParaSaldo = (valorCentavos: number): number => Math.max(0, Math.round(valorCentavos) - VALOR_MINIMO_CENTAVOS)

/**
 * O corpo do `PUT /payments/{id}`: o Asaas exige `billingType`, `value` e
 * `dueDate` mesmo para mudar só uma coisa. Repete os da cobrança e troca o
 * que vier em `mudar`. Sem `split` no corpo, o split da cobrança fica como está.
 */
// deno-lint-ignore no-explicit-any
export function corpoDoPut(pag: any, mudar: { valorCentavos?: number; split?: SplitAsaas[] }): Record<string, unknown> {
  return {
    billingType: pag.billingType ?? 'CREDIT_CARD',
    value: mudar.valorCentavos != null ? reais(mudar.valorCentavos) : pag.value,
    dueDate: String(pag.dueDate).slice(0, 10),
    ...(mudar.split ? { split: mudar.split } : {}),
  }
}

// ── Comissão do vendedor (split) ──────────────────────────────────────────

/** A regra do software (`afiliado_config`, Admin → Vendedores). */
export interface RegraDeComissao {
  /** % de UMA mensalidade quando o indicado paga a 2ª. */
  entradaPct: number
  /** % de cada mensalidade depois disso… */
  recorrentePct: number
  /** …por quantos meses. */
  recorrenteMeses: number
}

/**
 * A regra de um influenciador (pedido do Raver, 21/10/2026): a % é de cada um
 * (`afiliados.comissao_valor`, muda com o tamanho dele) e vale em cada
 * mensalidade a partir da 2ª — o mesmo cuidado da regra dos vendedores —, por
 * `meses` mensalidades. Ex.: 15% por 12 → do 2º ao 13º mês.
 */
export function regraDoInfluenciador(pct: number, meses: number): RegraDeComissao {
  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const n = Math.max(0, Math.floor(Number(meses) || 0))
  if (!p || !n) return { entradaPct: 0, recorrentePct: 0, recorrenteMeses: 0 }
  return { entradaPct: p, recorrentePct: p, recorrenteMeses: n - 1 }
}

export interface SplitAsaas {
  walletId: string
  fixedValue: number
  externalReference?: string
  description?: string
}

/** Os custos da empresa que saem antes da comissão (`comissao_custos`, por software). */
export interface CustosDaComissao {
  /** Soma dos custos em R$ por mês, em centavos. */
  fixoCentavosPorMes: number
  /** Soma dos custos em % do valor recebido. */
  pct: number
}

/**
 * A base da comissão de UM mês (decisão do Caio, 21/10/2026): o que o Asaas
 * entregou daquele mês (líquido, já sem a taxa do Asaas e com os descontos)
 * menos os nossos custos — primeiro os de %, depois os de R$ por mês.
 */
export function baseDaComissaoPorMes(liquidoCentavos: number, meses: number, custos: CustosDaComissao): number {
  const n = Math.max(1, Math.floor(meses) || 1)
  const porMes = Math.max(0, Number(liquidoCentavos) || 0) / n
  const pct = Math.min(Math.max(0, Number(custos.pct) || 0), 100)
  return Math.max(0, Math.round(porMes * (1 - pct / 100) - Math.max(0, Number(custos.fixoCentavosPorMes) || 0)))
}

/**
 * A comissão de uma cobrança que cobre os meses `de`..`ate` do indicado
 * (mensal = 1 mês; à vista semestral/anual = 6/12; cada parcela = 1):
 *   mês 1 → nada; mês 2 → entradaPct da base (100% = a mensalidade líquida inteira);
 *   meses 3 a 2 + recorrenteMeses → recorrentePct da base.
 * A base é a de `baseDaComissaoPorMes`. Nunca passa do líquido da cobrança:
 * split acima do líquido trava a cobrança no Asaas.
 */
export function comissaoDoPagamento(p: {
  de: number
  ate: number
  liquidoCentavos: number
  custos: CustosDaComissao
  regra: RegraDeComissao
}): number {
  const { regra } = p
  if (!(p.liquidoCentavos > 0)) return 0
  const de = Math.max(1, Math.floor(p.de))
  const ate = Math.max(de, Math.floor(p.ate))
  const base = baseDaComissaoPorMes(p.liquidoCentavos, ate - de + 1, p.custos)
  let pct = 0
  for (let m = de; m <= ate; m++) {
    if (m === 2) pct += regra.entradaPct
    else if (m >= 3 && m <= 2 + regra.recorrenteMeses) pct += regra.recorrentePct
  }
  const valor = Math.round((base * pct) / 100)
  return Math.max(0, Math.min(valor, Math.round(p.liquidoCentavos)))
}

/** Status de um item do split (`payment.split[]`) → status da nossa comissão. */
export function statusDoSplit(status: unknown): 'agendado' | 'repassado' | 'cancelado' | 'estornado' | 'bloqueado' {
  switch (String(status)) {
    case 'DONE': return 'repassado'
    case 'CANCELLED':
    case 'REFUSED': return 'cancelado'
    case 'REFUNDED': return 'estornado'
    case 'BLOCKED_BY_VALUE_DIVERGENCE': return 'bloqueado'
    default: return 'agendado'
  }
}

// ── Status do Asaas ───────────────────────────────────────────────────────

const PAGOS = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
const ESTORNADOS = new Set([
  'REFUNDED',
  'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
])

export const pagamentoPago = (status: unknown): boolean => PAGOS.has(String(status))
export const pagamentoEstornado = (status: unknown): boolean => ESTORNADOS.has(String(status))
export const pagamentoAtrasado = (status: unknown): boolean => String(status) === 'OVERDUE'

// ── Datas ─────────────────────────────────────────────────────────────────

/** Hoje no fuso de São Paulo, `AAAA-MM-DD` (o Asaas trabalha em datas locais). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

/** Soma meses a uma data `AAAA-MM-DD`; dia que não existe no mês de destino
    cai no último dia (31/01 + 1 mês = 28 ou 29/02). */
export function somarMesesData(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

/** Fim do dia `AAAA-MM-DD` em São Paulo, como ISO. */
export const fimDoDia = (data: string): string => new Date(`${data}T23:59:59-03:00`).toISOString()

/** Recorrente: o pagamento com vencimento V cobre até V + ciclo. */
export function periodoFimRecorrente(vencimento: string, ciclo: Ciclo): string {
  return fimDoDia(somarMesesData(vencimento, MESES[ciclo]))
}

/** Parcelado: a 1ª parcela libera o período inteiro, a partir de hoje ou do
    fim do período atual, o que vier depois (renovar antes não perde dias). */
export function periodoFimParcelado(atualIso: string | null, ciclo: Ciclo, agora: Date = new Date()): string {
  const atual = atualIso ? new Date(atualIso) : null
  const base = atual && atual.getTime() > agora.getTime() ? atual : agora
  return fimDoDia(somarMesesData(hojeSaoPaulo(base), MESES[ciclo]))
}

// ── CPF / CNPJ ────────────────────────────────────────────────────────────

export const somenteDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10])
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + Number(cnpj[i]) * p, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13])
}

/** O documento só com dígitos, se for CPF ou CNPJ válido; senão null. */
export function documentoValido(v: unknown): string | null {
  const d = somenteDigitos(v)
  return cpfValido(d) || cnpjValido(d) ? d : null
}

// ── Webhook ───────────────────────────────────────────────────────────────

/** Compara o token do webhook sem vazar, pelo tempo, quantos caracteres batem. */
export function tokenIgual(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = String(recebido ?? '')
  const b = String(esperado ?? '')
  if (!b) return false
  let dif = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return dif === 0
}

/** `?conta=` do endereço do webhook: só ids no formato de `contas_cobranca`. */
export const contaValida = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{2,20}$/.test(v)
