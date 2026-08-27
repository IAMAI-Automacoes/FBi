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
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { carregarPrompts, montarPrompt, type Prompts } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, checarCota, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, buscarConhecimento, nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'
import { agruparEmAssuntos, selecionarCandidatos, type Assunto, type PontoBruto } from '../_shared/assuntos.ts'
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

/** Teto de insights por rodada — pedido explícito do dono. */
const MAX_INSIGHTS = 5
/**
 * Assuntos que chegam a ser redigidos. Acima do teto de insights de propósito:
 * a verificação descarta alguns, e sobrar candidato é melhor que devolver menos
 * do que daria. Também é o que mantém o custo previsível — sem teto, 300 pontos
 * livres virariam ~40 assuntos e ~80 chamadas de modelo.
 */
const MAX_CANDIDATOS = 8

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
Gravidade calculada pelo sistema: {gravidade} de 4 — {explicacao_gravidade}
{termos_gravidade}
Pessoas diferentes que relataram: {pessoas} (o minimo para esta gravidade e {mininimo})
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
    assunto: Assunto
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
    gravidade: String(assunto.gravidade),
    explicacao_gravidade: EXPLICACAO_GRAVIDADE[assunto.gravidade] ?? '',
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
    assunto: Assunto
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
async function gerarInsightDoAssunto(db: Db, ctx: any, assunto: Assunto) {
  const textosIrmaos = await buscarTextosIrmaos(db, assunto)
  const vocabulario = construirVocabularioProibido(
    assunto.pontos.map((p) => p.texto),
    textosIrmaos,
  )

  let reparo: { rascunhoAnterior: unknown; critica: string } | undefined

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const rascunho = await redigirInsight(db, { ...ctx, assunto }, reparo)

    if (rascunho?.gerar === false) return null
    if (!rascunho?.titulo) return null

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
  const horasEntreAnalises = Number(configInsights.horas_entre_analises) || 24
  const ultimaAnalise = config.ultima_analise_insights
    ? new Date(config.ultima_analise_insights)
    : null

  // O intervalo agora é FREIO DE CRON, não portão de geração. O botão manual
  // (`force`) ignora — o dono pediu para gerar, gera. Sem esta distinção, o
  // cron gastaria IA a cada 5 minutos.
  if (!force && ultimaAnalise) {
    const horas = (Date.now() - ultimaAnalise.getTime()) / 3_600_000
    if (horas < horasEntreAnalises) {
      return { insights_gerados: 0, status: 'aguardando_intervalo' }
    }
  }

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
    const candidatos = selecionarCandidatos(assuntos, MAX_CANDIDATOS)

    if (candidatos.length === 0) {
      return {
        insights_gerados: 0,
        feedbacks_analisados: livres.length,
        assuntos_encontrados: assuntos.length,
        // Não é um portão: nenhum assunto atingiu o próprio limiar de pessoas.
        status: 'nenhum_assunto_relevante',
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

    // Conhecimento (RAG) é buscado UMA vez para a rodada: é caro (embedding) e
    // o material de referência não muda de assunto para assunto.
    const consulta = candidatos
      .map((a) => `${a.categoria}: ${a.pontos.map((p) => p.texto).join(' ')}`)
      .join('\n')
      .slice(0, 3500)
    const conhecimento = await buscarConhecimento(db, restauranteId, consulta)

    const ctx = { restauranteId, prompts, config, conhecimento, params, paramsVerificador }

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
      .filter((r): r is { assunto: Assunto; insight: any } => !!r.insight)
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
      // Gravidade 4 é sempre urgente, doa a quem doer: é a regra que não pode
      // ficar a critério do modelo.
      const prioridade = assunto.gravidade >= 4
        ? 'URGENTE'
        : (insight.prioridade || (assunto.gravidade >= 3 ? 'IMPORTANTE' : 'OBSERVACAO'))

      const categoria = CATEGORIAS.includes(insight.categoria)
        ? insight.categoria
        : (assunto.categoria ?? 'Outros')

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

    await db
      .from('restaurantes')
      .update({ ultima_analise_insights: new Date().toISOString() })
      .eq('id', restauranteId)

    try {
      await db.functions.invoke('sugerir-acoes', { body: { restaurante_id: restauranteId } })
    } catch (e) {
      console.error('Falha ao disparar sugerir-acoes:', e)
    }

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

serve(async (req: Request) => {
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
      const { data: restaurantes, error: restErr } = await db
        .from('restaurantes')
        .select('id')
        .is('excluida_em', null)
      if (restErr) throw restErr

      let total = 0
      let processados = 0
      for (const r of restaurantes ?? []) {
        const res = await processarRestaurante(db, r.id, false, prompts)
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
