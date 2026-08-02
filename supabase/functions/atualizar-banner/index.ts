import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { restaurante_id, force = false, process_all = false } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    let restaurantes: { id: number }[] = []

    if (process_all) {
      const { data } = await supabaseAdmin
        .from('restaurantes')
        .select('id')
        .eq('ativo', true)
        .is('excluida_em', null)
      restaurantes = data || []
    } else if (restaurante_id) {
      restaurantes = [{ id: restaurante_id }]
    } else {
      const { data } = await supabaseAdmin
        .from('restaurantes')
        .select('id')
        .eq('ativo', true)
        .is('excluida_em', null)
        .limit(1)
      restaurantes = data || []
    }

    if (restaurantes.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum restaurante encontrado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resultados = []
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    const modelo = Deno.env.get('OPENROUTER_MODELO') || 'google/gemini-2.5-flash-lite'

    for (const rest of restaurantes) {
      try {
        const { data: config, error: configErr } = await supabaseAdmin
          .from('restaurantes')
          .select('ultima_atualizacao_banner, mascote_config, excluida_em')
          .eq('id', rest.id)
          .single()

        if (configErr || !config) continue

        // Conta encerrada (soft delete): nao gasta chamada de IA. Cobre tambem
        // o caminho em que a funcao e chamada direto com um restaurante_id.
        if (config.excluida_em) {
          resultados.push({ id: rest.id, status: 'conta_encerrada' })
          continue
        }

        const ultimaAtualizacao = config.ultima_atualizacao_banner
          ? new Date(config.ultima_atualizacao_banner)
          : null
        const horasPassadas = ultimaAtualizacao
          ? (new Date().getTime() - ultimaAtualizacao.getTime()) / (1000 * 60 * 60)
          : Infinity

        if (!force && horasPassadas < 24) {
          resultados.push({ id: rest.id, status: 'ignorado_tempo' })
          continue
        }

        const data24hAtras = new Date()
        data24hAtras.setHours(data24hAtras.getHours() - 24)

        let { data: feedbacks } = await supabaseAdmin
          .from('feedbacks_restaurante')
          .select('texto_original, sentimento, categoria')
          .gte('created_at', data24hAtras.toISOString())

        if (!feedbacks || feedbacks.length === 0) {
          const data48hAtras = new Date()
          data48hAtras.setHours(data48hAtras.getHours() - 48)
          const { data: feedbacks48h } = await supabaseAdmin
            .from('feedbacks_restaurante')
            .select('texto_original, sentimento, categoria')
            .gte('created_at', data48hAtras.toISOString())
          feedbacks = feedbacks48h || []
        }

        const textoPadrao = 'Continue coletando feedbacks para receber insights do Chef Pepê.'

        if (feedbacks.length < 3) {
          await supabaseAdmin
            .from('restaurantes')
            .update({
              texto_banner: textoPadrao,
              ultima_atualizacao_banner: new Date().toISOString(),
            })
            .eq('id', rest.id)

          resultados.push({ id: rest.id, status: 'padrao_poucos_feedbacks', texto: textoPadrao })
          continue
        }

        if (!apiKey) {
          throw new Error('OPENROUTER_API_KEY ausente')
        }

        const mascoteConfig = (config.mascote_config as any) || {}
        const nomeMascote = mascoteConfig.nome || 'Chef Pepê'

        const prompt = `Você é o "${nomeMascote}", um assistente analisando feedbacks de clientes de um restaurante.
Sua missão é gerar UMA frase curta (máximo 2 linhas, tom profissional e amigável) resumindo o destaque dos feedbacks das últimas horas.
Exemplos: "Ontem recebemos 12 feedbacks, 83% positivos. Destaque: 4 elogios à nova sobremesa." ou "Nas últimas 24h, surgiram 3 menções negativas sobre tempo de espera. Vale investigar."
NÃO use formatação JSON nem markdown (asteriscos). Retorne apenas o texto puro da frase.
Feedbacks a analisar:
${JSON.stringify(feedbacks)}`

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
          }),
        })

        if (!response.ok) {
          resultados.push({ id: rest.id, status: 'erro_api_llm' })
          continue
        }

        const aiData = await response.json()
        const textoBanner =
          aiData.choices?.[0]?.message?.content?.replace(/\*/g, '')?.trim() ?? textoPadrao

        await supabaseAdmin
          .from('restaurantes')
          .update({
            texto_banner: textoBanner,
            ultima_atualizacao_banner: new Date().toISOString(),
          })
          .eq('id', rest.id)

        resultados.push({ id: rest.id, status: 'atualizado', texto: textoBanner })
      } catch (err: any) {
        resultados.push({ id: rest.id, status: 'erro', message: err.message })
      }
    }

    return new Response(JSON.stringify({ message: 'Processamento concluído', resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
