/**
 * Liga um feedback recém-chegado a uma ação ou insight que já trata daquilo.
 *
 * Disparada pelo trigger de insert em `feedbacks_restaurante`, logo depois de o
 * `classificar-feedback` atribuir o `tema_id`.
 *
 * ## Por que existe
 *
 * Sem isto, um feedback que chega hoje sobre um problema que a equipe já está
 * resolvendo fica parado até a próxima rodada de geração — e pior: pode virar
 * um insight duplicado do mesmo assunto. E, do lado do cliente, ele nunca
 * receberia o aviso de que o problema dele foi tratado, porque o motor de
 * resposta encontra o destinatário justamente pelos vínculos.
 *
 * ## Por que a IA não decide tudo
 *
 * O caminho é o mais quente do sistema: toda mensagem de cliente vira ~3
 * feedbacks separados, e cada um já pagou uma chamada de IA no
 * `classificar-feedback`. Botar mais uma por feedback aqui triplicaria o custo
 * do ingresso.
 *
 * O funil resolve quase tudo sem IA:
 *
 *   1. Mesmo `tema_id` de uma ação aberta  -> liga direto, zero IA. O tema já
 *      foi calculado; é a mesma decisão de agrupamento que gerou o insight.
 *   2. Mesmo `tema_id` de um insight ativo -> liga direto, zero IA.
 *   3. Nenhum candidato na categoria       -> fica livre, zero IA.
 *   4. Candidatos ambiguos                 -> UMA chamada de IA decide.
 *
 * Contaminação não é risco aqui: a saída é uma decisão de vínculo, não prosa.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'

const AGENTE = 'vinculador_feedback'

/** Acima disto a decisão vira ruído: manda para a IA em vez de adivinhar. */
const MAX_CANDIDATOS = 8

const PROMPT = `Voce decide se um feedback novo de cliente ja esta coberto por algo que a equipe do restaurante esta tratando.

## O feedback que acabou de chegar
"{texto}"
Categoria: {categoria} | Sentimento: {sentimento}

## Acoes em andamento (o restaurante ja esta resolvendo)
{acoes}

## Insights ativos (identificados, ainda nao viraram acao)
{insights}

## Sua tarefa
Escolha UMA opcao:
- "acao" + o id, se uma das acoes acima resolve o problema deste feedback.
- "insight" + o id, se um dos insights acima e sobre este mesmo problema.
- "nenhum", se nada acima trata deste problema.

Regras:
- Tem que ser o MESMO problema, nao apenas a mesma area. "A comida demorou" e
  "a comida veio fria" sao problemas diferentes, mesmo os dois sendo sobre
  comida. "O banheiro estava sujo" e "a mesa estava suja" tambem.
- Na duvida, responda "nenhum". Um vinculo errado faz o cliente receber uma
  mensagem dizendo que resolvemos algo que ele nunca relatou.
- Elogio quase nunca se liga a uma acao corretiva.

Chame registrar_decisao.`

const SCHEMA = {
  type: 'object',
  properties: {
    destino: { type: 'string', enum: ['acao', 'insight', 'nenhum'] },
    id: { type: 'string', description: 'Id do destino escolhido. Vazio quando "nenhum".' },
    motivo: { type: 'string', description: 'Uma frase curta.' },
  },
  required: ['destino'],
}

// deno-lint-ignore no-explicit-any
type Db = any

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { feedback_id: feedbackId } = await req.json().catch(() => ({}))
    if (!feedbackId) return json({ error: 'feedback_id é obrigatório' }, 400)

    const db: Db = clienteAdmin()

    const { data: fb } = await db
      .from('feedbacks_restaurante')
      .select('id, texto_original, resumo, categoria, sentimento, tema_id, origem_id, restaurante_id, usado_em')
      .eq('id', feedbackId)
      .maybeSingle()

    if (!fb) return json({ status: 'feedback_nao_encontrado' })
    // Já consumido por outra rota (backfill, geração concorrente): não mexe.
    if (fb.usado_em) return json({ status: 'ja_usado' })

    const texto = (fb.texto_original || fb.resumo || '').trim()
    if (!texto) return json({ status: 'sem_texto' })

    // ---- Candidatos: ações abertas e insights vivos ----
    const [{ data: acoes }, { data: insights }] = await Promise.all([
      db.from('acoes_operacionais')
        .select('id, titulo_acao, plano_detalhado, categoria')
        .eq('restaurante_id', fb.restaurante_id)
        .in('status', ['PENDENTE', 'EM_ANDAMENTO'])
        .is('arquivada_em', null),
      db.from('insights')
        .select('id, titulo, descricao, categoria, assunto_chave')
        .eq('restaurante_id', fb.restaurante_id)
        .eq('ativo', true)
        .is('deletado_em', null),
    ])

    // ---- 1. Atalho determinístico: mesmo tema ----
    // O `tema_id` foi atribuído pelo classificar-feedback com o mesmo critério
    // que agrupou os assuntos na geração. Se bate, é o mesmo assunto — não há
    // o que uma IA acrescentar aqui.
    //
    // A ação vem por consulta separada, e não por embed: existem DUAS FKs entre
    // `acoes_operacionais` e `insights` (`acoes.insight_id` e `insights.acao_id`),
    // então `insights!inner(...)` é ambíguo e o PostgREST devolve PGRST201. E os
    // dois sentidos precisam ser olhados de qualquer jeito — ações antigas
    // perderam o `insight_id` num `on delete set null`, e é o insight que passou
    // a guardar o `acao_id` quando virou ação.
    if (fb.tema_id) {
      const negativo = (fb.sentimento || '').toLowerCase().includes('negativ')
      const chaveEsperada = `tema:${fb.tema_id}|${negativo ? 'neg' : 'pos'}`

      const { data: doTema } = await db
        .from('insights')
        .select('id, acao_id, ativo, deletado_em')
        .eq('restaurante_id', fb.restaurante_id)
        .eq('assunto_chave', chaveEsperada)

      // deno-lint-ignore no-explicit-any
      const vivo = (doTema ?? []).find((i: any) => i.ativo && !i.deletado_em)
      if (vivo) {
        await ligarAoInsight(db, fb, vivo.id)
        return json({ status: 'ligado', destino: 'insight', id: vivo.id, via: 'tema' })
      }

      if (doTema && doTema.length > 0) {
        // deno-lint-ignore no-explicit-any
        const acaoIds = doTema.map((i: any) => i.acao_id).filter(Boolean)
        // deno-lint-ignore no-explicit-any
        const insightIds = doTema.map((i: any) => i.id)

        const filtros = [`insight_id.in.(${insightIds.join(',')})`]
        if (acaoIds.length > 0) filtros.push(`id.in.(${acaoIds.join(',')})`)

        const { data: acaoDoTema } = await db
          .from('acoes_operacionais')
          .select('id')
          .eq('restaurante_id', fb.restaurante_id)
          .in('status', ['PENDENTE', 'EM_ANDAMENTO'])
          .is('arquivada_em', null)
          .or(filtros.join(','))
          .limit(1)

        if (acaoDoTema && acaoDoTema.length > 0) {
          await ligarAAcao(db, fb, acaoDoTema[0].id)
          return json({ status: 'ligado', destino: 'acao', id: acaoDoTema[0].id, via: 'tema' })
        }
      }
    }

    // ---- 2. Sem candidato da mesma categoria: fica livre, sem gastar IA ----
    // deno-lint-ignore no-explicit-any
    const acoesCat = (acoes ?? []).filter((a: any) => a.categoria === fb.categoria)
    // deno-lint-ignore no-explicit-any
    const insightsCat = (insights ?? []).filter((i: any) => i.categoria === fb.categoria)

    if (acoesCat.length === 0 && insightsCat.length === 0) {
      return json({ status: 'livre', motivo: 'nenhum candidato na categoria' })
    }

    // ---- 3. Ambíguo: uma chamada de IA ----
    const prompts = await carregarPrompts(db)
    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 400 })
    if (!params) return json({ status: 'livre', motivo: 'agente desativado' })

    const prompt = montarPrompt(prompts, 'ef_vincular_feedback', PROMPT, {
      texto,
      categoria: fb.categoria ?? '?',
      sentimento: fb.sentimento ?? '?',
      acoes: acoesCat.length
        ? acoesCat
            .slice(0, MAX_CANDIDATOS)
            // deno-lint-ignore no-explicit-any
            .map((a: any) => `- id ${a.id}: ${a.titulo_acao} — ${(a.plano_detalhado ?? '').slice(0, 160)}`)
            .join('\n')
        : '(nenhuma)',
      insights: insightsCat.length
        ? insightsCat
            .slice(0, MAX_CANDIDATOS)
            // deno-lint-ignore no-explicit-any
            .map((i: any) => `- id ${i.id}: ${i.titulo} — ${(i.descricao ?? '').slice(0, 160)}`)
            .join('\n')
        : '(nenhum)',
    })

    let decisao: { destino?: string; id?: string; motivo?: string }
    try {
      const { result } = await chamarIA(db, {
        messages: [{ role: 'user', content: prompt }],
        params,
        origem: 'vincular-feedback',
        restauranteId: fb.restaurante_id,
        agenteId: AGENTE,
        calculadora: false,
        saida: {
          nome: 'registrar_decisao',
          descricao: 'Registra se o feedback se liga a alguma acao ou insight.',
          schema: SCHEMA,
        },
      })
      decisao = result ?? {}
    } catch (err) {
      if (err instanceof ErroCota) return json({ status: 'livre', motivo: 'sem credito' })
      console.error('Falha ao decidir vinculo:', err)
      return json({ status: 'livre', motivo: 'erro na IA' })
    }

    // A IA pode devolver id que não estava na lista — só passa o que ela viu.
    if (decisao.destino === 'acao') {
      // deno-lint-ignore no-explicit-any
      const valida = acoesCat.find((a: any) => String(a.id) === String(decisao.id))
      if (valida) {
        await ligarAAcao(db, fb, valida.id)
        return json({ status: 'ligado', destino: 'acao', id: valida.id, via: 'ia', motivo: decisao.motivo })
      }
    }
    if (decisao.destino === 'insight') {
      // deno-lint-ignore no-explicit-any
      const valido = insightsCat.find((i: any) => String(i.id) === String(decisao.id))
      if (valido) {
        await ligarAoInsight(db, fb, valido.id)
        return json({ status: 'ligado', destino: 'insight', id: valido.id, via: 'ia', motivo: decisao.motivo })
      }
    }

    return json({ status: 'livre', motivo: decisao.motivo ?? 'nenhum candidato serve' })
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    const e = err as any
    console.error('vincular-feedback:', e)
    return json({ error: e?.message || String(err) }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function ligarAoInsight(db: Db, fb: any, insightId: string) {
  const { error } = await db.from('insight_feedback').insert({
    insight_id: insightId,
    feedback_restaurante_id: fb.id,
    feedback_original_id: fb.origem_id,
    restaurante_id: fb.restaurante_id,
    origem: 'vinculo_novo',
  })
  // `insights.feedbacks_relacionados` não é atualizado aqui: um trigger em
  // `insight_feedback` recalcula (migration 20260827000000). Fazer na mão
  // deixava o contador alto quando a linha sumia por cascade.
  if (error) console.error('Falha ao ligar ao insight:', error)
}

// deno-lint-ignore no-explicit-any
async function ligarAAcao(db: Db, fb: any, acaoId: number) {
  const { error } = await db.from('feedback_acao').insert({
    acao_id: acaoId,
    feedback_restaurante_id: fb.id,
    feedback_original_id: fb.origem_id,
    restaurante_id: fb.restaurante_id,
  })
  if (error) console.error('Falha ao ligar à ação:', error)
}
