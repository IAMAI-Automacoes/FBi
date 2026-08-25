/**
 * Worker do motor de resposta a feedbacks.
 *
 * Acordado pelo pg_cron a cada 5 min (o mesmo padrão dos 4 jobs que já existem
 * neste projeto). Para cada contato com fila não-vazia decide se está na hora
 * de falar, monta a mensagem e entrega ao n8n.
 *
 * Por que um tick fixo em vez de agendar um wake-up por contato: a fórmula de
 * disparo é uma CONSULTA, não um agendamento. O tick só pergunta "quem já
 * venceu?". O custo é no máximo 5 min de atraso dentro de uma janela de 30 min
 * a 3 dias — irrelevante — e evita gerenciar N agendamentos que o pg_cron nem
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

/**
 * Carrega a fila de um contato, já com os feedbacks de cada ação.
 *
 * Os feedbacks são filtrados pelo próprio contato: uma ação costuma nascer de
 * feedbacks de VÁRIAS pessoas, e citar o comentário de outro cliente para esta
 * pessoa seria vazamento de dado alheio.
 */
async function carregarFila(db: Db, contatoId: string, agora: Date): Promise<AvisoFila[]> {
  const { data: avisos, error } = await db
    .from('aviso_pendente')
    .select('id, acao_id, etapa, criado_em, expira_em')
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
  }) => ({
    id: a.id,
    acao_id: a.acao_id,
    etapa: a.etapa,
    criado_em: a.criado_em,
    acao_titulo: porAcao.get(a.acao_id)?.titulo_acao ?? 'uma melhoria',
    acao_categoria: porAcao.get(a.acao_id)?.categoria ?? null,
    feedbacks: feedbacksPorAcao.get(a.acao_id) ?? [],
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
  // e um lock de transação cairia antes de a mensagem ser montada e entregue.
  // Este é uma linha com dono e prazo (ver migration 20260825050000).
  const { data: token, error: erroLock } = await db.rpc('motor_tomar_lock_contato', {
    p_contato_id: contatoId,
    p_restaurante_id: restauranteId,
  })
  if (erroLock) throw erroLock
  if (!token) return 'lock_ocupado'

  const resultado = await montarEEnviar(db, ctx)

  // Quando a mensagem foi entregue ao n8n, o lock continua com o callback: ele
  // é quem solta, depois de confirmar. Soltar aqui deixaria o próximo tick
  // montar uma segunda mensagem enquanto a primeira ainda não foi confirmada.
  if (!resultado.startsWith('enviando:')) {
    await db.rpc('motor_soltar_lock_contato', { p_contato_id: contatoId, p_token: token })
  }

  return resultado
}

/**
 * Decide, monta e entrega. Sempre chamada com o lock do contato já tomado.
 *
 * Devolve uma etiqueta do que aconteceu: `enviando:<id>` significa que a
 * mensagem está em voo e o lock ficou para o callback.
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

  const { data: mensagem, error: erroMsg } = await db
    .from('mensagem_enviada')
    .insert({
      contato_id: contatoId,
      restaurante_id: restauranteId,
      texto,
      status: ctx.dryRun ? 'simulado' : 'enviando',
    })
    .select('id')
    .single()
  if (erroMsg) throw erroMsg

  const idsDaFila = fila.map((a) => a.id)

  // Dry-run: calcula, agrupa, redige e registra — mas não fala com ninguém.
  // A fila NÃO é consumida, então dá para observar o motor rodando por dias
  // sobre dados reais antes de ligar o envio.
  if (ctx.dryRun) return `simulado:${mensagem.id}`

  await db
    .from('aviso_pendente')
    .update({ mensagem_id: mensagem.id })
    .in('id', idsDaFila)

  const { data: contato } = await db
    .from('contatos')
    .select('telefone')
    .eq('id', contatoId)
    .single()

  const { data: rest } = await db
    .from('restaurantes')
    .select('whatsapp_token, whatsapp_base_url')
    .eq('id', restauranteId)
    .single()

  const webhook = Deno.env.get('MOTOR_RETORNO_WEBHOOK_URL')
  const segredo = Deno.env.get('MOTOR_RETORNO_SECRET')
  if (!webhook || !segredo) throw new Error('MOTOR_RETORNO_WEBHOOK_URL/SECRET não configurados')

  const resposta = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-motor-secret': segredo },
    body: JSON.stringify({
      envio_id: mensagem.id,
      restaurante_id: restauranteId,
      restaurante_nome: ctx.restauranteNome,
      contato_id: contatoId,
      telefone: contato?.telefone,
      texto,
      whatsapp: {
        base_url: rest?.whatsapp_base_url,
        token: rest?.whatsapp_token,
      },
      callback_url:
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/motor-retorno-callback`,
    }),
  })

  if (!resposta.ok) {
    // O n8n não aceitou. Marca a falha e deixa a fila como está — o cooldown
    // NÃO avança, então a próxima rodada tenta de novo com a fila completa (I3).
    await db
      .from('mensagem_enviada')
      .update({
        status: 'falhou',
        erro_codigo: `HTTP_${resposta.status}`,
        erro_mensagem: (await resposta.text()).slice(0, 500),
      })
      .eq('id', mensagem.id)
    await db.from('aviso_pendente').update({ mensagem_id: null }).in('id', idsDaFila)
    return `falha_webhook:${resposta.status}`
  }

  // Daqui em diante quem confirma é o callback: ele marca os avisos como
  // enviados, avança `ultimo_envio_em` e solta o lock. Fazer isso aqui, antes
  // da confirmação do provedor, silenciaria o contato por 3 dias por uma
  // mensagem que talvez nunca tenha chegado.
  return `enviando:${mensagem.id}`
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

    // Expira o que passou do prazo antes de calcular qualquer coisa: aviso
    // velho demais não deve entrar na conta nem sair na mensagem.
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

    return json({ ok: true, dry_run: dryRun, restaurantes: saida })
  } catch (err) {
    // deno-lint-ignore no-explicit-any -- erro do supabase-js não é tipado
    const e = err as any
    console.error('motor-retorno-worker:', e)
    return json({ error: e?.message ?? String(err) }, 500)
  }
})
