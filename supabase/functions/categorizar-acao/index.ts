/**
 * Completa uma ação criada à mão: categoria, prioridade e vínculo com feedbacks.
 *
 * Roda quando o dono deixa Categoria e/ou Prioridade em branco — os dois únicos
 * campos opcionais do formulário. Nunca sobrescreve o que ele preencheu.
 *
 * ## A prioridade deixou de ser uma contagem
 *
 * A versão anterior fazia:
 *
 *     negativos na categoria nos ultimos 30d >= 5  -> URGENTE
 *                                            >= 2  -> IMPORTANTE
 *
 * Contava só reclamações e ignorava elogios por completo, então três queixas
 * num restaurante com duzentos elogios pesavam igual a três queixas em vinte
 * avaliações. E tratava "comida fria" e "cabelo na comida" como a mesma coisa,
 * já que os dois somavam 1 no contador.
 *
 * Agora cada feedback entra com a própria nota de gravidade (`gravidade.ts`),
 * os elogios amortecem, e a conta é normalizada por quantas PESSOAS reclamaram
 * (ver `prioridadeAcaoManual` em `limiar.ts`). Gravidade sanitária continua
 * vencendo volume: um relato de corpo estranho é URGENTE sozinho, por mais
 * elogios que existam.
 *
 * ## Vínculo com os feedbacks
 *
 * Ação criada à mão nasce sem `insight_id`, então o trigger que herda os
 * vínculos do insight nunca dispara — ela ficava "surda": mudar o status dela
 * jamais avisaria ninguém, porque o motor de resposta encontra o destinatário
 * justamente por `feedback_acao`. Aqui a IA lê o plano e escolhe, entre os
 * feedbacks livres da categoria, quais aquela ação realmente resolve.
 */
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { blocoPerfil, nomeDoAssistente } from '../_shared/perfil.ts'
import { avaliarGravidade, normalizar, type NivelGravidade } from '../_shared/gravidade.ts'
import { prioridadeAcaoManual } from '../_shared/limiar.ts'

const AGENTE = 'categorizador_acao'

const CATEGORIAS = [
  'Comida', 'Bebidas', 'Atendimento', 'Ambiente', 'Limpeza', 'Preço',
  'Tempo de Espera', 'Reserva', 'Estacionamento', 'Acessibilidade',
  'Música/Som', 'Cardápio/Variedade', 'Higiene', 'Outros',
]

/** Janela de feedbacks considerada no cálculo da prioridade. */
const JANELA_DIAS = 30
/** Teto de candidatos enviados à IA para vinculação. */
const MAX_CANDIDATOS_VINCULO = 25

const PROMPT_CATEGORIA = `Voce e o "{nome}", que organiza as tarefas de um restaurante.

## Sobre este restaurante
{perfil}

## A acao a classificar
Titulo: {titulo}
Plano: {plano}

## Sua tarefa
Escolha UMA categoria, exatamente uma, entre as 14 disponiveis. Escolha pelo
PROBLEMA que a acao resolve, nao pelas palavras que aparecem no plano — um
plano que fala em "treinar a equipe da cozinha para servir mais rapido" e sobre
Tempo de Espera, nao sobre Atendimento nem Comida.

Se nada se encaixar bem, use "Outros" em vez de forcar uma categoria proxima.

Chame registrar_categoria.`

const PROMPT_VINCULO = `Voce liga uma acao operacional aos ASSUNTOS de reclamacao que ela resolve.

## A acao
Titulo: {titulo}
Categoria: {categoria}
Plano: {plano}

## Assuntos com reclamacoes em aberto
Cada item traz o rotulo do assunto e exemplos reais. Confie nos EXEMPLOS: ha
rotulos antigos que nao descrevem bem o que esta dentro.

{candidatos}

## Sua tarefa
Devolva os NUMEROS dos assuntos que esta acao resolve.

Quase sempre e UM assunto. Raramente dois. Nunca mais de tres — uma acao
operacional conserta uma coisa, nao a experiencia inteira do restaurante. Se
voce esta querendo marcar cinco, esta incluindo o que nao devia.

O teste e um so: executar este plano muda alguma coisa para quem reclamou
daquele assunto? Se sim, inclua. Se nao, deixe de fora.

Os dois erros custam caro, em direcoes opostas:
- Incluir errado faz o cliente receber "resolvemos o seu problema" sobre algo
  que ele nunca relatou.
- Deixar de fora faz quem reclamou nunca saber que foi atendido.

Regras:
- IGNORE a categoria da acao. Ela e so uma etiqueta e erra: "musica alta" costuma
  ser catalogado em Ambiente e se resolve com uma acao de Musica/Som. Compare o
  ASSUNTO com o PLANO.
- Palavras diferentes, mesmo problema, ENTRA: "som altissimo" e "musica
  atrapalhava a conversa" sao a mesma queixa de volume.
- Assunto proximo mas diferente NAO entra. Baixar o volume da musica nao
  conserta mesa bamba, nao esquenta comida fria e nao arruma o estacionamento.
- Assunto GENERICO nao entra. "Ambiente ruim", "Atendimento ruim", "Opiniao
  negativa geral" nao dizem qual e o problema — voce nao tem como saber se este
  plano resolve, e incluir e adivinhar.
- Lista vazia e resposta legitima. Nao force.

Chame registrar_vinculos.`

const SCHEMA_CATEGORIA = {
  type: 'object',
  properties: {
    categoria: { type: 'string', enum: CATEGORIAS },
    justificativa: { type: 'string', description: 'Uma frase curta.' },
  },
  required: ['categoria'],
}

const SCHEMA_VINCULOS = {
  type: 'object',
  properties: {
    assuntos: {
      type: 'array',
      description:
        'Os NUMEROS dos assuntos que esta acao resolve, da lista. No maximo 3. Vazio se nenhum.',
      items: { type: 'integer' },
    },
  },
  required: ['assuntos'],
}

// deno-lint-ignore no-explicit-any
type Db = any

// `Deno.serve` nativo, sem o import de `deno.land/std`.
//
// O import externo era resolvido pelo bundler da Supabase A CADA DEPLOY, e em
// 2026-08-29 o deno.land ficou fora do ar: todo deploy passou a falhar com
// "Fetch ... timed out after 10s". Uma indisponibilidade de terceiro nao pode
// impedir de publicar correcao.
Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const corpo = await req.json().catch(() => ({}))
    const acaoId = corpo?.acao_id
    // `apenas_vinculo` é o botão "Buscar feedbacks relacionados": o dono já
    // decidiu categoria e prioridade e não quer que a IA mexa neles.
    const apenasVinculo = corpo?.apenas_vinculo === true
    if (!acaoId) return json({ error: 'acao_id é obrigatório' }, 400)

    const db: Db = clienteAdmin()

    const { data: acao, error: erroAcao } = await db
      .from('acoes_operacionais')
      .select('id, titulo_acao, plano_detalhado, categoria, prioridade, restaurante_id, insight_id, status, arquivada_em')
      .eq('id', acaoId)
      .single()

    if (erroAcao || !acao) return json({ error: 'Ação não encontrada' }, 404)

    const precisaCategoria = !apenasVinculo && !acao.categoria
    const precisaPrioridade = !apenasVinculo && !acao.prioridade

    const { data: config } = await db
      .from('restaurantes')
      .select('nome_restaurante, tipo_culinaria, numero_mesas, detalhes, perfil_restaurante, config_insights, mascote_config')
      .eq('id', acao.restaurante_id)
      .single()

    const prompts = await carregarPrompts(db)
    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 600 })
    if (!params) return json({ error: 'Agente desativado pelo administrador' }, 503)

    // ---- 1. Categoria ----
    let categoriaFinal: string = acao.categoria ?? 'Outros'

    if (precisaCategoria) {
      try {
        const prompt = montarPrompt(prompts, 'ef_categorizar_acao', PROMPT_CATEGORIA, {
          nome: nomeDoAssistente(config?.mascote_config),
          perfil: blocoPerfil(config),
          titulo: acao.titulo_acao ?? '',
          plano: acao.plano_detalhado ?? '',
        })
        const { result } = await chamarIA(db, {
          messages: [{ role: 'user', content: prompt }],
          params,
          origem: 'categorizar-acao',
          restauranteId: acao.restaurante_id,
          agenteId: AGENTE,
          calculadora: false,
          saida: {
            nome: 'registrar_categoria',
            descricao: 'Registra a categoria escolhida.',
            schema: SCHEMA_CATEGORIA,
          },
        })
        categoriaFinal = CATEGORIAS.includes(result?.categoria) ? result.categoria : 'Outros'
      } catch (err) {
        if (err instanceof ErroCota) throw err
        console.error('Falha ao categorizar, usando Outros:', err)
        categoriaFinal = 'Outros'
      }
    }

    // ---- 2. Vincular feedbacks (ANTES da prioridade) ----
    //
    // A ordem importa. Calcular a prioridade sobre a CATEGORIA inteira mistura
    // assuntos: uma ação sobre porção pequena herdava o peso de comida fria,
    // comida ruim e tudo mais catalogado em "Comida" — num teste real deu
    // N=46 sobre 22 pessoas para uma ação que trata de 3 relatos. Vinculando
    // primeiro, a conta passa a ser sobre os feedbacks que a ação REALMENTE
    // resolve, que é o que foi pedido ("ver quantos feedbacks reclamam
    // daquilo").
    //
    // Só para ação criada à mão: a que veio de insight já herdou os vínculos
    // pelo trigger, e re-vincular aqui traria feedback de outro assunto.
    //
    // Ação arquivada não recebe vínculo novo: ela está fora do quadro, e ligar
    // um feedback nela prenderia o ponto (ação existente segura sempre, mesmo
    // arquivada) sem que ninguém nunca fosse avisado — o motor de retorno só
    // olha transição de status, e uma ação arquivada não vai mais mudar.
    let vinculados = 0
    let motivoSemVinculo: string | null = null

    if (acao.insight_id) {
      motivoSemVinculo = 'a acao veio de um insight e ja herdou os vinculos dele'
    } else if (acao.arquivada_em) {
      motivoSemVinculo = 'acao arquivada nao recebe vinculo novo'
    } else {
      vinculados = await vincularFeedbacks(db, {
        acaoId,
        restauranteId: acao.restaurante_id,
        titulo: acao.titulo_acao ?? '',
        plano: acao.plano_detalhado ?? '',
        categoria: categoriaFinal,
        expiracaoDias: Number(
          (config?.config_insights as Record<string, unknown>)?.expiracao_feedback_dias ?? 14,
        ),
        prompts,
        params,
      })
      if (vinculados > 0) {
        await db.rpc('reconciliar_uso_feedbacks', { p_restaurante_id: acao.restaurante_id })
      }
    }

    // ---- 3. Prioridade, por conta ----
    let prioridadeFinal: string = acao.prioridade ?? 'OBSERVACAO'
    let detalhePrioridade: Record<string, unknown> | null = null

    if (precisaPrioridade) {
      const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString()

      // Os negativos que pesam são os que ESTA ação resolve. Sem vínculo
      // nenhum (ação que a IA não conseguiu casar com feedback), cai para a
      // categoria — é menos preciso, mas melhor que não ter medida alguma.
      const { data: ligados } = await db
        .from('feedback_acao')
        .select('feedbacks_restaurante(texto_original, resumo, sentimento, origem_id)')
        .eq('acao_id', acaoId)

      // deno-lint-ignore no-explicit-any
      let base: any[] = (ligados ?? [])
        // deno-lint-ignore no-explicit-any
        .map((l: any) => l.feedbacks_restaurante)
        .filter(Boolean)
      const usouVinculos = base.length > 0

      if (!usouVinculos) {
        const { data: daCategoria } = await db
          .from('feedbacks_restaurante')
          .select('texto_original, resumo, sentimento, origem_id')
          .eq('restaurante_id', acao.restaurante_id)
          .eq('categoria', categoriaFinal)
          .gte('created_at', desde)
        base = daCategoria ?? []
      }

      const negativos: NivelGravidade[] = []
      const origensNegativas = new Set<string>()
      for (const f of base) {
        if (!(f.sentimento || '').toLowerCase().includes('negativ')) continue
        negativos.push(avaliarGravidade(f.texto_original || f.resumo || '', f.sentimento).G)
        if (f.origem_id) origensNegativas.add(f.origem_id)
      }

      // Os elogios vêm sempre da CATEGORIA, não dos vínculos: eles existem para
      // dar contexto ("o restaurante vai bem nisso?"), e entre os feedbacks
      // vinculados a uma ação corretiva praticamente não há elogio — usá-los
      // como base zeraria o amortecimento que a regra pede.
      const { count: positivos } = await db
        .from('feedbacks_restaurante')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', acao.restaurante_id)
        .eq('categoria', categoriaFinal)
        .ilike('sentimento', '%positiv%')
        .gte('created_at', desde)

      const resultado = prioridadeAcaoManual({
        gravidadesNegativos: negativos,
        positivos: positivos ?? 0,
        originaisDistintos: origensNegativas.size,
      })
      prioridadeFinal = resultado.prioridade
      detalhePrioridade = {
        indice: Number(resultado.indice.toFixed(2)),
        motivo: resultado.motivo,
        base: usouVinculos ? 'feedbacks vinculados a esta acao' : `categoria ${categoriaFinal}`,
        ...resultado.componentes,
      }
    }

    if (precisaCategoria || precisaPrioridade) {
      const atualizacao: Record<string, string> = {}
      if (precisaCategoria) atualizacao.categoria = categoriaFinal
      if (precisaPrioridade) atualizacao.prioridade = prioridadeFinal
      const { error } = await db.from('acoes_operacionais').update(atualizacao).eq('id', acaoId)
      if (error) throw error
    }

    return json({
      status: 'sucesso',
      categoria: categoriaFinal,
      prioridade: prioridadeFinal,
      calculo_prioridade: detalhePrioridade,
      feedbacks_vinculados: vinculados,
      motivo_sem_vinculo: motivoSemVinculo,
    })
  } catch (err) {
    if (err instanceof ErroCota) {
      return json({ error: 'Crédito de IA esgotado neste ciclo', codigo: 'sem_credito' }, 402)
    }
    // deno-lint-ignore no-explicit-any
    const e = err as any
    return json({ error: e?.message || String(err) }, 500)
  }
})

/**
 * Liga a ação aos feedbacks livres que ela resolve — decidindo por TEMA.
 *
 * ## Por que por tema, e não feedback a feedback
 *
 * A primeira versão mandava até 25 feedbacks em texto corrido e pedia à IA que
 * escolhesse. Falhou de três jeitos, todos medidos em produção em 2026-08-29:
 *
 *   - Ligou "O ambiente era ruim e o cliente não gostou" a uma ação sobre volume
 *     da música. O texto é vago demais para sustentar vínculo nenhum.
 *   - Ligou "A mesa estava super bamba" e "A comida chegou fria" à mesma ação.
 *   - Cada chamada escolhia coisas diferentes, e o botão de reprocessar ia
 *     EMPILHANDO vínculos errados a cada clique.
 *
 * O problema não era o prompt (endurecer não resolveu): é que julgar 25 textos
 * corridos contra um plano é tarefa grande demais para uma chamada.
 *
 * O sistema já tem uma classificação semântica confiável — o `tema_id`, que o
 * `classificar-feedback` atribui um a um, com contexto pequeno. Agrupando por
 * ele, a pergunta vira "quais destes 13 assuntos esta ação resolve?", com
 * rótulos curtos ("Mesa instável", "Comida fria", "Música alta") em vez de
 * parágrafos. É a mesma decisão que o `vincular-feedback` já usa para casar
 * feedback novo com ação existente.
 *
 * Ganhos: a escolha fica estável entre chamadas (os temas não mudam), o
 * genérico se autodenuncia pelo rótulo ("Opinião negativa geral"), e todos os
 * feedbacks de um tema entram juntos — que é o que o dono espera ver.
 */
async function vincularFeedbacks(
  db: Db,
  ctx: {
    acaoId: number
    restauranteId: number
    titulo: string
    plano: string
    categoria: string
    expiracaoDias: number
    // deno-lint-ignore no-explicit-any
    prompts: any
    // deno-lint-ignore no-explicit-any
    params: any
  },
): Promise<number> {
  const limite = new Date(Date.now() - ctx.expiracaoDias * 86_400_000).toISOString()

  // Só QUEIXAS entram.
  //
  // Era regra de prompt e a IA violou: ligou dois "a música do Coldplay estava
  // ótima" a uma ação de REDUZIR o volume. Quem elogiou receberia um
  // "resolvemos o seu problema" sobre um elogio. Vira filtro de código porque a
  // regra é absoluta — ação operacional conserta problema.
  //
  // `%negativ%` cobre "Negativo" e o misto "Positivo e Negativo".
  const { data: livres } = await db
    .from('feedbacks_livres')
    .select('id, texto_original, resumo, sentimento, origem_id, categoria, tema_id')
    .eq('restaurante_id', ctx.restauranteId)
    .ilike('sentimento', '%negativ%')
    .gte('created_at', limite)
    .not('tema_id', 'is', null)

  if (!livres?.length) return 0

  // Agrupa por tema e busca os rótulos.
  // deno-lint-ignore no-explicit-any
  const porTema = new Map<string, any[]>()
  // deno-lint-ignore no-explicit-any
  for (const f of livres as any[]) {
    const atual = porTema.get(f.tema_id)
    if (atual) atual.push(f)
    else porTema.set(f.tema_id, [f])
  }

  const { data: temas } = await db
    .from('feedback_temas')
    .select('id, rotulo')
    .in('id', [...porTema.keys()])

  if (!temas?.length) return 0

  // Numerados de 1 a N, e nao pelo uuid do tema.
  //
  // Com uuid, o modelo devolveu os 13 ids da lista inteira — e a acao sobre
  // volume da musica acabou ligada a "Comida fria", "Estacionamento dificil" e
  // tudo mais. Copiar identificador longo e tarefa ruim para modelo pequeno: na
  // duvida ele ecoa a lista. Numero curto ele acerta, e o codigo mapeia de volta.
  //
  // Os exemplos importam MAIS que o rotulo, e por isso vao ate tres.
  //
  // Ha temas antigos mal formados, de quando o prompt de classificacao aceitava
  // assunto largo: "Ambiente agradavel" tem 18 feedbacks e mistura "ambiente
  // magnifico" com "o ambiente era ruim" e "a luz estava fraca". O rotulo mente
  // sobre o conteudo, e a IA decide por ele se so ele estiver a vista.
  const ordenados = temas as { id: string; rotulo: string }[]
  const lista = ordenados
    .map((t, i) => {
      const fs = porTema.get(t.id) ?? []
      const exemplos = fs
        .slice(0, 3)
        .map((f) => `      - "${(f.texto_original || f.resumo || '').slice(0, 100)}"`)
        .join('\n')
      return `${i + 1}. ${t.rotulo} (${fs.length} feedback${fs.length > 1 ? 's' : ''})\n${exemplos}`
    })
    .join('\n\n')

  const prompt = montarPrompt(ctx.prompts, 'ef_vincular_acao', PROMPT_VINCULO, {
    titulo: ctx.titulo,
    categoria: ctx.categoria,
    plano: ctx.plano,
    candidatos: lista,
  })

  let escolhidos: number[] = []
  try {
    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params: ctx.params,
      origem: 'categorizar-acao-vinculo',
      restauranteId: ctx.restauranteId,
      agenteId: AGENTE,
      calculadora: false,
      saida: {
        nome: 'registrar_vinculos',
        descricao: 'Registra os assuntos que esta acao resolve.',
        schema: SCHEMA_VINCULOS,
      },
    })
    escolhidos = Array.isArray(result?.assuntos) ? result.assuntos.map(Number) : []
  } catch (err) {
    if (err instanceof ErroCota) throw err
    console.error('Falha ao vincular feedbacks:', err)
    return 0
  }

  // Número fora da lista é descartado, e o teto de 3 é aplicado aqui também: o
  // schema pede, mas quem garante é o código.
  const validos = [...new Set(escolhidos)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= ordenados.length)
    .slice(0, 3)
    .map((n) => ordenados[n - 1])

  console.log(
    `[acao ${ctx.acaoId}] ${ordenados.length} assuntos -> escolhidos ${validos.length}: ` +
      validos.map((t) => t.rotulo).join(', '),
  )

  if (validos.length === 0) return 0

  // Todos os feedbacks dos temas escolhidos.
  const linhas = validos.flatMap((t) =>
    (porTema.get(t.id) ?? []).map((f) => ({
      acao_id: ctx.acaoId,
      feedback_restaurante_id: Number(f.id),
      feedback_original_id: f.origem_id,
      restaurante_id: ctx.restauranteId,
    }))
  )
  if (linhas.length === 0) return 0

  // Tira os já ligados a esta ação.
  //
  // Não dá para usar `upsert` com `onConflict`: o índice único
  // `feedback_acao_por_ponto` é PARCIAL (`where feedback_restaurante_id is not
  // null`) e o PostgREST não tem como mandar o predicado — o Postgres recusa com
  // 42P10 e o insert inteiro falha em silêncio.
  const { data: jaLigados } = await db
    .from('feedback_acao')
    .select('feedback_restaurante_id')
    .eq('acao_id', ctx.acaoId)
    .in('feedback_restaurante_id', linhas.map((l) => l.feedback_restaurante_id))

  // deno-lint-ignore no-explicit-any
  const existentes = new Set((jaLigados as any[] ?? []).map((l) => Number(l.feedback_restaurante_id)))
  const novas = linhas.filter((l) => !existentes.has(l.feedback_restaurante_id))
  if (novas.length === 0) return 0

  const { error } = await db.from('feedback_acao').insert(novas)
  if (!error) return novas.length

  // 23505 = duplicada. Só acontece se outra chamada gravou entre o filtro acima
  // e este insert. Um lote não pode ser perdido por causa de uma linha.
  if (error.code === '23505') {
    let gravados = 0
    for (const linha of novas) {
      const { error: e } = await db.from('feedback_acao').insert(linha)
      if (!e) gravados++
      else if (e.code !== '23505') console.error('Falha ao inserir vínculo:', e)
    }
    return gravados
  }

  console.error('Falha ao inserir vínculos:', error)
  return 0
}
