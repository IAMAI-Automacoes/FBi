/**
 * Regras da cobrança pelo Asaas (supabase/functions/_shared/asaas/regras.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/asaas.teste.ts
 */
import {
  comBonusDeIndicacao,
  comDescontoDoCupom,
  contaValida,
  documentoValido,
  hojeSaoPaulo,
  pagamentoEstornado,
  pagamentoPago,
  periodoFimParcelado,
  periodoFimRecorrente,
  somarMesesData,
  tokenIgual,
  VALOR_MINIMO_CENTAVOS,
} from '../asaas/regras.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── Cupom ────────────────────────────────────────────────────────────────────
ok('sem cupom: valor cheio', comDescontoDoCupom(19700, null) === 19700)
ok('20%: R$197 → R$157,60', comDescontoDoCupom(19700, { tipo: 'porcentagem', valor: 20 }) === 15760)
ok('R$50: R$197 → R$147', comDescontoDoCupom(19700, { tipo: 'valor', valor: 50 }) === 14700)
ok('R$49,90 (reais com centavos)', comDescontoDoCupom(19700, { tipo: 'valor', valor: 49.9 }) === 14710)
ok('desconto maior que o valor: fica no mínimo do Asaas', comDescontoDoCupom(19700, { tipo: 'valor', valor: 500 }) === VALOR_MINIMO_CENTAVOS)
ok('100% também para no mínimo (cupom de 100% libera acesso, não cobra)', comDescontoDoCupom(19700, { tipo: 'porcentagem', valor: 100 }) === VALOR_MINIMO_CENTAVOS)
ok('desconto zero ou negativo: valor cheio', comDescontoDoCupom(19700, { tipo: 'valor', valor: 0 }) === 19700 && comDescontoDoCupom(19700, { tipo: 'porcentagem', valor: -5 }) === 19700)
ok('anual parcelado: desconto sobre o total', comDescontoDoCupom(176400, { tipo: 'porcentagem', valor: 10 }) === 158760)

// ── Bônus de indicação ───────────────────────────────────────────────────────
ok('mensal: 10% de R$197 = R$19,70 a menos', comBonusDeIndicacao(19700, 19700, 'mensal', 10) === 17730)
ok('anual: 10% de UMA mensalidade (R$1.764/12 = R$147) = R$14,70 a menos', comBonusDeIndicacao(176400, 176400, 'anual', 10) === 174930)
ok('sem %: valor igual', comBonusDeIndicacao(19700, 19700, 'mensal', 0) === 19700)
ok('100%: a mensalidade de graça, mas o Asaas cobra o mínimo', comBonusDeIndicacao(19700, 19700, 'mensal', 100) === VALOR_MINIMO_CENTAVOS)

// ── Status ───────────────────────────────────────────────────────────────────
ok('pago: CONFIRMED, RECEIVED, RECEIVED_IN_CASH', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].every(pagamentoPago))
ok('não pago: PENDING, OVERDUE, REFUNDED', !['PENDING', 'OVERDUE', 'REFUNDED'].some(pagamentoPago))
ok('estorno e chargeback', ['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].every(pagamentoEstornado) && !pagamentoEstornado('CONFIRMED'))

// ── Datas ────────────────────────────────────────────────────────────────────
ok('somar 1 mês', somarMesesData('2026-10-15', 1) === '2026-11-15')
ok('31/01 + 1 mês = último dia de fevereiro', somarMesesData('2027-01-31', 1) === '2027-02-28' && somarMesesData('2028-01-31', 1) === '2028-02-29')
ok('virada de ano', somarMesesData('2026-11-30', 6) === '2027-05-30')
ok('recorrente mensal: vencimento + 1 mês, fim do dia em SP', periodoFimRecorrente('2026-10-15', 'mensal') === '2026-11-16T02:59:59.000Z')
ok('recorrente anual', periodoFimRecorrente('2026-10-15', 'anual').startsWith('2027-10-16T02:59:59'))
const agora = new Date('2026-10-15T15:00:00Z')
ok('parcelado sem período: de hoje + ciclo', periodoFimParcelado(null, 'semestral', agora) === '2027-04-16T02:59:59.000Z')
ok('parcelado renovado antes de vencer: soma ao fim atual', periodoFimParcelado('2026-12-01T02:59:59.000Z', 'anual', agora).startsWith('2027-12-01'))
ok('parcelado com período vencido: conta de hoje', periodoFimParcelado('2026-01-01T00:00:00Z', 'semestral', agora) === '2027-04-16T02:59:59.000Z')
ok('hoje em SP: 01h UTC ainda é o dia anterior', hojeSaoPaulo(new Date('2026-10-16T01:00:00Z')) === '2026-10-15')

// ── Documento ────────────────────────────────────────────────────────────────
ok('CPF válido (com máscara)', documentoValido('529.982.247-25') === '52998224725')
ok('CPF inválido', documentoValido('529.982.247-24') === null && documentoValido('111.111.111-11') === null)
ok('CNPJ válido (o do MEI)', documentoValido('53.582.840/0001-76') === '53582840000176')
ok('CNPJ inválido', documentoValido('53.582.840/0001-77') === null && documentoValido('00000000000000') === null)
ok('vazio ou curto', documentoValido('') === null && documentoValido('123') === null && documentoValido(null) === null)

// ── Webhook ──────────────────────────────────────────────────────────────────
ok('token igual', tokenIgual('abc123', 'abc123'))
ok('token diferente ou de outro tamanho', !tokenIgual('abc124', 'abc123') && !tokenIgual('abc', 'abc123') && !tokenIgual('abc1234', 'abc123'))
ok('sem token esperado: nunca aceita', !tokenIgual('', '') && !tokenIgual('x', undefined))
ok('conta do endereço', contaValida('mei') && contaValida('me_2') && !contaValida('MEI') && !contaValida('a') && !contaValida("mei'; drop"))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nasaas: tudo certo')
process.exit(falhas ? 1 : 0)
