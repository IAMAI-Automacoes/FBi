/**
 * Worker do motor de resposta a feedbacks.
 *
 * Acordado pelo pg_cron a cada 5 min (o mesmo padrão dos 4 jobs que já existem
 * neste projeto). Para cada contato com fila não-vazia decide se está na hora
 * de falar, monta a mensagem e GRAVA como 'pronta' — não entrega a ninguém.
 *
 * Quem entrega é o n8n, puxando: uma rotina diária dele lê a view
 * `fila_envio_n8n` (mensagens com status 'pronta'), manda pelo WhatsApp, e
 * confirma chamando `motor-retorno-callback`. O worker não sabe quando isso
 * acontece — só compõe e deixa pronto.
 *
 * Por que um tick fixo em vez de agendar um wake-up por contato: a fórmula de
 * disparo é uma CONSULTA, não um agendamento. O tick só pergunta "quem já
 * venceu?". O custo é no máximo 5 min de atraso dentro de uma janela de 2h a
 * 3 dias — irrelevante — e evita gerenciar N agendamentos que o pg_cron nem
 * sabe expressar (ele agenda por expressão cron, não por timestamp único).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { ErroCota, textoDaIA } from '../_shared/openrouter.ts'
import { nomeDoAssistente, tomDoAssistente } from '../_shared/perfil.ts'
import {
  aplicarTeto,
  calcularDisparo,
  dentroDoSilencio,
  montarBlocos,
  type AvisoFila,
  type BlocoNarrativo,
} from '../_shared/motor-agrupamento.ts'

const AGENTE = 'redator_retorno'

// A espera de 2h saiu daqui. Antes era um FILTRO (`criado_em <= now()-2h`)
// sobre avisos que já tinham nascido; agora o aviso só é CRIADO depois do
// prazo, pela função `promover_transicoes_pendentes()` chamada no início do
// tick. Manter o filtro aqui somaria as duas esperas e a mensagem sairia com
// 4h de atraso.

// deno-lint-ignore no-explicit-any -- o client do supabase-js não é tipado aqui
type Db = any

interface ConfigMotor {
  ativo: boolean
  cooldown_dias: number
  agregacao_min: number
  max_itens_msg: number
  quiet_inicio: number
  quiet_fim: number
}

/** Padrão do código; o admin sobrescreve pela chave ef_redator_retorno no painel. */
const PROMPT_PADRAO =
  `Voce e o "{nome}", que fala em nome do restaurante "{restaurante}" com um cliente pelo WhatsApp.

{tom}

Sua tarefa: escrever UMA mensagem curta contando ao cliente o que o restaurante fez a partir do
feedback que ELE enviou. Nao e propaganda, nao e pesquisa de satisfacao — e prestacao de contas.

## Regras inegociaveis
- Escreva em portugues do Brasil, direto, no maximo 2 frases por assunto.
- Use SOMENTE os fatos abaixo. Nao invente providencia, prazo, desconto, brinde ou convite.
- Cada bloco abaixo e UM assunto. Cite o comentario do cliente uma unica vez por bloco e depois
  liste o que foi feito. NUNCA repita a mesma citacao em blocos diferentes.
- Quando um bloco tem varias frentes, diga que sao varias frentes sobre aquele mesmo comentario.
- Respeite a ordem cronologica: "comecamos a agir" sempre antes de "ja concluimos".
- Nao use nome do cliente (nao temos), nao use emoji em excesso (no maximo 1 na mensagem toda).
- Nao peca resposta, nao faca pergunta, nao mande link.
- Nao comece com "Ola!" seguido de vazio — va direto ao ponto com cordialidade.
{excedente}

## Formato
Retorne SOMENTE o texto da mensagem, sem aspas, sem markdown, sem assinatura.

## Blocos (cada um e um assunto)
{blocos}`

/** Lê a config do motor do jsonb, com os mesmos defaults da migration. */
function lerConfig(configInsights: unknown): ConfigMotor {
  const raiz = (configInsights ?? {}) as Record<string, unknown>
  const m = (raiz.motor_resposta ?? {}) as Record<string, unknown>
  const num = (v: unknown, padrao: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : padrao
  }
  return {
    ativo: m.ativo === true,
    cooldown_dias: num(m.cooldown_dias, 3),
    agregacao_min: num(m.agregacao_min, 30),
    max_itens_msg: num(m.max_itens_msg, 4),
    quiet_inicio: num(m.quiet_inicio, 22),
    quiet_fim: num(m.quiet_fim, 9),
  }
}

/** Um item de fila com o rastro de feedbacks que a linha de `aviso_pendente`
 *  já carrega — usado só para gravar o rastro na mensagem final, não entra
 *  no agrupamento (que continua puxando o texto por join, como sempre). */
type AvisoFilaComRastro = AvisoFila & {
  feedbacksOriginaisIds: string[]
  feedbacksRestauranteIds: number[]
}

/**
 * Carrega a fila de um contato, já com os feedbacks de cada ação.
 *
 * Os feedbacks são filtrados pelo próprio contato: uma ação costuma nascer de
 * feedbacks de VÁRIAS pessoas, e citar o comentário de outro cliente para esta
 * pessoa seria vazamento de dado alheio.
 *
 * Todo aviso que chega aqui já cumpriu a espera de 2h — ele só existe porque
 * `promover_transicoes_pendentes()` o criou depois do prazo.
 */
async function carregarFila(db: Db, contatoId: string, agora: Date): Promise<AvisoFilaComRastro[]> {
  const { data: avisos, error } = await db
    .from('aviso_pendente')
    .select('id, acao_id, etapa, criado_em, expira_em, feedbacks_originais_ids, feedbacks_restaurante_ids')
    .eq('contato_id', contatoId)
    .eq('status', 'na_fila')
    .gt('expira_em', agora.toISOString())
    .order('criado_em', { ascending: true })

  if (error) throw error
  if (!avisos?.length) return []

  const acaoIds = [...new Set(avisos.map((a: { acao_id: number }) => a.acao_id))]

  const { data: acoes } = await db
    .from('acoes_operacionais')
    .select('id, titulo_acao, categoria')
    .in('id', acaoIds)

  const porAcao = new Map<number, { titulo_acao: string; categoria: string | null }>(
    (acoes ?? []).map((a: { id: number; titulo_acao: string; categoria: string | null }) => [
      a.id,
      { titulo_acao: a.titulo_acao, categoria: a.categoria },
    ]),
  )

  // Feedbacks DESTE contato que alimentaram estas ações.
  const { data: vinculos } = await db
    .from('feedback_acao')
    .select('acao_id, feedbacks_originais!inner(id, texto_original, created_at, contato_id)')
    .in('acao_id', acaoIds)
    .eq('feedbacks_originais.contato_id', contatoId)

  const feedbacksPorAcao = new Map<number, { id: string; texto: string; criado_em: string }[]>()
  for (const v of vinculos ?? []) {
    // deno-lint-ignore no-explicit-any -- shape do join aninhado do PostgREST
    const fo = (v as any).feedbacks_originais
    if (!fo) continue
    const lista = feedbacksPorAcao.get(v.acao_id) ?? []
    lista.push({ id: fo.id, texto: fo.texto_original ?? '', criado_em: fo.created_at })
    feedbacksPorAcao.set(v.acao_id, lista)
  }

  return avisos.map((a: {
    id: string
    acao_id: number
    etapa: 'em_andamento' | 'concluida'
    criado_em: string
    feedbacks_originais_ids: string[] | null
    feedbacks_restaurante_ids: number[] | null
  }) => ({
    id: a.id,
    acao_id: a.acao_id,
    etapa: a.etapa,
    criado_em: a.criado_em,
    acao_titulo: porAcao.get(a.acao_id)?.titulo_acao ?? 'uma melhoria',
    acao_categoria: porAcao.get(a.acao_id)?.categoria ?? null,
    feedbacks: feedbacksPorAcao.get(a.acao_id) ?? [],
    feedbacksOriginaisIds: a.feedbacks_originais_ids ?? [],
    feedbacksRestauranteIds: a.feedbacks_restaurante_ids ?? [],
  }))
}

/** Serializa os blocos para o prompt, já na ordem em que devem ser narrados. */
function blocosParaPrompt(blocos: BlocoNarrativo[]): string {
  return blocos
    .map((b, i) => {
      const frentes = b.frentes
        .map((f) => {
          const etapa = f.etapas.includes('concluida')
            ? (f.etapas.includes('em_andamento') ? 'comecamos e ja concluimos' : 'concluida')
            : 'em andamento'
          return `    - ${f.titulo} (${etapa})`
        })
        .join('\n')
      const citacao = b.citacao
        ? `  Comentario do cliente: "${b.citacao}"`
        : '  (sem comentario associado — fale da providencia sem citar o cliente)'
      return `Bloco ${i + 1}:\n${citacao}\n  Frentes:\n${frentes}`
    })
    .join('\n\n')
}

/** Processa um contato. Devolve o que aconteceu, para o relatório do tick. */
async function processarContato(
  db: Db,
  ctx: {
    contatoId: string
    restauranteId: number
    restauranteNome: string
    mascoteConfig: unknown
    config: ConfigMotor
    dryRun: boolean
    agora: Date
  },
): Promise<string> {
  const { contatoId, restauranteId } = ctx

  // Lock por contato (I6). Duas transições simultâneas — ou dois ticks que se
  // sobreponham — não podem virar duas mensagens.
  //
  // Não é advisory lock: cada chamada via PostgREST é a sua própria transação,
  // e um lock de transação cairia antes de a mensagem ser montada. Este é uma
  // linha com dono e prazo (ver migration 20260825050000).
  const { data: token, error: erroLock } = await db.rpc('motor_tomar_lock_contato', {
    p_contato_id: contatoId,
    p_restaurante_id: restauranteId,
  })
  if (erroLock) throw erroLock
  if (!token) return 'lock_ocupado'

  // Todo o trabalho é síncrono agora — não há mais um webhook em voo esperando
  // callback de outra função. O lock é tomado e solto na mesma chamada.
  try {
    return await montarEEnviar(db, ctx)
  } finally {
    await db.rpc('motor_soltar_lock_contato', { p_contato_id: contatoId, p_token: token })
  }
}

/**
 * Decide e monta. Sempre chamada com o lock do contato já tomado.
 *
 * Não entrega a ninguém — grava em `mensagem_enviada` com status 'pronta' e
 * para por aí. Quem entrega é o n8n (ver cabeçalho do arquivo).
 */
async function montarEEnviar(
  db: Db,
  ctx: {
    contatoId: string
    restauranteId: number
    restauranteNome: string
    mascoteConfig: unknown
    config: ConfigMotor
    dryRun: boolean
    agora: Date
  },
): Promise<string> {
  const { contatoId, restauranteId, config, agora } = ctx

  // Já existe uma mensagem deste contato esperando o n8n ler (pode levar até
  // um dia inteiro, já que ele lê uma vez por dia agora). Sem esta trava, um
  // aviso novo que chegasse nesse meio-tempo geraria uma SEGUNDA mensagem
  // 'pronta' antes da primeira sequer ter saído — duas mensagens no mesmo
  // dia pro mesmo cliente, violando o cooldown.
  const { count: emAberto } = await db
    .from('mensagem_enviada')
    .select('id', { count: 'exact', head: true })
    .eq('contato_id', contatoId)
    .in('status', ['pronta', 'enviando'])
  if ((emAberto ?? 0) > 0) return 'ja_pronta'

  const fila = await carregarFila(db, contatoId, agora)
  if (!fila.length) return 'fila_vazia'

  const { data: janela } = await db
    .from('janela_contato')
    .select('ultimo_envio_em')
    .eq('contato_id', contatoId)
    .maybeSingle()

  const ultimoEnvio = janela?.ultimo_envio_em ? new Date(janela.ultimo_envio_em) : null
  const maisAntigo = new Date(fila[0].criado_em)
  const disparo = calcularDisparo(
    maisAntigo,
    ultimoEnvio,
    config.agregacao_min,
    config.cooldown_dias,
  )

  if (disparo > agora) return 'aguardando'

  // Silêncio adia, não cancela: a fila continua intacta e sai no horário útil.
  if (dentroDoSilencio(agora, config.quiet_inicio, config.quiet_fim)) return 'quiet_hours'

  const blocos = montarBlocos(fila)
  if (!blocos.length) return 'sem_blocos'

  const { visiveis, excedente } = aplicarTeto(blocos, config.max_itens_msg)

  const prompts = await carregarPrompts(db)
  const prompt = montarPrompt(prompts, 'ef_redator_retorno', PROMPT_PADRAO, {
    nome: nomeDoAssistente(ctx.mascoteConfig),
    tom: tomDoAssistente(ctx.mascoteConfig),
    restaurante: ctx.restauranteNome ?? 'o restaurante',
    blocos: blocosParaPrompt(visiveis),
    excedente: excedente > 0
      ? `- Ao final, acrescente exatamente: "e mais ${excedente} ponto${excedente > 1 ? 's' : ''} que voce levantou".`
      : '',
  })

  const params = await paramsDoAgente(db, AGENTE, { max_tokens: 600 })
  if (!params) return 'agente_desativado'

  let texto: string
  try {
    const saida = await textoDaIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'motor-retorno-worker',
      restauranteId,
      agenteId: AGENTE,
      // Sem calculadora: a mensagem é texto corrido para um cliente, não há
      // conta a fazer, e a ferramenta só adicionaria latência e custo.
      calculadora: false,
    })
    texto = (saida ?? '').trim()
  } catch (err) {
    // Cota estourada é ADIAMENTO, não falha: a fila fica intacta e sai quando
    // houver crédito. Perder o aviso seria pior que atrasar.
    if (err instanceof ErroCota) return 'sem_credito'
    throw err
  }

  if (!texto) return 'texto_vazio'

  // Rastro: união dos feedbacks (originais e separados) de TODOS os avisos
  // que entraram nesta mensagem — não só dos que apareceram no texto (o teto
  // de itens pode ter deixado algum de fora do texto, mas ele continua tendo
  // motivado esta mensagem, então continua no rastro).
  const feedbacksOriginaisIds = [...new Set(fila.flatMap((a) => a.feedbacksOriginaisIds))]
  const feedbacksRestauranteIds = [...new Set(fila.flatMap((a) => a.feedbacksRestauranteIds))]

  const { data: mensagem, error: erroMsg } = await db
    .from('mensagem_enviada')
    .insert({
      contato_id: contatoId,
      restaurante_id: restauranteId,
      texto,
      status: ctx.dryRun ? 'simulado' : 'pronta',
      feedbacks_originais_ids: feedbacksOriginaisIds,
      feedbacks_restaurante_ids: feedbacksRestauranteIds,
    })
    .select('id')
    .single()
  if (erroMsg) throw erroMsg

  // Dry-run: calcula, agrupa, redige e registra — mas a fila NÃO é consumida
  // (fica 'simulado', não 'pronta'), então dá para observar o motor rodando
  // por dias sobre dados reais antes de expor qualquer coisa ao n8n.
  if (ctx.dryRun) return `simulado:${mensagem.id}`

  const idsDaFila = fila.map((a) => a.id)
  await db
    .from('aviso_pendente')
    .update({ mensagem_id: mensagem.id })
    .in('id', idsDaFila)

  return `pronta:${mensagem.id}`
}

async function processarRestaurante(
  db: Db,
  restaurante: {
    id: number
    nome_restaurante: string
    config_insights: unknown
    mascote_config: unknown
  },
  dryRun: boolean,
  agora: Date,
) {
  const config = lerConfig(restaurante.config_insights)
  if (!config.ativo && !dryRun) return { restaurante_id: restaurante.id, status: 'desligado' }

  // Contatos com fila viva neste restaurante.
  const { data: pendentes, error } = await db
    .from('aviso_pendente')
    .select('contato_id')
    .eq('restaurante_id', restaurante.id)
    .eq('status', 'na_fila')
    .gt('expira_em', agora.toISOString())
  if (error) throw error

  const contatos = [...new Set((pendentes ?? []).map((p: { contato_id: string }) => p.contato_id))]
  const resultados: Record<string, number> = {}

  for (const contatoId of contatos) {
    try {
      const r = await processarContato(db, {
        contatoId: contatoId as string,
        restauranteId: restaurante.id,
        restauranteNome: restaurante.nome_restaurante,
        mascoteConfig: restaurante.mascote_config,
        config,
        dryRun,
        agora,
      })
      const chave = r.split(':')[0]
      resultados[chave] = (resultados[chave] ?? 0) + 1
    } catch (err) {
      console.error(`motor: falha no contato ${contatoId}:`, err)
      resultados.erro = (resultados.erro ?? 0) + 1
    }
  }

  return { restaurante_id: restaurante.id, contatos: contatos.length, resultados }
}

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // Só o cron entra. Sem isto, qualquer um na internet dispararia a fila de
  // todos os restaurantes — o erro que a edge function `webhook-n8n` comete
  // hoje e que estamos justamente removendo.
  const cronSecret = Deno.env.get('CRON_SECRET')
  const enviado = req.headers.get('x-cron-secret')
  if (!cronSecret || enviado !== cronSecret) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body?.dry_run === true
    const agora = new Date()
    const db = clienteAdmin()

    // 1) Transições que cumpriram a espera de 2h sem serem revertidas viram
    //    aviso agora. Fica aqui, e não num cron próprio, porque este tick já
    //    roda a cada 5 min — uma peça móvel a menos. A função decide sozinha o
    //    que promover e o que cancelar, comparando o status ATUAL da ação com
    //    o marco registrado no histórico.
    const { data: promocao, error: erroPromocao } = await db.rpc('promover_transicoes_pendentes')
    if (erroPromocao) {
      // Falhar aqui não pode derrubar o tick: a fila que já existe ainda deve
      // ser processada, e a promoção tenta de novo em 5 minutos.
      console.error('motor: falha ao promover transicoes:', erroPromocao)
    }

    // 2) Expira o que passou do prazo antes de calcular qualquer coisa: aviso
    //    velho demais não deve entrar na conta nem sair na mensagem.
    await db
      .from('aviso_pendente')
      .update({ status: 'expirado' })
      .eq('status', 'na_fila')
      .lte('expira_em', agora.toISOString())

    const { data: restaurantes, error } = await db
      .from('restaurantes')
      .select('id, nome_restaurante, config_insights, mascote_config')
      .is('excluida_em', null)
      .eq('assinatura_status', 'ativa')
    if (error) throw error

    const saida = []
    for (const r of restaurantes ?? []) {
      saida.push(await processarRestaurante(db, r, dryRun, agora))
    }

    // `promocao` sai no retorno porque é o único lugar onde dá para ver o
    // debounce funcionando: quantas transições viraram aviso e quantas foram
    // canceladas por reversão dentro da janela.
    return json({
      ok: true,
      dry_run: dryRun,
      debounce: Array.isArray(promocao) ? promocao[0] : promocao,
      restaurantes: saida,
    })
  } catch (err) {
    // deno-lint-ignore no-explicit-any -- erro do supabase-js não é tipado
    const e = err as any
    console.error('motor-retorno-worker:', e)
    return json({ error: e?.message ?? String(err) }, 500)
  }
})
