/**
 * Testes da fase 2 do Asaas: comissão do vendedor (split), corpo do PUT,
 * status do split e espaço para o saldo de vídeo.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/asaas-comissao.teste.ts
 */
import {
  baseDaComissaoPorMes,
  comissaoDoPagamento,
  corpoDoPut,
  espacoParaSaldo,
  regraDoInfluenciador,
  statusDoSplit,
  valorComMesesGratis,
  VALOR_MINIMO_CENTAVOS,
  type CustosDaComissao,
  type RegraDeComissao,
} from '../asaas/regras.ts'
import { inicioDoPeriodoSP } from '../videos-missao.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// Regra padrão do Raver: 100% da mensalidade líquida na 2ª, 15% por 12 meses.
// A base é o líquido do Asaas daquele mês menos os nossos custos (decisão do Caio, 21/10/2026).
const PADRAO: RegraDeComissao = { entradaPct: 100, recorrentePct: 15, recorrenteMeses: 12 }
const SEM_CUSTOS: CustosDaComissao = { fixoCentavosPorMes: 0, pct: 0 }
const c = (de: number, ate: number, liquido = 19000, custos = SEM_CUSTOS, regra = PADRAO) =>
  comissaoDoPagamento({ de, ate, liquidoCentavos: liquido, custos, regra })

// ── Base: líquido menos custos ───────────────────────────────────────────────
ok('base sem custos = o líquido do mês', baseDaComissaoPorMes(19000, 1, SEM_CUSTOS) === 19000)
ok('base: R$ 190 − 6% − R$ 20 = R$ 158,60', baseDaComissaoPorMes(19000, 1, { pct: 6, fixoCentavosPorMes: 2000 }) === 15860)
ok('base do anual: o líquido dividido pelos 12 meses, custos por mês', baseDaComissaoPorMes(170000, 12, { pct: 0, fixoCentavosPorMes: 2000 }) === Math.round(170000 / 12 - 2000))
ok('base nunca negativa', baseDaComissaoPorMes(1000, 1, { pct: 0, fixoCentavosPorMes: 5000 }) === 0)

// ── Mensal (1 mês por cobrança), líquido de R$ 190 ───────────────────────────
ok('1º mês: sem comissão', c(1, 1) === 0)
ok('2º mês: a mensalidade líquida inteira', c(2, 2) === 19000)
ok('2º mês com custos: o que sobra depois dos custos', c(2, 2, 19000, { pct: 6, fixoCentavosPorMes: 2000 }) === 15860)
ok('3º mês: 15% da líquida', c(3, 3) === 2850)
ok('3º mês com custos: 15% do que sobra', c(3, 3, 19000, { pct: 6, fixoCentavosPorMes: 2000 }) === Math.round(15860 * 0.15))
ok('14º mês (o 12º depois da 2ª): ainda 15%', c(14, 14) === 2850)
ok('15º mês: acabou', c(15, 15) === 0)

// ── À vista: uma cobrança cobre vários meses ─────────────────────────────────
// Anual com líquido de R$ 1.700 (R$ 141,67 por mês): meses 1 a 12.
const anual = c(1, 12, 170000)
ok('anual à vista: 100% de 1 mês líquido + 15% × 10 meses (2,5 meses)', anual === Math.round(Math.round(170000 / 12) * 2.5), anual)
ok('renovação do anual: só os meses que faltam do prazo', c(13, 24, 170000) === Math.round(Math.round(170000 / 12) * 0.3))

// ── Parcelado: cada parcela é 1 mês ──────────────────────────────────────────
ok('parcela 1: nada; parcela 2: a parcela líquida; parcela 3: 15%', c(1, 1, 14000) === 0 && c(2, 2, 14000) === 14000 && c(3, 3, 14000) === 2100)

// ── Outras regras ────────────────────────────────────────────────────────────
ok('regra sem recorrente: só a entrada', c(3, 3, 19000, SEM_CUSTOS, { entradaPct: 50, recorrentePct: 0, recorrenteMeses: 12 }) === 0
  && c(2, 2, 19000, SEM_CUSTOS, { entradaPct: 50, recorrentePct: 0, recorrenteMeses: 12 }) === 9500)
ok('sem líquido: zero', c(2, 2, 0) === 0)
ok('nunca passa do líquido da cobrança', c(2, 2, 19000, SEM_CUSTOS, { entradaPct: 100, recorrentePct: 100, recorrenteMeses: 12 }) <= 19000)

// ── PUT do Asaas: billingType, value e dueDate sempre ────────────────────────
const pag = { id: 'pay_1', billingType: 'CREDIT_CARD', value: 197, dueDate: '2026-11-20' }
const so_valor = corpoDoPut(pag, { valorCentavos: 9850 })
ok('PUT de valor manda os 3 obrigatórios', so_valor.billingType === 'CREDIT_CARD' && so_valor.value === 98.5 && so_valor.dueDate === '2026-11-20' && !('split' in so_valor), so_valor)
const so_split = corpoDoPut(pag, { split: [{ walletId: 'w', fixedValue: 29.55 }] })
ok('PUT de split repete o valor e manda o split', so_split.value === 197 && Array.isArray(so_split.split), so_split)
ok('split vazio desliga o split', Array.isArray(corpoDoPut(pag, { split: [] }).split))

// ── Status do split ──────────────────────────────────────────────────────────
ok('status do split', statusDoSplit('DONE') === 'repassado' && statusDoSplit('PENDING') === 'agendado' && statusDoSplit('AWAITING_CREDIT') === 'agendado'
  && statusDoSplit('CANCELLED') === 'cancelado' && statusDoSplit('REFUNDED') === 'estornado' && statusDoSplit('BLOCKED_BY_VALUE_DIVERGENCE') === 'bloqueado')

// ── Saldo do vídeo e bônus fracionário ───────────────────────────────────────
ok('saldo cabe até deixar R$ 5', espacoParaSaldo(19700) === 19700 - VALOR_MINIMO_CENTAVOS && espacoParaSaldo(300) === 0)
ok('bônus de indicação de 50%: meia mensalidade', valorComMesesGratis(19700, 19700, 'mensal', 0.5) === 9850)
ok('anual com 1,5 bônus: abate 1,5 mensalidade', valorComMesesGratis(176400, 176400, 'anual', 1.5) === 176400 - 22050)

// ── Influenciador: a % dele em cada mensalidade a partir da 2ª, por N ───────
const SEM_CUSTO: CustosDaComissao = { fixoCentavosPorMes: 0, pct: 0 }
const INF = regraDoInfluenciador(15, 12)
ok('influenciador 15% por 12: 15% do 2º ao 13º mês', INF.entradaPct === 15 && INF.recorrentePct === 15 && INF.recorrenteMeses === 11, INF)
const mesInf = (m: number) => comissaoDoPagamento({ de: m, ate: m, liquidoCentavos: 19000, custos: SEM_CUSTO, regra: INF })
ok('influenciador: 1º mês não paga', mesInf(1) === 0)
ok('influenciador: 2º e 13º mês pagam 15%', mesInf(2) === 2850 && mesInf(13) === 2850, [mesInf(2), mesInf(13)])
ok('influenciador: 14º mês não paga mais', mesInf(14) === 0)
ok('influenciador: anual à vista (meses 1 a 12) paga 11 meses de 15%',
  comissaoDoPagamento({ de: 1, ate: 12, liquidoCentavos: 228000, custos: SEM_CUSTO, regra: INF }) === Math.round(19000 * 15 * 11 / 100))
ok('influenciador: 1 mês só = só o 2º', (() => { const r = regraDoInfluenciador(20, 1); return r.entradaPct === 20 && r.recorrenteMeses === 0 })())
ok('influenciador sem % ou sem meses: nada', [regraDoInfluenciador(0, 12), regraDoInfluenciador(15, 0), regraDoInfluenciador(Number.NaN, 12)]
  .every((r) => comissaoDoPagamento({ de: 2, ate: 2, liquidoCentavos: 19000, custos: SEM_CUSTO, regra: r }) === 0))
ok('influenciador: % acima de 100 trava em 100', regraDoInfluenciador(150, 3).entradaPct === 100)

// ── Período do limite de vídeos ──────────────────────────────────────────────
const em = (iso: string) => Date.parse(iso)
ok('ano', inicioDoPeriodoSP(em('2026-10-20T15:00:00Z'), 12) === '2026-01-01T00:00:00-03:00')
ok('semestre (outubro → julho)', inicioDoPeriodoSP(em('2026-10-20T15:00:00Z'), 6) === '2026-07-01T00:00:00-03:00')
ok('trimestre (outubro → outubro)', inicioDoPeriodoSP(em('2026-10-20T15:00:00Z'), 3) === '2026-10-01T00:00:00-03:00')
ok('trimestre (março → janeiro)', inicioDoPeriodoSP(em('2026-03-31T12:00:00Z'), 3) === '2026-01-01T00:00:00-03:00')
ok('virada em Brasília: 01/07 01:00 UTC ainda é junho', inicioDoPeriodoSP(em('2026-07-01T01:00:00Z'), 6) === '2026-01-01T00:00:00-03:00')
ok('período estranho vira ano', inicioDoPeriodoSP(em('2026-10-20T15:00:00Z'), 5) === '2026-01-01T00:00:00-03:00')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
