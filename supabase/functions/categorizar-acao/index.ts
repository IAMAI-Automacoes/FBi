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
import { avaliarGravidade, type NivelGravidade } from '../_shared/gravidade.ts'
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

const PROMPT_VINCULO = `Voce liga uma acao operacional aos feedbacks de clientes que ela resolve.

## A acao
Titulo: {titulo}
Categoria: {categoria}
Plano: {plano}

## Feedbacks disponiveis
{candidatos}

## Sua tarefa
Selecione os "id" dos feedbacks cujo problema esta acao resolve.

A pergunta e uma so: se esta acao for concluida, o cliente que escreveu isto
teria motivo para ficar satisfeito? Se sim, inclua.

Os dois erros custam caro, e em direcoes opostas:
- Incluir errado faz o cliente receber "resolvemos o seu problema" sobre algo
  que ele nunca relatou.
- DEIXAR DE FORA faz quem reclamou nunca saber que foi atendido. Um feedback
  que ninguem ligou a nada e um cliente que reclamou e levou silencio.

Entao nao seja timido nem generoso: seja exato.

Regras:
- IGNORE a categoria. Ela e so uma etiqueta e erra com frequencia: "a musica
  estava alta demais" costuma ser catalogado em Ambiente, e resolve com uma acao
  de Musica/Som. Compare o PROBLEMA com o PLANO, nao os rotulos.
- Palavras diferentes, mesmo problema, ENTRA: "o som estava altissimo", "nao
  dava pra conversar de tao alto" e "a musica atrapalhava" sao todos a mesma
  queixa de volume.
- Assunto proximo mas problema diferente NAO entra: "demorou para sentar" e
  "demorou para a comida chegar" tem causas e solucoes distintas.
- Feedback GENERICO nao entra. "O ambiente era ruim", "nao gostei", "foi mal"
  nao dizem QUAL e o problema — voce nao tem como saber se esta acao resolve
  aquilo, e a chance de estar adivinhando e alta. Exija que o feedback descreva
  o mesmo problema concreto que o plano ataca.
- Todos os feedbacks abaixo sao QUEIXAS (o filtro ja tirou os elogios).
- Lista vazia e uma resposta legitima quando nenhum feedback se encaixa. Nao
  force.

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
    ids: {
      type: 'array',
      description: 'Ids dos feedbacks que esta acao resolve. Vazio se nenhum.',
      items: { type: 'integer' },
    },
  },
  required: ['ids'],
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
 * Liga a ação aos feedbacks livres que ela resolve.
 *
 * Os candidatos vêm filtrados por categoria e validade ANTES de chegar à IA:
 * mandar tudo faria a chamada cara e aumentaria a chance de um vínculo errado —
 * e vínculo errado aqui tem custo real, porque o motor de resposta usa
 * `feedback_acao` para decidir a quem mandar mensagem. Um cliente receberia um
 * "resolvemos o seu problema" sobre algo que ele nunca relatou.
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
  const campos = 'id, texto_original, resumo, sentimento, origem_id, categoria'

  // Duas passadas, e não um filtro só por categoria.
  //
  // O problema que uma ação resolve nem sempre está catalogado na categoria em
  // que ela caiu: "revisar o fluxo de saída dos pratos" foi classificada como
  // Tempo de Espera, mas os relatos que ela resolve ("a comida chegou fria")
  // vivem em Comida. Filtrando só pela categoria da ação, a busca voltava
  // vazia e a ação nascia sem vínculo — ou seja, muda de status e não avisa
  // ninguém, porque o motor acha o destinatário justamente por `feedback_acao`.
  //
  // Então: primeiro os da própria categoria (mais provável), depois preenche o
  // resto do orçamento com queixas de outras categorias. Quem decide o que
  // entra continua sendo a IA lendo o plano.
  // Só QUEIXAS entram na lista, nas duas passadas.
  //
  // Isto era regra de prompt ("elogio nao entra, salvo se a acao for sobre
  // manter aquilo") e a IA violou na primeira rodada real: ligou dois "a musica
  // do Coldplay estava otima" a uma acao de REDUZIR o volume. Quem elogiou
  // receberia um "resolvemos o seu problema" sobre um elogio.
  //
  // Vira filtro de codigo porque a regra e absoluta e barata de aplicar: uma
  // acao operacional conserta problema. O caso de "acao para manter algo bom"
  // existe, mas e raro o bastante para nao valer a classe inteira de erro — e
  // nele o dono liga o feedback pela tela, nao pela IA.
  //
  // `%negativ%` cobre "Negativo" e o misto "Positivo e Negativo": se ha parte
  // negativa, ha queixa.
  const { data: daCategoria } = await db
    .from('feedbacks_livres')
    .select(campos)
    .eq('restaurante_id', ctx.restauranteId)
    .eq('categoria', ctx.categoria)
    .ilike('sentimento', '%negativ%')
    .gte('created_at', limite)
    .limit(MAX_CANDIDATOS_VINCULO)

  // deno-lint-ignore no-explicit-any
  const lista: any[] = [...(daCategoria ?? [])]
  const vistos = new Set(lista.map((f) => f.id))

  if (lista.length < MAX_CANDIDATOS_VINCULO) {
    const { data: outras } = await db
      .from('feedbacks_livres')
      .select(campos)
      .eq('restaurante_id', ctx.restauranteId)
      .neq('categoria', ctx.categoria)
      .ilike('sentimento', '%negativ%')
      .gte('created_at', limite)
      .order('created_at', { ascending: false })
      .limit(MAX_CANDIDATOS_VINCULO - lista.length)

    // deno-lint-ignore no-explicit-any
    for (const f of (outras ?? []) as any[]) {
      if (!vistos.has(f.id)) {
        lista.push(f)
        vistos.add(f.id)
      }
    }
  }

  if (lista.length === 0) return 0

  const validos = lista.filter((f) => (f.texto_original || f.resumo || '').trim())
  if (validos.length === 0) return 0

  const prompt = montarPrompt(ctx.prompts, 'ef_vincular_acao', PROMPT_VINCULO, {
    titulo: ctx.titulo,
    categoria: ctx.categoria,
    plano: ctx.plano,
    candidatos: validos
      .map(
        (f) =>
          `- id ${f.id} [${f.categoria ?? '?'} / ${f.sentimento ?? '?'}]: ` +
          `"${f.texto_original || f.resumo}"`,
      )
      .join('\n'),
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
        descricao: 'Registra os feedbacks que esta acao resolve.',
        schema: SCHEMA_VINCULOS,
      },
    })
    escolhidos = Array.isArray(result?.ids) ? result.ids.map(Number) : []
    // Diagnostico: sem isto, "por que a acao ficou sem feedback?" nao tem
    // resposta — nao da para saber se faltou candidato ou se a IA recusou.
    console.log(
      `[acao ${ctx.acaoId}] ${validos.length} candidatos -> IA escolheu ${escolhidos.length}` +
        ` | candidatos: ${validos.map((f) => f.id).join(',')}`,
    )
  } catch (err) {
    if (err instanceof ErroCota) throw err
    console.error('Falha ao vincular feedbacks:', err)
    return 0
  }

  // A IA pode devolver id que não estava na lista. Só passa o que ela viu.
  const permitidos = new Map(validos.map((f) => [Number(f.id), f]))
  let paraLigar = [...new Set(escolhidos)].filter((id) => permitidos.has(id))
  if (paraLigar.length === 0) return 0

  // Tira os que já estão ligados a esta ação.
  //
  // Não dá para usar `upsert` com `onConflict` aqui: o índice único
  // `feedback_acao_por_ponto` é PARCIAL (`where feedback_restaurante_id is not
  // null`), e o PostgREST não tem como mandar o predicado junto — o Postgres
  // recusa com 42P10, "no unique or exclusion constraint matching the ON
  // CONFLICT specification". Tentei e o insert inteiro falhou em silêncio: a IA
  // escolhia os feedbacks certos e nenhum era gravado.
  //
  // Filtrar antes resolve o caso real (duas chamadas em sequência) sem depender
  // de ON CONFLICT. A janela de corrida que sobra é de milissegundos, e o
  // fallback abaixo cobre.
  const { data: jaLigados } = await db
    .from('feedback_acao')
    .select('feedback_restaurante_id')
    .eq('acao_id', ctx.acaoId)
    .in('feedback_restaurante_id', paraLigar)

  if (jaLigados?.length) {
    // deno-lint-ignore no-explicit-any
    const existentes = new Set((jaLigados as any[]).map((l) => Number(l.feedback_restaurante_id)))
    paraLigar = paraLigar.filter((id) => !existentes.has(id))
    if (paraLigar.length === 0) return 0
  }

  const linhas = paraLigar.map((id) => ({
    acao_id: ctx.acaoId,
    feedback_restaurante_id: id,
    feedback_original_id: permitidos.get(id)!.origem_id,
    restaurante_id: ctx.restauranteId,
  }))

  const { error } = await db.from('feedback_acao').insert(linhas)
  if (!error) return paraLigar.length

  // 23505 = chave duplicada. Só acontece se outra chamada gravou entre o filtro
  // acima e este insert. Um lote inteiro não pode ser perdido por causa de uma
  // linha repetida, então reinsere uma a uma e conta o que passou.
  if (error.code === '23505') {
    let gravados = 0
    for (const linha of linhas) {
      const { error: e } = await db.from('feedback_acao').insert(linha)
      if (!e) gravados++
      else if (e.code !== '23505') console.error('Falha ao inserir vínculo:', e)
    }
    return gravados
  }

  console.error('Falha ao inserir vínculos:', error)
  return 0
}
