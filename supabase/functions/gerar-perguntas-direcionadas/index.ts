import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil } from '../_shared/perfil.ts'

const AGENTE = 'perguntas_direcionadas'

/** Padrão do código; o admin sobrescreve pela chave ef_perguntas no painel. */
const PROMPT_PADRAO = `Com base nesta ação que está sendo implementada no restaurante, gere 2 a 3
perguntas curtas e naturais para fazer aos clientes, que captem se a solução está funcionando.
As perguntas devem ser levemente direcionadas mas não enviesadas, e fazer sentido para o
público deste restaurante.

## Sobre este restaurante
{perfil}

## Ação
Título: "{titulo}"
Plano: "{plano}"
Categoria: "{categoria}"

Retorne APENAS um objeto JSON com a chave "perguntas" contendo um array de strings.`

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { acao_id: acaoId } = await req.json().catch(() => ({}))
    if (!acaoId) return json({ error: 'acao_id é obrigatório' }, 400)

    const db = clienteAdmin()

    const { data: acao, error: acaoErr } = await db
      .from('acoes_operacionais')
      .select('titulo_acao, plano_detalhado, categoria, restaurante_id')
      .eq('id', acaoId)
      .single()
    if (acaoErr || !acao) return json({ error: 'Ação não encontrada' }, 404)

    const { data: restaurante } = await db
      .from('restaurantes')
      .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante')
      .eq('id', acao.restaurante_id)
      .maybeSingle()

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_perguntas', PROMPT_PADRAO, {
      perfil: blocoPerfil(restaurante),
      titulo: acao.titulo_acao ?? '',
      plano: acao.plano_detalhado ?? '',
      categoria: acao.categoria ?? '',
    })

    const params = await paramsDoAgente(db, AGENTE, {
      response_format: { type: 'json_object' },
      max_tokens: 400,
    })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'gerar-perguntas-direcionadas',
      restauranteId: acao.restaurante_id,
      agenteId: AGENTE,
    })

    let perguntas: string[] = []
    if (Array.isArray(result)) {
      perguntas = result.filter((p): p is string => typeof p === 'string')
    } else if (result && typeof result === 'object') {
      perguntas = Array.isArray(result.perguntas)
        ? result.perguntas.filter((p: unknown): p is string => typeof p === 'string')
        : Object.values(result).filter((v): v is string => typeof v === 'string')
    }

    if (perguntas.length) {
      const { error: insertErr } = await db.from('perguntas_direcionadas').insert(
        perguntas.slice(0, 3).map((p) => ({ acao_id: acaoId, pergunta: p, ativa: true })),
      )
      if (insertErr) throw insertErr
    }

    return json({ sucesso: true, perguntas_geradas: perguntas.length })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    return json({ error: (err as Error).message }, 500)
  }
})
