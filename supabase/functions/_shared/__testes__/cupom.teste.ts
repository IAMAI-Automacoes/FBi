/**
 * O que um cupom dá e se está bem montado (supabase/functions/_shared/cupom.ts).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/cupom.teste.ts
 */
import { cupomDaArea, MAX_USOS_ADMIN, oQueOCupomDa, problemaDoCupom, type CupomParaConferir } from '../cupom.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const da = (dias: number | null, pct: number | null = null, valor: number | null = null) => oQueOCupomDa({ dias_validade: dias, porcentagem_desconto: pct, valor_desconto: valor })

// ── O que dá ─────────────────────────────────────────────────────────────────
ok('sem desconto (os cupons de sempre): acesso sem fim', JSON.stringify(da(null)) === JSON.stringify({ acesso: true, dias: null, desconto: null }))
ok('sem desconto com dias: acesso por esses dias', da(60).acesso && da(60).dias === 60 && da(60).desconto === null)
ok('100%: é acesso (como o VENDEDOR100 e o FASEBETA de hoje)', da(null, 100).acesso && da(null, 100).desconto === null && da(60, 100).dias === 60)
ok('desconto parcial em %: NÃO libera acesso, guarda o desconto', !da(null, 20).acesso && JSON.stringify(da(null, 20).desconto) === JSON.stringify({ tipo: 'porcentagem', valor: 20 }))
ok('desconto em R$: NÃO libera acesso, guarda o desconto', !da(null, null, 50).acesso && JSON.stringify(da(null, null, 50).desconto) === JSON.stringify({ tipo: 'valor', valor: 50 }))
ok('dias grátis + desconto: libera pelos dias e guarda o desconto', da(30, 20).acesso && da(30, 20).dias === 30 && da(30, 20).desconto?.valor === 20)
ok('0% ou R$ 0 contam como sem desconto', da(null, 0).acesso && da(null, 0).desconto === null && da(null, null, 0).desconto === null)

// ── Bem montado? ─────────────────────────────────────────────────────────────
const base: CupomParaConferir = { cupom: 'DESC20', tipo_conta: 'normal', vezes_uso_maximo: null, data_expiracao: null, dias_validade: null, porcentagem_desconto: null, valor_desconto: null }
const p = (m: Partial<CupomParaConferir>) => problemaDoCupom({ ...base, ...m })
ok('cupom simples: sem problema', p({}) === null)
ok('código: só letras, números, hífen e sublinhado, de 2 a 40', p({ cupom: 'a%' }) === 'codigo' && p({ cupom: 'X' }) === 'codigo' && p({ cupom: 'fase-beta_2' }) === null)
ok('dias: inteiro a partir de 1', p({ dias_validade: 0 }) === 'dias' && p({ dias_validade: 1.5 }) === 'dias' && p({ dias_validade: 30 }) === null)
ok('desconto: % ou R$, não os dois', p({ porcentagem_desconto: 10, valor_desconto: 5 }) === 'desconto_duplo')
ok('desconto em %: de 1 a 100', p({ porcentagem_desconto: 0 }) === 'porcentagem' && p({ porcentagem_desconto: 101 }) === 'porcentagem' && p({ porcentagem_desconto: 100 }) === null)
ok('desconto em R$: maior que zero', p({ valor_desconto: -1 }) === 'valor' && p({ valor_desconto: 49.9 }) === null)
ok('usos: inteiro a partir de 1', p({ vezes_uso_maximo: 0 }) === 'usos' && p({ vezes_uso_maximo: 3 }) === null)
ok('vendedor: livre, como um normal', p({ tipo_conta: 'vendedor' }) === null)
ok('admin: precisa de usos e de validade', p({ tipo_conta: 'admin' }) === 'admin_sem_limite' && p({ tipo_conta: 'admin', vezes_uso_maximo: 1 }) === 'admin_sem_limite'
  && p({ tipo_conta: 'admin', data_expiracao: '2026-12-31' }) === 'admin_sem_limite' && p({ tipo_conta: 'admin', vezes_uso_maximo: 1, data_expiracao: '2026-12-31' }) === null)
ok(`admin: no máximo ${MAX_USOS_ADMIN} usos`, p({ tipo_conta: 'admin', vezes_uso_maximo: MAX_USOS_ADMIN + 1, data_expiracao: '2026-12-31' }) === 'admin_sem_limite')
ok('tipo de conta desconhecido', p({ tipo_conta: 'dono' as never }) === 'tipo_conta')

// ── Software ─────────────────────────────────────────────────────────────────
ok('cupom do restaurante vale para conta de restaurante (e sem versão)', cupomDaArea('restaurante', 'restaurante') && cupomDaArea('restaurante', null))
ok('cupom do RH só vale para conta RH', cupomDaArea('rh', 'rh') && !cupomDaArea('rh', 'restaurante') && !cupomDaArea('restaurante', 'rh'))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncupons: tudo certo')
process.exit(falhas ? 1 : 0)
