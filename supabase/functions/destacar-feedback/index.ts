// Marca em negrito (**trecho**) os pedaços do feedback original que permitem
// entender a mensagem batendo o olho — nem demais, nem de menos. Disparada
// pelo trigger trg_feedbacks_originais_destacar a cada insert em
// feedbacks_originais.
//
// Segurança: a IA é instruída a devolver o texto ORIGINAL sem alterar nada, só
// inserindo ** antes/depois dos trechos-chave. O código confere: tirando os
// **, a resposta tem que bater EXATAMENTE com o texto original — senão o
// destaque é descartado (o feedback continua aparecendo normal, sem negrito).
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
    const { original_id } = await req.json().catch(() => ({}))
    if (!original_id) return json({ error: 'original_id ausente' }, 400)

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: original } = await db
      .from('feedbacks_originais')
      .select('id, texto_original, texto_destacado')
      .eq('id', original_id)
      .single()
    if (!original) return json({ error: 'feedback não encontrado' }, 404)
    if (original.texto_destacado) return json({ ok: true, ja_destacado: true })

    const texto = String(original.texto_original || '').trim()
    // Texto curto demais não tem o que destacar (ex.: avaliação só por nota, sem comentário).
    if (texto.length < 12) return json({ ok: false, motivo: 'texto curto demais' })

    const prompt = `Você recebe o feedback de um cliente de restaurante (às vezes transcrito de áudio, então pode ter erros, gírias e frases soltas). Sua tarefa é marcar em negrito, usando **dois asteriscos**, só os trechos que permitem alguém ENTENDER o feedback batendo o olho rapidamente, sem precisar ler a frase toda — como se fosse o resumo visual da mensagem pra quem só tem 2 segundos.

## Como decidir o que destacar
- Destaque o TRECHO que carrega a informação central de cada ponto (o que foi elogiado ou reclamado), não a frase toda em volta dele e não uma palavra solta demais.
- Se o feedback fala de mais de uma coisa (ex.: elogia o ambiente E reclama da comida), destaque um trecho pra CADA ponto — pode haver vários ** no mesmo texto.
- Ignore partes puramente informativas/contextuais que não ajudam a entender o feedback em si (ex.: "eu fui lá pro aniversário do meu primo", "cheguei lá umas 8 da noite") — não destaque essas.
- Se o feedback inteiro já for curto e direto (uma frase só, sem "enchimento" em volta), destacar a frase inteira é aceitável.
- Se não houver nada de fato relevante pra destacar (feedback só contextual, sem opinião nenhuma), devolva o texto sem nenhum **.

## Regra mais importante: NUNCA mude o texto
Devolva o texto ORIGINAL, IDÊNTICO, byte a byte — sem corrigir erros de português, sem arrumar gíria, sem mudar pontuação, sem adicionar ou tirar nenhuma palavra, sem envolver a resposta em aspas. A ÚNICA coisa que você pode inserir são os pares de **. Se você mudar uma letra sequer, a resposta inteira é descartada pelo sistema — então em caso de dúvida sobre destacar ou não um trecho, prefira destacar menos, nunca reescrever.

## Exemplos

Feedback: "Assim ó, o restaurante, o ambiente é bem agradável, mas a comida veio fria e os garçons pareciam que tinham começado a trabalhar hoje, estavam todos perdidos."
Resposta: Assim ó, o restaurante, o **ambiente é bem agradável**, mas a **comida veio fria** e os garçons pareciam que tinham começado a trabalhar hoje, **estavam todos perdidos**.

Feedback: "O lugar tem beleza magnífica Mas a comida é pior do q lixao"
Resposta: O lugar tem **beleza magnífica** Mas a **comida é pior do q lixao**

Feedback: "Atendimento excelente, garçom muito atencioso e agilidade impressionante na entrega dos pratos!"
Resposta: **Atendimento excelente**, garçom muito atencioso e **agilidade impressionante** na entrega dos pratos!

Feedback: "Assim ó, eu fui num restaurante pro aniversário do meu primo, toda a nossa família tava combinando de ir lá né, pro restaurante, daí eu fui tentar reservar as mesas e eu tive dificuldade porque o sistema ficava travando e tudo mais, mas daí depois eu descobri como fazer e daí deu certo e até por... até a coisa da comida, tipo, foi bem boa."
Resposta: Assim ó, eu fui num restaurante pro aniversário do meu primo, toda a nossa família tava combinando de ir lá né, pro restaurante, daí eu fui tentar reservar as mesas e eu tive **dificuldade porque o sistema ficava travando e tudo mais**, mas daí depois eu descobri como fazer e daí deu certo e até por... até a coisa da comida, tipo, **foi bem boa**.

Feedback: "Caramba, o restaurante foi razoável assim."
Resposta: Caramba, o restaurante foi **razoável** assim.

Feedback: "A comida estava ótima, o preço um pouco salgado, mas o atendimento foi impecável."
Resposta: A comida estava **ótima**, o preço **um pouco salgado**, mas o atendimento foi **impecável**.

Feedback: "a comida tava mt boa mas demorou pra caramba slc"
Resposta: a comida tava **mt boa** mas **demorou pra caramba** slc
(errado seria corrigir pra "A comida estava muito boa, mas demorou muito" — nunca faça isso)

Feedback: "Eu sentei lá na janela porque minha família ia fazer um aniversário."
Resposta: Eu sentei lá na janela porque minha família ia fazer um aniversário.
(nada de opinião aqui — é só contexto, então devolve sem nenhum **)

## Feedback a processar
"${texto}"

Responda SOMENTE o texto (com os ** inseridos, ou sem nenhum se não houver nada pra destacar). Nada de aspas extras envolvendo a resposta, nada de explicação, nada de markdown além dos **.`

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
      }),
    })
    if (!resp.ok) return json({ error: `IA falhou: ${await resp.text()}` }, 502)

    const data = await resp.json()
    let resposta = String(data.choices?.[0]?.message?.content ?? '').trim()
    if (!resposta) return json({ ok: false, motivo: 'resposta vazia' })

    // A IA às vezes embrulha a resposta inteira em "aspas", mesmo com a
    // instrução pra não fazer isso — tira essa camada extra antes de validar.
    const semAspas = resposta.match(/^"([\s\S]*)"$/)
    if (semAspas) resposta = semAspas[1]

    // Confere que a IA só inseriu ** — nenhuma outra letra pode ter mudado.
    const semMarcadores = resposta.replace(/\*\*/g, '').trim()
    if (semMarcadores !== texto) {
      return json({ ok: false, motivo: 'resposta da IA não preservou o texto original' })
    }

    await db.from('feedbacks_originais').update({ texto_destacado: resposta }).eq('id', original_id)

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
