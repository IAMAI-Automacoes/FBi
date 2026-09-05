/**
 * Liga um feedback recém-chegado a uma ação ou insight que já trata daquilo.
 *
 * Disparada pelo trigger de insert em `feedbacks_restaurante`, logo depois de o
 * `classificar-feedback` atribuir o `tema_id`.
 *
 * ## Por que existe
 *
 * Sem isto, um feedback que chega hoje sobre um problema que a equipe já está
 * resolvendo fica parado até a próxima rodada de geração — e pior: pode virar
 * um insight duplicado do mesmo assunto. E, do lado do cliente, ele nunca
 * receberia o aviso de que o problema dele foi tratado, porque o motor de
 * resposta encontra o destinatário justamente pelos vínculos.
 *
 * ## Por que a IA não decide tudo
 *
 * O caminho é o mais quente do sistema: toda mensagem de cliente vira ~3
 * feedbacks separados, e cada um já pagou uma chamada de IA no
 * `classificar-feedback`. Botar mais uma por feedback aqui triplicaria o custo
 * do ingresso.
 *
 * O funil resolve quase tudo sem IA:
 *
 *   1. Mesmo `tema_id` de uma ação aberta  -> liga direto, zero IA. O tema já
 *      foi calculado; é a mesma decisão de agrupamento que gerou o insight.
 *   2. Mesmo `tema_id` de um insight ativo -> liga direto, zero IA.
 *   3. Nenhum candidato na categoria       -> fica livre, zero IA.
 *   4. Candidatos ambiguos                 -> UMA chamada de IA decide.
 *
 * Contaminação não é risco aqui: a saída é uma decisão de vínculo, não prosa.
 *
 * ## O vínculo, seja com AÇÃO ou INSIGHT, reescreve o texto do destino
 *
 * Um insight é um texto que afirma representar um conjunto de feedbacks, e o
 * dono decide prioridade lendo esse texto. Uma ação é a mesma promessa, só que
 * já em execução pela equipe. Grudar um relato novo embaixo de qualquer um dos
 * dois sem tocar no texto produz uma mentira silenciosa: o card diz "3
 * clientes reclamaram do tempero" e por baixo há um quarto ponto dizendo que
 * passou mal — o número sobe, a urgência não, e a leitura do dono fica errada
 * exatamente no caso que mais importa.
 *
 * Por isso os dois pagam uma SEGUNDA chamada de IA depois do vínculo gravado.
 * Essa chamada relê TODOS os feedbacks já ligados ao destino — não só o novo —
 * e reescreve título, descrição/plano e prioridade para englobar o conjunto
 * inteiro, nunca para substituir pelo último relato. Ela roda nos dois
 * caminhos de decisão (atalho por tema e escolha da IA), porque o problema é
 * do vínculo, não de como ele foi decidido.
 *
 * O que muda entre os dois: no insight, categoria e assunto_chave nunca são
 * tocados pela IA — são a identidade do agrupamento. Na ação, além disso,
 * status também não é tocado — é o progresso real da equipe (PENDENTE,
 * EM_ANDAMENTO...), e só quem executa deve mudá-lo, nunca uma reescrita de
 * texto.
 *
 * O custo é aceitável porque o caso é raro: a maioria esmagadora dos feedbacks
 * termina em "livre", e da minoria que gruda em algo, a maior parte é só mais
 * um caso do que o texto já cobria — a IA recebe essa instrução e repete os
 * campos sem mudar nada. E a chamada é FALHA-SEGURA — se ela quebrar, o
 * vínculo já está gravado e o texto fica como estava antes.
 */
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'
import { carregarPrompts, montarPrompt } from '../_shared/prompts.ts'
import { paramsDoAgente } from '../_shared/params.ts'
import { chamarIA, ErroCota } from '../_shared/openrouter.ts'
import { planoParaPrompt } from '../_shared/texto-plano.ts'

const AGENTE = 'vinculador_feedback'
const AGENTE_ABSORCAO = 'absorvedor_insight'
const AGENTE_ABSORCAO_ACAO = 'absorvedor_acao'

/** Acima disto a decisão vira ruído: manda para a IA em vez de adivinhar. */
const MAX_CANDIDATOS = 8

/**
 * Quantos pontos já ligados ao destino (insight ou ação) vão no prompt de
 * absorção.
 *
 * A reescrita precisa saber o que o destino JÁ cobre, senão o modelo reescreve
 * o texto em cima só do feedback novo e ele encolhe para o último relato que
 * chegou — o oposto de englobar. Um teto existe porque um insight ou ação
 * campeã acumula dezenas de pontos e o prompt não pode crescer sem limite.
 */
const MAX_PONTOS_CONTEXTO = 12

const PROMPT = `Voce decide se um feedback novo de cliente ja esta coberto por algo que a equipe do restaurante esta tratando.

## O feedback que acabou de chegar
"{texto}"
Categoria: {categoria} | Sentimento: {sentimento}

## Acoes em andamento (o restaurante ja esta resolvendo)
{acoes}

## Insights ativos (identificados, ainda nao viraram acao)
{insights}

## Sua tarefa
Escolha UMA opcao:
- "acao" + o id, se uma das acoes acima resolve o problema deste feedback.
- "insight" + o id, se um dos insights acima e sobre este mesmo problema.
- "nenhum", se nada acima trata deste problema.

Regras:
- ACAO TEM PREFERENCIA. Se uma acao e um insight tratam do mesmo problema,
  escolha a ACAO: ela e o estado mais avancado, e e o vinculo com ela que faz o
  cliente ser avisado quando a equipe concluir.
- Tem que ser o MESMO problema, nao apenas a mesma area. "A comida demorou" e
  "a comida veio fria" sao problemas diferentes, mesmo os dois sendo sobre
  comida. "O banheiro estava sujo" e "a mesa estava suja" tambem.
- Na duvida, responda "nenhum". Um vinculo errado faz o cliente receber uma
  mensagem dizendo que resolvemos algo que ele nunca relatou.
- Elogio quase nunca se liga a uma acao corretiva.

Chame registrar_decisao.`

const SCHEMA = {
  type: 'object',
  properties: {
    destino: { type: 'string', enum: ['acao', 'insight', 'nenhum'] },
    id: { type: 'string', description: 'Id do destino escolhido. Vazio quando "nenhum".' },
    motivo: { type: 'string', description: 'Uma frase curta.' },
  },
  required: ['destino'],
}

const PROMPT_ABSORCAO =
  `Um feedback novo de cliente acabou de ser ligado a um insight que ja existe. Seu trabalho e conferir se o texto do insight ainda descreve corretamente TUDO que ele cobre agora — e reescrever o que estiver desatualizado.

## O insight, como esta hoje
Titulo: {titulo}
Descricao: {descricao}
Prioridade: {prioridade}
Categoria: {categoria}

## Os feedbacks que ele ja cobria
{pontos}

## O feedback que acabou de entrar
"{texto}"
Sentimento: {sentimento}

## Sua tarefa
Devolva titulo, descricao e prioridade que descrevam o conjunto INTEIRO — os
feedbacks antigos E o novo. Se algum campo ja esta bom, repita ele igual.

Regras:
- ENGLOBAR, nao substituir. O texto novo tem que continuar valendo para os
  feedbacks antigos. Reescrever o insight so em cima do relato que acabou de
  chegar e o erro mais grave possivel aqui: apaga o que os outros clientes
  disseram.
- Se o feedback novo nao acrescenta nada (e mais um caso do que ja estava
  escrito), repita os tres campos como estao. Isso e uma resposta correta e
  comum — a maioria dos vinculos nao muda o insight.
- PRIORIDADE SO SOBE, nunca desce. Um relato a mais nunca torna o problema
  menos grave, mesmo que ele seja brando: os relatos graves anteriores
  continuam existindo. A ordem e OBSERVACAO < IMPORTANTE < URGENTE.
- Suba para URGENTE quando o feedback novo trouxer algo que a descricao atual
  nao cobre e que muda o tamanho do problema: passar mal, corpo estranho na
  comida, risco a saude, cobranca indevida, discriminacao ou falta de higiene.
- Descricao: no maximo 3 frases, sobre o que os clientes relataram. Sem
  saudacao, sem plano de acao, sem inventar numero que nao esteja nos relatos.
- Titulo: curto e especifico, no maximo 10 palavras.
- Escreva em portugues do Brasil, na mesma voz do texto atual.

Chame registrar_absorcao.`

const SCHEMA_ABSORCAO = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'Titulo que cobre o conjunto inteiro.' },
    descricao: { type: 'string', description: 'Ate 3 frases sobre o que os clientes relataram.' },
    prioridade: { type: 'string', enum: ['URGENTE', 'IMPORTANTE', 'OBSERVACAO'] },
    mudou: {
      type: 'boolean',
      description: 'true se algum dos campos precisou mesmo mudar para englobar o feedback novo.',
    },
    motivo: { type: 'string', description: 'Uma frase curta explicando a mudanca, ou por que nada mudou.' },
  },
  required: ['titulo', 'descricao', 'prioridade'],
}

const PROMPT_ABSORCAO_ACAO =
  `Um feedback novo de cliente acabou de ser ligado a uma acao que a equipe do restaurante ja esta executando. Seu trabalho e conferir se o titulo e o plano da acao ainda cobrem tudo que ela trata agora — e ajustar o que for preciso para incluir o feedback novo, sem jogar fora o que ja estava certo.

## A acao, como esta hoje
Titulo: {titulo}
Status: {status}
Plano:
{plano}
Prioridade: {prioridade}
Categoria: {categoria}

## Os feedbacks que ela ja cobria
{pontos}

## O feedback que acabou de entrar
"{texto}"
Sentimento: {sentimento}

## Sua tarefa
Devolva titulo_acao, plano_detalhado e prioridade que continuem valendo para o
conjunto INTEIRO — os feedbacks antigos E o novo.

Regras:
- A equipe pode ja estar executando este plano. NAO reescreva do zero: parta
  sempre do que ja esta escrito.
- Se o feedback novo e so mais um caso do problema que o plano ja ataca, repita
  titulo_acao e plano_detalhado exatamente como estao. Isso e o mais comum —
  nao mude so para mudar.
- Se o feedback novo trouxer um aspecto que o plano ainda nao cobre (ex.: o
  plano fala de demora na cozinha e o feedback novo fala de mesa suja no mesmo
  atendimento), ACRESCENTE um passo ao plano existente. Nunca apague nem
  reescreva um passo que ja resolvia os relatos antigos so para caber o novo.
- PRIORIDADE SO SOBE, nunca desce. Um relato a mais nunca torna o problema
  menos grave, mesmo que ele seja brando: os relatos graves anteriores
  continuam existindo. A ordem e OBSERVACAO < IMPORTANTE < URGENTE.
- Suba para URGENTE quando o feedback novo trouxer algo que o plano atual nao
  cobre e que muda o tamanho do problema: passar mal, corpo estranho na
  comida, risco a saude, cobranca indevida, discriminacao ou falta de higiene.
- Titulo: curto e especifico, no maximo 10 palavras.
- Escreva em portugues do Brasil, na mesma voz do texto atual.

Chame registrar_absorcao_acao.`

const SCHEMA_ABSORCAO_ACAO = {
  type: 'object',
  properties: {
    titulo_acao: { type: 'string', description: 'Titulo que continua cobrindo o conjunto inteiro.' },
    plano_detalhado: { type: 'string', description: 'Plano ajustado, preservando o que ja estava certo.' },
    prioridade: { type: 'string', enum: ['URGENTE', 'IMPORTANTE', 'OBSERVACAO'] },
    mudou: {
      type: 'boolean',
      description: 'true se algum dos campos precisou mesmo mudar para incluir o feedback novo.',
    },
    motivo: { type: 'string', description: 'Uma frase curta explicando a mudanca, ou por que nada mudou.' },
  },
  required: ['titulo_acao', 'plano_detalhado', 'prioridade'],
}

/** Ordem oficial da escala. Índice maior = mais grave. */
const ESCALA_PRIORIDADE = ['OBSERVACAO', 'IMPORTANTE', 'URGENTE']

// deno-lint-ignore no-explicit-any
type Db = any

/**
 * O feedback terminou livre. Ja ha acumulo suficiente para uma rodada?
 *
 * Este e o unico lugar do sistema onde a resposta pode ser dada com seguranca.
 * O feedback nasce livre, mas so depois desta funcao rodar se sabe se ele
 * REALMENTE ficou livre ou grudou em algo — contar na chegada dispararia
 * rodadas cheias de feedbacks que sao vinculados segundos depois.
 *
 * Dispara e nao espera: a geracao leva dezenas de segundos e nao pode segurar o
 * trigger de insert. Se falhar, o cron horario pega na proxima passada.
 */
async function talvezGerarInsights(db: Db, restauranteId: number) {
  try {
    const { data } = await db.rpc('deve_gerar_insights', { p_restaurante_id: restauranteId })
    const g = Array.isArray(data) ? data[0] : data
    if (!g?.deve) return

    console.log(
      `[r${restauranteId}] ${g.livres_novos} feedbacks livres acumulados ` +
        `(limite ${g.necessarios}) — disparando a analise`,
    )

    // Sem await no corpo da resposta: dispara e segue.
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/gerar-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
      },
      body: JSON.stringify({ restaurante_id: restauranteId, force: false }),
    }).catch((e) => console.error('falha ao disparar gerar-insights:', e))
  } catch (e) {
    console.error('falha ao checar o gatilho de insights:', e)
  }
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { feedback_id: feedbackId } = await req.json().catch(() => ({}))
    if (!feedbackId) return json({ error: 'feedback_id é obrigatório' }, 400)

    const db: Db = clienteAdmin()

    const { data: fb } = await db
      .from('feedbacks_restaurante')
      .select('id, texto_original, resumo, categoria, sentimento, tema_id, origem_id, restaurante_id, usado_em')
      .eq('id', feedbackId)
      .maybeSingle()

    if (!fb) return json({ status: 'feedback_nao_encontrado' })
    // Já consumido por outra rota (backfill, geração concorrente): não mexe.
    if (fb.usado_em) return json({ status: 'ja_usado' })

    const texto = (fb.texto_original || fb.resumo || '').trim()
    if (!texto) return json({ status: 'sem_texto' })

    // ---- Candidatos: ações abertas e insights vivos ----
    const [{ data: acoes }, { data: insights }] = await Promise.all([
      db.from('acoes_operacionais')
        .select('id, titulo_acao, plano_detalhado, categoria')
        .eq('restaurante_id', fb.restaurante_id)
        .in('status', ['PENDENTE', 'EM_ANDAMENTO'])
        .is('arquivada_em', null),
      db.from('insights')
        .select('id, titulo, descricao, categoria, assunto_chave')
        .eq('restaurante_id', fb.restaurante_id)
        .eq('ativo', true)
        .is('deletado_em', null),
    ])

    // ---- 1. Atalho determinístico: mesmo tema ----
    //
    // A ORDEM É AÇÃO PRIMEIRO, DEPOIS INSIGHT, e isso importa.
    //
    // A ação é o estado mais avançado do mesmo assunto: alguém já decidiu
    // resolver aquilo e está tocando. Se um feedback novo fosse para o insight
    // quando existe uma ação sobre o mesmo tema, o cliente que reclamou hoje
    // não seria avisado quando a equipe concluísse — porque quem gera o aviso
    // é o vínculo com a AÇÃO, não com o insight.
    //
    // O `tema_id` vem do `classificar-feedback`, com o mesmo critério que
    // agrupou os assuntos na geração. Se bate, é o mesmo assunto — não há o que
    // uma IA acrescentar aqui.
    //
    // A ação é procurada por consulta separada, e não por embed: existem DUAS
    // FKs entre `acoes_operacionais` e `insights` (`acoes.insight_id` e
    // `insights.acao_id`), então `insights!inner(...)` é ambíguo e o PostgREST
    // devolve PGRST201. E os dois sentidos precisam ser olhados de qualquer
    // jeito — ações antigas perderam o `insight_id` num `on delete set null`, e
    // é o insight que passou a guardar o `acao_id` ao virar ação.
    if (fb.tema_id) {
      const negativo = (fb.sentimento || '').toLowerCase().includes('negativ')
      const chaveEsperada = `tema:${fb.tema_id}|${negativo ? 'neg' : 'pos'}`

      const { data: doTema } = await db
        .from('insights')
        .select('id, acao_id, ativo, deletado_em')
        .eq('restaurante_id', fb.restaurante_id)
        .eq('assunto_chave', chaveEsperada)

      // 1a. Existe AÇÃO ABERTA sobre este assunto?
      if (doTema && doTema.length > 0) {
        // deno-lint-ignore no-explicit-any
        const acaoIds = doTema.map((i: any) => i.acao_id).filter(Boolean)
        // deno-lint-ignore no-explicit-any
        const insightIds = doTema.map((i: any) => i.id)

        const filtros = [`insight_id.in.(${insightIds.join(',')})`]
        if (acaoIds.length > 0) filtros.push(`id.in.(${acaoIds.join(',')})`)

        const { data: acaoDoTema } = await db
          .from('acoes_operacionais')
          .select('id')
          .eq('restaurante_id', fb.restaurante_id)
          .in('status', ['PENDENTE', 'EM_ANDAMENTO'])
          .is('arquivada_em', null)
          .or(filtros.join(','))
          .limit(1)

        if (acaoDoTema && acaoDoTema.length > 0) {
          const abs = await ligarAAcao(db, fb, acaoDoTema[0].id, texto)
          return json({ status: 'ligado', destino: 'acao', id: acaoDoTema[0].id, via: 'tema', absorcao: abs })
        }
      }

      // 1b. Não há ação. E insight ativo sobre o mesmo assunto?
      // deno-lint-ignore no-explicit-any
      const vivo = (doTema ?? []).find((i: any) => i.ativo && !i.deletado_em)
      if (vivo) {
        const abs = await ligarAoInsight(db, fb, vivo.id, texto)
        return json({ status: 'ligado', destino: 'insight', id: vivo.id, via: 'tema', absorcao: abs })
      }
    }
    // ---- 2. Sem candidato da mesma categoria: fica livre, sem gastar IA ----
    // deno-lint-ignore no-explicit-any
    const acoesCat = (acoes ?? []).filter((a: any) => a.categoria === fb.categoria)
    // deno-lint-ignore no-explicit-any
    const insightsCat = (insights ?? []).filter((i: any) => i.categoria === fb.categoria)

    if (acoesCat.length === 0 && insightsCat.length === 0) {
      await talvezGerarInsights(db, fb.restaurante_id)
      return json({ status: 'livre', motivo: 'nenhum candidato na categoria' })
    }

    // ---- 3. Ambíguo: uma chamada de IA ----
    const prompts = await carregarPrompts(db)
    const params = await paramsDoAgente(db, AGENTE, { max_tokens: 400 })
    if (!params) {
      await talvezGerarInsights(db, fb.restaurante_id)
      return json({ status: 'livre', motivo: 'agente desativado' })
    }

    const prompt = montarPrompt(prompts, 'ef_vincular_feedback', PROMPT, {
      texto,
      categoria: fb.categoria ?? '?',
      sentimento: fb.sentimento ?? '?',
      acoes: acoesCat.length
        ? acoesCat
            .slice(0, MAX_CANDIDATOS)
            // deno-lint-ignore no-explicit-any
            .map((a: any) => `- id ${a.id}: ${a.titulo_acao} — ${(a.plano_detalhado ?? '').slice(0, 160)}`)
            .join('\n')
        : '(nenhuma)',
      insights: insightsCat.length
        ? insightsCat
            .slice(0, MAX_CANDIDATOS)
            // deno-lint-ignore no-explicit-any
            .map((i: any) => `- id ${i.id}: ${i.titulo} — ${(i.descricao ?? '').slice(0, 160)}`)
            .join('\n')
        : '(nenhum)',
    })

    let decisao: { destino?: string; id?: string; motivo?: string }
    try {
      const { result } = await chamarIA(db, {
        messages: [{ role: 'user', content: prompt }],
        params,
        origem: 'vincular-feedback',
        restauranteId: fb.restaurante_id,
        agenteId: AGENTE,
        calculadora: false,
        saida: {
          nome: 'registrar_decisao',
          descricao: 'Registra se o feedback se liga a alguma acao ou insight.',
          schema: SCHEMA,
        },
      })
      decisao = result ?? {}
    } catch (err) {
      if (err instanceof ErroCota) {
        await talvezGerarInsights(db, fb.restaurante_id)
        return json({ status: 'livre', motivo: 'sem credito' })
      }
      console.error('Falha ao decidir vinculo:', err)
      await talvezGerarInsights(db, fb.restaurante_id)
      return json({ status: 'livre', motivo: 'erro na IA' })
    }

    // A IA pode devolver id que não estava na lista — só passa o que ela viu.
    if (decisao.destino === 'acao') {
      // deno-lint-ignore no-explicit-any
      const valida = acoesCat.find((a: any) => String(a.id) === String(decisao.id))
      if (valida) {
        const abs = await ligarAAcao(db, fb, valida.id, texto)
        return json({
          status: 'ligado',
          destino: 'acao',
          id: valida.id,
          via: 'ia',
          motivo: decisao.motivo,
          absorcao: abs,
        })
      }
    }
    if (decisao.destino === 'insight') {
      // deno-lint-ignore no-explicit-any
      const valido = insightsCat.find((i: any) => String(i.id) === String(decisao.id))
      if (valido) {
        const abs = await ligarAoInsight(db, fb, valido.id, texto)
        return json({
          status: 'ligado',
          destino: 'insight',
          id: valido.id,
          via: 'ia',
          motivo: decisao.motivo,
          absorcao: abs,
        })
      }
    }

    await talvezGerarInsights(db, fb.restaurante_id)
    return json({ status: 'livre', motivo: decisao.motivo ?? 'nenhum candidato serve' })
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    const e = err as any
    console.error('vincular-feedback:', e)
    return json({ error: e?.message || String(err) }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function ligarAoInsight(db: Db, fb: any, insightId: string, texto: string) {
  const { error } = await db.from('insight_feedback').insert({
    insight_id: insightId,
    feedback_restaurante_id: fb.id,
    feedback_original_id: fb.origem_id,
    restaurante_id: fb.restaurante_id,
    origem: 'vinculo_novo',
  })
  // `insights.feedbacks_relacionados` não é atualizado aqui: um trigger em
  // `insight_feedback` recalcula (migration 20260827000000). Fazer na mão
  // deixava o contador alto quando a linha sumia por cascade.
  if (error) {
    console.error('Falha ao ligar ao insight:', error)
    // Sem vínculo não há o que absorver: reescrever o insight aqui afirmaria
    // que ele cobre um feedback que ninguém consegue enxergar por baixo dele.
    return { absorvido: false as const, motivo: 'vinculo falhou' }
  }

  return await absorverNoInsight(db, fb, insightId, texto)
}

/**
 * Reescreve o insight para que ele passe a descrever também o feedback recém
 * ligado. Ver o cabeçalho do arquivo para o porquê de isto existir.
 *
 * Falha-segura em todos os caminhos: sem crédito, agente desligado, IA fora do
 * ar ou resposta inválida, o insight fica com o texto que já tinha. O vínculo
 * (que é a parte que o cliente sente, porque é ele que faz o aviso chegar) já
 * está gravado antes de esta função ser chamada.
 */
// deno-lint-ignore no-explicit-any
async function absorverNoInsight(db: Db, fb: any, insightId: string, texto: string) {
  try {
    const { data: insight } = await db
      .from('insights')
      .select('id, titulo, descricao, prioridade, categoria')
      .eq('id', insightId)
      .maybeSingle()

    if (!insight) return { absorvido: false as const, motivo: 'insight sumiu' }

    const params = await paramsDoAgente(db, AGENTE_ABSORCAO, { max_tokens: 700 })
    if (!params) return { absorvido: false as const, motivo: 'agente desativado' }

    // Os pontos que o insight já cobria, para o modelo reescrever em cima do
    // conjunto e não só do último relato. O feedback novo é excluído: ele entra
    // no prompt pelo seu próprio bloco, e listá-lo duas vezes dá a ele peso
    // dobrado justamente na decisão que precisa tratá-lo como mais um.
    const { data: vinculos } = await db
      .from('insight_feedback')
      .select('feedback_restaurante_id')
      .eq('insight_id', insightId)
      .neq('feedback_restaurante_id', fb.id)
      .limit(MAX_PONTOS_CONTEXTO)

    // deno-lint-ignore no-explicit-any
    const ids = (vinculos ?? []).map((v: any) => v.feedback_restaurante_id).filter(Boolean)
    let pontos: string[] = []
    if (ids.length > 0) {
      const { data: textos } = await db
        .from('feedbacks_restaurante')
        .select('texto_original, resumo')
        .in('id', ids)
      pontos = (textos ?? [])
        // deno-lint-ignore no-explicit-any
        .map((t: any) => (t.texto_original || t.resumo || '').trim())
        .filter(Boolean)
        .map((t: string) => `- "${t.slice(0, 300)}"`)
    }

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_absorver_insight', PROMPT_ABSORCAO, {
      titulo: insight.titulo ?? '(sem titulo)',
      descricao: insight.descricao ?? '(sem descricao)',
      prioridade: insight.prioridade ?? 'OBSERVACAO',
      categoria: insight.categoria ?? '?',
      pontos: pontos.length ? pontos.join('\n') : '(nenhum registrado)',
      texto,
      sentimento: fb.sentimento ?? '?',
    })

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'vincular-feedback:absorcao',
      restauranteId: fb.restaurante_id,
      agenteId: AGENTE_ABSORCAO,
      calculadora: false,
      saida: {
        nome: 'registrar_absorcao',
        descricao: 'Registra o insight reescrito para englobar o feedback novo.',
        schema: SCHEMA_ABSORCAO,
      },
    })

    const r = (result ?? {}) as {
      titulo?: string
      descricao?: string
      prioridade?: string
      motivo?: string
    }

    // ---- O que a IA pode e o que ela não pode mudar ----
    //
    // `categoria` não está aqui de propósito: ela sai dos feedbacks por
    // maioria (gerar-insights), não da opinião do modelo, e o filtro da tela
    // conta feedback por categoria — deixar a IA mexer faria o número do filtro
    // parar de bater com o insight listado.
    //
    // `assunto_chave` também não: ele é a identidade do assunto
    // (`tema:N|neg`), e é por ele que o atalho determinístico do começo desta
    // função encontra o insight sem gastar IA. Reescrevê-lo quebraria o
    // agrupamento de todos os feedbacks seguintes.
    // deno-lint-ignore no-explicit-any
    const patch: Record<string, any> = {}

    const titulo = (r.titulo ?? '').trim()
    if (titulo && titulo !== insight.titulo) patch.titulo = titulo

    const descricao = (r.descricao ?? '').trim()
    if (descricao && descricao !== insight.descricao) patch.descricao = descricao

    // Prioridade é CLICADA no máximo, nunca no que a IA devolveu.
    //
    // O prompt manda não rebaixar, mas prompt é pedido, não garantia — e um
    // rebaixamento aqui é dano real: o insight urgente do relato de intoxicação
    // vira "observação" porque o quarto cliente só achou o prato salgado, e o
    // dono deixa de ver no topo o caso que mais importa. Um `max` custa uma
    // linha e fecha a porta.
    const atual = ESCALA_PRIORIDADE.indexOf(insight.prioridade ?? 'OBSERVACAO')
    const proposta = ESCALA_PRIORIDADE.indexOf((r.prioridade ?? '').toUpperCase())
    if (proposta > atual && proposta >= 0) patch.prioridade = ESCALA_PRIORIDADE[proposta]

    if (Object.keys(patch).length === 0) {
      return { absorvido: false as const, motivo: r.motivo ?? 'nada a mudar' }
    }

    const { error } = await db.from('insights').update(patch).eq('id', insightId)
    if (error) {
      console.error('Falha ao absorver no insight:', error)
      return { absorvido: false as const, motivo: 'update falhou' }
    }

    return { absorvido: true as const, campos: Object.keys(patch), motivo: r.motivo }
  } catch (err) {
    if (err instanceof ErroCota) return { absorvido: false as const, motivo: 'sem credito' }
    console.error('Falha na absorção do insight:', err)
    return { absorvido: false as const, motivo: 'erro na IA' }
  }
}

// deno-lint-ignore no-explicit-any
async function ligarAAcao(db: Db, fb: any, acaoId: number, texto: string) {
  const { error } = await db.from('feedback_acao').insert({
    acao_id: acaoId,
    feedback_restaurante_id: fb.id,
    feedback_original_id: fb.origem_id,
    restaurante_id: fb.restaurante_id,
  })
  // `acoes_operacionais.feedbacks_relacionados`/arrays espelhados, se existirem,
  // são recalculados por trigger em `feedback_acao` — mesma lógica do contador
  // de insight (migration 20260827030000). Nada a atualizar aqui na mão.
  if (error) {
    console.error('Falha ao ligar à ação:', error)
    // Sem vínculo não há o que absorver: reescrever a ação aqui afirmaria que
    // ela cobre um feedback que ninguém consegue enxergar por baixo dela.
    return { absorvido: false as const, motivo: 'vinculo falhou' }
  }

  return await absorverNaAcao(db, fb, acaoId, texto)
}

/**
 * Reescreve a ação para que ela passe a cobrir também o feedback recém
 * ligado, preservando o que já estava escrito. Ver o cabeçalho do arquivo
 * para o porquê de isto existir — é o mesmo motivo da absorção de insight,
 * só que para um texto que a equipe já pode estar executando.
 *
 * Falha-segura em todos os caminhos: sem crédito, agente desligado, IA fora do
 * ar ou resposta inválida, a ação fica com o texto que já tinha. O vínculo
 * (que é a parte que o cliente sente, porque é ele que faz o aviso de
 * conclusão chegar) já está gravado antes de esta função ser chamada.
 */
// deno-lint-ignore no-explicit-any
async function absorverNaAcao(db: Db, fb: any, acaoId: number, texto: string) {
  try {
    const { data: acao } = await db
      .from('acoes_operacionais')
      .select('id, titulo_acao, plano_detalhado, prioridade, categoria, status')
      .eq('id', acaoId)
      .maybeSingle()

    if (!acao) return { absorvido: false as const, motivo: 'acao sumiu' }

    const params = await paramsDoAgente(db, AGENTE_ABSORCAO_ACAO, { max_tokens: 900 })
    if (!params) return { absorvido: false as const, motivo: 'agente desativado' }

    // Os pontos que a ação já cobria, para o modelo reescrever em cima do
    // conjunto e não só do último relato. O feedback novo é excluído pela
    // mesma razão da absorção de insight: listá-lo duas vezes dá a ele peso
    // dobrado justamente na decisão que precisa tratá-lo como mais um.
    const { data: vinculos } = await db
      .from('feedback_acao')
      .select('feedback_restaurante_id')
      .eq('acao_id', acaoId)
      .neq('feedback_restaurante_id', fb.id)
      .limit(MAX_PONTOS_CONTEXTO)

    // deno-lint-ignore no-explicit-any
    const ids = (vinculos ?? []).map((v: any) => v.feedback_restaurante_id).filter(Boolean)
    let pontos: string[] = []
    if (ids.length > 0) {
      const { data: textos } = await db
        .from('feedbacks_restaurante')
        .select('texto_original, resumo')
        .in('id', ids)
      pontos = (textos ?? [])
        // deno-lint-ignore no-explicit-any
        .map((t: any) => (t.texto_original || t.resumo || '').trim())
        .filter(Boolean)
        .map((t: string) => `- "${t.slice(0, 300)}"`)
    }

    const planoAtual = planoParaPrompt(acao.plano_detalhado)

    const prompts = await carregarPrompts(db)
    const prompt = montarPrompt(prompts, 'ef_absorver_acao', PROMPT_ABSORCAO_ACAO, {
      titulo: acao.titulo_acao ?? '(sem titulo)',
      status: acao.status ?? '?',
      plano: planoAtual || '(sem plano)',
      prioridade: acao.prioridade ?? 'OBSERVACAO',
      categoria: acao.categoria ?? '?',
      pontos: pontos.length ? pontos.join('\n') : '(nenhum registrado)',
      texto,
      sentimento: fb.sentimento ?? '?',
    })

    const { result } = await chamarIA(db, {
      messages: [{ role: 'user', content: prompt }],
      params,
      origem: 'vincular-feedback:absorcao-acao',
      restauranteId: fb.restaurante_id,
      agenteId: AGENTE_ABSORCAO_ACAO,
      calculadora: false,
      saida: {
        nome: 'registrar_absorcao_acao',
        descricao: 'Registra a acao reescrita para cobrir o feedback novo.',
        schema: SCHEMA_ABSORCAO_ACAO,
      },
    })

    const r = (result ?? {}) as {
      titulo_acao?: string
      plano_detalhado?: string
      prioridade?: string
      motivo?: string
    }

    // ---- O que a IA pode e o que ela não pode mudar ----
    //
    // `categoria` não está aqui pelo mesmo motivo da absorção de insight: o
    // filtro da tela conta feedback por categoria, e deixar a IA mexer faria o
    // número parar de bater com a ação listada.
    //
    // `status` também não: é o progresso real da equipe (PENDENTE,
    // EM_ANDAMENTO, CONCLUIDO...). Só quem executa deve mudá-lo — uma
    // reescrita de texto não pode reabrir nem concluir uma ação sozinha.
    // deno-lint-ignore no-explicit-any
    const patch: Record<string, any> = {}

    const titulo = (r.titulo_acao ?? '').trim()
    if (titulo && titulo !== acao.titulo_acao) patch.titulo_acao = titulo

    const plano = (r.plano_detalhado ?? '').trim()
    if (plano && plano !== planoAtual) patch.plano_detalhado = plano

    // Prioridade é CLICADA no máximo, nunca no que a IA devolveu — mesma
    // salvaguarda da absorção de insight, pelo mesmo motivo: um prompt pede,
    // não garante, e um rebaixamento aqui apagaria da vista a ação urgente que
    // a equipe mais precisa tocar primeiro.
    const atual = ESCALA_PRIORIDADE.indexOf(acao.prioridade ?? 'OBSERVACAO')
    const proposta = ESCALA_PRIORIDADE.indexOf((r.prioridade ?? '').toUpperCase())
    if (proposta > atual && proposta >= 0) patch.prioridade = ESCALA_PRIORIDADE[proposta]

    if (Object.keys(patch).length === 0) {
      return { absorvido: false as const, motivo: r.motivo ?? 'nada a mudar' }
    }

    const { error } = await db.from('acoes_operacionais').update(patch).eq('id', acaoId)
    if (error) {
      console.error('Falha ao absorver na ação:', error)
      return { absorvido: false as const, motivo: 'update falhou' }
    }

    return { absorvido: true as const, campos: Object.keys(patch), motivo: r.motivo }
  } catch (err) {
    if (err instanceof ErroCota) return { absorvido: false as const, motivo: 'sem credito' }
    console.error('Falha na absorção da ação:', err)
    return { absorvido: false as const, motivo: 'erro na IA' }
  }
}
