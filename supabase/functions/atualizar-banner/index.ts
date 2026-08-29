import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, checarCota, ErroCota } from '../_shared/openrouter.ts'
import { nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'

const AGENTE = 'banner'

/** Padrão do código; o admin sobrescreve pela chave ef_banner no painel. */
const PROMPT_PADRAO = `Você é o "{nome}", um assistente analisando feedbacks de clientes de um restaurante.
Sua missão é gerar UMA frase curta (máximo 2 linhas, tom profissional e amigável) resumindo o
destaque dos feedbacks das últimas horas.

{tom}

Se a frase precisar de uma contagem ou porcentagem (ex.: "12 feedbacks, 83% positivos"), NUNCA
calcule de cabeça — use a ferramenta de calculadora disponível para contar/calcular com exatidão
antes de escrever o número. Nunca escreva um número que você não tenha certeza de ter contado ou
calculado corretamente.

Exemplos: "Ontem recebemos 12 feedbacks, 83% positivos. Destaque: 4 elogios à nova sobremesa."
ou "Nas últimas 24h, surgiram 3 menções negativas sobre tempo de espera. Vale investigar."
NÃO use formatação JSON nem markdown (asteriscos). Retorne apenas o texto puro da frase.

Feedbacks a analisar:
{feedbacks}`

const TEXTO_PADRAO = 'Continue coletando feedbacks para receber insights do Chef Pepê.'

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const { restaurante_id: restauranteId, force = false, process_all: processAll = false } = body

    const db = clienteAdmin()

    let restaurantes: { id: number }[] = []
    if (processAll) {
      const { data } = await db
        .from('restaurantes').select('id').eq('ativo', true).is('excluida_em', null)
      restaurantes = data || []
    } else if (restauranteId) {
      restaurantes = [{ id: restauranteId }]
    } else {
      const { data } = await db
        .from('restaurantes').select('id').eq('ativo', true).is('excluida_em', null).limit(1)
      restaurantes = data || []
    }

    if (!restaurantes.length) return json({ message: 'Nenhum restaurante encontrado.' })

    const prompts = await carregarPrompts(db)
    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 200 })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    const resultados = []

    for (const rest of restaurantes) {
      try {
        const { data: config, error: configErr } = await db
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

        const desde = (horas: number) => {
          const d = new Date()
          d.setHours(d.getHours() - horas)
          return d.toISOString()
        }

        // O filtro por restaurante_id faltava aqui: dentro do laço por
        // restaurante, cada banner era gerado com os feedbacks de TODOS os
        // restaurantes da plataforma.
        let { data: feedbacks } = await db
          .from('feedbacks_restaurante')
          .select('texto_original, sentimento, categoria')
          .eq('restaurante_id', rest.id)
          .gte('created_at', desde(24))

        if (!feedbacks?.length) {
          const { data: feedbacks48h } = await db
            .from('feedbacks_restaurante')
            .select('texto_original, sentimento, categoria')
            .eq('restaurante_id', rest.id)
            .gte('created_at', desde(48))
          feedbacks = feedbacks48h || []
        }

        if (feedbacks.length < 3) {
          await db
            .from('restaurantes')
            .update({
              texto_banner: TEXTO_PADRAO,
              ultima_atualizacao_banner: new Date().toISOString(),
            })
            .eq('id', rest.id)

          resultados.push({ id: rest.id, status: 'padrao_poucos_feedbacks', texto: TEXTO_PADRAO })
          continue
        }

        // A cota é por restaurante, então precisa ser checada dentro do laço:
        // um restaurante sem crédito não pode interromper os demais.
        try {
          await checarCota(db, rest.id)
        } catch (e) {
          if (e instanceof ErroCota) {
            resultados.push({ id: rest.id, status: 'sem_credito' })
            continue
          }
          throw e
        }

        const prompt = montarPrompt(prompts, 'ef_banner', PROMPT_PADRAO, {
          nome: nomeDoAssistente(config.mascote_config),
          tom: tomDoAssistente(config.mascote_config),
          feedbacks: JSON.stringify(feedbacks),
        })

        const { result } = await chamarIA(db, {
          messages: [{ role: 'user', content: prompt }],
          params,
          origem: 'atualizar-banner',
          restauranteId: rest.id,
          agenteId: AGENTE,
          checarCotaAntes: false,
        })

        const textoBanner = String(result || '').replace(/\*/g, '').trim() || TEXTO_PADRAO

        await db
          .from('restaurantes')
          .update({
            texto_banner: textoBanner,
            ultima_atualizacao_banner: new Date().toISOString(),
          })
          .eq('id', rest.id)

        resultados.push({ id: rest.id, status: 'atualizado', texto: textoBanner })
      } catch (err) {
        resultados.push({ id: rest.id, status: 'erro', message: (err as Error).message })
      }
    }

    return json({ message: 'Processamento concluído', resultados })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
