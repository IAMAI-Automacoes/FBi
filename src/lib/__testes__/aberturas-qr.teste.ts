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
  ok('conta tudo que caiu na janela', s.total === 4, String(s.total))
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
// "Tudo": começa na primeira abertura e vira semanal quando estica
// ---------------------------------------------------------------------------
{
  const s = montarSerie([diasAtras(3), diasAtras(0)], 'tudo', AGORA)
  ok('tudo: começa no dia da primeira abertura', s.pontos.length === 4, String(s.pontos.length))
  ok('tudo: não tem período anterior pra comparar', s.anterior === null, String(s.anterior))
  ok('tudo: sabe a data da primeira abertura', s.primeiraAbertura?.getDate() === 6, String(s.primeiraAbertura))
  ok('tudo: ainda é diário quando é curto', !s.porSemana)

  const longo = montarSerie([diasAtras(100), diasAtras(0)], 'tudo', AGORA)
  ok('tudo: passou de um mês, agrupa por semana', longo.porSemana)
  ok('tudo: semanal encurta a série', longo.pontos.length <= 16, String(longo.pontos.length))
  ok('tudo: nenhuma abertura se perde ao agrupar', longo.total === 2, String(longo.total))
  ok('tudo: o último balde termina hoje',
    longo.pontos[longo.pontos.length - 1].fim.getDate() === 9,
    String(longo.pontos[longo.pontos.length - 1].fim))

  const limite = montarSerie([diasAtras(MAX_PONTOS_DIARIOS - 1)], 'tudo', AGORA)
  ok('tudo: exatamente no limite ainda é diário', !limite.porSemana)

  const vazio = montarSerie([], 'tudo', AGORA)
  ok('tudo: sem nenhuma abertura, a série não fica vazia', vazio.pontos.length === 1, String(vazio.pontos.length))
  ok('tudo: sem abertura, total zero', vazio.total === 0, String(vazio.total))
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

  ok('em "tudo" (anterior nulo) não há comparação', !tendenciaDeAberturas(9, null).hasPrevData)
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

  const longo = montarSerie([diasAtras(100), diasAtras(0)], 'tudo', AGORA)
  const ultimo = longo.pontos[longo.pontos.length - 1]
  ok('no semanal, a semana que ainda corre vem marcada', ultimo.emAndamento)
  ok('as semanas fechadas não vêm marcadas',
    longo.pontos.slice(0, -1).every((p) => !p.emAndamento))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
