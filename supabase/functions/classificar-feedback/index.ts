// Classifica UM feedback separado num tema — reusa um tema existente do
// restaurante quando é o mesmo ponto, ou cria um tema novo. Disparada pelo
// trigger trg_feedbacks_classificar a cada insert em feedbacks_restaurante.
//
// Estratégia (precisão): a IA recebe a LISTA de temas que já existem e decide se
// o feedback encaixa num deles ou é um ponto genuinamente diferente. Classificar
// um feedback não remexe os antigos → agrupamento estável.
//
// ## Por que esta função passou a usar a infra compartilhada
//
// Ela falava com o OpenRouter por `fetch` direto, montando o prompt por template
// string. Funcionava — e era o buraco mais caro do sistema.
//
// É o agente MAIS chamado que existe aqui: roda uma vez por ponto separado, e
// uma mensagem de cliente vira ~3 pontos. Ainda assim não aparecia em `uso_ia`
// (custo invisível), não chamava `checarCota` (furava o limite do restaurante),
// não passava por `paramsDoAgente` (o admin não conseguia trocar o modelo nem
// desligar) e não passava por `montarPrompt` (o prompt não era editável no
// painel). Auditado em 2026-08-27: 380 chamadas registradas em `uso_ia`, zero
// desta função.
//
// A saída vira ferramenta em vez de `json_object`: o schema garante o FORMATO,
// não só que é JSON válido. E, sem outra ferramenta disponível, ela é forçada já
// na primeira rodada — uma chamada por ponto, que é o que o caminho quente
// aguenta.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'

const AGENTE = 'classificador_feedback'

/**
 * Prompt padrão. O admin pode sobrescrever pelo painel (chave
 * `ef_classificar_feedback`); os placeholders são preenchidos aqui e não podem
 * ser removidos na edição.
 */
const PROMPT_PADRAO =
  `Você agrupa feedbacks de clientes de restaurante em TEMAS específicos.

## Temas que já existem neste restaurante
{temas}

## Feedback novo a classificar
"{texto}"
(categoria informada: {categoria}; sentimento: {sentimento})

## Regra
- Se este feedback fala do MESMO ponto específico de um tema acima, devolva o id desse tema (mesmo problema/elogio, ainda que com outras palavras).
- Só crie um tema NOVO se for um ponto genuinamente diferente.
- Seja ESPECÍFICO: "comida fria" e "comida sem sal" são temas DIFERENTES; "veio frio" e "estava gelado" são o MESMO tema.
- rotulo: curto, específico, no singular (ex.: "Comida fria", "Demora no atendimento", "Música alta", "Garçom atencioso").

Chame registrar_tema. Deixe tema_id como null se for um tema novo.`

const SCHEMA = {
  type: 'object',
  properties: {
    tema_id: {
      type: ['string', 'null'],
      description: 'Id de um tema da lista, ou null se este ponto for novo.',
    },
    rotulo: {
      type: 'string',
      description: 'Rotulo curto, especifico, no singular. Ex.: "Comida fria".',
    },
    tipo: { type: 'string', enum: ['elogio', 'reclamacao', 'neutro'] },
  },
  required: ['rotulo', 'tipo'],
}

// Encadeia a vinculação automática logo depois que o tema é conhecido.
//
// Por que aqui e não num trigger próprio no insert: `vincular-feedback` decide
// pelo `tema_id`, e o trigger de insert dispara ANTES desta função gravar o
// tema. Dois triggers no mesmo evento correriam, e a vinculação leria tema nulo
// — perdendo justamente o atalho determinístico que existe pra economizar IA.
//
// Nunca propaga erro: classificar o feedback é o trabalho principal, e ele não
// pode falhar porque a vinculação caiu. Sem vínculo o feedback só fica livre e
// entra na próxima rodada de geração de insights.
async function vincular(feedbackId: number | string) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vincular-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      },
      body: JSON.stringify({ feedback_id: feedbackId }),
    })
  } catch (e) {
    console.error('vinculação automática falhou:', e)
  }
}

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { feedback_id } = await req.json().catch(() => ({}))
    if (feedback_id == null) return json({ error: 'feedback_id ausente' }, 400)

    // deno-lint-ignore no-explicit-any
    const db: any = clienteAdmin()

    const { data: fb } = await db
      .from('feedbacks_restaurante')
      .select('id, restaurante_id, texto_original, resumo, categoria, sentimento, tema_id')
      .eq('id', feedback_id)
      .single()
    if (!fb || !fb.restaurante_id) return json({ error: 'feedback não encontrado' }, 404)
    if (fb.tema_id) {
      await vincular(fb.id)
      return json({ ok: true, ja_classificado: true })
    }

    const texto = String(fb.resumo || fb.texto_original || '').trim().slice(0, 1000)
    if (!texto) return json({ ok: false, motivo: 'feedback sem texto' })

    const { data: temas } = await db
      .from('feedback_temas')
      .select('id, rotulo, tipo')
      .eq('restaurante_id', fb.restaurante_id)
      .order('quantidade', { ascending: false })
      .limit(120)
    const existentes = temas ?? []
    const idsValidos = new Set(existentes.map((t: any) => String(t.id)))

    const lista = existentes.length
      ? existentes.map((t: any) => `- id:${t.id} | ${t.rotulo} (${t.tipo})`).join('\n')
      : '(nenhum tema ainda)'

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_classificar_feedback', PROMPT_PADRAO, {
      temas: lista,
      texto,
      categoria: fb.categoria ?? '—',
      sentimento: fb.sentimento ?? '—',
    })

    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 300 })
    // Agente desligado no painel: o feedback fica sem tema em vez de a função
    // estourar. Ele ainda entra na geração de insights, só sem o agrupamento.
    if (!params) return json({ ok: false, motivo: 'agente desativado' })

    // deno-lint-ignore no-explicit-any
    let parsed: any = {}
    try {
      const { result } = await chamarIA(db, {
        messages: [{ role: 'user', content: prompt }],
        params,
        origem: 'classificar-feedback',
        restauranteId: fb.restaurante_id,
        agenteId: AGENTE,
        calculadora: false,
        saida: {
          nome: 'registrar_tema',
          descricao: 'Registra o tema em que este feedback se encaixa.',
          schema: SCHEMA,
        },
      })
      parsed = result ?? {}
    } catch (err) {
      if (err instanceof ErroCota) {
        return json({ ok: false, motivo: 'sem crédito de IA' })
      }
      throw err
    }

    // Decide o tema: id existente (validado contra a lista, pra não aceitar id
    // inventado) ou cria um novo.
    let temaId: string | null =
      parsed.tema_id && idsValidos.has(String(parsed.tema_id)) ? String(parsed.tema_id) : null

    if (!temaId) {
      const rotulo = String(parsed.rotulo || 'Outros').trim().slice(0, 80)
      const tipo = ['elogio', 'reclamacao', 'neutro'].includes(parsed.tipo) ? parsed.tipo : 'reclamacao'

      // Reusa um tema com o mesmo rótulo (case-insensitive) se já existir — evita
      // duplicar quando dois feedbacks iguais chegam quase juntos.
      const acharPorRotulo = async () => {
        const { data } = await db
          .from('feedback_temas')
          .select('id')
          .eq('restaurante_id', fb.restaurante_id)
          .ilike('rotulo', rotulo)
          .maybeSingle()
        return data?.id ?? null
      }

      temaId = await acharPorRotulo()
      if (!temaId) {
        const { data: novo, error: errNovo } = await db
          .from('feedback_temas')
          .insert({ restaurante_id: fb.restaurante_id, rotulo, tipo, quantidade: 0 })
          .select('id')
          .single()
        if (errNovo) {
          // Corrida: o índice único barrou porque outro insert criou o mesmo
          // rótulo neste instante — reusa o que ganhou.
          temaId = await acharPorRotulo()
          if (!temaId) return json({ error: `falha ao criar tema: ${errNovo.message}` }, 500)
        } else {
          temaId = novo.id
        }
      }
    }

    await db.from('feedbacks_restaurante').update({ tema_id: temaId }).eq('id', fb.id)

    // Recalcula a contagem real do tema (e bumpa atualizado_em → Realtime avisa o app).
    const { count } = await db
      .from('feedbacks_restaurante')
      .select('id', { count: 'exact', head: true })
      .eq('tema_id', temaId)
    await db
      .from('feedback_temas')
      .update({ quantidade: count ?? 0, atualizado_em: new Date().toISOString() })
      .eq('id', temaId)

    await vincular(fb.id)

    return json({ ok: true, tema_id: temaId, quantidade: count ?? 0 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
