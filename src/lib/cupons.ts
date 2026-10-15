/**
 * Cupons na tela (Admin → Cupons e o resgate no Checkout). A regra do que o
 * cupom dá mora em supabase/functions/_shared/cupom.ts, a mesma que o resgate
 * usa no servidor.
 */
import { oQueOCupomDa, type CupomParaRegra, type TipoDeConta } from '../../supabase/functions/_shared/cupom.ts'

export { MAX_USOS_ADMIN, oQueOCupomDa, problemaDoCupom, TIPOS_DE_CONTA, type TipoDeConta } from '../../supabase/functions/_shared/cupom.ts'

export const ROTULO_TIPO_DE_CONTA: Record<TipoDeConta, string> = {
  normal: 'Conta normal',
  vendedor: 'Vira vendedor',
  admin: 'Vira admin',
}

export const RECUSA_DO_CUPOM: Record<string, string> = {
  codigo: 'O código pode ter de 2 a 40 letras, números, hífen ou sublinhado.',
  dias: 'Os dias de acesso são um número inteiro a partir de 1 (vazio = sem fim).',
  desconto_duplo: 'Escolha desconto em % ou em R$, não os dois.',
  porcentagem: 'O desconto em % vai de 1 a 100.',
  valor: 'O desconto em R$ precisa ser maior que zero.',
  usos: 'Os usos são um número inteiro a partir de 1 (vazio = ilimitado).',
  admin_sem_limite: 'Cupom de admin precisa de número de usos (até 20) e de data de validade.',
  tipo_conta: 'Escolha o tipo de conta.',
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** O desconto em texto: "20% de desconto" ou "R$ 50,00 de desconto". */
export function textoDoDesconto(d: { tipo: 'porcentagem' | 'valor'; valor: number }): string {
  return d.tipo === 'porcentagem' ? `${String(d.valor).replace('.', ',')}% de desconto` : `${reais(d.valor)} de desconto`
}

/** O que o cupom dá, numa frase curta (a coluna "Dá" da lista). */
export function descricaoDoCupom(c: CupomParaRegra): string {
  const da = oQueOCupomDa(c)
  const acesso = da.acesso ? (da.dias ? `${da.dias} dias grátis` : 'Acesso sem fim') : ''
  const desconto = da.desconto ? textoDoDesconto(da.desconto) : ''
  return [acesso, desconto].filter(Boolean).join(' + ')
}
