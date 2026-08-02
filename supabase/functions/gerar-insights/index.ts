import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const MIN_FEEDBACKS_MANUAL = 3

// @ts-ignore - Supabase.ai existe no runtime das edge functions
const aiSession = new Supabase.ai.Session('gte-small')

function blocoPerfil(r: any): string {
  const p = (r?.perfil_restaurante as any) || {}
  const linhas = [
    r?.nome_restaurante ? `Nome: ${r.nome_restaurante}` : '',
    r?.tipo_culinaria ? `Tipo de cozinha: ${r.tipo_culinaria}` : '',
    p.estilo ? `Estilo: ${p.estilo}` : '',
    p.localizacao ? `Localizacao: ${p.localizacao}` : '',
    r?.numero_mesas ? `Mesas: ${r.numero_mesas}` : '',
    p.capacidade_lugares ? `Capacidade: ${p.capacidade_lugares} lugares` : '',
    p.num_funcionarios ? `Equipe: ${p.num_funcionarios} funcionarios` : '',
    p.faixa_preco ? `Ticket medio: ${p.faixa_preco}` : '',
    p.publico_alvo ? `Publico: ${p.publico_alvo}` : '',
    p.pratos_destaque ? `Pratos que mais saem: ${p.pratos_destaque}` : '',
    p.diferenciais ? `Diferenciais: ${p.diferenciais}` : '',
    p.desafios ? `Desafios relatados pelo dono: ${p.desafios}` : '',
    r?.detalhes ? `Descricao do dono: ${r.detalhes}` : '',
  ].filter(Boolean)
  return linhas.length ? linhas.join('\n') : 'Perfil ainda nao preenchido.'
}

async function buscarConhecimento(db: any, restauranteId: number, consulta: string): Promise<string> {
  try {
    if (!consulta.trim()) return ''
    const emb = await aiSession.run(consulta.slice(0, 4000), { mean_pool: true, normalize: true })
    const { data } = await db.rpc('buscar_conhecimento_para', {
      consulta_embedding: emb,
      p_restaurante_id: restauranteId,
      consulta_texto: consulta.slice(0, 500),
      limite: 6,
    })
    if (!data || !data.length) return ''
    return data.map((t: any, i: number) => `[${i + 1}] (${t.titulo})\n${t.conteudo}`).join('\n\n')
  } catch (e) {
    console.error('Falha na busca de conhecimento:', e)
    return ''
  }
}

async function processarRestaurante(db: any, restauranteId: number, force: boolean, apiKey: string, modelo: string) {
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
  const mascoteNome = (config.mascote_config as any)?.nome || 'Chef Pepe'

  const ultimaAnalise = config.ultima_analise_insights ? new Date(config.ultima_analise_insights) : null

  let feedbacksQuery = db
    .from('feedbacks_restaurante')
    .select('*', { count: 'exact' })
    .eq('restaurante_id', restauranteId)

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

  const prompt = `Voce e o "${mascoteNome}", consultor de gestao de restaurantes. Analise os feedbacks reais dos clientes e gere insights operacionais em JSON.

## Sobre este restaurante
${blocoPerfil(config)}
${memoria?.length ? `\n## O que voce ja aprendeu sobre este restaurante (anotacoes)\n${memoria.map((m: any) => `- ${m.fato}`).join('\n')}` : ''}
${conhecimento ? `\n## Boas praticas de referencia (use para embasar as sugestoes)\n${conhecimento}` : ''}

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

## Formato OBRIGATORIO (retorne SOMENTE este JSON)
{
  "insights": [
    {
      "prioridade": "URGENTE" | "IMPORTANTE" | "OBSERVACAO",
      "categoria": "Servico" | "Comida" | "Ambiente" | "Preco" | "Agilidade" | "Geral",
      "titulo": "Titulo curto e claro",
      "descricao": "O que os feedbacks mostram, com o padrao observado",
      "sugestao": "Acao pratica e especifica para a equipe resolver",
      "feedbacks_relacionados": 2
    }
  ]
}

## Feedbacks a analisar
${JSON.stringify((feedbacks || []).map((f: any) => ({ texto: f.texto_original, sentimento: f.sentimento, categoria: f.categoria })))}`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://feedbackinteligente.app',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    console.error(`OpenRouter API Error (restaurante ${restauranteId}): ${await response.text()}`)
    return { insights_gerados: 0, feedbacks_analisados: totalFeedbacks, status: 'erro_ia' }
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? '[]'

  let insightsGerados: any[] = []
  try {
    const parsed = JSON.parse(content)
    insightsGerados = Array.isArray(parsed) ? parsed : parsed.insights || []
  } catch (parseErr) {
    console.error('Falha ao parsear resposta da IA:', content, parseErr)
  }

  if (insightsGerados.length > 0) {
    const urgentes = insightsGerados.filter((i) => i.prioridade === 'URGENTE')
    const importantes = insightsGerados.filter((i) => i.prioridade === 'IMPORTANTE').slice(0, max_importantes)
    const observacoes = insightsGerados
      .filter((i) => i.prioridade === 'OBSERVACAO' || i.prioridade === 'OBSERVAÇÃO')
      .slice(0, max_observacoes)

    const finalInsights = [...urgentes, ...importantes, ...observacoes].map((i) => ({
      restaurante_id: restauranteId,
      prioridade: i.prioridade === 'OBSERVAÇÃO' ? 'OBSERVACAO' : i.prioridade,
      categoria: i.categoria || 'Geral',
      titulo: i.titulo || 'Insight detectado',
      descricao: i.descricao || '',
      sugestao: i.sugestao || '',
      feedbacks_relacionados: i.feedbacks_relacionados || 1,
      gerado_por: 'ia',
      ativo: true,
    }))

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

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    const modelo = Deno.env.get('OPENROUTER_MODELO') || 'google/gemini-2.5-flash-lite'
    if (!apiKey) throw new Error('OPENROUTER_API_KEY nao configurada.')

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
        const res = await processarRestaurante(db, r.id, false, apiKey, modelo)
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

    const result = await processarRestaurante(db, targetRestauranteId, force, apiKey, modelo)
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
