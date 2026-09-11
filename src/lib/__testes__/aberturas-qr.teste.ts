import { escalaDoEixo, montarSerie, tendenciaDeAberturas, MAX_PONTOS_DIARIOS } from '../aberturas-qr.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

/** Uma quarta-feira ao meio-dia, pra nenhum teste depender de "hoje". */
const AGORA = new Date(2026, 8, 9, 12, 0, 0)
const diasAtras = (n: number, hora = 10) =>
  new Date(2026, 8, 9 - n, hora, 30, 0)

// ---------------------------------------------------------------------------
// A janela tem tamanho fixo — este é o motivo de não ser "esta semana"
// ---------------------------------------------------------------------------
{
  const s = montarSerie([], '7d', AGORA)
  ok('7 dias rende 7 pontos', s.pontos.length === 7, String(s.pontos.length))
  ok('o último ponto é hoje', s.pontos[6].inicio.getDate() === 9, s.pontos[6].label)
  ok('o primeiro ponto é 6 dias atrás', s.pontos[0].inicio.getDate() === 3, s.pontos[0].label)

  const trinta = montarSerie([], '30d', AGORA)
  ok('30 dias rende 30 pontos', trinta.pontos.length === 30, String(trinta.pontos.length))

  // Numa segunda-feira, "esta semana" teria 1 ponto; a janela fixa tem 7.
  const segunda = new Date(2026, 8, 7, 9, 0, 0)
  ok('numa segunda-feira continuam sendo 7 pontos, não 1',
    montarSerie([], '7d', segunda).pontos.length === 7)
}

// ---------------------------------------------------------------------------
// Contagem
// ---------------------------------------------------------------------------
{
  const datas = [diasAtras(0), diasAtras(0), diasAtras(2), diasAtras(6)]
  const s = montarSerie(datas, '7d', AGORA)
  ok('conta total que caiu na janela', s.total === 4, String(s.total))
  ok('duas no mesmo dia empilham no mesmo ponto', s.pontos[6].aberturas === 2, String(s.pontos[6].aberturas))
  ok('a de 2 dias atrás caiu no ponto certo', s.pontos[4].aberturas === 1, String(s.pontos[4].aberturas))
  ok('dia sem abertura fica zerado', s.pontos[5].aberturas === 0, String(s.pontos[5].aberturas))

  const forA = montarSerie([...datas, diasAtras(9)], '7d', AGORA)
  ok('o que é mais velho que a janela não entra no total', forA.total === 4, String(forA.total))
  ok('mas conta como período ANTERIOR', forA.anterior === 1, String(forA.anterior))
}

// ---------------------------------------------------------------------------
// Hora do dia não muda o balde (o erro clássico de fuso/limite de dia)
// ---------------------------------------------------------------------------
{
  const s = montarSerie([diasAtras(1, 0), diasAtras(1, 23)], '7d', AGORA)
  ok('meia-noite e 23h do mesmo dia caem no mesmo ponto',
    s.pontos[5].aberturas === 2, JSON.stringify(s.pontos.map((p) => p.aberturas)))
}

// ---------------------------------------------------------------------------
// "Total": começa na primeira abertura e vira semanal quando estica
// ---------------------------------------------------------------------------
{
  const s = montarSerie([diasAtras(3), diasAtras(0)], 'total', AGORA)
  ok('total: começa no dia da primeira abertura', s.pontos.length === 4, String(s.pontos.length))
  ok('total: não tem período anterior pra comparar', s.anterior === null, String(s.anterior))
  ok('total: sabe a data da primeira abertura', s.primeiraAbertura?.getDate() === 6, String(s.primeiraAbertura))
  ok('total: ainda é diário quando é curto', !s.porSemana)

  const longo = montarSerie([diasAtras(100), diasAtras(0)], 'total', AGORA)
  ok('total: passou de um mês, agrupa por semana', longo.porSemana)
  ok('total: semanal encurta a série', longo.pontos.length <= 16, String(longo.pontos.length))
  ok('total: nenhuma abertura se perde ao agrupar', longo.total === 2, String(longo.total))
  ok('total: o último balde termina hoje',
    longo.pontos[longo.pontos.length - 1].fim.getDate() === 9,
    String(longo.pontos[longo.pontos.length - 1].fim))

  const limite = montarSerie([diasAtras(MAX_PONTOS_DIARIOS - 1)], 'total', AGORA)
  ok('total: exatamente no limite ainda é diário', !limite.porSemana)

  const vazio = montarSerie([], 'total', AGORA)
  ok('total: sem nenhuma abertura, a série não fica vazia', vazio.pontos.length === 1, String(vazio.pontos.length))
  ok('total: sem abertura, total zero', vazio.total === 0, String(vazio.total))
}

// ---------------------------------------------------------------------------
// Tendência — mesmos limites da Visão Geral
// ---------------------------------------------------------------------------
{
  const dobrou = tendenciaDeAberturas(20, 10)
  ok('dobrou vira +100%', dobrou.trend === '+100%', dobrou.trend)
  ok('dobrou é confiável (base >= 3)', dobrou.prevConfiavel)

  const caiu = tendenciaDeAberturas(5, 10)
  ok('caiu pela metade vira -50%', caiu.trend === '-50%', caiu.trend)

  ok('igual é estável', tendenciaDeAberturas(10, 10).trend === 'estável')

  const base1 = tendenciaDeAberturas(3, 1)
  ok('3 contra 1 NÃO é tratado como confiável', !base1.prevConfiavel, JSON.stringify(base1))

  const primeiro = tendenciaDeAberturas(7, 0)
  ok('sem período anterior e com aberturas = novo', primeiro.trend === 'novo', primeiro.trend)
  ok('sem período anterior não tem o que comparar', !primeiro.hasPrevData)

  const nada = tendenciaDeAberturas(0, 0)
  ok('sem nada dos dois lados não inventa variação', nada.trend === '—', nada.trend)

  ok('em "total" (anterior nulo) não há comparação', !tendenciaDeAberturas(9, null).hasPrevData)
}

// ---------------------------------------------------------------------------
// O eixo vertical: marcas inteiras e igualmente espaçadas
// ---------------------------------------------------------------------------
{
  const espacamentoUniforme = (m: number[]) =>
    m.length > 1 && m.every((v, i) => i === 0 || v - m[i - 1] === m[1] - m[0])

  for (const pico of [0, 1, 5, 11, 37, 100, 253]) {
    const { teto, marcas } = escalaDoEixo(pico)
    ok(`eixo até ${pico}: as marcas são igualmente espaçadas`, espacamentoUniforme(marcas), marcas.join(','))
    ok(`eixo até ${pico}: só números inteiros`, marcas.every((v) => Number.isInteger(v)), marcas.join(','))
    ok(`eixo até ${pico}: o teto não corta a curva`, teto >= pico, `teto ${teto}`)
    ok(`eixo até ${pico}: começa no zero`, marcas[0] === 0, marcas.join(','))
    ok(`eixo até ${pico}: não vira uma régua cheia de marcas`, marcas.length <= 6, marcas.join(','))
  }

  ok('eixo de um período zerado ainda tem altura', escalaDoEixo(0).teto >= 4, String(escalaDoEixo(0).teto))
}

// ---------------------------------------------------------------------------
// O balde que ainda está correndo
// ---------------------------------------------------------------------------
{
  const s = montarSerie([diasAtras(1)], '7d', AGORA)
  ok('só o último ponto está em andamento',
    s.pontos.filter((p) => p.emAndamento).length === 1,
    String(s.pontos.filter((p) => p.emAndamento).length))
  ok('o ponto em andamento é o de hoje', s.pontos[6].emAndamento)

  const longo = montarSerie([diasAtras(100), diasAtras(0)], 'total', AGORA)
  const ultimo = longo.pontos[longo.pontos.length - 1]
  ok('no semanal, a semana que ainda corre vem marcada', ultimo.emAndamento)
  ok('as semanas fechadas não vêm marcadas',
    longo.pontos.slice(0, -1).every((p) => !p.emAndamento))
}

// ---------------------------------------------------------------------------
// Intervalo escolhido no calendário
// ---------------------------------------------------------------------------
{
  // 03/09 a 05/09 — três dias, terminados antes de hoje (09/09).
  const janela = { from: new Date(2026, 8, 3), to: new Date(2026, 8, 5) }
  const dentro = [diasAtras(6), diasAtras(5), diasAtras(4), diasAtras(4)] // 03, 04, 05, 05
  const fora = [diasAtras(0), diasAtras(7)]                              // 09 e 02
  const s = montarSerie([...dentro, ...fora], '7d', AGORA, janela)

  ok('intervalo: a janela tem os dias escolhidos', s.pontos.length === 3, String(s.pontos.length))
  ok('intervalo: conta só o que caiu dentro', s.total === 4, String(s.total))
  ok('intervalo: começa no dia escolhido', s.inicio.getDate() === 3, String(s.inicio))
  ok('intervalo: termina no dia escolhido, não hoje', s.fim.getDate() === 5, String(s.fim))
  ok('intervalo: o atalho é ignorado quando há intervalo', s.pontos.length !== 7, String(s.pontos.length))
  ok('intervalo: nada fica "ainda contando" numa janela que já fechou',
    s.pontos.every((p) => !p.emAndamento))
  ok('intervalo: compara com os 3 dias anteriores (31/08 a 02/09)', s.anterior === 1, String(s.anterior))

  const umDia = montarSerie([diasAtras(6), diasAtras(6), diasAtras(5)], '7d', AGORA, { from: new Date(2026, 8, 3) })
  ok('intervalo: sem data de fim é um dia só', umDia.pontos.length === 1, String(umDia.pontos.length))
  ok('intervalo: um dia só conta o daquele dia', umDia.total === 2, String(umDia.total))

  const invertido = montarSerie(dentro, '7d', AGORA, { from: new Date(2026, 8, 5), to: new Date(2026, 8, 3) })
  ok('intervalo: digitado de trás pra frente, se acomoda', invertido.total === 4, String(invertido.total))
  ok('intervalo: e endireita as pontas', invertido.inicio.getDate() === 3 && invertido.fim.getDate() === 5,
    `${invertido.inicio} -> ${invertido.fim}`)

  const longo = montarSerie([], '7d', AGORA, { from: new Date(2026, 5, 1), to: new Date(2026, 8, 5) })
  ok('intervalo: janela longa também agrupa por semana', longo.porSemana)

  const ateHoje = montarSerie([], '7d', AGORA, { from: new Date(2026, 8, 3), to: new Date(2026, 8, 9) })
  ok('intervalo: se alcança hoje, o último dia fica "ainda contando"',
    ateHoje.pontos[ateHoje.pontos.length - 1].emAndamento)
}

// O card mostra as pontas da janela — elas precisam existir sempre.
{
  for (const p of ['7d', '30d', 'total'] as const) {
    const s = montarSerie([diasAtras(2)], p, AGORA)
    ok(`${p}: a série sabe onde começa e termina`, !!s.inicio && !!s.fim, `${s.inicio} ${s.fim}`)
    ok(`${p}: termina hoje quando não há intervalo`, s.fim.getDate() === 9, String(s.fim))
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
