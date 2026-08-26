/**
 * Ferramentas que os agentes de insight/ação podem chamar durante a análise.
 *
 * Todas são construídas POR ASSUNTO, capturando num closure a lista de pontos
 * daquele assunto. Isso não é detalhe de implementação — é a primeira camada
 * anti-contaminação: a IA que está redigindo o insight sobre "demora" não
 * consegue buscar o feedback de "comida fria" nem que queira, porque a função
 * que ela chama simplesmente não aceita aquele id.
 *
 * A defesa não pode morar no prompt. O dono do produto escolheu que a IA
 * receba a mensagem original INTEIRA quando pedir (para julgar tom e
 * gravidade), e uma mensagem real do banco é assim:
 *
 *   "A comida até que é boa, mas demorou quase 50 minutos pra chegar (...)
 *    Quando chegou, o prato principal já estava frio. O ambiente pelo menos
 *    é bonito e aconchegante."
 *
 * Três assuntos num texto só. Ler isso para escrever sobre demora é
 * inevitavelmente ver os outros dois. Por isso o allowlist aqui é só o
 * primeiro anel; o segundo é o detector determinístico (`anti-vazamento.ts`)
 * e o terceiro é a chamada de verificação.
 */

import type { Ferramenta } from './openrouter.ts'
// Reusa o tipo de `assuntos.ts` em vez de declarar um igual aqui: eram duas
// definições estruturalmente idênticas, e TypeScript aceitaria as duas mesmo
// se divergissem num campo — o erro só apareceria em produção.
import type { PontoDoAssunto } from './assuntos.ts'

// deno-lint-ignore no-explicit-any -- client do supabase-js não é tipado aqui
type Db = any

export type { PontoDoAssunto }

/**
 * `ler_original` — devolve a mensagem completa de onde um ponto veio.
 *
 * Só aceita id que esteja no assunto em análise. Id de outro assunto, de outro
 * restaurante ou inventado devolve erro — e o erro vai PARA A IA, que segue a
 * análise sem aquele dado em vez de a geração inteira quebrar.
 *
 * A resposta vem com um aviso explícito de escopo. Ele não substitui as camadas
 * seguintes (modelo pode ignorar instrução), mas reduz a chance de a IA achar
 * que os outros trechos são material de trabalho.
 */
export function ferramentaLerOriginal(db: Db, pontosDoAssunto: PontoDoAssunto[]): Ferramenta {
  const permitidos = new Map(pontosDoAssunto.map((p) => [String(p.id), p]))

  return {
    maxChamadas: 4,
    definicao: {
      type: 'function',
      function: {
        name: 'ler_original',
        description:
          'Le a mensagem completa que o cliente enviou, para julgar tom, intensidade e gravidade ' +
          'do relato. Use quando a gravidade estiver incerta ou quando precisar entender o que de ' +
          'fato aconteceu. ATENCAO: a mensagem quase sempre fala de VARIOS assuntos; voce so pode ' +
          'usar o que se refere ao assunto em analise.',
        parameters: {
          type: 'object',
          properties: {
            ponto_id: {
              type: 'string',
              description: 'O "id" de um dos pontos listados no assunto em analise.',
            },
          },
          required: ['ponto_id'],
        },
      },
    },
    executar: async (argumentos: string) => {
      let args: { ponto_id?: string | number }
      try {
        args = JSON.parse(argumentos || '{}')
      } catch {
        return JSON.stringify({ erro: 'argumentos invalidos' })
      }

      const ponto = permitidos.get(String(args.ponto_id ?? ''))
      if (!ponto) {
        return JSON.stringify({
          erro: 'ponto fora do escopo deste assunto',
          pontos_disponiveis: [...permitidos.keys()],
        })
      }
      if (!ponto.origem_id) {
        return JSON.stringify({ erro: 'este ponto nao tem mensagem original registrada' })
      }

      const { data, error } = await db
        .from('feedbacks_originais')
        .select('texto_original, created_at, sentimento')
        .eq('id', ponto.origem_id)
        .maybeSingle()

      if (error) return JSON.stringify({ erro: error.message })
      if (!data) return JSON.stringify({ erro: 'mensagem original nao encontrada' })

      // Os pontos IRMÃOS são listados por CATEGORIA, sem texto. Isso dá à IA a
      // informação útil ("esta pessoa teve uma experiência ruim em três
      // frentes") sem entregar o conteúdo que ela não pode usar.
      const { data: irmaos } = await db
        .from('feedbacks_restaurante')
        .select('id, categoria, sentimento')
        .eq('origem_id', ponto.origem_id)
        .neq('id', ponto.id)

      return JSON.stringify({
        texto_da_mensagem: data.texto_original,
        enviada_em: data.created_at,
        trecho_em_analise: ponto.texto,
        outros_assuntos_desta_mensagem: (irmaos ?? []).map((i: { categoria: string | null; sentimento: string | null }) => ({
          categoria: i.categoria,
          sentimento: i.sentimento,
        })),
        AVISO:
          'A mensagem acima pode conter outros assuntos. Use APENAS o que se refere a "' +
          (ponto.categoria ?? 'assunto em analise') +
          '" e ao trecho em analise. Nao mencione, nao resuma e nao sugira nada sobre os demais ' +
          'assuntos — eles serao tratados nos proprios insights.',
      })
    },
  }
}

/**
 * `historico_do_assunto` — este tema já virou insight ou ação recentemente?
 *
 * Serve para a IA não levantar como novidade algo que a equipe já está
 * tratando, e para reconhecer reincidência ("voltou depois de encerrado" é
 * sinal de que a solução anterior não pegou).
 */
export function ferramentaHistoricoDoAssunto(
  db: Db,
  restauranteId: number,
  categoria: string | null,
): Ferramenta {
  return {
    maxChamadas: 2,
    definicao: {
      type: 'function',
      function: {
        name: 'historico_do_assunto',
        description:
          'Mostra insights e acoes dos ultimos 90 dias nesta mesma categoria, com o status atual. ' +
          'Use para saber se o assunto ja esta sendo tratado (evita levantar de novo) ou se voltou ' +
          'depois de encerrado (reincidencia).',
        parameters: { type: 'object', properties: {} },
      },
    },
    executar: async () => {
      const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()

      const [{ data: insights }, { data: acoes }] = await Promise.all([
        db.from('insights')
          .select('titulo, created_at, motivo_encerramento, ativo')
          .eq('restaurante_id', restauranteId)
          .eq('categoria', categoria)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(5),
        db.from('acoes_operacionais')
          .select('titulo_acao, status, created_at, arquivada_em')
          .eq('restaurante_id', restauranteId)
          .eq('categoria', categoria)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      return JSON.stringify({
        categoria,
        insights_recentes: insights ?? [],
        acoes_recentes: acoes ?? [],
      })
    },
  }
}

/**
 * `listar_pontos` — os pontos do insight que está virando ação, com o texto.
 *
 * Existe para o redator da ação não depender de tudo vir no prompt: ele pede
 * quando precisa reler, e o resultado é sempre o conjunto exato do assunto.
 */
export function ferramentaListarPontos(pontos: PontoDoAssunto[]): Ferramenta {
  return {
    maxChamadas: 2,
    definicao: {
      type: 'function',
      function: {
        name: 'listar_pontos',
        description:
          'Lista os feedbacks (pontos) que sustentam este assunto, com texto, categoria e sentimento.',
        parameters: { type: 'object', properties: {} },
      },
    },
    executar: () =>
      JSON.stringify(
        pontos.map((p) => ({
          id: p.id,
          texto: p.texto,
          categoria: p.categoria,
          sentimento: p.sentimento,
          quando: p.created_at,
        })),
      ),
  }
}
