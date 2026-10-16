import {
  diasEntre, frasesDaBase, frasesDoRestaurante, indiceSatisfacao, linhasCsvMensal, MIN_AVALIACOES, podeNomear,
  resumirBase, resumirRestaurante, somar, somarDias, sujeitoDaFrase, type DiaMetricas,
} from '../resultados.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

function dia(d: string, p: Partial<DiaMetricas> = {}): DiaMetricas {
  return {
    restaurante_id: 1, dia: d, mensagens: 0, positivos: 0, negativos: 0, neutros: 0, sugestoes: 0,
    por_categoria: {}, clientes_novos: 0, retornos: 0, aberturas_qr: 0, acoes_criadas: 0, acoes_concluidas: 0,
    insights_gerados: 0, ...p,
  }
}

const HOJE = '2026-10-15'

// ---------------------------------------------------------------------------
// Datas e índice
// ---------------------------------------------------------------------------
ok('somarDias atravessa o mês', somarDias('2026-01-31', 1) === '2026-02-01')
ok('somarDias para trás', somarDias('2026-03-01', -1) === '2026-02-28')
ok('diasEntre conta os dois dias', diasEntre('2026-10-01', '2026-10-01') === 1)
ok('diasEntre de um mês', diasEntre('2026-09-16', '2026-10-15') === 30)
ok('índice: só positivo = 100', indiceSatisfacao(5, 0, 0) === 100)
ok('índice: neutro vale 50', indiceSatisfacao(0, 2, 0) === 50)
ok('índice: sem avaliação = null', indiceSatisfacao(0, 0, 0) === null)
{
  const t = somar([dia('2026-10-01', { positivos: 1, negativos: 1, sugestoes: 5 })])
  ok('sugestão não entra no índice', t.indice === 50 && t.avaliacoes === 2, String(t.indice))
  ok('% de negativas sobre as avaliações', t.pctNegativos === 50)
}
{
  const t = somar([
    dia('2026-10-01', { por_categoria: { Comida: { pos: 1, neu: 0, neg: 1, sug: 0 } } }),
    dia('2026-10-02', { por_categoria: { Comida: { pos: 2, neu: 0, neg: 0, sug: 1 } } }),
  ])
  ok('categorias somam entre dias', t.porCategoria.Comida.pos === 3 && t.porCategoria.Comida.sug === 1)
}

// ---------------------------------------------------------------------------
// Restaurante comparável: começou mal, melhorou
// ---------------------------------------------------------------------------
// Início em 2026-07-01 (107 dias de casa). Primeiros 30 dias: 4 pos, 8 neg = 33.
// Últimos 30 dias: 10 pos, 2 neg = 83.
const melhorou = [
  dia('2026-07-01', {
    mensagens: 8, positivos: 4, negativos: 8, clientes_novos: 6,
    por_categoria: { Atendimento: { pos: 1, neu: 0, neg: 5, sug: 0 }, Comida: { pos: 3, neu: 0, neg: 3, sug: 0 } },
  }),
  dia('2026-08-20', { mensagens: 3, positivos: 2, acoes_concluidas: 2 }),
  dia('2026-10-10', {
    mensagens: 9, positivos: 10, negativos: 2, clientes_novos: 4, retornos: 3,
    por_categoria: { Atendimento: { pos: 5, neu: 0, neg: 0, sug: 0 }, Comida: { pos: 5, neu: 0, neg: 2, sug: 0 } },
  }),
]
const r = resumirRestaurante(melhorou, HOJE)
ok('primeiro dia é o do primeiro feedback', r.primeiroDia === '2026-07-01')
ok('dias de casa', r.diasDeCasa === 107, String(r.diasDeCasa))
ok('índice do início', r.inicio.indice === 33, String(r.inicio.indice))
ok('índice de agora', r.agora.indice === 83, String(r.agora.indice))
ok('é comparável', r.comparavel)
ok('ganho = 50 pontos', r.ganho === 50, String(r.ganho))
ok('o dia do meio não entra em nenhuma janela', r.inicio.positivos === 4 && r.agora.positivos === 10)
ok('total soma tudo', r.total.positivos === 16 && r.total.acoesConcluidas === 2)
{
  const at = r.categorias.find((c) => c.nome === 'Atendimento')!
  ok('categoria comparada', at.inicio === 17 && at.agora === 100 && at.ganho === 83, JSON.stringify(at))
}
ok('um ponto por mês, de jul a out', r.mensal.map((m) => m.mes).join() === '2026-07,2026-08,2026-09,2026-10', r.mensal.map((m) => m.mes).join())
ok('mês sem feedback fica vazio, não some', r.mensal[2].avaliacoes === 0 && r.mensal[2].indice === null)
ok('rótulo do mês', r.mensal[3].rotulo === 'out/26', r.mensal[3].rotulo)

{
  const f = frasesDoRestaurante(r, 'Um restaurante')
  ok('frase da satisfação com a base', f.some((x) => x.includes('saiu de 33 para 83') && x.includes('Base: 12 avaliações')), f.join(' | '))
  ok('frase das negativas', f.some((x) => x.includes('caíram de 67% para 17%')), f.join(' | '))
  ok('frase da categoria que mais subiu', f.some((x) => x.startsWith('Um restaurante: Atendimento subiu de 17 para 100')), f.join(' | '))
  ok('frase das melhorias', f.some((x) => x.includes('concluiu 2 melhorias')))
  ok('frase dos clientes', f.some((x) => x.includes('ouviu 10 clientes diferentes')))
}

// ---------------------------------------------------------------------------
// As travas
// ---------------------------------------------------------------------------
{
  // 40 dias de casa: as janelas se sobrepõem.
  const novo = resumirRestaurante([
    dia('2026-09-06', { positivos: 2, negativos: 10 }),
    dia('2026-10-14', { positivos: 12 }),
  ], HOJE)
  ok('menos de 60 dias não compara', !novo.comparavel && novo.ganho === null)
  ok('nem a categoria', novo.categorias.every((c) => c.ganho === null))
  ok('sem frase de ganho', !frasesDoRestaurante(novo, 'X').some((x) => x.includes('saiu de')))
}
{
  const pouco = resumirRestaurante([
    dia('2026-06-01', { positivos: 1, negativos: MIN_AVALIACOES - 2 }),
    dia('2026-10-14', { positivos: 20 }),
  ], HOJE)
  ok('início com base pequena não compara', !pouco.inicioConfiavel && !pouco.comparavel)
}
{
  const piorou = resumirRestaurante([
    dia('2026-06-01', { positivos: 12 }),
    dia('2026-10-14', { positivos: 2, negativos: 10 }),
  ], HOJE)
  ok('piora é comparável e o ganho é negativo', piorou.comparavel && (piorou.ganho as number) < 0)
  ok('piora não vira frase de marketing', !frasesDoRestaurante(piorou, 'X').some((x) => x.includes('saiu de') || x.includes('caíram')))
}
{
  const vazio = resumirRestaurante([dia('2026-10-01', { aberturas_qr: 3 })], HOJE)
  ok('só aberturas de QR: sem primeiro feedback', vazio.primeiroDia === null && vazio.mensal.length === 0)
  ok('sem feedback, sem frase', frasesDoRestaurante(vazio, 'X').length === 0)
}

// ---------------------------------------------------------------------------
// Quem aparece na frase
// ---------------------------------------------------------------------------
const aut = { status: 'autorizado' as const, pode_nome: true, pode_logo: false, pode_numeros: true, pode_depoimento: false }
ok('autorização completa nomeia', podeNomear(aut))
ok('sem números não nomeia', !podeNomear({ ...aut, pode_numeros: false }))
ok('revogada não nomeia', !podeNomear({ ...aut, status: 'revogado' }))
ok('sem autorização não nomeia', !podeNomear(null))
ok('nome com autorização', sujeitoDaFrase({ nome: 'Cantina X', culinaria: 'Italiana', culinariaSegura: true, autorizacao: aut }).texto === 'Cantina X')
ok('culinária segura entra no anônimo',
  sujeitoDaFrase({ nome: 'Cantina X', culinaria: 'Italiana', culinariaSegura: true, autorizacao: null }).texto === 'Um restaurante de italiana')
ok('culinária rara não entra',
  sujeitoDaFrase({ nome: 'Cantina X', culinaria: 'Italiana', culinariaSegura: false, autorizacao: null }).texto === 'Um restaurante')

// ---------------------------------------------------------------------------
// A base
// ---------------------------------------------------------------------------
{
  const b = resumirBase([
    { resumo: r, ehTeste: false },
    { resumo: r, ehTeste: true },
    { resumo: resumirRestaurante([dia('2026-10-01', { mensagens: 4, positivos: 3, clientes_novos: 2 })], HOJE), ehTeste: false },
  ])
  ok('conta de teste fica de fora', b.restaurantes === 2, String(b.restaurantes))
  ok('só os comparáveis entram no ganho', b.comparaveis === 1 && b.medianaGanho === 50)
  ok('volume soma os reais', b.mensagens === 24 && b.clientes === 12, `${b.mensagens} ${b.clientes}`)
  ok('com 1 comparável não é divulgável', !b.divulgavel)
  const f = frasesDaBase(b)
  ok('frase da base cita quantos restaurantes', f.some((x) => x.includes('Base: 1 restaurante')), f.join(' | '))
  ok('frase de volume', f.some((x) => x.startsWith('2 restaurantes já receberam 24 mensagens de 12 clientes')), f.join(' | '))
}
{
  const cinco = Array.from({ length: 5 }, () => ({ resumo: r, ehTeste: false }))
  ok('5 comparáveis é divulgável', resumirBase(cinco).divulgavel)
}

// ---------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------
{
  const linhas = linhasCsvMensal(r)
  ok('cabeçalho + um mês por linha', linhas.length === 1 + r.mensal.length)
  ok('mês vazio sai em branco no índice', linhas[3][7] === '', String(linhas[3][7]))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
