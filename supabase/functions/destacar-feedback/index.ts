// Marca em negrito (**trecho**) os pedaços do feedback original que permitem
// entender a mensagem batendo o olho — nem demais, nem de menos. Disparada
// pelo trigger trg_feedbacks_originais_destacar a cada insert em
// feedbacks_originais.
//
// ## Por que ela responde ANTES de terminar
//
// Quem chama é o `net.http_post` do trigger, e ele desliga a conexão aos 5
// segundos (é o padrão do pg_net, que o trigger não mudava). Esta função
// precisa falar com a IA: 1,6 a 2,1 s quando está quente, mas os feedbacks
// chegam esparsos, então quase toda invocação pega a função FRIA — e aí o
// tempo de subir o isolate mais o da IA passa dos 5 s, o pg_net corta, e o
// destaque nunca era gravado. Foi o que deixou 70 dos 72 feedbacks sem negrito.
//
// Agora o pedido é aceito na hora (202) e o trabalho continua em segundo plano
// com `EdgeRuntime.waitUntil`. O relógio do pg_net deixa de importar: ele só
// espera o "recebi".
//
// ## Dois modos
//
// - `{ original_id }` — um feedback, o caminho do trigger.
// - `{ lote: N }` — varre os que ficaram sem destaque e processa até N. É a
//   rede de segurança: nenhum disparo assíncrono acerta 100% das vezes, e sem
//   isso um feedback perdido fica perdido para sempre.
//
// Segurança: a IA é instruída a devolver o texto ORIGINAL sem alterar nada, só
// inserindo ** antes/depois dos trechos-chave. O código confere: tirando os
// **, a resposta tem que bater EXATAMENTE com o texto original — senão o
// destaque é descartado (o feedback continua aparecendo normal, sem negrito).
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

type Db = ReturnType<typeof createClient>

function conectar(): Db {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
}

/** Destaca UM feedback. Devolve o que aconteceu, para o log e para o lote. */
async function destacarUm(db: Db, original_id: string): Promise<{ ok: boolean; motivo?: string }> {
  {
    const { data: original } = await db
      .from('feedbacks_originais')
      .select('id, texto_original, texto_destacado')
      .eq('id', original_id)
      .single()
    if (!original) return { ok: false, motivo: 'feedback não encontrado' }
    if (original.texto_destacado) return { ok: true, motivo: 'já destacado' }

    const texto = String(original.texto_original || '').trim()
    // Texto curto demais não tem o que destacar (ex.: avaliação só por nota, sem comentário).
    if (texto.length < 12) return { ok: false, motivo: 'texto curto demais' }

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
    if (!apiKey) return { ok: false, motivo: 'OPENROUTER_API_KEY não configurada' }
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
    if (!resp.ok) return { ok: false, motivo: `IA falhou: ${(await resp.text()).slice(0, 200)}` }

    const data = await resp.json()
    let resposta = String(data.choices?.[0]?.message?.content ?? '').trim()
    if (!resposta) return { ok: false, motivo: 'resposta vazia' }

    // A IA às vezes embrulha a resposta inteira em "aspas", mesmo com a
    // instrução pra não fazer isso — tira essa camada extra antes de validar.
    const semAspas = resposta.match(/^"([\s\S]*)"$/)
    if (semAspas) resposta = semAspas[1]

    // Confere que a IA só inseriu ** — nenhuma outra letra pode ter mudado.
    const semMarcadores = resposta.replace(/\*\*/g, '').trim()
    if (semMarcadores !== texto) {
      return { ok: false, motivo: 'resposta da IA não preservou o texto original' }
    }

    await db.from('feedbacks_originais').update({ texto_destacado: resposta }).eq('id', original_id)
    return { ok: true }
  }
}

/**
 * A varredura: pega quem ficou sem destaque e tenta de novo.
 *
 * Em série, de propósito — são chamadas de IA, e disparar dezenas de uma vez
 * só rende 429 do provedor. Nenhuma falha interrompe as outras: um feedback
 * que a IA se recusa a destacar não pode impedir os cinquenta seguintes.
 */
async function destacarLote(db: Db, quantos: number) {
  const { data: pendentes } = await db
    .from('feedbacks_originais')
    .select('id')
    .is('texto_destacado', null)
    .not('texto_original', 'is', null)
    .order('created_at', { ascending: false })
    .limit(quantos)

  let feitos = 0
  const recusados: string[] = []
  for (const p of pendentes ?? []) {
    try {
      const r = await destacarUm(db, p.id as string)
      if (r.ok) feitos++
      else recusados.push(`${p.id}: ${r.motivo}`)
    } catch (e) {
      recusados.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { encontrados: pendentes?.length ?? 0, feitos, recusados }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const corpo = await req.json().catch(() => ({}))
  const original_id: string | undefined = corpo?.original_id
  const lote: number | undefined = corpo?.lote
  if (!original_id && !lote) return json({ error: 'informe original_id ou lote' }, 400)

  const db = conectar()

  // O LOTE responde só no fim: quem o chama é um cron ou uma pessoa, e os dois
  // querem saber quantos saíram. Sem pressa de relógio no meio.
  if (lote) {
    try {
      return json({ ok: true, ...(await destacarLote(db, Math.min(Number(lote) || 20, 200))) })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  // O caminho do TRIGGER responde antes de trabalhar — ver o cabeçalho: o
  // pg_net desliga aos 5 s e levava o destaque junto. `waitUntil` mantém o
  // isolate vivo depois da resposta, que é exatamente o que falta aqui.
  const tarefa = destacarUm(db, original_id as string)
    .then((r) => { if (!r.ok) console.log(`destaque não saiu (${original_id}): ${r.motivo}`) })
    .catch((e) => console.error(`destaque falhou (${original_id}):`, e))

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(tarefa)
    return json({ aceito: true }, 202)
  }
  // Sem `EdgeRuntime` (rodando localmente, por exemplo) não há segundo plano:
  // espera de verdade, senão o isolate morre no meio do trabalho.
  await tarefa
  return json({ ok: true })
})
