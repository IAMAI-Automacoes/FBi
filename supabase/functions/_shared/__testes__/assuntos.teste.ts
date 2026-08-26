import { agruparEmAssuntos, selecionarCandidatos, type PontoBruto } from '../assuntos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const AGORA = new Date('2026-08-26T12:00:00Z')
let seq = 0
const ponto = (p: Partial<PontoBruto> & { texto_original: string }): PontoBruto => ({
  id: ++seq,
  resumo: null,
  categoria: 'Comida',
  sentimento: 'negativo',
  origem_id: `orig-${seq}`,
  tema_id: 'tema-a',
  created_at: '2026-08-26T10:00:00Z',
  ...p,
})

// ---------------------------------------------------------------------------
// Agrupa por tema, e o tema é mais fino que a categoria
// ---------------------------------------------------------------------------
{
  const assuntos = agruparEmAssuntos(
    [
      ponto({ texto_original: 'o prato veio frio', tema_id: 'tema-frio' }),
      ponto({ texto_original: 'comida chegou fria', tema_id: 'tema-frio' }),
      ponto({ texto_original: 'a porcao e pequena', tema_id: 'tema-porcao' }),
    ],
    { agora: AGORA },
  )
  ok('separa dois temas dentro da mesma categoria', assuntos.length === 2, `${assuntos.length}`)
  const frio = assuntos.find((a) => a.chave.startsWith('tema:tema-frio'))
  ok('agrupa os dois pontos do mesmo tema', frio?.pontos.length === 2)
}

// ---------------------------------------------------------------------------
// Ponto sem tema cai na categoria; ponto sem texto é descartado
// ---------------------------------------------------------------------------
{
  const assuntos = agruparEmAssuntos(
    [
      ponto({ texto_original: 'musica alta', tema_id: null, categoria: 'Música/Som' }),
      ponto({ texto_original: '   ', tema_id: null, categoria: 'Música/Som' }),
    ],
    { agora: AGORA },
  )
  ok('sem tema, agrupa por categoria', assuntos[0]?.chave.startsWith('categoria:Música/Som'), assuntos[0]?.chave)
  ok('ponto sem texto nao entra', assuntos[0]?.pontos.length === 1)
}

// ---------------------------------------------------------------------------
// PESSOAS = originais distintos, não pontos.
// É o caso real: um cliente escreveu "achei razoável" e "não foi bom nem ruim"
// na MESMA mensagem, virando 2 pontos. Contar 2 pessoas furaria o limiar.
// ---------------------------------------------------------------------------
{
  const [a] = agruparEmAssuntos(
    [
      ponto({ texto_original: 'achei razoavel', origem_id: 'msg-1', tema_id: 'tema-x' }),
      ponto({ texto_original: 'nao foi bom nem ruim', origem_id: 'msg-1', tema_id: 'tema-x' }),
    ],
    { agora: AGORA },
  )
  ok('2 pontos da mesma mensagem = 1 pessoa', a.pessoas === 1, `pessoas=${a.pessoas}`)
  ok('mas os 2 pontos ficam no assunto', a.pontos.length === 2)
}

// ---------------------------------------------------------------------------
// Gravidade do assunto = a do PIOR ponto
// ---------------------------------------------------------------------------
{
  const [a] = agruparEmAssuntos(
    [
      ponto({ texto_original: 'demorou um pouco', tema_id: 'tema-y' }),
      ponto({ texto_original: 'tinha cabelo na comida', tema_id: 'tema-y', origem_id: 'o2' }),
    ],
    { agora: AGORA },
  )
  ok('um relato sanitario eleva o assunto inteiro a G4', a.gravidade === 4, `G${a.gravidade}`)
  ok('e com 1 pessoa ja fica elegivel', a.elegivel && a.pessoasNecessarias === 1)
}

// ---------------------------------------------------------------------------
// Elegibilidade substitui o portão de contagem: o que decide é gravidade x
// volume, não um mínimo fixo de feedbacks na rodada.
// ---------------------------------------------------------------------------
{
  const [soUm] = agruparEmAssuntos(
    [ponto({ texto_original: 'o prato veio frio', tema_id: 'tema-frio-solo' })],
    { agora: AGORA },
  )
  ok('1 relato de comida fria NAO e elegivel (precisa de 3)', !soUm.elegivel, `pessoas=${soUm.pessoas} min=${soUm.pessoasNecessarias}`)

  // Exatamente na fronteira: 2 nao basta, 3 basta.
  const dois = agruparEmAssuntos(
    [1, 2].map((n) => ponto({ texto_original: 'o prato veio frio', tema_id: 'tema-frio-2', origem_id: `d${n}` })),
    { agora: AGORA },
  )[0]
  ok('2 relatos ainda NAO sao elegiveis', !dois.elegivel)

  const tres = agruparEmAssuntos(
    [1, 2, 3].map((n) => ponto({ texto_original: 'o prato veio frio', tema_id: 'tema-frio-3', origem_id: `t${n}` })),
    { agora: AGORA },
  )[0]
  ok('3 relatos de comida fria SAO elegiveis', tres.elegivel)
}

// ---------------------------------------------------------------------------
// Ordenação e seleção de candidatos
// ---------------------------------------------------------------------------
{
  const assuntos = agruparEmAssuntos(
    [
      ponto({ texto_original: 'tinha cabelo na comida', tema_id: 't-grave', origem_id: 'g1' }),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) =>
        ponto({ texto_original: 'poderia ter mais opcoes veganas', tema_id: 't-banal', origem_id: `b${n}`, sentimento: 'Neutro' }),
      ),
    ],
    { agora: AGORA },
  )
  ok('assunto sanitario vem primeiro, mesmo com 1 pessoa contra 12', assuntos[0].chave.startsWith('tema:t-grave'), assuntos[0].chave)

  const candidatos = selecionarCandidatos(assuntos, 1)
  ok('teto de candidatos corta a lista', candidatos.length === 1)
  ok('e mantem o mais bem pontuado', candidatos[0].chave.startsWith('tema:t-grave'))
}

// ---------------------------------------------------------------------------
// Inelegível nunca vira candidato, por mais alto que pontue
// ---------------------------------------------------------------------------
{
  const assuntos = agruparEmAssuntos(
    [ponto({ texto_original: 'a porcao podia ser maior', tema_id: 't-sozinho' })],
    { agora: AGORA },
  )
  ok('assunto inelegivel fica de fora dos candidatos', selecionarCandidatos(assuntos, 5).length === 0)
}

// ---------------------------------------------------------------------------
// Reincidência entra pela chave do assunto
// ---------------------------------------------------------------------------
{
  const entrada = [1, 2, 3, 4].map((n) =>
    ponto({ texto_original: 'o prato veio frio', tema_id: 't-rec', origem_id: `r${n}` }),
  )
  const normal = agruparEmAssuntos(entrada, { agora: AGORA })[0]
  const reincidente = agruparEmAssuntos(entrada, {
    agora: AGORA,
    reincidentes: new Set(['tema:t-rec|neg']),
  })[0]
  ok('assunto reincidente pontua mais', reincidente.score > normal.score)
}

// ---------------------------------------------------------------------------
// Lista vazia não quebra
// ---------------------------------------------------------------------------
{
  ok('entrada vazia devolve lista vazia', agruparEmAssuntos([], { agora: AGORA }).length === 0)
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
