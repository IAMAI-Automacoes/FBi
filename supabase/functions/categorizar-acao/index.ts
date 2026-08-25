import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'

const AGENTE = 'categorizar_acao'

/** As mesmas 14 categorias oficiais de `src/lib/categorias-feedback.ts` —
 *  não crie categoria fora desta lista. */
const CATEGORIAS = [
  'Comida', 'Bebidas', 'Atendimento', 'Ambiente', 'Limpeza', 'Preço',
  'Tempo de Espera', 'Reserva', 'Estacionamento', 'Acessibilidade',
  'Música/Som', 'Cardápio/Variedade', 'Higiene', 'Outros',
]

const PROMPT_PADRAO = `Você classifica ações operacionais de um restaurante numa categoria fixa.

Leia o título e o plano da ação abaixo e escolha, entre as categorias válidas, a que MELHOR descreve o assunto principal da ação. Se nenhuma se encaixar bem, use "Outros".

## Categorias válidas (use exatamente um destes nomes, sem inventar outro)
{categorias}

## Ação
Título: {titulo}
Plano: {plano}

Retorne SOMENTE este JSON, sem markdown:
{ "categoria": "..." }`

/** Janela de dias pra contar feedbacks recentes na categoria escolhida —
 *  mesma ideia do "tema crítico" da Visão Geral (`criticalTheme` em
 *  visao-geral.ts): volume de reclamações recentes decide a urgência, não a
 *  opinião subjetiva da IA sobre o texto da ação. */
const JANELA_DIAS = 30
/** Cortes de contagem de feedbacks NEGATIVOS na categoria, dentro da janela
 *  acima. Abaixo do corte "importante", cai em observação. */
const CORTE_URGENTE = 5
const CORTE_IMPORTANTE = 2

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
      .select('id, titulo_acao, plano_detalhado, categoria, prioridade, restaurante_id')
      .eq('id', acaoId)
      .single()
    if (acaoErr) throw acaoErr
    if (!acao) return json({ error: 'Ação não encontrada' }, 404)

    // Nunca reescreve o que o dono já preencheu manualmente — só completa o
    // que ficou em branco.
    const precisaCategoria = !acao.categoria
    const precisaPrioridade = !acao.prioridade
    if (!precisaCategoria && !precisaPrioridade) {
      return json({ status: 'sem_alteracao' })
    }

    let categoriaFinal: string = acao.categoria || 'Outros'

    if (precisaCategoria) {
      const prompts = await carregarPrompts(db)
      const prompt = montarPrompt(prompts, 'ef_categorizar_acao', PROMPT_PADRAO, {
        categorias: CATEGORIAS.join(', '),
        titulo: acao.titulo_acao || '',
        plano: acao.plano_detalhado || '',
      })

      const params = await paramsDoAgente(db, AGENTE, {
        response_format: { type: 'json_object' },
        max_tokens: 100,
      })

      // Sem IA disponível (cota estourada, agente desativado pelo admin,
      // resposta fora do formato) cai em "Outros" em vez de deixar a ação
      // sem categoria nenhuma — o dono sempre pode trocar depois.
      if (params) {
        try {
          const { result } = await chamarIA(db, {
            messages: [{ role: 'user', content: prompt }],
            params,
            origem: 'categorizar-acao',
            restauranteId: acao.restaurante_id,
            agenteId: AGENTE,
          })
          const escolhida = typeof result === 'object' ? result?.categoria : null
          categoriaFinal = CATEGORIAS.includes(escolhida) ? escolhida : 'Outros'
        } catch (err) {
          if (err instanceof ErroCota) throw err
          categoriaFinal = 'Outros'
        }
      } else {
        categoriaFinal = 'Outros'
      }
    }

    let prioridadeFinal: string = acao.prioridade || 'OBSERVACAO'

    if (precisaPrioridade) {
      const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await db
        .from('feedbacks_restaurante')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', acao.restaurante_id)
        .eq('categoria', categoriaFinal)
        .eq('sentimento', 'negativo')
        .gte('created_at', desde)

      const negativos = count ?? 0
      prioridadeFinal =
        negativos >= CORTE_URGENTE ? 'URGENTE' : negativos >= CORTE_IMPORTANTE ? 'IMPORTANTE' : 'OBSERVACAO'
    }

    // deno-lint-ignore no-explicit-any
    const atualizacao: Record<string, any> = {}
    if (precisaCategoria) atualizacao.categoria = categoriaFinal
    if (precisaPrioridade) atualizacao.prioridade = prioridadeFinal

    const { error: updateErr } = await db
      .from('acoes_operacionais')
      .update(atualizacao)
      .eq('id', acaoId)
    if (updateErr) throw updateErr

    return json({ status: 'sucesso', categoria: categoriaFinal, prioridade: prioridadeFinal })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    // deno-lint-ignore no-explicit-any
    const e = err as any
    return json({ error: e?.message || String(err), code: e?.code }, 500)
  }
})
