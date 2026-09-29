import {
  cicloDoPrice,
  mesmoEmail,
  montarPrecosPublicos,
  statusApp,
  validarDescritor,
} from '../stripe/mapeamento.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// Ciclo: recorrência vence lookup_key vence metadata
// ---------------------------------------------------------------------------
ok('mensal por recorrência', cicloDoPrice({ id: 'p', recurring: { interval: 'month', interval_count: 1 } }) === 'mensal')
ok('semestral por recorrência', cicloDoPrice({ id: 'p', recurring: { interval: 'month', interval_count: 6 } }) === 'semestral')
ok('anual por recorrência (year)', cicloDoPrice({ id: 'p', recurring: { interval: 'year', interval_count: 1 } }) === 'anual')
ok('anual por recorrência (12 meses)', cicloDoPrice({ id: 'p', recurring: { interval: 'month', interval_count: 12 } }) === 'anual')
ok(
  'price antigo sem lookup_key ainda é reconhecido',
  cicloDoPrice({ id: 'p', lookup_key: null, recurring: { interval: 'year', interval_count: 1 } }) === 'anual',
)
ok('cai no lookup_key sem recorrência', cicloDoPrice({ id: 'p', lookup_key: 'easyfeed_semestral' }) === 'semestral')
ok('cai na metadata', cicloDoPrice({ id: 'p', metadata: { ciclo: 'mensal' } }) === 'mensal')
ok('desconhecido → null', cicloDoPrice({ id: 'p', recurring: { interval: 'week', interval_count: 2 } }) === null)

// ---------------------------------------------------------------------------
// Preços públicos: equivalente mensal e desconto calculados no servidor
// ---------------------------------------------------------------------------
{
  const precos = montarPrecosPublicos([
    { id: 'a', lookup_key: 'easyfeed_anual', unit_amount: 176400, currency: 'brl', active: true, recurring: { interval: 'year', interval_count: 1 } },
    { id: 'm', lookup_key: 'easyfeed_mensal', unit_amount: 19700, currency: 'brl', active: true, recurring: { interval: 'month', interval_count: 1 } },
    { id: 's', lookup_key: 'easyfeed_semestral', unit_amount: 100200, currency: 'brl', active: true, recurring: { interval: 'month', interval_count: 6 } },
    { id: 'velho', lookup_key: null, unit_amount: 15000, currency: 'brl', active: false, recurring: { interval: 'month', interval_count: 1 } },
  ])
  ok('ordem mensal, semestral, anual', precos.map((p) => p.ciclo).join(',') === 'mensal,semestral,anual')
  ok('inativo ignorado', precos.every((p) => p.total_centavos !== 15000))
  const anual = precos.find((p) => p.ciclo === 'anual')!
  ok('mensal equivalente do anual', anual.mensal_equivalente_centavos === 14700, String(anual.mensal_equivalente_centavos))
  ok('desconto do anual vs mensal', anual.desconto_percentual === 25, String(anual.desconto_percentual))
  const semestral = precos.find((p) => p.ciclo === 'semestral')!
  ok('desconto do semestral', semestral.desconto_percentual === 15, String(semestral.desconto_percentual))
  ok('mensal sem desconto', precos.find((p) => p.ciclo === 'mensal')!.desconto_percentual === null)
}
{
  const precos = montarPrecosPublicos([
    { id: 'a', lookup_key: 'easyfeed_anual', unit_amount: 240000, active: true, recurring: { interval: 'year', interval_count: 1 } },
    { id: 'm', lookup_key: 'easyfeed_mensal', unit_amount: 19700, active: true, recurring: { interval: 'month', interval_count: 1 } },
  ])
  ok('anual mais caro que mensal → desconto null, não negativo', precos.find((p) => p.ciclo === 'anual')!.desconto_percentual === null)
  ok('ciclo ausente simplesmente não aparece', precos.length === 2)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
ok('active → ativa', statusApp('active') === 'ativa')
ok('trialing → ativa', statusApp('trialing') === 'ativa')
ok('past_due → inadimplente', statusApp('past_due') === 'inadimplente')
ok('unpaid → inadimplente', statusApp('unpaid') === 'inadimplente')
ok('canceled → cancelada', statusApp('canceled') === 'cancelada')
ok('incomplete → null (não mexe)', statusApp('incomplete') === null)

// ---------------------------------------------------------------------------
// Descritor de fatura
// ---------------------------------------------------------------------------
{
  const r = validarDescritor('EasyFeed')
  ok('descritor normaliza para maiúsculas', r.ok && r.normalizado === 'EASYFEED')
  const acento = validarDescritor('Cardápio')
  ok('acento removido', acento.ok && acento.normalizado === 'CARDAPIO')
  ok('22+ chars recusado', !validarDescritor('ABCDEFGHIJKLMNOPQRSTUVW').ok)
  ok('sem letra recusado', !validarDescritor('12345').ok)
  ok('aspas recusadas', !validarDescritor(`EASY"FEED`).ok)
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------
ok('mesmo e-mail ignora caixa e espaços', mesmoEmail(' Dono@Rest.com ', 'dono@rest.com'))
ok('e-mail diferente', !mesmoEmail('a@rest.com', 'b@rest.com'))
ok('nulo nunca casa', !mesmoEmail(null, 'a@rest.com'))

if (falhas > 0) {
  console.error(`\n${falhas} falha(s)`)
  process.exit(1)
}
console.log('\nTodos os testes passaram.')
