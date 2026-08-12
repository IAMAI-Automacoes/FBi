// Classifica UM feedback separado num tema — reusa um tema existente do
// restaurante quando é o mesmo ponto, ou cria um tema novo. Disparada pelo
// trigger trg_feedbacks_classificar a cada insert em feedbacks_restaurante.
//
// Estratégia (precisão): a IA recebe a LISTA de temas que já existem e decide se
// o feedback encaixa num deles ou é um ponto genuinamente diferente. Classificar
// um feedback não remexe os antigos → agrupamento estável.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { feedback_id } = await req.json().catch(() => ({}))
    if (feedback_id == null) return json({ error: 'feedback_id ausente' }, 400)

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: fb } = await db
      .from('feedbacks_restaurante')
      .select('id, restaurante_id, texto_original, resumo, categoria, sentimento, tema_id')
      .eq('id', feedback_id)
      .single()
    if (!fb || !fb.restaurante_id) return json({ error: 'feedback não encontrado' }, 404)
    if (fb.tema_id) return json({ ok: true, ja_classificado: true })

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

    const prompt = `Você agrupa feedbacks de clientes de restaurante em TEMAS específicos.

## Temas que já existem neste restaurante
${lista}

## Feedback novo a classificar
"${texto}"
(categoria informada: ${fb.categoria ?? '—'}; sentimento: ${fb.sentimento ?? '—'})

## Regra
- Se este feedback fala do MESMO ponto específico de um tema acima, devolva o id desse tema (mesmo problema/elogio, ainda que com outras palavras).
- Só crie um tema NOVO se for um ponto genuinamente diferente.
- Seja ESPECÍFICO: "comida fria" e "comida sem sal" são temas DIFERENTES; "veio frio" e "estava gelado" são o MESMO tema.
- rotulo: curto, específico, no singular (ex.: "Comida fria", "Demora no atendimento", "Música alta", "Garçom atencioso").

## Responda SOMENTE este JSON
{"tema_id": "<id de um tema existente, ou null se for novo>", "rotulo": "<rótulo do tema>", "tipo": "elogio" | "reclamacao" | "neutro"}`

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json({ error: 'OPENROUTER_API_KEY não configurada' }, 500)
    const modelo = Deno.env.get('OPENROUTER_MODELO') || 'google/gemini-2.5-flash-lite'

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    if (!resp.ok) return json({ error: `IA falhou: ${await resp.text()}` }, 502)

    const data = await resp.json()
    let parsed: any = {}
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
    } catch {
      return json({ error: 'resposta da IA ilegível' }, 502)
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

    return json({ ok: true, tema_id: temaId, quantidade: count ?? 0 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
