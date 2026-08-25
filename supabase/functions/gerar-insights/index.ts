import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { carregarPrompts, montarPrompt, type Prompts } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, checarCota, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, buscarConhecimento, nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const MIN_FEEDBACKS_MANUAL = 3
/** Teto de insights por rodada — pedido explícito: qualidade antes de
 *  quantidade, a IA pode gerar menos se não tiver 5 assuntos de verdade. */
const MAX_INSIGHTS = 5
const AGENTE = 'gerador_insights'

/** Padrão do código; o admin sobrescreve pela chave ef_gerar_insights no painel. */
const PROMPT_PADRAO = `Voce e o "{nome}", consultor de gestao de restaurantes. Analise os feedbacks reais dos clientes e gere insights operacionais em JSON.

{tom}

## Sobre este restaurante
{perfil}
{memoria}
{conhecimento}

## Como classificar
1. "URGENTE": qualquer risco sanitario (cabelo, inseto, alimento estragado, intoxicacao), risco a seguranca do cliente ou violacao grave. Classifique assim INDEPENDENTE do volume, mesmo com 1 relato.
2. "IMPORTANTE": padroes relevantes, reclamacoes recorrentes e consistentes, pontos de melhoria fortes.
3. "OBSERVACAO": assuntos notaveis, tendencias menores e elogios sem acao imediata.

## Regras de qualidade
- Baseie-se APENAS nos feedbacks abaixo. Nao invente reclamacao que nao existe.
- Gere no MAXIMO ${MAX_INSIGHTS} insights, os mais valiosos — nunca mais que isso. Gere MENOS que ${MAX_INSIGHTS} sempre que nao houver assunto de verdade para preencher: nao invente insight so pra bater o numero. Um relato isolado, opiniao pessoal de um unico cliente sem repeticao, ou algo generico demais pra virar acao NAO deve virar insight so pra completar a cota.
- A sugestao deve ser CONCRETA e executavel neste restaurante, considerando o perfil dele (tamanho, tipo de cozinha, publico). Nada de conselho generico.
- Quando uma boa pratica de referencia embasar a sugestao, aplique-a ao caso concreto.
- Agrupe feedbacks do mesmo tema num unico insight, nao repita o mesmo feedback em dois insights.
- Escreva em portugues do Brasil, direto, sem jargao.
- "feedback_ids": liste os IDs EXATOS ("id") dos feedbacks abaixo que sustentam este insight. Use somente IDs que aparecem na lista. Nao invente ID.

## Formato OBRIGATORIO (retorne SOMENTE este JSON)
{
  "insights": [
    {
      "prioridade": "URGENTE" | "IMPORTANTE" | "OBSERVACAO",
      "categoria": "Comida" | "Bebidas" | "Atendimento" | "Ambiente" | "Limpeza" | "Preço" | "Tempo de Espera" | "Reserva" | "Estacionamento" | "Acessibilidade" | "Música/Som" | "Cardápio/Variedade" | "Higiene" | "Outros",
      "titulo": "Titulo curto e claro",
      "descricao": "O que os feedbacks mostram, com o padrao observado",
      "sugestao": "Acao pratica e especifica para a equipe resolver",
      "feedback_ids": ["id-do-feedback-1", "id-do-feedback-2"]
    }
  ]
}

## Feedbacks a analisar
{feedbacks}`

const PESO_PRIORIDADE: Record<string, number> = { URGENTE: 3, IMPORTANTE: 2, OBSERVACAO: 1 }

async function processarRestaurante(db: any, restauranteId: number, force: boolean, prompts: Prompts) {
  // A configuracao mora na tabela restaurantes (config_restaurantes nao existe)
  const { data: config, error: configErr } = await db
    .from('restaurantes')
    .select('*')
    .eq('id', restauranteId)
    .single()

  if (configErr || !config) {
    return { insights_gerados: 0, feedbacks_analisados: 0, status: 'sem_config' }
  }

  // Conta encerrada (soft delete): nao processa nem quando chamada direto.
  if (config.excluida_em) {
    return { insights_gerados: 0, feedbacks_analisados: 0, status: 'conta_encerrada' }
  }

  const config_insights = (config.config_insights as any) || {}
  const feedbacks_por_analise = config_insights.feedbacks_por_analise || 10
  const horas_entre_analises = config_insights.horas_entre_analises || 24
  const mascoteNome = nomeDoAssistente(config.mascote_config)

  const ultimaAnalise = config.ultima_analise_insights ? new Date(config.ultima_analise_insights) : null

  // Feedbacks já "reservados" — citados no feedback_ids/feedbacks_restaurante_ids
  // de algum insight ATIVO ou de alguma ação NAO arquivada. Nunca reanalisa o
  // mesmo feedback separado duas vezes enquanto ele seguir vinculado ali (a
  // correspondência exata "isso realmente já foi tratado" fica por conta da
  // lógica mais fina que ainda vai entrar — aqui é só não repetir).
  const [{ data: insightsAtivos }, { data: acoesAtuais }] = await Promise.all([
    db.from('insights').select('feedbacks_restaurante_ids').eq('restaurante_id', restauranteId).eq('ativo', true),
    db.from('acoes_operacionais').select('feedbacks_restaurante_ids').eq('restaurante_id', restauranteId).is('arquivada_em', null),
  ])
  const idsReservados = new Set<number>()
  for (const linha of [...(insightsAtivos ?? []), ...(acoesAtuais ?? [])]) {
    for (const id of (linha.feedbacks_restaurante_ids ?? [])) idsReservados.add(id)
  }

  const { data: feedbacksBrutos, error: countErr } = await db
    .from('feedbacks_restaurante')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (countErr) return { insights_gerados: 0, feedbacks_analisados: 0, status: 'erro_busca' }

  // Só os que ainda não estão em nenhum insight/ação — é o universo real
  // disponível pra gerar insight novo.
  const feedbacks = (feedbacksBrutos ?? []).filter((f: any) => !idsReservados.has(f.id))
  const totalDisponivel = feedbacks.length

  const horasPassadas = ultimaAnalise
    ? (new Date().getTime() - ultimaAnalise.getTime()) / (1000 * 60 * 60)
    : Infinity

  if (!force && totalDisponivel < feedbacks_por_analise && horasPassadas < horas_entre_analises) {
    return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, status: 'criterios_nao_atingidos' }
  }

  if (totalDisponivel === 0) return { insights_gerados: 0, feedbacks_analisados: 0, status: 'sem_feedbacks' }
  if (force && totalDisponivel < MIN_FEEDBACKS_MANUAL) {
    return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, minimo_necessario: MIN_FEEDBACKS_MANUAL, status: 'insuficiente' }
  }

  // Anotacoes que a IA fez em conversas
  const { data: memoria } = await db
    .from('memoria_assistente')
    .select('fato')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(30)

  // Recupera boas praticas relevantes aos temas dos feedbacks (foco nos negativos)
  const consultaConhecimento =
    feedbacks
      .filter((f: any) => (f.sentimento || '').toLowerCase().startsWith('neg'))
      .map((f: any) => `${f.categoria || ''}: ${f.texto_original || f.resumo || ''}`)
      .join('\n')
      .slice(0, 3500) ||
    feedbacks.map((f: any) => f.texto_original || '').join('\n').slice(0, 3500)

  const conhecimento = await buscarConhecimento(db, restauranteId, consultaConhecimento)

  const prompt = montarPrompt(prompts, 'ef_gerar_insights', PROMPT_PADRAO, {
    nome: mascoteNome,
    tom: tomDoAssistente(config.mascote_config),
    perfil: blocoPerfil(config),
    memoria: memoria?.length
      ? `\n## O que voce ja aprendeu sobre este restaurante (anotacoes)\n${memoria.map((m: any) => `- ${m.fato}`).join('\n')}`
      : '',
    conhecimento: conhecimento
      ? `\n## Boas praticas de referencia (use para embasar as sugestoes)\n${conhecimento}`
      : '',
    // O "id" enviado agora é o do FEEDBACK SEPARADO (`feedbacks_restaurante.id`),
    // não mais o da mensagem original — precisa ser o id fino pra marcar
    // exatamente qual pedaço foi usado (um original pode ter virado dois
    // feedbacks separados, ex.: elogio + reclamação na mesma mensagem, e só
    // um dos dois pode ser o que sustenta este insight). O id da mensagem
    // original (pra navegação em /feedbacks) é derivado depois, em código,
    // a partir do que a IA citar aqui — sem pedir os dois pra IA, sem risco
    // de inventar um dos dois.
    feedbacks: JSON.stringify(
      feedbacks.map((f: any) => ({
        id: f.id,
        texto: f.texto_original,
        sentimento: f.sentimento,
        categoria: f.categoria,
      })),
    ),
  })

  // A cota é por restaurante: um sem crédito não pode interromper o lote.
  try {
    await checarCota(db, restauranteId)
  } catch (e) {
    if (e instanceof ErroCota) {
      return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, status: 'sem_credito' }
    }
    throw e
  }

  const params = await paramsDoAgente(db, AGENTE, {
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })
  if (!params) {
    return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, status: 'agente_desativado' }
  }

  let insightsGerados: any[] = []
  try {
    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'gerar-insights',
      restauranteId,
      agenteId: AGENTE,
      checarCotaAntes: false,
    })
    insightsGerados = Array.isArray(result) ? result : (result?.insights || [])
  } catch (err) {
    console.error(`Falha ao gerar insights (restaurante ${restauranteId}):`, err)
    return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, status: 'erro_ia' }
  }

  if (insightsGerados.length > 0) {
    // Mapa id-do-feedback-separado -> origem_id, pra derivar o feedback_ids
    // (uuid[] de feedbacks_originais, usado pela navegação "Ver feedbacks
    // relacionados") sem depender da IA citar dois ids por insight.
    const origemPorId = new Map<number, string>(
      feedbacks.map((f: any) => [f.id, f.origem_id ?? null]).filter(([, o]: any) => o != null),
    )
    const idsValidos = new Set(feedbacks.map((f: any) => String(f.id)))

    // Corta em 5, priorizando URGENTE > IMPORTANTE > OBSERVACAO — não é mais
    // um teto por categoria (antes: X importantes + Y observações), é um
    // teto único no total.
    const ordenados = [...insightsGerados].sort((a, b) => {
      const pa = PESO_PRIORIDADE[a.prioridade === 'OBSERVAÇÃO' ? 'OBSERVACAO' : a.prioridade] || 0
      const pb = PESO_PRIORIDADE[b.prioridade === 'OBSERVAÇÃO' ? 'OBSERVACAO' : b.prioridade] || 0
      return pb - pa
    })
    const selecionados = ordenados.slice(0, MAX_INSIGHTS)

    const finalInsights = selecionados.map((i) => {
      // O modelo às vezes inventa ID. Só passam os que realmente vieram na
      // lista, senão o link "feedbacks relacionados" levaria a um feedback
      // inexistente.
      const feedbacksRestauranteIds = (Array.isArray(i.feedback_ids) ? i.feedback_ids : [])
        .map((id: unknown) => String(id))
        .filter((id: string) => idsValidos.has(id))
        .map((id: string) => Number(id))

      const feedbackIdsOriginais = [
        ...new Set(
          feedbacksRestauranteIds
            .map((id: number) => origemPorId.get(id))
            .filter((o: string | undefined): o is string => !!o),
        ),
      ]

      return {
        restaurante_id: restauranteId,
        prioridade: i.prioridade === 'OBSERVAÇÃO' ? 'OBSERVACAO' : i.prioridade,
        categoria: i.categoria || 'Outros',
        titulo: i.titulo || 'Insight detectado',
        descricao: i.descricao || '',
        sugestao: i.sugestao || '',
        feedback_ids: feedbackIdsOriginais,
        feedbacks_restaurante_ids: feedbacksRestauranteIds,
        // Deriva da lista real (contagem de feedbacks SEPARADOS, mais fina
        // que a de originais): o número deixa de ser um palpite do modelo.
        feedbacks_relacionados: feedbacksRestauranteIds.length || 1,
        gerado_por: 'ia',
        ativo: true,
      }
    })

    const { error: insertErr } = await db.from('insights').insert(finalInsights)
    if (insertErr) {
      console.error(`Falha ao inserir insights (restaurante ${restauranteId}):`, insertErr)
      return { insights_gerados: 0, feedbacks_analisados: totalDisponivel, status: 'erro_insert' }
    }

    await db.from('restaurantes').update({ ultima_analise_insights: new Date().toISOString() }).eq('id', restauranteId)

    try {
      await db.functions.invoke('sugerir-acoes', { body: { restaurante_id: restauranteId } })
    } catch (e) {
      console.error('Falha ao disparar sugerir-acoes:', e)
    }

    return {
      insights_gerados: finalInsights.length,
      feedbacks_analisados: totalDisponivel,
      status: 'sucesso',
    }
  }

  return {
    insights_gerados: 0,
    feedbacks_analisados: totalDisponivel,
    status: 'sem_novidades',
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const force = body?.force ?? false

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const db = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

    if (!Deno.env.get('OPENROUTER_API_KEY')) throw new Error('OPENROUTER_API_KEY nao configurada.')

    // Carregado uma vez por invocação: o lote inteiro usa a mesma versão dos
    // prompts, e a próxima execução já pega a edição feita no painel.
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
      // Conta encerrada (soft delete) fica de fora: processar custaria chamada
      // de IA por restaurante que nao e mais cliente.
      const { data: restaurantes, error: restErr } = await db
        .from('restaurantes')
        .select('id')
        .is('excluida_em', null)
      if (restErr) throw restErr
      let insightsTotal = 0
      let processados = 0
      for (const r of restaurantes ?? []) {
        const res = await processarRestaurante(db, r.id, false, prompts)
        insightsTotal += res.insights_gerados
        processados += 1
      }
      return new Response(
        JSON.stringify({ modo: 'cron', restaurantes_processados: processados, insights_gerados: insightsTotal }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Modo manual: o restaurante e derivado do usuario (auth_user_id), nunca do body
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

    const { data: rest } = await db.from('restaurantes').select('id').eq('auth_user_id', user.id).single()
    const targetRestauranteId = rest?.id
    if (!targetRestauranteId) {
      return new Response(JSON.stringify({ error: 'Restaurante nao encontrado para este usuario.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await processarRestaurante(db, targetRestauranteId, force, prompts)
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
