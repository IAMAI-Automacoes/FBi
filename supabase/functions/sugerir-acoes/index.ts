import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, buscarConhecimento, nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'

const AGENTE = 'sugeridor_acoes'

/** Padrão do código; o admin sobrescreve pela chave ef_sugerir_acoes no painel. */
const PROMPT_PADRAO = `Voce e o "{nome}", consultor especialista em gestao de restaurantes. Com base nos insights abaixo, gere ATE {max} acoes operacionais concretas para o dono resolver os problemas mais valiosos (maior impacto e urgencia).

{tom}

## Sobre este restaurante
{perfil}
{memoria}
{conhecimento}

## Regras para cada acao
1. "titulo_acao": titulo curto e claro do que precisa ser feito.
2. "plano_detalhado": um plano pratico em passos, adaptado a ESTE restaurante (tamanho, equipe, tipo de cozinha). Quando uma boa pratica de referencia se aplicar, incorpore-a de forma concreta. Nada de conselho generico como "melhore o atendimento".
3. "prioridade": herde do insight principal (URGENTE, IMPORTANTE ou OBSERVACAO).
4. "categoria": Servico, Comida, Ambiente, Preco, Agilidade ou Geral.
Escreva em portugues do Brasil, direto.

## Formato (retorne SOMENTE este JSON)
{ "acoes": [ { "titulo_acao": "...", "plano_detalhado": "...", "prioridade": "...", "categoria": "..." } ] }

## Insights disponiveis
{insights}`

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const targetRestauranteId = body.restaurante_id

    // Sem restaurante_id a função pegava o primeiro restaurante ativo do banco
    // e gerava ações para ele — um restaurante recebia sugestões a partir de
    // uma chamada que não era sua.
    if (!targetRestauranteId) {
      return json({ error: 'restaurante_id é obrigatório' }, 400)
    }

    const db = clienteAdmin()

    // Nao gera novas sugestoes enquanto ha sugestoes aguardando aprovacao
    const { count } = await db
      .from('acoes_operacionais')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'SUGERIDA')
      .eq('restaurante_id', targetRestauranteId)

    if (count && count > 0) {
      return json({ status: 'aguardando_aprovacao', sugestoes_criadas: 0 })
    }

    // Configuracao (mora em restaurantes) + perfil para contexto
    const { data: restauranteData } = await db
      .from('restaurantes')
      .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante, config_insights, mascote_config')
      .eq('id', targetRestauranteId)
      .single()

    // deno-lint-ignore no-explicit-any
    const ci = (restauranteData?.config_insights as any) || {}
    const maxSugestoes = ci.max_sugestoes_acoes_por_ciclo || 3

    // Insights ativos
    const { data: insights, error: insightsErr } = await db
      .from('insights')
      .select('*')
      .eq('ativo', true)
      .eq('restaurante_id', targetRestauranteId)
    if (insightsErr) throw insightsErr

    if (!insights || insights.length === 0) {
      return json({ status: 'sem_insights', sugestoes_criadas: 0 })
    }

    const prioridadePeso: Record<string, number> = { URGENTE: 3, IMPORTANTE: 2, OBSERVACAO: 1 }
    const insightsOrdenados = insights.sort((a, b) => {
      const pA = prioridadePeso[a.prioridade?.toUpperCase()] || 0
      const pB = prioridadePeso[b.prioridade?.toUpperCase()] || 0
      if (pA !== pB) return pB - pA
      return (b.feedbacks_relacionados || 0) - (a.feedbacks_relacionados || 0)
    })

    const insightsValidos = insightsOrdenados
      .filter((i) => i.prioridade?.toUpperCase() === 'URGENTE' || (i.feedbacks_relacionados || 0) >= 2)
      .slice(0, 10)

    if (insightsValidos.length === 0) {
      return json({ status: 'sem_insights_relevantes', sugestoes_criadas: 0 })
    }

    // Anotacoes da IA
    const { data: memoria } = await db
      .from('memoria_assistente')
      .select('fato')
      .eq('restaurante_id', targetRestauranteId)
      .order('created_at', { ascending: false })
      .limit(20)

    // Boas praticas relevantes aos temas dos insights
    const consultaConhecimento = insightsValidos
      .map((i) => `${i.categoria || ''}: ${i.titulo}. ${i.descricao || ''}`)
      .join('\n')
      .slice(0, 3500)
    const conhecimento = await buscarConhecimento(db, targetRestauranteId, consultaConhecimento)

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_sugerir_acoes', PROMPT_PADRAO, {
      nome: nomeDoAssistente(restauranteData?.mascote_config),
      tom: tomDoAssistente(restauranteData?.mascote_config),
      max: String(maxSugestoes),
      perfil: blocoPerfil(restauranteData),
      memoria: memoria?.length
        ? `\n## O que se sabe deste restaurante (anotacoes)\n${memoria.map((m: { fato: string }) => `- ${m.fato}`).join('\n')}`
        : '',
      conhecimento: conhecimento
        ? `\n## Boas praticas de referencia (use para montar o plano)\n${conhecimento}`
        : '',
      insights: JSON.stringify(
        insightsValidos.map((i) => ({
          prioridade: i.prioridade,
          categoria: i.categoria,
          titulo: i.titulo,
          descricao: i.descricao,
          sugestao: i.sugestao,
        })),
      ),
    })

    const params = await paramsDoAgente(db, AGENTE, {
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'sugerir-acoes',
      restauranteId: targetRestauranteId,
      agenteId: AGENTE,
    })

    // deno-lint-ignore no-explicit-any
    const acoesGeradas: any[] = Array.isArray(result)
      ? result
      : (result?.acoes || result?.sugestoes || [])

    let criadas = 0
    if (acoesGeradas.length > 0) {
      const finalAcoes = acoesGeradas.slice(0, maxSugestoes).map((a) => ({
        titulo_acao: a.titulo_acao || 'Acao sugerida',
        plano_detalhado: a.plano_detalhado || '',
        prioridade: a.prioridade || 'IMPORTANTE',
        categoria: a.categoria || 'Geral',
        status: 'SUGERIDA',
        restaurante_id: targetRestauranteId,
        texto: 'Gerado automaticamente via IA baseando-se em insights ativos, no perfil do restaurante e nas boas praticas.',
      }))

      const { error: insertErr } = await db.from('acoes_operacionais').insert(finalAcoes)
      if (insertErr) throw insertErr
      criadas = finalAcoes.length
    }

    return json({ status: 'sucesso', sugestoes_criadas: criadas })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    // deno-lint-ignore no-explicit-any
    const e = err as any
    return json({ error: e?.message || String(err), code: e?.code }, 500)
  }
})
