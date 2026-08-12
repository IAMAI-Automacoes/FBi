import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, buscarConhecimento, tomDoAssistente } from '../_shared/perfil.ts'

const AGENTE = 'plano_acao'

/**
 * Prompt padrão. O admin pode sobrescrevê-lo pelo painel (chave ef_plano_acao);
 * os placeholders são preenchidos aqui e não podem ser removidos na edição.
 */
const PROMPT_PADRAO = `Você é um especialista em gestão de restaurantes e operações.
Baseado na ação descrita abaixo, gere um plano detalhado de ação PARA ESTE restaurante.

{tom}

O plano deve:
1. Explicar COMO resolver o problema
2. Ser orientador e prático, sem ser rígido demais
3. Fornecer direcionamentos claros para a equipe
4. Levar em conta o porte, o público e a realidade deste restaurante — nada de
   conselho genérico que serviria para qualquer lugar

## Sobre este restaurante
{perfil}

## Ação
{acao}

{insights}

{conhecimento}

Retorne SOMENTE um JSON neste formato, sem markdown:
{
  "plano_detalhado": "Seu plano aqui com múltiplas linhas se necessário"
}`

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const acaoId = body.acao_id
    if (!acaoId) return json({ error: 'acao_id é obrigatório' }, 400)

    const db = clienteAdmin()

    const { data: acao, error: acaoErr } = await db
      .from('acoes_operacionais')
      .select('*')
      .eq('id', acaoId)
      .single()
    if (acaoErr) throw acaoErr
    if (!acao) return json({ error: 'Ação não encontrada' }, 404)

    // Antes esta função rodava sem nenhum dado do restaurante e sobrescrevia
    // com um plano genérico o plano contextualizado que sugerir-acoes havia
    // gerado. Agora ela recebe o mesmo contexto.
    const { data: restaurante } = await db
      .from('restaurantes')
      .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante, mascote_config')
      .eq('id', acao.restaurante_id)
      .maybeSingle()

    const { data: insights } = await db
      .from('insights')
      .select('titulo, descricao')
      .eq('restaurante_id', acao.restaurante_id)
      .eq('ativo', true)
      .limit(5)

    const contextoAcao = [
      `Título: ${acao.titulo_acao}`,
      acao.categoria ? `Categoria: ${acao.categoria}` : '',
      acao.prioridade ? `Prioridade: ${acao.prioridade}` : '',
      acao.status ? `Status: ${acao.status}` : '',
    ].filter(Boolean).join('\n')

    const blocoInsights = insights?.length
      ? `## Insights relacionados\n${insights.map((i: { titulo: string; descricao: string }) => `- ${i.titulo}: ${i.descricao}`).join('\n')}`
      : ''

    const conhecimento = await buscarConhecimento(
      db,
      acao.restaurante_id,
      `${acao.titulo_acao} ${acao.categoria ?? ''}`,
      4,
    )
    const blocoConhecimento = conhecimento
      ? `## Boas práticas de referência (use para embasar o plano)\n${conhecimento}`
      : ''

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_plano_acao', PROMPT_PADRAO, {
      tom: tomDoAssistente(restaurante?.mascote_config),
      perfil: blocoPerfil(restaurante),
      acao: contextoAcao,
      insights: blocoInsights,
      conhecimento: blocoConhecimento,
    })

    const params = await paramsDoAgente(db, AGENTE, {
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'gerar-plano-acao',
      restauranteId: acao.restaurante_id,
      agenteId: AGENTE,
    })

    const planoGerado =
      typeof result === 'string' ? result : (result?.plano_detalhado ?? '')
    if (!planoGerado) return json({ error: 'Não foi possível gerar o plano' }, 502)

    const { error: updateErr } = await db
      .from('acoes_operacionais')
      .update({ plano_detalhado: planoGerado })
      .eq('id', acaoId)
    if (updateErr) throw updateErr

    return json({ status: 'sucesso', plano_detalhado: planoGerado, acao_id: acaoId })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    // deno-lint-ignore no-explicit-any
    const e = err as any
    return json({ error: e?.message || String(err), code: e?.code }, 500)
  }
})
