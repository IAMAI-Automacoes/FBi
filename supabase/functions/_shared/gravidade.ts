/**
 * Classificador de gravidade de um feedback — determinístico, sem IA.
 *
 * Existe porque a decisão "isso merece virar insight sozinho?" não pode ser um
 * palpite do modelo. Um relato de cabelo na comida tem que virar insight com UM
 * relato só; "comida fria" precisa de padrão. Quem decide isso é uma escala
 * calculada aqui e entregue pronta à IA (ver `limiar.ts`), em vez de a IA
 * inventar o próprio critério a cada rodada.
 *
 * É léxico (lista de expressões), não IA, de propósito: precisa ser explicável,
 * auditável e de custo zero — roda em todo ponto, o tempo todo.
 *
 * VIÉS DELIBERADO: em caso de dúvida no nível 4 (risco sanitário), erra para
 * cima. Um insight a mais custa centavos; um inseto não detectado custa o
 * cliente. O `confianca` devolvido é o que permite à IA saber quando vale a
 * pena consultar a mensagem original antes de concluir.
 */

export type NivelGravidade = 0 | 1 | 2 | 3 | 4

export interface ResultadoGravidade {
  /** 4 = risco sanitário/segurança … 0 = elogio ou neutro. */
  G: NivelGravidade
  /** Expressões que bateram — vai no prompt, para a IA saber o porquê. */
  termos: string[]
  /**
   * 'baixa' quando só uma expressão FRACA bateu (palavra solta, ambígua).
   * É o sinal de "vale ler o original antes de decidir".
   */
  confianca: 'alta' | 'baixa'
}

/**
 * Negadores. `sem` fica FORA de propósito: aparece dentro de expressões
 * legítimas do próprio léxico ("sem sal", "sem tempero"), e tratá-lo como
 * negador anularia justamente o que se quer detectar.
 */
const NEGADORES = new Set(['nao', 'nenhum', 'nenhuma', 'nunca', 'jamais'])

/** Quantas palavras antes do termo são inspecionadas em busca de negação. */
const JANELA_NEGACAO = 3

interface NivelLexico {
  nivel: NivelGravidade
  /** Expressões inequívocas — bateu, confiança alta. */
  fortes: string[]
  /** Palavras soltas e ambíguas — bateu sozinha, confiança baixa. */
  fracos: string[]
}

/**
 * Tudo sem acento (a normalização remove antes de comparar) e em minúsculas.
 * Expressões de várias palavras vêm primeiro porque são as que dão confiança
 * alta; as soltas existem só para não deixar passar um relato escrito de um
 * jeito que ninguém previu.
 */
const LEXICO: NivelLexico[] = [
  {
    nivel: 4,
    fortes: [
      // corpo estranho
      'cabelo na comida', 'cabelo no prato', 'cabelo na', 'fio de cabelo',
      'inseto na comida', 'inseto no', 'barata', 'larva', 'lagarta',
      'mosca na comida', 'mosca no', 'formiga na', 'bicho na comida',
      'caco de vidro', 'pedaco de vidro', 'pedaco de plastico', 'prego na',
      // saúde
      'passei mal', 'passou mal', 'passamos mal', 'passar mal',
      'intoxicacao', 'intoxicado', 'intoxicada',
      'vomitei', 'vomitou', 'vomitar', 'fui parar no hospital', 'no pronto socorro',
      'dor de barriga', 'diarreia',
      'reacao alergica', 'crise alergica', 'choque anafilatico',
      // alimento impróprio
      'comida estragada', 'estava estragado', 'estava estragada',
      'estava azedo', 'estava azeda', 'cheiro de estragado', 'gosto estranho',
      'mofo', 'mofado', 'mofada', 'carne crua', 'frango cru', 'cru no meio',
      // segurança e conduta
      'me agrediu', 'foi agredido', 'assedio', 'assediou',
      'racismo', 'racista', 'homofobia', 'homofobico',
      'me cortei', 'me machuquei', 'queimadura',
      'cobranca indevida', 'clonaram meu cartao', 'fraude no cartao',
    ],
    fracos: ['cabelo', 'inseto', 'estragado', 'estragada', 'azedo', 'alergia', 'praga'],
  },
  {
    nivel: 3,
    fortes: [
      'banheiro sujo', 'banheiro imundo', 'banheiro nojento', 'banheiro fedido',
      'sem papel higienico', 'sem sabonete',
      'louca suja', 'copo sujo', 'prato sujo', 'talher sujo', 'mesa suja',
      'mesa pegajosa', 'chao imundo',
      'cheiro de esgoto', 'cheiro forte de', 'mal cheiro', 'fedendo',
      'muito grosseiro', 'foi grosseiro', 'foi grossa', 'mal educado',
      'mal educada', 'destratou', 'me ignorou completamente', 'falta de respeito',
      'cobrou errado', 'conta errada', 'cobraram a mais', 'cobranca a mais',
      'perderam minha reserva', 'reserva perdida', 'nao honraram a reserva',
      'esperei mais de uma hora', 'mais de uma hora esperando', 'duas horas esperando',
    ],
    fracos: ['imundo', 'nojento', 'grosseiro', 'grosseira', 'rude', 'fedor'],
  },
  {
    nivel: 2,
    fortes: [
      'comida fria', 'prato frio', 'chegou frio', 'chegou fria',
      'estava frio', 'estava fria', 'ja estava frio',
      'sem sal', 'sem tempero', 'sem gosto', 'passou do ponto',
      'mal passado', 'muito salgado', 'sem sabor',
      'pedido errado', 'trouxeram errado', 'veio errado', 'item errado',
      'demorou muito', 'demora no atendimento', 'demorou demais', 'muita demora',
      'garcom sumiu', 'ninguem atendeu', 'ninguem veio', 'atendimento demorado',
      'musica muito alta', 'som muito alto', 'barulho demais',
      'acabou o', 'nao tinha mais', 'em falta',
      'porcao pequena', 'porcao minuscula',
    ],
    fracos: ['frio', 'fria', 'demorou', 'demora', 'lento', 'lerdo'],
  },
  {
    nivel: 1,
    fortes: [
      'poderia ter', 'seria bom se', 'seria legal se', 'sugiro', 'sugestao',
      'deveria ter', 'senti falta', 'faltou opcao', 'podia melhorar',
    ],
    fracos: ['preferia', 'gostaria'],
  },
  {
    nivel: 0,
    fortes: [
      'excelente', 'otimo', 'otima', 'maravilhoso', 'maravilhosa',
      'delicioso', 'deliciosa', 'adorei', 'amei', 'perfeito', 'perfeita',
      'parabens', 'recomendo', 'melhor que ja', 'muito bom', 'muito boa',
      'impecavel', 'nota dez',
    ],
    fracos: ['bom', 'boa', 'gostoso', 'gostosa', 'legal'],
  },
]

/**
 * Marcas de acento que o `normalize('NFD')` separa da letra base.
 *
 * Construída a partir de string (e não como literal `/[...]/`) de propósito:
 * escrever caractere combinante direto no código-fonte é frágil — alguns
 * editores e ferramentas re-normalizam o arquivo e o colam de volta na letra,
 * fazendo a classe casar com nada e o bug voltar em silêncio.
 */
const COMBINANTES = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Minúsculas, sem acento, só letras/dígitos/espaço, com espaço nas pontas.
 *
 * O espaço nas pontas é o que permite buscar ` termo ` e ter fronteira de
 * palavra sem regex — "cru" não bate dentro de "crustaceo".
 */
export function normalizar(texto: string): string {
  // Duas passadas, e a ORDEM importa. NFD separa a letra do acento
  // ("ã" -> "a" + U+0303); a marca é apagada para NADA, não para espaço —
  // se virasse espaço, "não" viraria "na o" (duas palavras) e o negador
  // deixaria de ser reconhecido, além de "intoxicação" nunca casar com
  // "intoxicacao" do léxico. Só DEPOIS a pontuação vira separador.
  const decomposto = (texto || '').toLowerCase().normalize('NFD')
  const semAcento = decomposto.replace(COMBINANTES, '')
  return ' ' + semAcento.replace(/[^a-z0-9]+/g, ' ').trim() + ' '
}

/**
 * Há pelo menos UMA ocorrência do termo que não esteja negada?
 *
 * "não tinha cabelo na comida" não pode contar como relato de cabelo. Mas
 * "tinha cabelo, não voltarei" também tem um negador na frase — por isso a
 * janela olha só as 3 palavras ANTERIORES ao termo, não a frase inteira.
 */
function ocorrenciaValida(textoNorm: string, termo: string): boolean {
  const alvo = ' ' + termo + ' '
  let de = 0
  for (;;) {
    const i = textoNorm.indexOf(alvo, de)
    if (i < 0) return false
    const anteriores = textoNorm.slice(0, i + 1).trim().split(' ').filter(Boolean)
    const janela = anteriores.slice(-JANELA_NEGACAO)
    if (!janela.some((p) => NEGADORES.has(p))) return true
    de = i + 1
  }
}

/**
 * Classifica um texto (o ponto separado, normalmente).
 *
 * Varre do nível mais grave para o menos grave e para no primeiro que bater:
 * um texto que fala de cabelo E de demora é tratado como cabelo.
 */
export function avaliarGravidade(texto: string): ResultadoGravidade {
  const norm = normalizar(texto)

  for (const faixa of LEXICO) {
    const fortes = faixa.fortes.filter((t) => ocorrenciaValida(norm, t))
    const fracos = faixa.fracos.filter((t) => ocorrenciaValida(norm, t))
    if (fortes.length === 0 && fracos.length === 0) continue

    return {
      G: faixa.nivel,
      termos: [...fortes, ...fracos],
      // Uma palavra solta e ambígua não basta para ter certeza: é aí que a IA
      // deve consultar o original antes de concluir.
      confianca: fortes.length > 0 || fracos.length >= 2 ? 'alta' : 'baixa',
    }
  }

  return { G: 0, termos: [], confianca: 'baixa' }
}

/** Gravidade de um conjunto de pontos: a do pior deles. */
export function gravidadeMaxima(textos: string[]): NivelGravidade {
  let maior: NivelGravidade = 0
  for (const t of textos) {
    const { G } = avaliarGravidade(t)
    if (G > maior) maior = G
  }
  return maior
}
