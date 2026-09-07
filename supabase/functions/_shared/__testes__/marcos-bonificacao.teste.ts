import {
  marcosParaMeta,
  contagemDoMarco,
  marcosAtingidos,
  avancarPeriodo,
  garcomParticipaDaRegra,
} from '../marcos-bonificacao.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// marcosParaMeta — as 4 faixas. O caso que importa de verdade: metas curtas
// (<=7) só avisam no fim, metas grandes ganham marco a mais perto de 100%.
// ---------------------------------------------------------------------------
{
  ok('meta 0 não tem marco', JSON.stringify(marcosParaMeta(0)) === '[]')
  ok('meta negativa não tem marco', JSON.stringify(marcosParaMeta(-3)) === '[]')
  ok('meta 7 (exemplo do Raver): só 100%', JSON.stringify(marcosParaMeta(7)) === '[100]', JSON.stringify(marcosParaMeta(7)))
  ok('meta 8: entra na faixa de 2 marcos', JSON.stringify(marcosParaMeta(8)) === '[50,100]')
  ok('meta 14: ainda 2 marcos', JSON.stringify(marcosParaMeta(14)) === '[50,100]')
  ok('meta 15: vira 3 marcos', JSON.stringify(marcosParaMeta(15)) === '[50,75,100]')
  ok('meta 29: ainda 3 marcos', JSON.stringify(marcosParaMeta(29)) === '[50,75,100]')
  ok('meta 30: vira a faixa cheia', JSON.stringify(marcosParaMeta(30)) === '[25,50,75,90,100]')
  ok('meta 50 (exemplo do Raver): 50 e 75 estão na lista', JSON.stringify(marcosParaMeta(50)) === '[25,50,75,90,100]')
  ok('meta 500: mesma faixa cheia (não cresce pra sempre)', JSON.stringify(marcosParaMeta(500)) === '[25,50,75,90,100]')
}

// ---------------------------------------------------------------------------
// contagemDoMarco — arredonda pra cima, nunca cai a zero.
// ---------------------------------------------------------------------------
{
  ok('meta 7, marco 100 -> 7', contagemDoMarco(7, 100) === 7)
  ok('meta 10, marco 50 -> 5', contagemDoMarco(10, 50) === 5)
  ok('meta 13, marco 50 -> 7 (arredonda pra cima)', contagemDoMarco(13, 50) === 7)
  ok('meta 3, marco 50 -> 2 (arredonda pra cima)', contagemDoMarco(3, 50) === 2)
  ok('meta 1, marco 100 -> 1', contagemDoMarco(1, 100) === 1)
}

// ---------------------------------------------------------------------------
// marcosAtingidos — a parte que decide se dispara ou não. Não depende de um
// "antes": é sempre "o que já está batido com a contagem de agora", porque
// isso é seguro sob concorrência (duas aberturas do mesmo garçom quase
// juntas) — quem evita repetir o aviso é a UNIQUE do banco no `INSERT`, não
// esta função.
// ---------------------------------------------------------------------------
{
  ok('meta 10, contagem 4: ainda não bateu 50%', JSON.stringify(marcosAtingidos(10, 4)) === '[]')
  ok('meta 10, contagem 5: bateu os 50%', JSON.stringify(marcosAtingidos(10, 5)) === '[50]')
  ok('meta 10, contagem 9: ainda só 50%', JSON.stringify(marcosAtingidos(10, 9)) === '[50]')
  ok('meta 10, contagem 10: bateu os dois', JSON.stringify(marcosAtingidos(10, 10)) === '[50,100]')
  ok('meta 10, contagem 15 (passou da meta): os dois continuam batidos', JSON.stringify(marcosAtingidos(10, 15)) === '[50,100]')
  ok('salto direto de 0 pra meta atinge TODOS os marcos de uma vez', JSON.stringify(marcosAtingidos(30, 30)) === '[25,50,75,90,100]')
  ok('meta 7, contagem 7: só o marco de 100% existe e foi batido', JSON.stringify(marcosAtingidos(7, 7)) === '[100]')
  ok('meta 7, contagem 4: nada batido ainda (só existe o de 100%)', JSON.stringify(marcosAtingidos(7, 4)) === '[]')
  ok('contagem 0: nada batido', JSON.stringify(marcosAtingidos(10, 0)) === '[]')
}

// ---------------------------------------------------------------------------
// avancarPeriodo — precisa concordar com o `addMonths` do date-fns usado em
// src/lib/queries/bonificacao-garcons.ts (clampa em vez de estourar o mês).
// ---------------------------------------------------------------------------
{
  const semanal = avancarPeriodo(new Date('2026-01-05T00:00:00.000Z'), { frequencia: 'semanal' })
  ok('semanal soma 7 dias', semanal.toISOString() === '2026-01-12T00:00:00.000Z', semanal.toISOString())

  const trimestral = avancarPeriodo(new Date('2026-01-05T00:00:00.000Z'), { frequencia: 'trimestral' })
  ok('trimestral soma 3 meses', trimestral.toISOString() === '2026-04-05T00:00:00.000Z', trimestral.toISOString())

  const personalizado = avancarPeriodo(new Date('2026-01-05T00:00:00.000Z'), { frequencia: 'personalizado', dias_personalizados: 10 })
  ok('personalizado usa dias_personalizados', personalizado.toISOString() === '2026-01-15T00:00:00.000Z', personalizado.toISOString())

  // 31 de janeiro + 1 mês: fevereiro não tem dia 31, cai pro dia 28 (2026 não é bissexto).
  const clampado = avancarPeriodo(new Date('2026-01-31T00:00:00.000Z'), { frequencia: 'mensal' })
  ok('mensal clampa no último dia do mês de destino', clampado.toISOString() === '2026-02-28T00:00:00.000Z', clampado.toISOString())

  const normal = avancarPeriodo(new Date('2026-03-10T00:00:00.000Z'), { frequencia: 'mensal' })
  ok('mensal soma 1 mês em caso normal', normal.toISOString() === '2026-04-10T00:00:00.000Z', normal.toISOString())
}

// ---------------------------------------------------------------------------
// garcomParticipaDaRegra
// ---------------------------------------------------------------------------
{
  ok('null = vale pra todos', garcomParticipaDaRegra(null, 7) === true)
  ok('lista vazia = vale pra todos', garcomParticipaDaRegra([], 7) === true)
  ok('garçom na lista participa', garcomParticipaDaRegra([1, 7], 7) === true)
  ok('garçom fora da lista não participa', garcomParticipaDaRegra([1, 2], 7) === false)
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
