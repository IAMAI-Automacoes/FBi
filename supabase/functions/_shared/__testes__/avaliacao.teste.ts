import {
  assuntoElegivelPorNota,
  consolidarNota,
  pessoasNecessariasPorNota,
  pontuarPorNota,
  razaoQueixa,
} from '../avaliacao.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra: unknown = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${!cond && extra ? ' -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// Conversao nota -> pessoas: os 5 pontos da escala herdada de G0-G4
// ---------------------------------------------------------------------------
{
  const esperado: [number, number][] = [[10, 1], [7.5, 2], [5, 3], [2.5, 6], [0, 12]]
  for (const [nota, pessoas] of esperado) {
    ok(`nota ${nota} exige ${pessoas} pessoa(s)`, pessoasNecessariasPorNota(nota) === pessoas, {
      obtido: pessoasNecessariasPorNota(nota),
    })
  }

  // A curva tem que ser monotonica: nota maior nunca exige MAIS gente.
  let anterior = Infinity
  for (let n = 0; n <= 10; n += 0.5) {
    const atual = pessoasNecessariasPorNota(n)
    ok(`monotonica em ${n}`, atual <= anterior, { anterior, atual })
    anterior = atual
  }

  // Nota 6 nao existia na escala antiga; tem que cair entre 2 e 3.
  const n6 = pessoasNecessariasPorNota(6)
  ok('nota 6 cai entre 2 e 3 pessoas', n6 >= 2 && n6 <= 3, n6)
}

// ---------------------------------------------------------------------------
// Faixa: nota fora de 0-10 e fixada, nunca rejeitada
// ---------------------------------------------------------------------------
{
  ok('nota 11 vira 10', consolidarNota(11, 0).nota === 10)
  ok('nota -5 vira 0', consolidarNota(-5, 0).nota === 0)
  ok('NaN vira 0', consolidarNota(NaN, 0).nota === 0)
}

// ---------------------------------------------------------------------------
// O PISO: a garantia que a IA nao pode desfazer
//
// O cenario que este bloco protege: a IA, por qualquer motivo, devolve nota
// baixa para um relato de cabelo na comida. O lexico reconheceu G4, entao a
// nota tem que subir para 10 e o assunto virar insight com UMA pessoa.
// ---------------------------------------------------------------------------
{
  const r = consolidarNota(2, 4)
  ok('IA disse 2, lexico viu G4 -> nota 10', r.nota === 10, r)
  ok('piso e sinalizado', r.pisoAplicado === true)
  ok('a nota crua da IA e preservada para log', r.notaIA === 2)
  ok('com piso, 1 pessoa basta', assuntoElegivelPorNota(r.nota, 1))

  const r3 = consolidarNota(1, 3)
  ok('IA disse 1, lexico viu G3 -> nota 7.5', r3.nota === 7.5, r3)

  // A IA pode SUBIR acima do piso: ela sabe coisas que o lexico nao sabe.
  const alta = consolidarNota(9, 3)
  ok('IA acima do piso prevalece', alta.nota === 9 && alta.pisoAplicado === false, alta)

  // G2 e abaixo nao tem piso: o julgamento e todo da IA.
  ok('G2 nao impoe piso', consolidarNota(1, 2).nota === 1)
  ok('G0 nao impoe piso', consolidarNota(0, 0).nota === 0)
}

// ---------------------------------------------------------------------------
// Amortecimento por elogios
// ---------------------------------------------------------------------------
{
  const semElogio = razaoQueixa({ nota: 5, pessoas: 3, positivos: 0 })
  const comElogios = razaoQueixa({ nota: 5, pessoas: 3, positivos: 20 })
  ok('elogios reduzem a razao', comElogios < semElogio, { semElogio, comElogios })
  ok('razao fica entre 0 e 1', semElogio <= 1 && comElogios >= 0)

  // A regra central: risco sanitario NAO e amortecido por elogio nenhum.
  const grave = razaoQueixa({ nota: 10, pessoas: 1, positivos: 500 })
  ok('nota 10 e imune a elogios', grave === 1, grave)
  ok('nota 7.5 tambem e imune', razaoQueixa({ nota: 7.5, pessoas: 1, positivos: 99 }) === 1)

  // Assunto sem queixa nenhuma nao pontua.
  ok('nota 0 da razao 0', razaoQueixa({ nota: 0, pessoas: 5, positivos: 0 }) === 0)
}

// ---------------------------------------------------------------------------
// Ranking: o caso que reprovou a formula anterior
//
// Antes de existir o teto de volume, "poderia ter opcao vegana" (nota baixa,
// 12 pessoas) marcava 5,94 contra 5,70 de cabelo na comida (nota maxima, 1
// pessoa) — o volume valia mais que toda a escala de importancia.
// ---------------------------------------------------------------------------
{
  const vegano = pontuarPorNota({
    nota: 2.5, pessoas: 12, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  const cabelo = pontuarPorNota({
    nota: 10, pessoas: 1, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  ok('sanitario com 1 pessoa vence preferencia com 12', cabelo > vegano, { cabelo, vegano })

  // Mas a dominancia e FORTE, nao absoluta: volume realmente massivo ainda
  // ultrapassa um degrau acima. E o comportamento desejado.
  const massivo = pontuarPorNota({
    nota: 5, pessoas: 60, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  const poucoAcima = pontuarPorNota({
    nota: 6, pessoas: 1, positivos: 0, diasDesdeMaisRecente: 30, reincidente: false,
  })
  ok('problema massivo passa na frente de um degrau acima', massivo > poucoAcima, {
    massivo, poucoAcima,
  })

  // Elogios rebaixam de verdade no ranking.
  const semElogio = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  const afogado = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 40, diasDesdeMaisRecente: 1, reincidente: false,
  })
  ok('muitos elogios rebaixam o assunto', afogado < semElogio, { semElogio, afogado })

  // Reincidencia sobe.
  const novo = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  const voltou = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 0, diasDesdeMaisRecente: 1, reincidente: true,
  })
  ok('assunto reincidente pontua mais', voltou > novo, { novo, voltou })

  // Recencia: o mesmo assunto vale menos quando e velho.
  const recente = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 0, diasDesdeMaisRecente: 1, reincidente: false,
  })
  const velho = pontuarPorNota({
    nota: 5, pessoas: 3, positivos: 0, diasDesdeMaisRecente: 30, reincidente: false,
  })
  ok('assunto recente pontua mais', recente > velho, { recente, velho })
}

// ---------------------------------------------------------------------------
// Ponta a ponta: os tres cenarios de sanidade do produto
// ---------------------------------------------------------------------------
{
  // 1 relato de cabelo, IA subestimou -> vira insight sozinho
  const cabelo = consolidarNota(3, 4)
  ok('CENARIO cabelo: 1 pessoa basta', assuntoElegivelPorNota(cabelo.nota, 1))

  // comida fria (operacional comum), 2 pessoas -> ainda NAO
  const fria2 = consolidarNota(5, 2)
  ok('CENARIO comida fria com 2 pessoas: nao gera', !assuntoElegivelPorNota(fria2.nota, 2))

  // a terceira pessoa reclama -> agora gera
  ok('CENARIO comida fria com 3 pessoas: gera', assuntoElegivelPorNota(fria2.nota, 3))

  // preferencia isolada -> nao gera
  const musica = consolidarNota(2.5, 1)
  ok('CENARIO preferencia com 2 pessoas: nao gera', !assuntoElegivelPorNota(musica.nota, 2))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
