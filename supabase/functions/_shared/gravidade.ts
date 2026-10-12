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

import type { Publico } from './publico.ts'

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
      // Formas femininas e a variante "por dentro": faltavam, e "a carne
      // estava crua no meio" — proteína malcozida, risco sanitário de
      // verdade — escapava para G2. São expressões coladas em carne/frango de
      // propósito: "estava cru" sozinho pegaria tomate cru, que é normal.
      'crua no meio', 'cru por dentro', 'crua por dentro',
      'carne estava crua', 'frango estava cru', 'carne mal cozida',
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
      // Espera acima de uma hora, em qualquer construção. A primeira versão só
      // tinha 'esperei mais de uma hora' e deixava passar o texto real do
      // banco, "a comida demorou mais de uma hora para chegar", como G2.
      'mais de uma hora', 'mais de 1 hora', 'duas horas esperando', 'quase duas horas',
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
 * O mesmo léxico para quem TRABALHA no restaurante (feedback da equipe).
 *
 * A escala é a mesma (4 = age com um relato só … 0 = elogio), mas o que é
 * grave muda de mundo: não é cabelo na comida, é assédio, acidente, salário não
 * pago. Sem esta lista, "o gerente me ameaçou" e "o salário atrasa todo mês"
 * caíam no piso do sentimento (G2), como se fossem "comida fria".
 *
 *   4  risco a uma pessoa ou ilegalidade grave  → um relato basta
 *   3  falha grave de gestão ou de condição de trabalho, e sinal de saída
 *   2  problema comum do dia a dia
 *   1  sugestão        0  elogio
 */
const LEXICO_EQUIPE: NivelLexico[] = [
  {
    nivel: 4,
    fortes: [
      // assédio, agressão, ameaça
      'assedio', 'assediou', 'assediada', 'assediado', 'me assedia', 'passou a mao', 'passa a mao',
      'me agrediu', 'foi agredido', 'foi agredida', 'me bateu', 'me empurrou', 'partiu pra cima',
      'me ameacou', 'ameacou', 'fui ameacado', 'fui ameacada', 'ameacando', 'ameaca de',
      // discriminação
      'racismo', 'racista', 'homofobia', 'homofobico', 'homofobica', 'machismo', 'machista',
      'xenofobia', 'discriminacao', 'discriminou', 'preconceito',
      // acidente e risco
      'me cortei', 'me queimei', 'queimadura', 'me machuquei', 'acidente de trabalho', 'sofri um acidente',
      'fui parar no hospital', 'no pronto socorro', 'levei um choque', 'choque eletrico',
      'vazamento de gas', 'cheiro de gas', 'fio desencapado', 'fio exposto', 'risco de incendio',
      // salário não pago, sem registro, trabalhar doente
      'sem registro', 'sem carteira assinada', 'carteira nao foi assinada', 'nao assinaram minha carteira',
      'nao recebi o salario', 'nao recebi meu salario', 'nao pagaram o salario', 'salario nao foi pago',
      'meses sem receber', 'trabalhar doente', 'trabalhei doente', 'nao aceitam atestado',
      'nao aceitaram o atestado', 'nao aceitou meu atestado',
      // a própria vida
      'me matar', 'tirar minha vida', 'nao quero mais viver',
    ],
    fracos: ['ameaca', 'acidente', 'agrediu', 'agressao', 'choque'],
  },
  {
    nivel: 3,
    fortes: [
      // dinheiro
      'salario atrasado', 'salario atrasa', 'salario atrasou', 'atraso no salario', 'atraso de salario',
      'atrasam o salario', 'atrasou o pagamento', 'pagamento atrasado', 'pagamento atrasa',
      'hora extra nao paga', 'nao pagam hora extra', 'nao paga hora extra', 'nao recebo hora extra',
      'desconto indevido', 'descontaram do meu salario', 'descontam do salario',
      // tratamento
      'grita com', 'gritou com', 'gritando com', 'grita comigo', 'gritou comigo', 'aos gritos',
      'humilha', 'humilhou', 'humilhacao', 'humilhado', 'humilhada', 'xingou', 'xinga',
      'falta de respeito', 'me destratou', 'destrata',
      // jornada
      'sem folga', 'nao tenho folga', 'sem descanso', 'dobrando', 'dobra de turno', 'dobrar turno',
      'fecho e abro', 'fechar e abrir', 'sem intervalo', 'sem horario de almoco', 'sem pausa',
      'trabalho por dois', 'trabalho de dois', 'faltando gente', 'falta gente', 'falta de funcionario',
      // proteção
      'sem epi', 'sem luva', 'sem equipamento de protecao', 'chao liso', 'piso liso', 'piso escorregadio',
      // sinal de saída: é o que o dono mais quer evitar
      'pedir demissao', 'pedir as contas', 'vou sair daqui', 'vou embora daqui',
      'procurando outro emprego', 'procurando outro trabalho', 'nao aguento mais',
      'esgotado', 'esgotada', 'burnout',
    ],
    fracos: ['grita', 'gritou', 'gritos', 'demissao', 'exausto', 'exausta'],
  },
  {
    nivel: 2,
    fortes: [
      'em cima da hora', 'na vespera', 'equipamento quebrado', 'forno quebrado', 'fritadeira quebrada',
      'vive quebrado', 'vive quebrada', 'esta quebrado', 'esta quebrada',
      'falta uniforme', 'sem uniforme', 'falta material',
      'ninguem avisa', 'ninguem avisou', 'fico sabendo pelos outros',
      'ninguem ensina', 'ninguem me ensinou', 'sem treinamento', 'falta de treinamento',
      'fofoca', 'panelinha', 'ninguem agradece', 'sem reconhecimento', 'falta de reconhecimento',
      'salario baixo', 'ganho pouco', 'paga pouco', 'cliente grosseiro', 'cliente grosso',
    ],
    fracos: ['quebrado', 'quebrada', 'desorganizado', 'desorganizada', 'bagunca', 'baguncado'],
  },
  {
    nivel: 1,
    fortes: [
      'poderia ter', 'seria bom se', 'seria legal se', 'sugiro', 'sugestao',
      'deveria ter', 'senti falta', 'podia melhorar', 'podiam ter', 'seria bom ter',
    ],
    fracos: ['preferia', 'gostaria'],
  },
  {
    nivel: 0,
    fortes: [
      'excelente', 'otimo', 'otima', 'maravilhoso', 'maravilhosa', 'adoro', 'adorei',
      'gosto de trabalhar', 'gosto muito', 'amo trabalhar', 'equipe unida', 'ambiente bom',
      'ambiente otimo', 'me sinto bem', 'parabens', 'muito bom', 'muito boa', 'nota dez',
    ],
    fracos: ['bom', 'boa', 'legal', 'tranquilo'],
  },
]

const LEXICOS: Record<Publico, NivelLexico[]> = { cliente: LEXICO, equipe: LEXICO_EQUIPE }

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

function avaliarPorLexico(texto: string, publico: Publico = 'cliente'): ResultadoGravidade {
  const norm = normalizar(texto)

  for (const faixa of LEXICOS[publico]) {
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

/**
 * Piso de gravidade dado pelo SENTIMENTO já classificado pelo n8n.
 *
 * Esta é a peça que faz o classificador funcionar no mundo real. Rodando o
 * léxico sozinho contra 56 feedbacks de produção, só 1 de 17 assuntos ficava
 * elegível — e os que escapavam não eram casos duvidosos, eram problemas
 * óbvios escritos com palavras que a lista não previa:
 *
 *   "o sistema de reserva ficava travando"   (5 pessoas!)  -> G0
 *   "os garçons pareciam perdidos"           (3 pessoas)   -> G0
 *   "a mesa estava super bamba e balançava"  (2 pessoas)   -> G0
 *
 * Nenhuma lista de expressões cobre as infinitas formas de reclamar. Mas o
 * feedback já chega com o sentimento classificado por IA no n8n, e "Negativo"
 * é, por si só, evidência de que há problema — mesmo quando as palavras exatas
 * não estão no léxico.
 *
 * Então o papel de cada parte se inverte: o SENTIMENTO estabelece o piso
 * (existe uma queixa aqui), e o LÉXICO serve para ELEVAR acima dele (esta
 * queixa específica é grave). O léxico não precisa mais reconhecer toda
 * reclamação — só as severas.
 */
function pisoPorSentimento(sentimento?: string | null): NivelGravidade {
  const s = (sentimento || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  // Cobre 'Negativo' e também o misto 'Positivo e Negativo': se há parte
  // negativa, há queixa.
  if (s.includes('negativ')) return 2
  // Sugestão é ponto a melhorar: o nível de melhoria do léxico ("sugiro",
  // "seria bom se"…), nunca queixa nem urgência.
  if (s.includes('sugest')) return 1
  return 0
}

/**
 * Classifica um ponto separado.
 *
 * Combina as duas fontes: o léxico varre do nível mais grave para o menos
 * grave e para no primeiro que bater (um texto que fala de cabelo E de demora
 * é tratado como cabelo); o sentimento garante que uma queixa não reconhecida
 * não caia para G0.
 */
export function avaliarGravidade(
  texto: string,
  sentimento?: string | null,
  /** De quem é o feedback: cada público tem a sua lista do que é grave. */
  publico: Publico = 'cliente',
): ResultadoGravidade {
  const doLexico = avaliarPorLexico(texto, publico)
  const piso = pisoPorSentimento(sentimento)

  if (doLexico.G >= piso) return doLexico

  return {
    G: piso,
    termos: [piso === 1
      ? (publico === 'equipe' ? 'sugestao da equipe (melhoria)' : 'sugestao do cliente (melhoria)')
      : 'sentimento negativo (sem expressao especifica no lexico)'],
    // Confiança baixa de propósito: sabemos que é queixa, não sabemos o quanto
    // é grave. É exatamente o caso em que vale a IA ler a mensagem original.
    confianca: 'baixa',
  }
}

/** Gravidade de um conjunto de pontos: a do pior deles. */
export function gravidadeMaxima(
  pontos: { texto: string; sentimento?: string | null }[],
  publico: Publico = 'cliente',
): NivelGravidade {
  let maior: NivelGravidade = 0
  for (const p of pontos) {
    const { G } = avaliarGravidade(p.texto, p.sentimento, publico)
    if (G > maior) maior = G
  }
  return maior
}
