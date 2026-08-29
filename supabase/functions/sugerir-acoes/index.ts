/**
 * Insight vira ação.
 *
 * ## O que muda em relação à versão anterior
 *
 * - **O insight some da lista, mas não do banco.** Antes ele continuava ativo
 *   depois de virar ação, então o card ficava na tela e um segundo clique
 *   criava uma segunda ação do mesmo insight. Agora ele é desativado com
 *   `motivo_encerramento = 'virou_acao'` e guarda o id da ação que virou.
 *
 * - **Os vínculos são transferidos, não recriados.** Todos os pontos do insight
 *   passam para a ação (sem teto), pelo trigger `vincular_feedbacks_da_acao`.
 *
 * - **Re-varredura.** Entre o insight nascer e o dono clicar "criar ação" pode
 *   ter chegado feedback novo sobre o MESMO assunto. Esses são procurados e
 *   entram na ação também — senão o cliente que reclamou depois nunca seria
 *   avisado de que o problema dele foi tratado.
 *
 * - **Isolamento por ação.** Uma invocação de IA por insight, com histórico
 *   zerado, e as mesmas três camadas anti-contaminação do gerador.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt, type Prompts } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import {
  blocoPerfil,
  buscarConhecimento,
  buscarMemorias,
  nomeDoAssistente,
  tomDoAssistente,
} from '../_shared/perfil.ts'
import { construirVocabularioProibido, detectarVazamento } from '../_shared/anti-vazamento.ts'
import { ferramentaLerOriginal, ferramentaListarPontos } from '../_shared/ferramentas-feedback.ts'
import type { PontoDoAssunto } from '../_shared/assuntos.ts'

const AGENTE = 'sugeridor_acoes'
const AGENTE_VERIFICADOR = 'verificador_acoes'

const CATEGORIAS = [
  'Comida', 'Bebidas', 'Atendimento', 'Ambiente', 'Limpeza', 'Preço',
  'Tempo de Espera', 'Reserva', 'Estacionamento', 'Acessibilidade',
  'Música/Som', 'Cardápio/Variedade', 'Higiene', 'Outros',
]

/** Quantos insights o ciclo automático converte de uma vez. */
const MAX_ACOES_CICLO = 3
/** Insights convertidos em paralelo (150s de teto na edge function). */
const CONCORRENCIA = 3

const PROMPT_REDATOR = `Voce e o "{nome}", consultor especialista em gestao de restaurantes.
Sua tarefa: transformar UM insight em uma acao operacional que a equipe consiga executar.

{tom}

## Sobre este restaurante
{perfil}

## O que ja sabemos sobre este restaurante
{memorias}
{conhecimento}

## O insight a resolver
Prioridade: {prioridade}
Categoria: {categoria}
Titulo: {titulo}
Descricao: {descricao}
Sugestao inicial: {sugestao}

## Os feedbacks que originaram este insight — sua UNICA fonte de fatos
{pontos}

## Regras
- A acao resolve ESTE problema e mais nada. Se os feedbacks falam de demora, a
  acao e sobre demora — nao sobre comida, nem sobre ambiente, ainda que voce
  veja esses assuntos ao ler uma mensagem original.
- "plano_detalhado": passos praticos e verificaveis, adaptados a ESTE
  restaurante (porte, equipe, tipo de cozinha, publico do perfil acima). Quem
  faz, o que faz, e como saber que funcionou. Nada de "melhore o atendimento".
- Use ler_original quando precisar entender a gravidade ou o contexto real do
  relato. A mensagem tera outros assuntos: eles NAO entram na acao.
- Use listar_pontos para reler os feedbacks a qualquer momento.
- Herde a prioridade do insight, salvo se os feedbacks mostrarem algo mais
  grave do que o insight registrou.
- Escreva em portugues do Brasil, direto.

Chame registrar_acao com o resultado.`

const PROMPT_VERIFICADOR = `Voce revisa se uma acao operacional corresponde ao problema que a originou.

## Os feedbacks — a UNICA fonte de fatos
{pontos}

## O insight
{titulo} — {descricao}

## A acao redigida
Titulo: {titulo_acao}
Plano: {plano}

## Sua tarefa
Reprove se:
- A acao ataca um problema DIFERENTE do que os feedbacks e o insight descrevem.
  Trocar o objeto e erro mesmo dentro da mesma categoria: "espera pela comida" e
  "espera por mesa" sao problemas distintos, com causas e solucoes distintas.
- O plano cita fato, numero, lugar ou pessoa que nao esta nos feedbacks.
- O plano trata de assunto que aparece de raspao numa mensagem do cliente mas
  nao e o tema do insight.

NAO reprove por:
- O plano propor medidas que nao estao nos feedbacks — isso e o esperado, o
  plano e uma proposta de solucao.
- Estilo, tamanho ou tom.

Chame registrar_verificacao.`

const SCHEMA_ACAO = {
  type: 'object',
  properties: {
    titulo_acao: { type: 'string', description: 'O que precisa ser feito, curto e claro.' },
    plano_detalhado: { type: 'string', description: 'Passos praticos, com responsavel e criterio de conclusao.' },
    prioridade: { type: 'string', enum: ['URGENTE', 'IMPORTANTE', 'OBSERVACAO'] },
    categoria: { type: 'string', enum: CATEGORIAS },
  },
  required: ['titulo_acao', 'plano_detalhado'],
}

const SCHEMA_VERIFICACAO = {
  type: 'object',
  properties: {
    aprovado: { type: 'boolean' },
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { afirmacao: { type: 'string' }, motivo: { type: 'string' } },
      },
    },
  },
  required: ['aprovado'],
}

// deno-lint-ignore no-explicit-any
type Db = any

async function emParalelo<T, R>(itens: T[], limite: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let proximo = 0
  async function trabalhador() {
    for (;;) {
      const i = proximo++
      if (i >= itens.length) return
      saida[i] = await fn(itens[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador()))
  return saida
}

/** Os pontos que já estão ligados ao insight, com o texto. */
async function pontosDoInsight(db: Db, insightId: string): Promise<PontoDoAssunto[]> {
  const { data } = await db
    .from('insight_feedback')
    .select('feedbacks_restaurante(id, texto_original, resumo, categoria, sentimento, origem_id, created_at)')
    .eq('insight_id', insightId)

  return (data ?? [])
    // deno-lint-ignore no-explicit-any
    .map((l: any) => l.feedbacks_restaurante)
    .filter(Boolean)
    // deno-lint-ignore no-explicit-any
    .map((f: any) => ({
      id: f.id,
      texto: f.texto_original || f.resumo || '',
      categoria: f.categoria,
      sentimento: f.sentimento,
      origem_id: f.origem_id,
      created_at: f.created_at,
    }))
}

/**
 * Feedbacks do MESMO assunto que chegaram depois do insight nascer.
 *
 * A busca é determinística, sem IA: `assunto_chave` guarda exatamente o
 * critério de agrupamento que criou o insight (`tema:<uuid>|neg`), então
 * procurar pontos livres com o mesmo tema e o mesmo balde de sentimento
 * devolve, por construção, o mesmo assunto. Pedir para a IA julgar isso seria
 * gastar uma chamada para reproduzir uma decisão que já está tomada.
 */
async function pontosNovosDoAssunto(
  db: Db,
  restauranteId: number,
  assuntoChave: string | null,
  expiracaoDias: number,
  jaLigados: Set<number>,
): Promise<PontoDoAssunto[]> {
  if (!assuntoChave?.startsWith('tema:')) return []

  const [temaParte, balde] = assuntoChave.slice('tema:'.length).split('|')
  if (!temaParte) return []

  const limite = new Date(Date.now() - expiracaoDias * 86_400_000).toISOString()
  const { data } = await db
    .from('feedbacks_livres')
    .select('id, texto_original, resumo, categoria, sentimento, origem_id, created_at')
    .eq('restaurante_id', restauranteId)
    .eq('tema_id', temaParte)
    .gte('created_at', limite)

  // deno-lint-ignore no-explicit-any
  return (data ?? [])
    .filter((f: any) => !jaLigados.has(f.id))
    .filter((f: any) => {
      const negativo = (f.sentimento || '').toLowerCase().includes('negativ')
      return balde === 'neg' ? negativo : !negativo
    })
    .map((f: any) => ({
      id: f.id,
      texto: f.texto_original || f.resumo || '',
      categoria: f.categoria,
      sentimento: f.sentimento,
      origem_id: f.origem_id,
      created_at: f.created_at,
    }))
    .filter((p: PontoDoAssunto) => p.texto.trim().length > 0)
}

/** Textos dos pontos irmãos — a matéria-prima do detector de vazamento. */
async function textosIrmaos(db: Db, pontos: PontoDoAssunto[]): Promise<string[]> {
  const origens = [...new Set(pontos.map((p) => p.origem_id).filter(Boolean))]
  if (origens.length === 0) return []
  const doAssunto = new Set(pontos.map((p) => p.id))

  const { data } = await db
    .from('feedbacks_restaurante')
    .select('id, texto_original, resumo')
    .in('origem_id', origens)

  // deno-lint-ignore no-explicit-any
  return (data ?? [])
    .filter((f: any) => !doAssunto.has(f.id))
    .map((f: any) => f.texto_original || f.resumo || '')
    .filter(Boolean)
}

function listarParaPrompt(pontos: PontoDoAssunto[]): string {
  return pontos.map((p) => `- id ${p.id} [${p.sentimento ?? '?'}]: "${p.texto}"`).join('\n')
}

/** Estágios 1-3 de UM insight. Devolve a ação aprovada, ou null. */
async function redigirAcao(
  db: Db,
  // deno-lint-ignore no-explicit-any
  ctx: any,
  // deno-lint-ignore no-explicit-any
  insight: any,
  pontos: PontoDoAssunto[],
) {
  const vocabulario = construirVocabularioProibido(
    pontos.map((p) => p.texto),
    await textosIrmaos(db, pontos),
  )

  let reparo: { anterior: unknown; critica: string } | undefined

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const prompt = montarPrompt(ctx.prompts, 'ef_sugerir_acoes', PROMPT_REDATOR, {
      nome: nomeDoAssistente(ctx.config?.mascote_config),
      tom: tomDoAssistente(ctx.config?.mascote_config),
      perfil: blocoPerfil(ctx.config),
      memorias: ctx.memorias || '(nenhuma anotacao registrada ainda)',
      conhecimento: ctx.conhecimento ? `\n## Boas praticas de referencia\n${ctx.conhecimento}` : '',
      prioridade: insight.prioridade ?? 'IMPORTANTE',
      categoria: insight.categoria ?? 'Outros',
      titulo: insight.titulo ?? '',
      descricao: insight.descricao ?? '',
      sugestao: insight.sugestao ?? '',
      pontos: listarParaPrompt(pontos),
    })

    const mensagens: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: prompt },
    ]
    if (reparo) {
      // Turno de assistente entre as duas mensagens de usuário: sem ele o
      // modelo trata a crítica como assunto novo (bug já visto no gerador,
      // que produziu um insight intitulado "Afirmações sem lastro").
      mensagens.push({ role: 'assistant', content: JSON.stringify(reparo.anterior) })
      mensagens.push({
        role: 'user',
        content:
          `Sua resposta anterior foi REPROVADA na revisao. Motivo: ${reparo.critica}\n\n` +
          'Reescreva a acao para o MESMO problema descrito no inicio, corrigindo apenas o ' +
          'apontado. Esta mensagem e uma critica ao seu texto, nao um assunto novo.',
      })
    }

    const { result: rascunho } = await chamarIA(db, {
      messages: mensagens,
      params: ctx.params,
      origem: 'sugerir-acoes',
      restauranteId: ctx.restauranteId,
      agenteId: AGENTE,
      checarCotaAntes: false,
      ferramentas: [ferramentaLerOriginal(db, pontos), ferramentaListarPontos(pontos)],
      saida: {
        nome: 'registrar_acao',
        descricao: 'Registra a acao operacional que resolve este insight.',
        schema: SCHEMA_ACAO,
      },
    })

    if (!rascunho?.titulo_acao) return null

    const texto = [rascunho.titulo_acao, rascunho.plano_detalhado].filter(Boolean).join(' ')
    const vazamento = detectarVazamento(texto, vocabulario)
    if (vazamento.nivel === 'vazou') {
      if (tentativa === 1) {
        console.warn(`[acao/${insight.id}] descartada: vazamento persistente`, vazamento)
        return null
      }
      reparo = {
        anterior: rascunho,
        critica:
          'o texto usou conteudo de OUTRO assunto da mesma mensagem do cliente. Termos: ' +
          [...vazamento.trigramas, ...vazamento.tokens].join(', '),
      }
      continue
    }

    const promptVerif = montarPrompt(ctx.prompts, 'ef_verificar_acao', PROMPT_VERIFICADOR, {
      pontos: listarParaPrompt(pontos),
      titulo: insight.titulo ?? '',
      descricao: insight.descricao ?? '',
      titulo_acao: rascunho.titulo_acao,
      plano: rascunho.plano_detalhado ?? '',
    })

    const { result: veredito } = await chamarIA(db, {
      messages: [{ role: 'user', content: promptVerif }],
      params: ctx.paramsVerificador,
      origem: 'sugerir-acoes-verificador',
      restauranteId: ctx.restauranteId,
      agenteId: AGENTE_VERIFICADOR,
      checarCotaAntes: false,
      calculadora: false,
      saida: {
        nome: 'registrar_verificacao',
        descricao: 'Registra o resultado da revisao.',
        schema: SCHEMA_VERIFICACAO,
      },
    })

    if (veredito?.aprovado !== false) return rascunho

    if (tentativa === 1) {
      console.warn(`[acao/${insight.id}] descartada: sem lastro`, veredito.problemas)
      return null
    }
    reparo = {
      anterior: rascunho,
      critica:
        'a acao nao corresponde ao problema — ' +
        // deno-lint-ignore no-explicit-any
        (veredito.problemas ?? []).map((p: any) => `"${p.afirmacao}" (${p.motivo})`).join('; '),
    }
  }

  return null
}

/** Converte UM insight em ação, do começo ao fim. */
// deno-lint-ignore no-explicit-any
async function converterInsight(db: Db, ctx: any, insight: any) {
  const ligados = await pontosDoInsight(db, insight.id)

  // Re-varredura: o que chegou depois do insight nascer entra também.
  const novos = await pontosNovosDoAssunto(
    db,
    ctx.restauranteId,
    insight.assunto_chave,
    ctx.expiracaoDias,
    new Set(ligados.map((p) => p.id)),
  )

  const pontos = [...ligados, ...novos]
  if (pontos.length === 0) {
    console.warn(`[acao/${insight.id}] insight sem pontos ligados; convertendo sem vinculo`)
  }

  const rascunho = await redigirAcao(db, ctx, insight, pontos)
  if (!rascunho) return { criada: false, novos: 0 }

  // A prioridade do insight já embute a regra de gravidade (G4 vira URGENTE na
  // geração), então ela é o piso: a IA pode subir, nunca baixar.
  const peso: Record<string, number> = { URGENTE: 3, IMPORTANTE: 2, OBSERVACAO: 1 }
  const doInsight = insight.prioridade ?? 'IMPORTANTE'
  const daIA = rascunho.prioridade
  const prioridade = daIA && (peso[daIA] ?? 0) > (peso[doInsight] ?? 0) ? daIA : doInsight
  const categoria = CATEGORIAS.includes(rascunho.categoria)
    ? rascunho.categoria
    : (insight.categoria ?? 'Outros')

  // A ação nasce com `insight_id`: é o que faz o trigger
  // `vincular_feedbacks_da_acao` copiar TODOS os pontos do insight para
  // `feedback_acao` sozinho, sem teto.
  const { data: acao, error: erroAcao } = await db
    .from('acoes_operacionais')
    .insert({
      titulo_acao: rascunho.titulo_acao,
      plano_detalhado: rascunho.plano_detalhado ?? '',
      prioridade,
      categoria,
      status: 'PENDENTE',
      restaurante_id: ctx.restauranteId,
      insight_id: insight.id,
      texto: 'Gerada a partir de um insight, com os feedbacks de origem vinculados.',
    })
    .select('id')
    .single()

  if (erroAcao || !acao) {
    console.error(`[acao/${insight.id}] falha ao inserir:`, erroAcao)
    return { criada: false, novos: 0 }
  }

  // Os pontos NOVOS (da re-varredura) não estão em `insight_feedback`, então o
  // trigger não os pega — vão direto para o vínculo da ação.
  if (novos.length > 0) {
    const { error } = await db.from('feedback_acao').insert(
      novos.map((p) => ({
        acao_id: acao.id,
        feedback_restaurante_id: p.id,
        feedback_original_id: p.origem_id,
        restaurante_id: ctx.restauranteId,
      })),
    )
    if (error) console.error(`[acao/${insight.id}] falha ao vincular novos:`, error)
  }

  // O insight sai de cena guardando o que ele virou. Nunca é apagado.
  const { error: erroEncerra } = await db
    .from('insights')
    .update({
      ativo: false,
      desativado_em: new Date().toISOString(),
      motivo_encerramento: 'virou_acao',
      acao_id: acao.id,
    })
    .eq('id', insight.id)
  if (erroEncerra) console.error(`[acao/${insight.id}] falha ao encerrar insight:`, erroEncerra)

  return { criada: true, novos: novos.length, acao_id: acao.id }
}

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const restauranteId = body.restaurante_id
    // Com `insight_id`, é o dono clicando "Criar Ação" naquele insight.
    const insightSolicitado: string | undefined = body.insight_id

    if (!restauranteId) return json({ error: 'restaurante_id é obrigatório' }, 400)

    const db = clienteAdmin()

    const { data: config } = await db
      .from('restaurantes')
      .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante, config_insights, mascote_config')
      .eq('id', restauranteId)
      .single()

    const configInsights = (config?.config_insights as Record<string, unknown>) || {}
    const expiracaoDias = Number(configInsights.expiracao_feedback_dias ?? 14)

    let query = db
      .from('insights')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .eq('ativo', true)
      .is('deletado_em', null)

    if (insightSolicitado) query = query.eq('id', insightSolicitado)

    const { data: insights, error: erroInsights } = await query
    if (erroInsights) throw erroInsights
    if (!insights || insights.length === 0) {
      return json({ status: 'sem_insights', acoes_criadas: 0 })
    }

    // Idempotência: um insight que já virou ação não vira de novo. Sem isto,
    // um duplo clique no botão criava duas ações do mesmo insight.
    // deno-lint-ignore no-explicit-any
    const pendentes = insights.filter((i: any) => !i.acao_id)
    if (pendentes.length === 0) {
      return json({ status: 'ja_convertido', acoes_criadas: 0 })
    }

    const peso: Record<string, number> = { URGENTE: 3, IMPORTANTE: 2, OBSERVACAO: 1 }
    // deno-lint-ignore no-explicit-any
    const ordenados = pendentes.sort((a: any, b: any) =>
      (peso[b.prioridade?.toUpperCase()] || 0) - (peso[a.prioridade?.toUpperCase()] || 0)
    )
    const alvos = insightSolicitado ? ordenados : ordenados.slice(0, MAX_ACOES_CICLO)

    // Busca na web ligada, como no `gerar-plano-acao`: esta funcao escreve o
    // plano que a equipe vai EXECUTAR, e quando o assunto tem norma estabelecida
    // (temperatura segura, prazo de validade, exigencia sanitaria) o numero
    // precisa ser o real. O admin desliga no painel se o custo nao compensar.
    const params = await paramsDoAgente(db, AGENTE, {
      max_tokens: 1600,
      web: true,
      web_max_results: 3,
    })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)
    const paramsVerificador = await paramsDoAgente(db, AGENTE_VERIFICADOR, { max_tokens: 600 })

    const prompts = await carregarPrompts(db)

    // Perfil, documentos de treinamento E as anotações do assistente. As
    // memórias entram porque é nelas que fica o que o dono já tentou, o que ele
    // valoriza e o que não funciona neste restaurante — escrever um plano de
    // ação sem isso produz conselho genérico.
    const [conhecimento, memorias] = await Promise.all([
      buscarConhecimento(
        db,
        restauranteId,
        // deno-lint-ignore no-explicit-any
        alvos.map((i: any) => `${i.categoria}: ${i.titulo}. ${i.descricao}`).join('\n').slice(0, 3500),
      ),
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
      expiracaoDias,
    }

    const resultados = await emParalelo(alvos, CONCORRENCIA, async (insight) => {
      try {
        return await converterInsight(db, ctx, insight)
      } catch (err) {
        if (err instanceof ErroCota) throw err
        // deno-lint-ignore no-explicit-any
        console.error(`[acao/${(insight as any).id}] falha:`, err)
        return { criada: false, novos: 0 }
      }
    })

    const criadas = resultados.filter((r) => r.criada).length
    const novosVinculados = resultados.reduce((s, r) => s + r.novos, 0)

    if (criadas > 0) {
      await db.rpc('reconciliar_uso_feedbacks', { p_restaurante_id: restauranteId })
    }

    return json({
      status: criadas > 0 ? 'sucesso' : 'nenhuma_acao_aprovada',
      acoes_criadas: criadas,
      feedbacks_novos_vinculados: novosVinculados,
    })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    // deno-lint-ignore no-explicit-any
    const e = err as any
    return json({ error: e?.message || String(err), code: e?.code }, 500)
  }
})
