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
- A sugestao deve ser CONCRETA e executavel neste restaurante, considerando o perfil dele (tamanho, tipo de cozinha, publico). Nada de conselho generico.
- Quando uma boa pratica de referencia embasar a sugestao, aplique-a ao caso concreto.
- Agrupe feedbacks do mesmo tema num unico insight, nao repita.
- Escreva em portugues do Brasil, direto, sem jargao.
- "refs": liste os NUMEROS dos feedbacks abaixo que sustentam este insight (o campo "n" de cada um).
  Ex.: [1, 4, 7]. Use somente numeros que aparecem na lista. NUNCA deixe vazio: todo insight nasce
  de feedbacks concretos, entao sempre cite pelo menos um.

## Formato OBRIGATORIO (retorne SOMENTE este JSON)
{
  "insights": [
    {
      "prioridade": "URGENTE" | "IMPORTANTE" | "OBSERVACAO",
      "categoria": "Comida" | "Bebidas" | "Atendimento" | "Ambiente" | "Limpeza" | "Preço" | "Tempo de Espera" | "Reserva" | "Estacionamento" | "Acessibilidade" | "Música/Som" | "Cardápio/Variedade" | "Higiene" | "Outros",
      "titulo": "Titulo curto e claro",
      "descricao": "O que os feedbacks mostram, com o padrao observado",
      "sugestao": "Acao pratica e especifica para a equipe resolver",
      "refs": [1, 4]
    }
  ]
}

## Feedbacks a analisar
{feedbacks}`

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
  const max_importantes = config_insights.max_importantes || 5
  const max_observacoes = config_insights.max_observacoes || 3
  const mascoteNome = nomeDoAssistente(config.mascote_config)

  const ultimaAnalise = config.ultima_analise_insights ? new Date(config.ultima_analise_insights) : null

  // Só feedback DISPONÍVEL entra na análise.
  //
  // Antes o corte era só por janela de tempo, e o mesmo feedback podia entrar em
  // vários ciclos, gerando insights praticamente idênticos — o dono via a mesma
  // reclamação virar tarefa duas vezes. Agora, ao entrar num insight (ou numa
  // ação), o feedback é marcado como usado; se aquele insight/ação for
  // excluído, ele volta a ficar disponível.
  //
  // Vale inclusive no modo `force`: repetir insight a pedido continua sendo
  // repetir insight.
  let feedbacksQuery = db
    .from('feedbacks_restaurante')
    .select('*', { count: 'exact' })
    .eq('restaurante_id', restauranteId)
    .is('usado_em', null)

  // Feedback velho demais deixa de ser material para insight: o restaurante
  // provavelmente já mudou, e agir hoje sobre uma reclamação de dois meses
  // atrás gera tarefa sem contexto. O prazo é do dono (/configuracoes).
  const expiracaoDias = Number(
    (config.config_insights as Record<string, unknown> | null)?.expiracao_feedback_dias ?? 14,
  )
  if (Number.isFinite(expiracaoDias) && expiracaoDias > 0) {
    const limite = new Date(Date.now() - expiracaoDias * 86_400_000)
    feedbacksQuery = feedbacksQuery.gte('created_at', limite.toISOString())
  }

  if (ultimaAnalise && !force) {
    feedbacksQuery = feedbacksQuery.gte('created_at', ultimaAnalise.toISOString())
  }

  const { data: feedbacks, count, error: countErr } = await feedbacksQuery
    .order('created_at', { ascending: false })
    .limit(100)

  if (countErr) return { insights_gerados: 0, feedbacks_analisados: 0, status: 'erro_busca' }

  const horasPassadas = ultimaAnalise
    ? (new Date().getTime() - ultimaAnalise.getTime()) / (1000 * 60 * 60)
    : Infinity

  if (!force && (count || 0) < feedbacks_por_analise && horasPassadas < horas_entre_analises) {
    return { insights_gerados: 0, feedbacks_analisados: count || 0, status: 'criterios_nao_atingidos' }
  }

  const totalFeedbacks = feedbacks?.length || 0
  if (totalFeedbacks === 0) return { insights_gerados: 0, feedbacks_analisados: 0, status: 'sem_feedbacks' }
  if (force && totalFeedbacks < MIN_FEEDBACKS_MANUAL) {
    return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, minimo_necessario: MIN_FEEDBACKS_MANUAL, status: 'insuficiente' }
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
    (feedbacks || [])
      .filter((f: any) => (f.sentimento || '').toLowerCase().startsWith('neg'))
      .map((f: any) => `${f.categoria || ''}: ${f.texto_original || f.resumo || ''}`)
      .join('\n')
      .slice(0, 3500) ||
    (feedbacks || []).map((f: any) => f.texto_original || '').join('\n').slice(0, 3500)

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
    // O modelo recebe um NÚMERO curto (1, 2, 3...) em vez do uuid do feedback.
    //
    // Antes mandávamos o `origem_id` cru e pedíamos que ele o repetisse. Modelos
    // pequenos — e `gemini-2.5-flash-lite`, o ativo aqui, é um deles — truncam ou
    // reescrevem uuid de 36 caracteres em saída JSON. Como a validação descarta
    // todo id que não bate exatamente, o resultado era `feedback_ids: []`: o
    // insight nascia sem vínculo nenhum, silenciosamente. Aconteceu nos 15
    // insights existentes.
    //
    // Um inteiro de um dígito o modelo copia certo, e a tradução de volta para
    // uuid acontece aqui no código, onde não há como errar.
    feedbacks: JSON.stringify(
      (feedbacks || []).map((f: any, indice: number) => ({
        n: indice + 1,
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
      return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, status: 'sem_credito' }
    }
    throw e
  }

  const params = await paramsDoAgente(db, AGENTE, {
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })
  if (!params) {
    return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, status: 'agente_desativado' }
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
    return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, status: 'erro_ia' }
  }

  if (insightsGerados.length > 0) {
    const urgentes = insightsGerados.filter((i) => i.prioridade === 'URGENTE')
    const importantes = insightsGerados.filter((i) => i.prioridade === 'IMPORTANTE').slice(0, max_importantes)
    const observacoes = insightsGerados
      .filter((i) => i.prioridade === 'OBSERVACAO' || i.prioridade === 'OBSERVAÇÃO')
      .slice(0, max_observacoes)

    // Traduz os números que o modelo citou de volta para uuid de feedbacks_originais.
    // A posição é a mesma que foi enviada no prompt, então a correspondência é exata.
    const porIndice = (feedbacks || []).map((f: any) => String(f.origem_id ?? f.id))

    /**
     * Feedbacks que sustentam o insight.
     *
     * Aceita `refs` (números, o formato atual) e também `feedback_ids` (uuid, o
     * formato antigo) — um prompt sobrescrito em `prompts_editaveis` pode ainda
     * estar pedindo uuid, e nesse caso continuamos entendendo a resposta.
     */
    const idsDoInsight = (i: any): string[] => {
      const porRef = (Array.isArray(i.refs) ? i.refs : [])
        .map((n: unknown) => porIndice[Number(n) - 1])
        .filter((id: string | undefined): id is string => !!id)
      if (porRef.length > 0) return [...new Set<string>(porRef)]

      const validos = new Set(porIndice)
      const porUuid = (Array.isArray(i.feedback_ids) ? i.feedback_ids : [])
        .map((id: unknown) => String(id))
        .filter((id: string) => validos.has(id))
      return [...new Set<string>(porUuid)]
    }

    const finalInsights = [...urgentes, ...importantes, ...observacoes].map((i) => {
      let ids = idsDoInsight(i)

      // Rede de segurança: se o modelo não citou nada de aproveitável, liga o
      // insight aos feedbacks da mesma categoria que ele próprio classificou.
      //
      // Um insight sem vínculo é pior que um vínculo aproximado: ele quebra o
      // botão "feedbacks relacionados" e, agora, deixa o motor de resposta sem
      // destinatário — o cliente que reclamou nunca fica sabendo que agimos.
      if (ids.length === 0) {
        const categoria = String(i.categoria || '').toLowerCase()
        ids = [
          ...new Set<string>(
            (feedbacks || [])
              .filter((f: any) => String(f.categoria || '').toLowerCase() === categoria)
              .map((f: any) => String(f.origem_id ?? f.id)),
          ),
        ].slice(0, 10)
        if (ids.length > 0) {
          console.warn(
            `Insight "${i.titulo}" veio sem refs do modelo; vinculado por categoria (${ids.length} feedbacks).`,
          )
        }
      }

      return {
        restaurante_id: restauranteId,
        prioridade: i.prioridade === 'OBSERVAÇÃO' ? 'OBSERVACAO' : i.prioridade,
        categoria: i.categoria || 'Outros',
        titulo: i.titulo || 'Insight detectado',
        descricao: i.descricao || '',
        sugestao: i.sugestao || '',
        feedback_ids: ids,
        // Deriva da lista real: o número deixa de ser um palpite do modelo.
        feedbacks_relacionados: ids.length || 1,
        gerado_por: 'ia',
        ativo: true,
      }
    })

    if (ultimaAnalise) {
      await db.from('insights').update({ ativo: false }).eq('restaurante_id', restauranteId).lt('created_at', ultimaAnalise.toISOString())
    }

    const { error: insertErr } = await db.from('insights').insert(finalInsights)
    if (insertErr) {
      console.error(`Falha ao inserir insights (restaurante ${restauranteId}):`, insertErr)
      return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, status: 'erro_insert' }
    }

    await db.from('restaurantes').update({ ultima_analise_insights: new Date().toISOString() }).eq('id', restauranteId)

    try {
      await db.functions.invoke('sugerir-acoes', { body: { restaurante_id: restauranteId } })
    } catch (e) {
      console.error('Falha ao disparar sugerir-acoes:', e)
    }
  }

  return {
    insights_gerados: insightsGerados.length,
    feedbacks_analisados: totalFeedbacks,
    status: insightsGerados.length > 0 ? 'sucesso' : 'sem_novidades',
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
