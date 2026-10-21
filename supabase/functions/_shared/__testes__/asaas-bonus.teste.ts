/**
 * Testes do mês grátis de indicação na cobrança do Asaas (valorComMesesGratis).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/asaas-bonus.teste.ts
 */
import { MESES, VALOR_MINIMO_CENTAVOS, valorComMesesGratis } from '../asaas/regras.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// Mensal de R$ 120.
ok('mensal sem bônus: cobra cheio', valorComMesesGratis(12000, 12000, 'mensal', 0) === 12000)
ok('mensal com 1 bônus: a cobrança inteira sai (0)', valorComMesesGratis(12000, 12000, 'mensal', 1) === 0)
ok('mensal nunca gasta mais de 1 bônus de uma vez', valorComMesesGratis(12000, 12000, 'mensal', 5) === 0)

// Anual de R$ 1.440 (R$ 120 por mês): o exemplo do Raver, 2 bônus validados.
ok('anual com 2 bônus: abate 2 mensalidades (R$ 1.440 → R$ 1.200)', valorComMesesGratis(144000, 144000, 'anual', 2) === 120000)
ok('anual com 12 ou mais: a renovação inteira sai', valorComMesesGratis(144000, 144000, 'anual', 12) === 0 && valorComMesesGratis(144000, 144000, 'anual', 30) === 0)
ok('anual com 11: sobra 1 mensalidade', valorComMesesGratis(144000, 144000, 'anual', 11) === 12000)

// Semestral de R$ 600 (R$ 100 por mês).
ok('semestral com 3 bônus: R$ 600 → R$ 300', valorComMesesGratis(60000, 60000, 'semestral', 3) === 30000)
ok('meses do ciclo como o Asaas usa', MESES.semestral === 6 && MESES.anual === 12)

// Sobra pequena: o Asaas não aceita abaixo de R$ 5.
ok('sobra entre R$ 0 e R$ 5 vira R$ 5', valorComMesesGratis(60300, 60000, 'semestral', 6 - 1) === 10300 && valorComMesesGratis(10300, 60000, 'semestral', 1) === VALOR_MINIMO_CENTAVOS)
ok('lixo no número de bônus vale zero', valorComMesesGratis(12000, 12000, 'mensal', Number.NaN) === 12000 && valorComMesesGratis(12000, 12000, 'mensal', -2) === 12000)
ok('nunca cobra mais que o valor da cobrança', valorComMesesGratis(500, 144000, 'anual', 1) <= 500)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
