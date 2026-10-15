/**
 * O que um cupom dá, e se um cupom está bem montado. Usado pela função
 * `resgatar-cupom` e pela tela de Cupons do admin (mesma regra nos dois lados).
 *
 * Decisões do Raver (15/10/2026):
 *   - cada cupom é de UM software (Restaurante ou RH) e só vale para conta dele;
 *   - o cupom pode dar desconto em % ou em R$. O desconto fica guardado na conta
 *     e entra na cobrança quando o pagamento novo (Asaas) chegar;
 *   - o cupom escolhe o tipo de conta que cria: normal, vendedor ou admin. Só o
 *     de admin é obrigado a ter número de usos e data de validade (quem souber
 *     o código vira admin da plataforma).
 *
 * Acesso: cupom sem desconto (como sempre foi), com 100% de desconto, ou com
 * dias grátis libera o acesso. Cupom só de desconto parcial NÃO libera: o
 * desconto é sobre a mensalidade que a pessoa paga.
 *
 * Sem import de fora: dá para testar com `node --experimental-strip-types`.
 */

export type TipoDeConta = 'normal' | 'vendedor' | 'admin'
export const TIPOS_DE_CONTA: readonly TipoDeConta[] = ['normal', 'vendedor', 'admin']

/** Máximo de usos de um cupom de admin (é para poucas pessoas). */
export const MAX_USOS_ADMIN = 20

export interface CupomParaRegra {
  dias_validade: number | null
  porcentagem_desconto: number | null
  valor_desconto: number | null
}

export interface OQueOCupomDa {
  /** Libera o acesso ao sistema (assinatura ativa). */
  acesso: boolean
  /** Por quantos dias; null = sem data para acabar. */
  dias: number | null
  /** Desconto guardado para a cobrança; null = nenhum. */
  desconto: { tipo: 'porcentagem' | 'valor'; valor: number } | null
}

const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function oQueOCupomDa(c: CupomParaRegra): OQueOCupomDa {
  const dias = numero(c.dias_validade)
  const pct = numero(c.porcentagem_desconto)
  const valor = numero(c.valor_desconto)
  const desconto = pct != null && pct > 0 && pct < 100
    ? { tipo: 'porcentagem' as const, valor: pct }
    : valor != null && valor > 0 && !(pct != null && pct >= 100)
      ? { tipo: 'valor' as const, valor }
      : null
  const comDias = dias != null && dias > 0
  return { acesso: !desconto || comDias, dias: comDias ? Math.floor(dias) : null, desconto }
}

export interface CupomParaConferir extends CupomParaRegra {
  cupom: string
  tipo_conta: TipoDeConta
  vezes_uso_maximo: number | null
  data_expiracao: string | null
}

/** Só letras, números, hífen e sublinhado (o resgate recusa o resto). */
export const CODIGO_DO_CUPOM = /^[A-Z0-9_-]{2,40}$/

/** O primeiro problema do cupom, ou null. Os mesmos motivos do banco. */
export function problemaDoCupom(c: CupomParaConferir): string | null {
  if (!CODIGO_DO_CUPOM.test(String(c.cupom ?? '').trim().toUpperCase())) return 'codigo'
  const dias = numero(c.dias_validade)
  if (dias != null && (dias < 1 || !Number.isInteger(dias))) return 'dias'
  const pct = numero(c.porcentagem_desconto)
  const valor = numero(c.valor_desconto)
  if (pct != null && valor != null) return 'desconto_duplo'
  if (pct != null && (pct <= 0 || pct > 100)) return 'porcentagem'
  if (valor != null && valor <= 0) return 'valor'
  const usos = numero(c.vezes_uso_maximo)
  if (usos != null && (usos < 1 || !Number.isInteger(usos))) return 'usos'
  if (c.tipo_conta === 'admin' && (usos == null || usos > MAX_USOS_ADMIN || !c.data_expiracao)) return 'admin_sem_limite'
  if (!TIPOS_DE_CONTA.includes(c.tipo_conta)) return 'tipo_conta'
  return null
}

/** O cupom é do software desta conta? Conta sem versão conta como restaurante. */
export const cupomDaArea = (areaDoCupom: unknown, areaDaConta: unknown) =>
  (areaDoCupom === 'rh' ? 'rh' : 'restaurante') === (areaDaConta === 'rh' ? 'rh' : 'restaurante')
