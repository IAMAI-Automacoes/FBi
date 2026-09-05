/**
 * Geração de insights, em estágios.
 *
 * ## O que mudou e por quê
 *
 * A versão anterior fazia UMA chamada de IA com todos os feedbacks juntos e
 * pedia "gere insights". Três problemas de fundo:
 *
 * 1. **Portões de contagem.** Abortava com `criterios_nao_atingidos` (menos de
 *    10 feedbacks novos e menos de 24h desde a última rodada) ou `insuficiente`
 *    (menos de 3 no modo manual). Um relato único de cabelo na comida — que
 *    precisa virar insight sozinho — era descartado por contagem. Os dois
 *    portões saíram: quem decide agora é gravidade × volume, por assunto.
 *
 * 2. **A IA estimava relevância sozinha.** Sem número calculado, a mesma
 *    reclamação virava insight num dia e não virava no outro. Agora
 *    `gravidade.ts` e `limiar.ts` entregam tudo pronto (o quão grave, quantas
 *    pessoas relataram, quantas seriam necessárias) e a IA só redige.
 *
 * 3. **Contaminação entre assuntos.** Com tudo no mesmo contexto, nada impedia
 *    o insight de "demora" absorver o "prato frio" da mesma mensagem. Agora
 *    cada assunto é uma invocação isolada, com histórico zerado — que é também
 *    o pedido de "a IA esquecer as memórias entre um insight e outro".
 *
 * ## O pipeline
 *
 *   0. agrupar em assuntos          (código, `assuntos.ts`)
 *   1. redigir                      (IA, isolada por assunto, com ferramentas)
 *   2. detector de vazamento        (código, `anti-vazamento.ts`)
 *   3. verificar lastro             (IA, isolada, só vê os pontos + o rascunho)
 *   4. gravar insight + vínculos
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { carregarPrompts, montarPrompt, type Prompts } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, checarCota, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, buscarConhecimento, buscarMemorias, nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'
import {
  agruparEmAssuntos, chaveDoAssunto, selecionarParaAvaliar, type Assunto, type PontoBruto,
} from '../_shared/assuntos.ts'
import {
  assuntoElegivelPorNota,
  consolidarNota,
  pessoasNecessariasPorNota,
  pontuarPorNota,
  type CamposAvaliacao,
} from '../_shared/avaliacao.ts'
import { construirVocabularioProibido, detectarVazamento } from '../_shared/anti-vazamento.ts'
import { ferramentaHistoricoDoAssunto, ferramentaLerOriginal } from '../_shared/ferramentas-feedback.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const AGENTE = 'gerador_insights'
const AGENTE_VERIFICADOR = 'verificador_insights'
const AGENTE_AVALIADOR = 'avaliador_assunto'

/** Teto de insights por rodada — pedido explícito do dono. */
const MAX_INSIGHTS = 5
/**
 * Assuntos que chegam a ser redigidos. Acima do teto de insights de propósito:
 * a verificação descarta alguns, e sobrar candidato é melhor que devolver menos
 * do que daria. Também é o que mantém o custo previsível — sem teto, 300 pontos
 * livres virariam ~40 assuntos e ~80 chamadas de modelo.
 */
const MAX_CANDIDATOS = 8
/**
 * Assuntos que chegam a ser avaliados pela IA. Maior que MAX_CANDIDATOS de
 * propósito: a avaliação é barata (400 tokens, sem ferramenta) e é ela que
 * decide quem é elegível — cortar cedo demais devolveria o problema que o
 * avaliador existe para resolver.
 */
const MAX_AVALIACOES = 14

const CATEGORIAS = [
  'Comida', 'Bebidas', 'Atendimento', 'Ambiente', 'Limpeza', 'Preço',
  'Tempo de Espera', 'Reserva', 'Estacionamento', 'Acessibilidade',
  'Música/Som', 'Cardápio/Variedade', 'Higiene', 'Outros',
]

const EXPLICACAO_GRAVIDADE: Record<number, string> = {
  4: 'risco sanitario ou de seguranca (corpo estranho, intoxicacao, agressao)',
  3: 'falha grave de higiene, conduta ou operacao',
  2: 'problema operacional comum',
  1: 'preferencia ou sugestao',
  0: 'elogio ou comentario neutro',
}

/** Padrão do código; o admin sobrescreve pela chave ef_gerar_insights no painel. */
const PROMPT_REDATOR = `Voce e o "{nome}", consultor de gestao de restaurantes.

{tom}

## Sobre este restaurante
{perfil}
{conhecimento}

## O UNICO assunto em analise
Categoria: {categoria}
Nota de importancia: {nota} de 10 — {justificativa_nota}
{termos_gravidade}
Pessoas diferentes que relataram: {pessoas} (o minimo para esta nota e {mininimo})
Comentarios positivos sobre o mesmo tema: {positivos}
Confianca da classificacao automatica: {confianca}

## Os feedbacks deste assunto — sua UNICA fonte
{pontos}

## Regras
- Escreva sobre ESTE assunto e mais nada. Outros assuntos ja tem (ou terao) os
  proprios insights; mencionar qualquer um deles aqui e erro grave.
- Os numeros acima ja estao calculados. Nao os recalcule nem os contradiga.
- A sugestao deve ser CONCRETA e executavel NESTE restaurante, considerando o
  porte, o tipo de cozinha e o publico descritos no perfil. Nada de "melhore o
  atendimento".
- Quando a confianca for "baixa", ou quando a gravidade parecer nao refletir o
  que os feedbacks dizem, use a ferramenta ler_original antes de concluir.
- ATENCAO com ler_original: a mensagem do cliente quase sempre fala de VARIOS
  assuntos. Voce so pode usar o que se refere ao assunto acima. Nao cite, nao
  resuma e nao sugira nada sobre os demais — eles nao sao seu problema aqui.
- Escreva em portugues do Brasil, direto, sem jargao.
- Se este assunto nao justificar um insight (relato isolado sem padrao, opiniao
  pessoal, generico demais para virar acao), devolva gerar=false. E preferivel
  entregar menos insights do que encher a lista.

Chame registrar_insight com o resultado.`

const PROMPT_VERIFICADOR = `Voce revisa se um insight tem lastro nos feedbacks que o originaram.

## Os feedbacks — a UNICA fonte que o insight podia usar
{pontos}

## O insight redigido
Titulo: {titulo}
Descricao: {descricao}
Sugestao: {sugestao}

## Sua tarefa
Verifique cada afirmacao factual do TITULO e da DESCRICAO contra os feedbacks
acima. Uma afirmacao esta sustentada quando os feedbacks realmente dizem aquilo.

Regras de julgamento:
- Confira O QUE exatamente cada afirmacao descreve, nao so o tema geral. Trocar
  o objeto da queixa e erro, mesmo dentro da mesma categoria. Exemplos reais de
  troca que DEVEM ser reprovados:
    feedback diz "a comida demorou para chegar"  ->  insight diz "espera para SENTAR"
    feedback diz "a mesa estava suja"            ->  insight diz "o BANHEIRO estava sujo"
    feedback diz "o garcom sumiu"                ->  insight diz "faltou EDUCACAO"
  Espera pela comida e espera por mesa sao problemas diferentes, com causas e
  solucoes diferentes.
- Reprove se o insight mencionar problema, elogio, lugar, pessoa ou detalhe que
  nao esta em nenhum dos feedbacks acima — mesmo que pareca plausivel ou util.
- A SUGESTAO e uma proposta de acao; ela nao precisa aparecer nos feedbacks.
  Mas tem que atacar o problema que os feedbacks descrevem, nao outro.
- Nao reprove por estilo, tom, nem por a redacao ser mais generica que os
  feedbacks. So o que for FALSO ou ALHEIO reprova.
- Se reprovar, escreva em "afirmacao" o trecho exato do insight e em "motivo" o
  que os feedbacks realmente dizem.

Chame registrar_verificacao.`

/**
 * Rubrica de importancia. Editavel no painel pela chave ef_avaliar_assunto.
 *
 * As ancoras sao concretas de proposito: "de 0 a 10, o quao importante e isso"
 * sem referencia produz notas que variam de rodada para rodada. Com exemplos
 * ancorados, dois assuntos parecidos recebem notas parecidas.
 */
const PROMPT_AVALIADOR = `Voce avalia o quao importante e um assunto para o DONO deste restaurante.

{tom}

## Sobre este restaurante
{perfil}

## O que ja sabemos sobre ele
{memorias}

{conhecimento}

## O assunto
Tipo: {tipo}
Categoria: {categoria}
Pessoas diferentes que relataram: {pessoas}
Comentarios POSITIVOS sobre o mesmo tema no periodo: {positivos}

## Os feedbacks
{pontos}

## A escala — use estas ancoras
- 10: risco sanitario ou de seguranca. Corpo estranho na comida (cabelo, inseto,
  vidro), intoxicacao, alguem passou mal, alimento estragado, agressao, assedio,
  ferimento, fraude. Um relato so ja basta para agir.
- 7 a 9: falha grave de higiene, conduta ou operacao. Banheiro imundo, praga no
  salao, grosseria de funcionario, erro de cobranca, espera acima de uma hora.
- 4 a 6: problema operacional comum. Comida fria, ponto errado, pedido trocado,
  demora moderada, garcom sumido, item em falta.
- 2 a 3: preferencia ou sugestao. Musica alta, gosto pessoal, "poderia ter".
- 0 a 1: elogio, comentario neutro, ou nada acionavel.

REGRA DURA sobre o tipo: se o Tipo acima for ELOGIO ou NEUTRO, a nota e no
maximo 1. Elogio nao e problema a resolver — por melhor que seja e por mais
gente que tenha dito, ele nao compete por atencao com uma queixa. A unica
excecao e um texto marcado como elogio que na verdade RELATA um problema grave
(acontece: o cliente elogia o garcom e menciona de passagem que achou um inseto).
Nesse caso, avalie pelo problema.

## Como usar o contexto do restaurante
- Se as anotacoes ou o perfil mostram que o dono ja se preocupa com este assunto,
  ou que ele e recorrente, isso SOBE a nota.
- Se o restaurante e pequeno e o assunto exige investimento alto para pouca
  gente, isso DESCE a nota.
- Muitos comentarios positivos sobre o mesmo tema sugerem que o problema e
  pontual, e nao um padrao — considere isso. NAO vale para risco sanitario:
  ali um relato basta, tenha o restaurante os elogios que tiver.
- Nunca invente contexto que nao esta acima.

## Sua tarefa
De a nota do assunto e explique em uma frase. Liste em "sinais" as expressoes
dos feedbacks que sustentam a nota.

Chame registrar_avaliacao.`

const SCHEMA_AVALIACAO = {
  type: 'object',
  properties: {
    nota: {
      type: 'number',
      description: 'De 0 a 10, seguindo as ancoras da escala. Pode ter meio ponto.',
    },
    justificativa: { type: 'string', description: 'Uma frase curta.' },
    sinais: {
      type: 'array',
      description: 'Trechos dos feedbacks que sustentam a nota.',
      items: { type: 'string' },
    },
  },
  required: ['nota'],
}

const SCHEMA_INSIGHT = {
  type: 'object',
  properties: {
    gerar: {
      type: 'boolean',
      description: 'false quando o assunto nao justifica um insight. Prefira false a encher a lista.',
    },
    prioridade: { type: 'string', enum: ['URGENTE', 'IMPORTANTE', 'OBSERVACAO'] },
    categoria: { type: 'string', enum: CATEGORIAS },
    titulo: { type: 'string', description: 'Curto e claro, sem ponto final.' },
    descricao: { type: 'string', description: 'O padrao que os feedbacks mostram.' },
    sugestao: { type: 'string', description: 'Acao pratica e especifica para a equipe.' },
  },
  required: ['gerar'],
}

const SCHEMA_VERIFICACAO = {
  type: 'object',
  properties: {
    aprovado: { type: 'boolean' },
    problemas: {
      type: 'array',
      description: 'Afirmacoes sem lastro. Vazio quando aprovado.',
      items: {
        type: 'object',
        properties: {
          afirmacao: { type: 'string' },
          motivo: { type: 'string' },
        },
      },
    },
  },
  required: ['aprovado'],
}

// deno-lint-ignore no-explicit-any
type Db = any

/** Assunto depois do estagio de avaliacao. E o que circula dali para a frente. */
type AssuntoAvaliado = Assunto & CamposAvaliacao

/**
 * Quantos assuntos são redigidos ao mesmo tempo.
 *
 * Edge function do Supabase morre em 150s. Rodando um assunto por vez, oito
 * assuntos × (redigir + ferramentas + verificar) estouram o limite — foi o que
 * aconteceu no primeiro teste real. Os assuntos são independentes por
 * construção (cada um tem a própria conversa isolada), então paralelizar não
 * muda o resultado, só o relógio. O limite de 4 evita disparar oito chamadas
 * simultâneas contra o OpenRouter e apanhar de rate limit.
 */
const CONCORRENCIA = 4

/** Executa `fn` sobre os itens com no máximo `limite` em voo ao mesmo tempo. */
async function emParalelo<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let proximo = 0

  async function trabalhador() {
    for (;;) {
      const i = proximo++
      if (i >= itens.length) return
      saida[i] = await fn(itens[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador()),
  )
  return saida
}

function listarPontosParaPrompt(assunto: Assunto): string {
  return assunto.pontos
    .map((p) => `- id ${p.id} [${p.sentimento ?? 'sem sentimento'}]: "${p.texto}"`)
    .join('\n')
}

/**
 * Estagio 0b — a IA da a nota de importancia do assunto.
 *
 * Roda por assunto, isolada, ANTES de decidir se ele vira insight. E aqui que o
 * que o dono valoriza entra na conta: `blocoPerfil`, as anotacoes do assistente
 * (`memoria_assistente`) e os documentos de treinamento (RAG) chegam ao mesmo
 * tempo que os feedbacks.
 *
 * O codigo nao aceita a nota crua. `consolidarNota` aplica o piso do lexico: se
 * as palavras do relato denunciam corpo estranho ou intoxicacao, a nota minima e
 * 10 mesmo que o modelo tenha dito 2. Risco sanitario nao pode depender do humor
 * do modelo numa rodada.
 *
 * Falhar aqui NAO derruba o assunto: cai no piso do lexico, que e exatamente o
 * comportamento antigo. Nunca deixa de avaliar por erro de rede.
 */
async function avaliarImportancia(
  db: Db,
  // deno-lint-ignore no-explicit-any
  ctx: any,
  assunto: Assunto,
): Promise<{ nota: number; justificativa: string; notaIA: number; pisoAplicado: boolean }> {
  const prompt = montarPrompt(ctx.prompts, 'ef_avaliar_assunto', PROMPT_AVALIADOR, {
    tom: tomDoAssistente(ctx.config.mascote_config),
    perfil: blocoPerfil(ctx.config),
    memorias: ctx.memorias || '(nenhuma anotacao registrada ainda)',
    conhecimento: ctx.conhecimento ? `## Boas praticas de referencia
${ctx.conhecimento}` : '',
    tipo: assunto.chave.endsWith('|neg') ? 'QUEIXA' : 'ELOGIO ou NEUTRO',
    categoria: assunto.categoria ?? 'Outros',
    pessoas: String(assunto.pessoas),
    positivos: String(assunto.positivosDoTema ?? 0),
    pontos: listarPontosParaPrompt(assunto),
  })

  let notaIA = -1
  let justificativa = ''
  try {
    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params: ctx.paramsAvaliador,
      origem: 'gerar-insights-avaliador',
      restauranteId: ctx.restauranteId,
      agenteId: AGENTE_AVALIADOR,
      checarCotaAntes: false,
      // Sem ferramenta: a nota sai do que esta no prompt. Deixar a IA buscar
      // mais contexto aqui so aumentaria a variacao entre rodadas.
      calculadora: false,
      saida: {
        nome: 'registrar_avaliacao',
        descricao: 'Registra a nota de importancia do assunto.',
        schema: SCHEMA_AVALIACAO,
      },
    })
    notaIA = Number(result?.nota)
    justificativa = String(result?.justificativa ?? '')
  } catch (err) {
    console.error(`[${assunto.chave}] falha ao avaliar; usando so o piso do lexico:`, err)
  }

  // Sem resposta da IA, o piso vira a nota: e o comportamento de antes desta
  // mudanca, quando o lexico decidia sozinho.
  const base = Number.isFinite(notaIA) && notaIA >= 0 ? notaIA : assunto.gravidade * 2.5
  const r = consolidarNota(base, assunto.gravidade)

  if (r.pisoAplicado) {
    console.warn(
      `[${assunto.chave}] IA deu ${r.notaIA} mas o lexico reconheceu gravidade ` +
        `${assunto.gravidade}; nota elevada para ${r.nota}`,
    )
  }

  return { nota: r.nota, justificativa, notaIA: r.notaIA, pisoAplicado: r.pisoAplicado }
}

/**
 * Estágio 1 — redigir o insight de UM assunto, isoladamente.
 *
 * `reparo` carrega a segunda tentativa, quando o detector ou o verificador
 * reprovam. A ESTRUTURA DE TURNOS importa e já causou um bug em produção: na
 * primeira versão o reparo era só mais uma mensagem `user` depois do prompt,
 * sem turno do assistente no meio. O modelo via duas mensagens de usuário
 * seguidas, a última dominava, e ele escrevia um insight SOBRE A CORREÇÃO —
 * saiu um insight de verdade intitulado "Afirmações sem lastro nos feedbacks".
 *
 * Com o rascunho anterior no papel de `assistant`, a conversa fica coerente:
 * pedido -> tentativa -> crítica -> nova tentativa.
 */
async function redigirInsight(
  db: Db,
  ctx: {
    restauranteId: number
    assunto: AssuntoAvaliado
    prompts: Prompts
    config: Record<string, unknown>
    conhecimento: string
    // deno-lint-ignore no-explicit-any
    params: any
  },
  reparo?: { rascunhoAnterior: unknown; critica: string },
) {
  const { assunto } = ctx

  const prompt = montarPrompt(ctx.prompts, 'ef_gerar_insights', PROMPT_REDATOR, {
    nome: nomeDoAssistente(ctx.config.mascote_config),
    tom: tomDoAssistente(ctx.config.mascote_config),
    perfil: blocoPerfil(ctx.config),
    conhecimento: ctx.conhecimento
      ? `\n## Boas praticas de referencia\n${ctx.conhecimento}`
      : '',
    categoria: assunto.categoria ?? 'Outros',
    nota: String(assunto.nota ?? assunto.gravidade * 2.5),
    justificativa_nota: assunto.justificativaNota || (EXPLICACAO_GRAVIDADE[assunto.gravidade] ?? ''),
    positivos: String(assunto.positivosDoTema ?? 0),
    termos_gravidade: assunto.termosGravidade.length
      ? `Sinais que levaram a essa gravidade: ${assunto.termosGravidade.join(', ')}`
      : '',
    pessoas: String(assunto.pessoas),
    mininimo: String(assunto.pessoasNecessarias),
    confianca: assunto.confianca,
    pontos: listarPontosParaPrompt(assunto),
  })

  const mensagens: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: prompt },
  ]
  if (reparo) {
    mensagens.push({ role: 'assistant', content: JSON.stringify(reparo.rascunhoAnterior) })
    mensagens.push({
      role: 'user',
      content:
        `Sua resposta anterior foi REPROVADA na revisao. Motivo: ${reparo.critica}\n\n` +
        'Reescreva o insight SOBRE O MESMO ASSUNTO descrito no inicio desta conversa, ' +
        'corrigindo apenas o que foi apontado. Esta mensagem e uma critica ao seu texto, ' +
        'NAO e um novo assunto: nao escreva sobre revisao, lastro nem sobre o proprio ' +
        'processo de geracao. Se nao for possivel corrigir mantendo o assunto, devolva ' +
        'gerar=false.',
    })
  }

  const { result } = await chamarIA(db, {
    messages: mensagens,
    params: ctx.params,
    origem: 'gerar-insights',
    restauranteId: ctx.restauranteId,
    agenteId: AGENTE,
    checarCotaAntes: false,
    ferramentas: [
      ferramentaLerOriginal(db, assunto.pontos),
      ferramentaHistoricoDoAssunto(db, ctx.restauranteId, assunto.categoria),
    ],
    saida: {
      nome: 'registrar_insight',
      descricao: 'Registra o insight deste assunto, ou informa que ele nao justifica um insight.',
      schema: SCHEMA_INSIGHT,
    },
  })

  return result as {
    gerar?: boolean
    prioridade?: string
    categoria?: string
    titulo?: string
    descricao?: string
    sugestao?: string
  }
}

/** Estágio 3 — a chamada que só vê os pontos e o rascunho, e julga o lastro. */
async function verificarLastro(
  db: Db,
  ctx: {
    restauranteId: number
    assunto: AssuntoAvaliado
    prompts: Prompts
    // deno-lint-ignore no-explicit-any
    paramsVerificador: any
  },
  insight: { titulo?: string; descricao?: string; sugestao?: string },
) {
  const prompt = montarPrompt(ctx.prompts, 'ef_verificar_insight', PROMPT_VERIFICADOR, {
    pontos: listarPontosParaPrompt(ctx.assunto),
    titulo: insight.titulo ?? '',
    descricao: insight.descricao ?? '',
    sugestao: insight.sugestao ?? '',
  })

  const { result } = await chamarIA(db, {
    messages: [{ role: 'user', content: prompt }],
    // Params do VERIFICADOR, não do redator: ele responde um julgamento curto,
    // e usar o teto de tokens do redator só desperdiçaria cota.
    params: ctx.paramsVerificador,
    origem: 'gerar-insights-verificador',
    restauranteId: ctx.restauranteId,
    agenteId: AGENTE_VERIFICADOR,
    checarCotaAntes: false,
    // Sem ferramenta nenhuma, e de propósito: o verificador não pode ir buscar
    // contexto novo. Ele julga o rascunho contra os pontos, e só.
    calculadora: false,
    saida: {
      nome: 'registrar_verificacao',
      descricao: 'Registra o resultado da revisao.',
      schema: SCHEMA_VERIFICACAO,
    },
  })

  return result as { aprovado?: boolean; problemas?: { afirmacao: string; motivo: string }[] }
}

/**
 * Roda os estágios 1-3 de um assunto e devolve o insight aprovado, ou null.
 *
 * Uma única rodada de reparo, compartilhada entre o detector e o verificador:
 * se o problema persistir depois de apontado, o assunto é descartado. Insistir
 * mais que isso gasta cota para, na prática, obter o mesmo texto de novo.
 */
async function gerarInsightDoAssunto(db: Db, ctx: any, assunto: AssuntoAvaliado) {
  const textosIrmaos = await buscarTextosIrmaos(db, assunto)
  const vocabulario = construirVocabularioProibido(
    assunto.pontos.map((p) => p.texto),
    textosIrmaos,
  )

  let reparo: { rascunhoAnterior: unknown; critica: string } | undefined

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const rascunho = await redigirInsight(db, { ...ctx, assunto }, reparo)

    if (rascunho?.gerar === false) {
      console.log(`[${assunto.chave}] o redator julgou que nao justifica insight`)
      return null
    }
    if (!rascunho?.titulo) {
      console.log(`[${assunto.chave}] rascunho sem titulo, descartado`)
      return null
    }

    const textoCompleto = [rascunho.titulo, rascunho.descricao, rascunho.sugestao]
      .filter(Boolean)
      .join(' ')

    const vazamento = detectarVazamento(textoCompleto, vocabulario)
    if (vazamento.nivel === 'vazou') {
      if (tentativa === 1) {
        console.warn(`[${assunto.chave}] descartado: vazamento persistente`, vazamento)
        return null
      }
      reparo = {
        rascunhoAnterior: rascunho,
        critica:
          'o texto usou conteudo de OUTRO assunto da mesma mensagem do cliente. ' +
          `Termos que denunciam: ${[...vazamento.trigramas, ...vazamento.tokens].join(', ')}`,
      }
      continue
    }

    const veredito = await verificarLastro(db, { ...ctx, assunto }, rascunho)
    if (veredito?.aprovado !== false) return rascunho

    if (tentativa === 1) {
      console.warn(`[${assunto.chave}] descartado: sem lastro`, veredito.problemas)
      return null
    }
    reparo = {
      rascunhoAnterior: rascunho,
      critica:
        'afirmacoes que os feedbacks nao sustentam — ' +
        (veredito.problemas ?? []).map((p) => `"${p.afirmacao}" (${p.motivo})`).join('; '),
    }
  }

  return null
}

/**
 * Os textos dos pontos IRMÃOS — mesma mensagem original, assunto diferente.
 *
 * É a matéria-prima do detector de vazamento: o vocabulário proibido é o que
 * existe aqui e não existe no assunto em análise.
 */
async function buscarTextosIrmaos(db: Db, assunto: Assunto): Promise<string[]> {
  const origens = [...new Set(assunto.pontos.map((p) => p.origem_id).filter(Boolean))]
  if (origens.length === 0) return []

  const idsDoAssunto = new Set(assunto.pontos.map((p) => p.id))

  const { data } = await db
    .from('feedbacks_restaurante')
    .select('id, texto_original, resumo')
    .in('origem_id', origens)

  return (data ?? [])
    .filter((f: { id: number }) => !idsDoAssunto.has(f.id))
    .map((f: { texto_original: string | null; resumo: string | null }) => f.texto_original || f.resumo || '')
    .filter(Boolean)
}

async function processarRestaurante(db: Db, restauranteId: number, force: boolean, prompts: Prompts) {
  const { data: config, error: configErr } = await db
    .from('restaurantes')
    .select('*')
    .eq('id', restauranteId)
    .single()

  if (configErr || !config) return { insights_gerados: 0, status: 'sem_config' }
  if (config.excluida_em) return { insights_gerados: 0, status: 'conta_encerrada' }

  const configInsights = (config.config_insights as Record<string, unknown>) || {}

  // ---- O PORTÃO: quantos feedbacks livres se acumularam ----
  //
  // Não é mais por tempo. A tela de Insights tem um slider que diz ao dono "a
  // análise automática será disparada a cada N novos feedbacks", grava em
  // `config_insights.feedbacks_por_analise` — e nenhuma edge function lia essa
  // chave. O disparo real era `horas_entre_analises`, e o slider não fazia nada.
  //
  // `force` (o botão "Gerar insights") pula o portão, e só ele: a regra de o
  // que vira insight é exatamente a mesma nos dois caminhos.
  if (!force) {
    const { data: gatilho } = await db.rpc('deve_gerar_insights', {
      p_restaurante_id: restauranteId,
    })
    const g = Array.isArray(gatilho) ? gatilho[0] : gatilho
    if (!g?.deve) {
      return {
        insights_gerados: 0,
        status: 'aguardando_feedbacks',
        livres_novos: g?.livres_novos ?? 0,
        necessarios: g?.necessarios ?? 0,
      }
    }
  }

  // O marco avanca AQUI, assim que a rodada comeca de verdade — nao no fim.
  //
  // Ele e a linha de corte que `deve_gerar_insights` usa para contar "livres
  // novos". Avancando so quando ha insight gravado, uma rodada que nao produz
  // nada deixaria os mesmos N feedbacks contando para sempre, e cada feedback
  // seguinte dispararia a analise inteira de novo — IA queimada em loop sobre o
  // mesmo material.
  //
  // Avancar no inicio entrega o comportamento pedido: "se tinha 5 e nao gerou
  // nenhum insight, espera chegar mais 5". E, de quebra, serve de trava contra
  // duas rodadas simultaneas do mesmo restaurante.
  await db
    .from('restaurantes')
    .update({ ultima_analise_insights: new Date().toISOString() })
    .eq('id', restauranteId)

  // NADA é alterado até haver insight pronto para gravar.
  //
  // A primeira versão desativava os não-fixados aqui, porque era a única forma
  // de liberar os pontos deles para a análise. Num teste real a função bateu no
  // limite de 150s e foi MORTA pelo runtime — e como foi morte, não exceção, o
  // rollback do catch nunca rodou: 4 insights desativados, nenhum criado, tela
  // vazia. A função `feedbacks_para_geracao` resolve isso devolvendo os pontos
  // que ESTARIAM livres, sem precisar libertá-los antes.
  {
    // ---- ESTÁGIO 0: assuntos ----
    const expiracaoDias = Number(configInsights.expiracao_feedback_dias ?? 14)

    // Sem teto de quantidade: o dono pediu que TODOS os feedbacks disponíveis e
    // dentro da validade entrem na análise. O corte de custo acontece adiante,
    // no número de assuntos que chegam a ser redigidos.
    const { data: livres, error: erroLivres } = await db.rpc('feedbacks_para_geracao', {
      p_restaurante_id: restauranteId,
      p_dias: expiracaoDias,
    })

    if (erroLivres) {
      return { insights_gerados: 0, status: 'erro_busca', erro: erroLivres.message }
    }
    if (!livres || livres.length === 0) {
      return { insights_gerados: 0, feedbacks_analisados: 0, status: 'sem_feedbacks' }
    }

    const { data: encerrados } = await db
      .from('insights')
      .select('assunto_chave')
      .eq('restaurante_id', restauranteId)
      .not('assunto_chave', 'is', null)
      .gte('desativado_em', new Date(Date.now() - 30 * 86_400_000).toISOString())
    const reincidentes = new Set<string>(
      (encerrados ?? []).map((i: { assunto_chave: string }) => i.assunto_chave),
    )

    const assuntos = agruparEmAssuntos(livres as PontoBruto[], { reincidentes })

    // Quem chega a ser AVALIADO. Este corte NÃO filtra elegibilidade: ela
    // depende da nota que a IA ainda vai dar, e cortar antes pelo léxico
    // descartaria justamente o assunto que o léxico não soube ler — que é a
    // razão de o avaliador existir.
    const paraAvaliar = selecionarParaAvaliar(assuntos, MAX_AVALIACOES)

    if (paraAvaliar.length === 0) {
      return {
        insights_gerados: 0,
        feedbacks_analisados: livres.length,
        assuntos_encontrados: 0,
        status: 'sem_assuntos',
      }
    }

    try {
      await checarCota(db, restauranteId)
    } catch (e) {
      if (e instanceof ErroCota) return { insights_gerados: 0, status: 'sem_credito' }
      throw e
    }

    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 1200 })
    if (!params) {
      return { insights_gerados: 0, status: 'agente_desativado' }
    }
    const paramsVerificador = await paramsDoAgente(db, AGENTE_VERIFICADOR, { max_tokens: 600 })
    const paramsAvaliador = await paramsDoAgente(db, AGENTE_AVALIADOR, { max_tokens: 400 })

    // Conhecimento (RAG) e memórias são buscados UMA vez por rodada: o embedding
    // é caro e o material não muda de assunto para assunto.
    const consulta = paraAvaliar
      .map((a) => `${a.categoria}: ${a.pontos.map((p) => p.texto).join(' ')}`)
      .join('\n')
      .slice(0, 3500)
    const [conhecimento, memorias] = await Promise.all([
      buscarConhecimento(db, restauranteId, consulta),
      buscarMemorias(db, restauranteId),
    ])

    const ctx = {
      restauranteId,
      prompts,
      config,
      conhecimento,
      memorias,
      params,
      paramsVerificador,
      paramsAvaliador,
    }

    // ---- ESTÁGIO 0b: a IA dá a nota de cada assunto ----
    // Barato (400 tokens, sem ferramenta) e paralelo. É o que traz o perfil, as
    // anotações e os documentos do dono para dentro da DECISÃO — antes disto a
    // importância saía de um dicionário de palavras que não sabia nada sobre
    // este restaurante em particular.
    const avaliados = await emParalelo(paraAvaliar, CONCORRENCIA, async (assunto) => {
      const av = await avaliarImportancia(db, ctx, assunto)
      return {
        ...assunto,
        nota: av.nota,
        notaIA: av.notaIA,
        justificativaNota: av.justificativa,
        pisoAplicado: av.pisoAplicado,
        pessoasNecessarias: pessoasNecessariasPorNota(av.nota),
        elegivel: assuntoElegivelPorNota(av.nota, assunto.pessoas),
        score: pontuarPorNota({
          nota: av.nota,
          pessoas: assunto.pessoas,
          positivos: assunto.positivosDoTema,
          diasDesdeMaisRecente: assunto.diasDesdeMaisRecente,
          reincidente: reincidentes.has(assunto.chave),
        }),
      }
    })

    // Log de diagnóstico. Sem isto, "por que este assunto não virou insight?"
    // não tem resposta: a nota vive só na memória da invocação.
    console.log(
      `[r${restauranteId}] avaliados:\n` +
        avaliados
          .sort((a, b) => b.score - a.score)
          .map((a) =>
            `  ${a.elegivel ? 'OK ' : '-- '} nota ${String(a.nota).padStart(4)} ` +
            `pessoas ${a.pessoas}/${a.pessoasNecessarias} ` +
            `score ${a.score.toFixed(2)} ${a.chave}`
          )
          .join('\n'),
    )

    // Agora sim: só os que atingiram o limiar que a PRÓPRIA nota deles exige,
    // reordenados por ela.
    const candidatos = avaliados
      .filter((a) => a.elegivel)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATOS)

    if (candidatos.length === 0) {
      return {
        insights_gerados: 0,
        feedbacks_analisados: livres.length,
        assuntos_encontrados: assuntos.length,
        assuntos_avaliados: avaliados.length,
        // Não é portão de contagem: nenhum assunto reuniu o número de pessoas
        // que a nota dele exige.
        status: 'nenhum_assunto_relevante',
        detalhe: avaliados.slice(0, 5).map((a) => ({
          assunto: a.chave,
          nota: a.nota,
          pessoas: a.pessoas,
          precisa: a.pessoasNecessarias,
        })),
      }
    }

    // ---- ESTÁGIOS 1-3, vários assuntos ao mesmo tempo ----
    // Sequencial estourava os 150s da edge function. Como cada assunto tem a
    // própria conversa isolada, rodar em paralelo não muda o resultado.
    const resultados = await emParalelo(candidatos, CONCORRENCIA, async (assunto) => {
      try {
        const insight = await gerarInsightDoAssunto(db, { ...ctx, assunto }, assunto)
        return { assunto, insight }
      } catch (err) {
        console.error(`[${assunto.chave}] falha ao gerar:`, err)
        return { assunto, insight: null }
      }
    })

    // Os candidatos já vêm ordenados por nota, então cortar em MAX_INSIGHTS
    // aqui mantém os assuntos mais relevantes.
    const aprovados = resultados
      .filter((r): r is typeof r & { insight: NonNullable<typeof r.insight> } => !!r.insight)
      .slice(0, MAX_INSIGHTS)
    const descartados = resultados.length - aprovados.length

    if (aprovados.length === 0) {
      // Nada aprovado e NADA foi alterado até aqui: os insights antigos seguem
      // na tela. O dono clicou "gerar" e não recebeu nada — o que ele já tinha
      // continua valendo mais que uma lista vazia.
      return {
        insights_gerados: 0,
        feedbacks_analisados: livres.length,
        assuntos_encontrados: assuntos.length,
        candidatos: candidatos.length,
        descartados,
        status: 'nenhum_insight_aprovado',
      }
    }

    // ---- ESTÁGIO 3b: feedbacks invalidados por exclusão manual, pra religar ----
    //
    // Um assunto que já teve insight excluído pelo dono não pode gerar insight
    // sozinho de novo (por isso `feedbacks_para_geracao`/`feedbacks_livres` os
    // exclui do agrupamento acima) — mas se ele voltar por conta de feedback
    // NOVO e válido, o relato antigo entra junto: é o que mantém alcançável
    // pelo motor de resposta o cliente que reclamou daquela vez. Ver
    // `20260902000000_feedback_invalidado_por_exclusao.sql`.
    //
    // Buscado uma vez só, fora do loop de assuntos: mesmo restaurante para
    // todos os aprovados desta rodada.
    const { data: invalidados } = await db
      .from('feedbacks_restaurante')
      .select('id, origem_id, tema_id, categoria, sentimento, created_at')
      .eq('restaurante_id', restauranteId)
      .not('invalidado_em', 'is', null)

    // ---- ESTÁGIO 4: substituir e gravar ----
    // Só agora os antigos saem de cena, com o substituto pronto na mão. Precisa
    // vir ANTES do insert: o trigger de vínculo usa `coalesce(usado_por_insight_id,
    // novo)`, então um ponto ainda preso pelo insight velho ficaria marcado com
    // o dono errado.
    await db
      .from('insights')
      .update({
        ativo: false,
        desativado_em: new Date().toISOString(),
        motivo_encerramento: 'substituido',
      })
      .eq('restaurante_id', restauranteId)
      .eq('ativo', true)
      .is('deletado_em', null)
      .or('fixado.is.null,fixado.eq.false')

    let gravados = 0
    for (const { assunto, insight } of aprovados) {
      // Nota 10 é sempre urgente, doa a quem doer: é a regra que não pode ficar
      // a critério do modelo. A nota já passou pelo piso do léxico, então um
      // relato sanitário chega aqui com 10 mesmo que a IA tenha subestimado.
      const prioridade = assunto.nota >= 10
        ? 'URGENTE'
        : (insight.prioridade || (assunto.nota >= 7.5 ? 'IMPORTANTE' : 'OBSERVACAO'))

      // A categoria sai dos FEEDBACKS, não da opinião da IA.
      //
      // É a categoria mais frequente entre os pontos ligados ao insight —
      // quase sempre todos têm a mesma, e quando divergem a maioria decide.
      // Antes valia o que a IA escrevesse, e ela às vezes classificava o
      // insight numa categoria que nenhum dos feedbacks dele tinha; o número
      // do filtro (que conta feedback) então não batia com o insight listado.
      //
      // Empate resolve pela ordem oficial da paleta, para dar sempre o mesmo
      // resultado com o mesmo conjunto de pontos.
      const votos = new Map<string, number>()
      for (const p of assunto.pontos) {
        if (p.categoria) votos.set(p.categoria, (votos.get(p.categoria) ?? 0) + 1)
      }
      let categoria = assunto.categoria ?? 'Outros'
      let maisVotos = 0
      for (const nome of CATEGORIAS) {
        const v = votos.get(nome) ?? 0
        if (v > maisVotos) {
          maisVotos = v
          categoria = nome
        }
      }

      const { data: novo, error: erroInsert } = await db
        .from('insights')
        .insert({
          restaurante_id: restauranteId,
          prioridade,
          categoria,
          titulo: insight.titulo,
          descricao: insight.descricao ?? '',
          sugestao: insight.sugestao ?? '',
          assunto_chave: assunto.chave,
          feedbacks_relacionados: assunto.pontos.length,
          // Compatibilidade: código antigo ainda lê este array. O vínculo que
          // vale é `insight_feedback`, gravado logo abaixo.
          feedback_ids: [...new Set(assunto.pontos.map((p) => p.origem_id).filter(Boolean))],
          gerado_por: 'ia',
          ativo: true,
        })
        .select('id')
        .single()

      if (erroInsert || !novo) {
        console.error(`[${assunto.chave}] falha ao inserir:`, erroInsert)
        continue
      }

      // TODOS os pontos do assunto entram no vínculo — não só os que a IA
      // citou. Era o pedido explícito do dono, e é o que faz a contagem da
      // tela bater com o que a telinha lista.
      const { error: erroVinculo } = await db.from('insight_feedback').insert(
        assunto.pontos.map((p) => ({
          insight_id: novo.id,
          feedback_restaurante_id: p.id,
          feedback_original_id: p.origem_id,
          restaurante_id: restauranteId,
          origem: 'geracao',
        })),
      )
      if (erroVinculo) console.error(`[${assunto.chave}] falha ao vincular:`, erroVinculo)

      // Do mesmo assunto, mas invalidados por uma exclusão manual anterior —
      // não dispararam esta rodada (excluídos de `feedbacks_livres`), mas o
      // insight que nasce agora sobre o mesmo assunto os representa também.
      // `chaveDoAssunto` usa a MESMA regra de agrupamento do estágio 0, então
      // a comparação é exata, não uma aproximação por categoria.
      const reaproveitados = (invalidados ?? []).filter((p) => chaveDoAssunto(p) === assunto.chave)
      if (reaproveitados.length > 0) {
        const { error: erroReaproveitar } = await db.from('insight_feedback').insert(
          reaproveitados.map((p) => ({
            insight_id: novo.id,
            feedback_restaurante_id: p.id,
            feedback_original_id: p.origem_id,
            restaurante_id: restauranteId,
            origem: 'reaproveitado',
          })),
        )
        if (erroReaproveitar) console.error(`[${assunto.chave}] falha ao reaproveitar:`, erroReaproveitar)
      }

      gravados++
    }

    // Fecha a rodada reconstruindo o cache de uso a partir dos vínculos.
    //
    // Não é paranoia: nesta rodada os pontos passaram por desativação (que
    // libera) e por vínculo novo (que prende), em triggers separados e nesta
    // ordem. Se qualquer insert de vínculo falhar no meio, `usado_em` fica
    // descrevendo um estado que não existe mais — e um ponto preso por um
    // insight morto some da análise para sempre. Uma chamada resolve.
    const { error: erroReconciliar } = await db.rpc('reconciliar_uso_feedbacks', {
      p_restaurante_id: restauranteId,
    })
    if (erroReconciliar) console.error('Falha ao reconciliar uso:', erroReconciliar)

    // O insight NAO vira acao sozinho.
    //
    // Aqui existia um `invoke('sugerir-acoes')` sem filtro de insight, e o
    // efeito era que todo insight recem-criado virava acao em segundos: o
    // `sugerir-acoes` converte TODOS os insights ativos do restaurante quando
    // chamado sem `insight_id`. Na pratica o dono nunca via um insight na tela
    // — ele nascia e era encerrado com motivo 'virou_acao' antes do primeiro
    // refresh. Medido em 2026-08-28: dois insights criados as 22:08:44 e
    // encerrados as 22:08:53 e 22:08:56.
    //
    // Quem decide que um insight vira acao e o dono, clicando em "Criar Acao"
    // — e ai o `sugerir-acoes` e chamado com o `insight_id` daquele card.

    return {
      insights_gerados: gravados,
      feedbacks_analisados: livres.length,
      assuntos_encontrados: assuntos.length,
      candidatos: candidatos.length,
      descartados,
      status: 'sucesso',
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const force = body?.force ?? false

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    })

    if (!Deno.env.get('OPENROUTER_API_KEY')) throw new Error('OPENROUTER_API_KEY nao configurada.')

    const prompts = await carregarPrompts(db)

    const cronSecret = Deno.env.get('CRON_SECRET')
    const providedSecret = req.headers.get('x-cron-secret')

    if (providedSecret) {
      if (!cronSecret || providedSecret !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Segredo de cron invalido.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // `restaurante_id` no corpo restringe a rodada a um só. É o que o disparo
      // em cadeia usa (o feedback que acabou de ficar livre sabe de quem é), e
      // o que permite testar sem processar a base inteira dentro dos 150s.
      let consulta = db.from('restaurantes').select('id').is('excluida_em', null)
      if (body?.restaurante_id) consulta = consulta.eq('id', body.restaurante_id)
      const { data: restaurantes, error: restErr } = await consulta
      if (restErr) throw restErr

      let total = 0
      let processados = 0
      for (const r of restaurantes ?? []) {
        // Respeita o `force` do corpo. O cron de verdade manda false, entao
        // para ele nada muda; e o que permite forcar uma rodada de teste sem
        // esperar o intervalo.
        const res = await processarRestaurante(db, r.id, force, prompts)
        total += res.insights_gerados ?? 0
        processados += 1
      }
      return new Response(
        JSON.stringify({ modo: 'cron', restaurantes_processados: processados, insights_gerados: total }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Modo manual: o restaurante vem do usuário autenticado, nunca do body.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Nao autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: rest } = await db
      .from('restaurantes')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!rest?.id) {
      return new Response(JSON.stringify({ error: 'Restaurante nao encontrado para este usuario.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await processarRestaurante(db, rest.id, force, prompts)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
