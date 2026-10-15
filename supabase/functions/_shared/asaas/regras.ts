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
 * Onde cada desconto entra. PADRÃO PROVISÓRIO (15/10/2026), a confirmar com o
 * Raver — mudar aqui muda o comportamento inteiro:
 *   - cupom: só na 1ª cobrança da compra;
 *   - bônus de indicação: X% de UMA mensalidade, na próxima cobrança da
 *     assinatura recorrente (um bônus por cobrança, o mais antigo primeiro).
 */
export const POLITICA_DESCONTOS = {
  cupom: 'primeira_cobranca',
  bonusIndicacao: 'uma_mensalidade_por_cobranca',
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

function limitar(valor: number, teto: number): number {
  return Math.min(teto, Math.max(VALOR_MINIMO_CENTAVOS, Math.round(valor)))
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
