import { json, preflight } from '../_shared/cors.ts'
import { planoParaPrompt } from '../_shared/texto-plano.ts'
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

Se a ação já tem um "Plano já escrito pelo usuário" (veja abaixo), ele é a base:
DESENVOLVA A PARTIR DELE — expanda, estruture em passos, complemente com os
insights e boas práticas. NÃO ignore o que já foi escrito nem substitua por um
plano genérico do zero. Se não houver plano escrito, use o título e a
categoria da ação como ponto de partida.

O plano deve:
1. Explicar COMO resolver o problema
2. Ser orientador e prático, sem ser rígido demais
3. Fornecer direcionamentos claros para a equipe
4. Levar em conta o porte, o público e a realidade deste restaurante — nada de
   conselho genérico que serviria para qualquer lugar
5. Quando o assunto tiver regra ou procedimento estabelecido — temperatura segura
   de armazenamento, prazo de validade, exigência da vigilância sanitária, norma
   de acessibilidade — usar o NÚMERO e a REGRA reais, não uma aproximação. Você
   tem busca na web: use-a para conferir antes de afirmar. Escreva a regra dentro
   do passo, em português, sem citar link nem nome de site.
   Se não achar a regra, escreva o passo sem número em vez de chutar um.

Se o título da ação for vago demais (ex.: "Melhorar atendimento" sem mais
nada) E não houver plano escrito nem insights relacionados suficientes para
embasar algo específico, NÃO invente um plano genérico — nesse caso, retorne
em vez disso:
{
  "contexto_insuficiente": true,
  "motivo": "frase curta explicando que informação falta (ex.: qual problema exatamente, o que já foi tentado)"
}

## Sobre este restaurante
{perfil}

## Ação
{acao}

{insights}

{conhecimento}

Se houver contexto suficiente, retorne SOMENTE um JSON neste formato, sem markdown:
{
  "plano_detalhado": "Seu plano aqui com múltiplas linhas se necessário"
}
Caso contrário, retorne SOMENTE o JSON de "contexto_insuficiente" descrito acima.`

Deno.serve(async (req: Request) => {
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
      acao.plano_detalhado
        ? `Plano já escrito pelo usuário (desenvolva A PARTIR dele, não ignore):\n${planoParaPrompt(acao.plano_detalhado)}`
        : '',
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

    // Único agente do sistema com busca na web ligada, e de propósito: é o
    // único que escreve instrução operacional que alguém vai EXECUTAR. Um plano
    // que diz "mantenha a carne resfriada até 7 °C" quando a regra é 4 °C não é
    // um texto ruim — é um texto que causa o problema que ele deveria resolver.
    //
    // Os outros agentes descrevem o que os clientes disseram; para eles a web só
    // acrescentaria custo e uma porta a mais para entrar informação que não veio
    // do feedback. O admin pode desligar em `agentes_ia.avancado`.
    const params = await paramsDoAgente(db, AGENTE, {
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      web: true,
      web_max_results: 3,
    })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'gerar-plano-acao',
      restauranteId: acao.restaurante_id,
      agenteId: AGENTE,
    })

    // A IA pode julgar que não há informação suficiente pra gerar algo
    // específico — nesse caso ela devolve este sinal em vez de um plano, e a
    // ação não é tocada no banco (não sobrescreve um plano existente com nada).
    if (result?.contexto_insuficiente) {
      return json({
        status: 'contexto_insuficiente',
        motivo: result.motivo || 'Descreva melhor o título ou o plano da ação.',
        acao_id: acaoId,
      })
    }

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
