/**
 * Montagem da mensagem de retorno: da fila crua aos blocos narrativos.
 *
 * Isolado do worker de propósito — é lógica pura (entra fila, sai blocos), sem
 * banco e sem rede, que é justamente a parte que precisa ser lida com atenção e
 * testada isoladamente.
 *
 * O problema que estas duas passadas resolvem: a fila é uma lista plana de
 * avisos, e renderizar essa lista direto produziria mensagem repetitiva —
 * a mesma citação do cliente aparecendo três vezes porque o feedback dele
 * alimentou três ações. Pior que não mandar nada.
 */

export interface AvisoFila {
  id: string
  acao_id: number
  etapa: 'em_andamento' | 'concluida'
  criado_em: string
  acao_titulo: string
  acao_categoria: string | null
  /** Feedbacks (originais) que alimentaram esta ação, do contato em questão. */
  feedbacks: { id: string; texto: string; criado_em: string }[]
}

export interface BlocoNarrativo {
  /** Citação do cliente. Nulo quando a ação perdeu o feedback de origem. */
  citacao: string | null
  /** Ações cobertas por este bloco — as "frentes" abertas sobre aquele comentário. */
  frentes: {
    acao_id: number
    titulo: string
    /** Etapas desta ação presentes na fila, em ordem cronológica. */
    etapas: ('em_andamento' | 'concluida')[]
  }[]
  /** Aviso mais antigo do bloco — define a ordem dos blocos na mensagem. */
  ancora_em: string
}

/**
 * Passada 1 — agrupar por ação.
 *
 * A mesma ação pode ter dois avisos na fila (começou E concluiu dentro da mesma
 * janela de silêncio). Os dois são reportados, mas como um movimento só:
 * "começamos a agir e já concluímos". Renderizar `concluida` antes de
 * `em_andamento` da mesma ação seria contar a história de trás para frente.
 */
function agruparPorAcao(fila: AvisoFila[]) {
  const porAcao = new Map<number, {
    acao_id: number
    titulo: string
    etapas: ('em_andamento' | 'concluida')[]
    feedbacks: { id: string; texto: string; criado_em: string }[]
    maisAntigo: string
  }>()

  for (const aviso of fila) {
    const atual = porAcao.get(aviso.acao_id)
    if (!atual) {
      porAcao.set(aviso.acao_id, {
        acao_id: aviso.acao_id,
        titulo: aviso.acao_titulo,
        etapas: [aviso.etapa],
        feedbacks: aviso.feedbacks,
        maisAntigo: aviso.criado_em,
      })
      continue
    }
    if (!atual.etapas.includes(aviso.etapa)) atual.etapas.push(aviso.etapa)
    if (aviso.criado_em < atual.maisAntigo) atual.maisAntigo = aviso.criado_em
  }

  // Ordem cronológica da narrativa, não a ordem em que os avisos entraram na
  // fila: "começamos" sempre antes de "concluímos".
  const ordem = { em_andamento: 0, concluida: 1 }
  for (const grupo of porAcao.values()) {
    grupo.etapas.sort((a, b) => ordem[a] - ordem[b])
  }

  return [...porAcao.values()]
}

/**
 * Passada 2 — agrupar por feedback, com desempate.
 *
 * Um feedback pode alimentar várias ações. Sem esta passada a mensagem repete a
 * mesma citação N vezes.
 *
 * O desempate resolve o caso em que os grupos se sobrepõem: o feedback A
 * alimenta as ações 1 e 2, o feedback B alimenta as ações 2 e 3 — agrupar
 * ingenuamente faria a ação 2 aparecer duas vezes. Regra: cada ação aparece uma
 * única vez, ancorada no feedback MAIS ANTIGO do contato que a alimentou.
 * Escolher o mais antigo (e não um qualquer) torna o resultado determinístico:
 * a mesma fila sempre produz a mesma mensagem.
 */
export function montarBlocos(fila: AvisoFila[]): BlocoNarrativo[] {
  const grupos = agruparPorAcao(fila)

  // Âncora de cada ação: o feedback mais antigo entre os que a alimentaram.
  const ancoraDaAcao = new Map<number, { id: string; texto: string; criado_em: string } | null>()
  for (const grupo of grupos) {
    const maisAntigo = [...grupo.feedbacks].sort((a, b) =>
      a.criado_em === b.criado_em ? a.id.localeCompare(b.id) : a.criado_em.localeCompare(b.criado_em)
    )[0]
    ancoraDaAcao.set(grupo.acao_id, maisAntigo ?? null)
  }

  const porFeedback = new Map<string, BlocoNarrativo>()
  const semFeedback: BlocoNarrativo[] = []

  for (const grupo of grupos) {
    const ancora = ancoraDaAcao.get(grupo.acao_id) ?? null
    const frente = { acao_id: grupo.acao_id, titulo: grupo.titulo, etapas: grupo.etapas }

    // Ação cujo feedback de origem foi apagado: vira bloco próprio, sem citação.
    // Some da mensagem se o worker decidir exigir citação — mas aqui ela ainda
    // existe, para que a decisão seja explícita e não um sumiço silencioso.
    if (!ancora) {
      semFeedback.push({ citacao: null, frentes: [frente], ancora_em: grupo.maisAntigo })
      continue
    }

    const bloco = porFeedback.get(ancora.id)
    if (bloco) {
      bloco.frentes.push(frente)
      if (grupo.maisAntigo < bloco.ancora_em) bloco.ancora_em = grupo.maisAntigo
    } else {
      porFeedback.set(ancora.id, {
        citacao: ancora.texto,
        frentes: [frente],
        ancora_em: grupo.maisAntigo,
      })
    }
  }

  // Mais antigo primeiro: o cliente lê na ordem em que as coisas aconteceram.
  return [...porFeedback.values(), ...semFeedback].sort((a, b) =>
    a.ancora_em.localeCompare(b.ancora_em)
  )
}

/**
 * Aplica o teto de itens.
 *
 * `max_itens_msg` conta BLOCOS NARRATIVOS, não avisos: um feedback que virou
 * cinco ações é um bloco, não cinco. Contar avisos truncaria a mensagem no meio
 * de um assunto só.
 */
export function aplicarTeto(
  blocos: BlocoNarrativo[],
  maxItens: number,
): { visiveis: BlocoNarrativo[]; excedente: number } {
  if (blocos.length <= maxItens) return { visiveis: blocos, excedente: 0 }
  return {
    visiveis: blocos.slice(0, maxItens),
    excedente: blocos.length - maxItens,
  }
}

/**
 * Momento em que a fila deste contato deve sair.
 *
 *     disparo = max(mais_antigo_da_fila + T_AGG, ultimo_envio + T_COOLDOWN)
 *
 * Uma conta só, sem iterar por etapa. O `max` cobre os dois casos:
 *
 *  - Fila fria (ninguém recebeu nada há muito tempo): vale `criado_em + T_AGG`.
 *    Espera a rajada inicial se formar, para não mandar uma mensagem por ação
 *    quando o dono move três cards seguidos.
 *
 *  - Fila represada (cooldown correndo): `criado_em + T_AGG` já passou faz
 *    tempo, então vale o fim do cooldown — a mensagem sai no instante em que o
 *    silêncio acaba, sem esperar mais um T_AGG à toa.
 */
export function calcularDisparo(
  maisAntigoDaFila: Date,
  ultimoEnvio: Date | null,
  agregacaoMin: number,
  cooldownDias: number,
): Date {
  const porAgregacao = new Date(maisAntigoDaFila.getTime() + agregacaoMin * 60_000)
  if (!ultimoEnvio) return porAgregacao

  const fimDoCooldown = new Date(ultimoEnvio.getTime() + cooldownDias * 86_400_000)
  return porAgregacao > fimDoCooldown ? porAgregacao : fimDoCooldown
}

/**
 * Horário de silêncio, em Brasília.
 *
 * O banco roda em UTC. Aplicar 22h–9h sem converter silenciaria das 19h às 6h
 * de Brasília — justamente o horário de pico de um restaurante, e o contrário
 * do que se quer.
 *
 * A janela cruza a meia-noite (22 → 9), daí a comparação por OR em vez de AND.
 */
export function dentroDoSilencio(agora: Date, inicio: number, fim: number): boolean {
  if (inicio === fim) return false // janela vazia = sem silêncio

  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(agora),
  ) % 24

  return inicio > fim ? hora >= inicio || hora < fim : hora >= inicio && hora < fim
}

/** Próximo instante fora do silêncio (o horário de `fim`, em Brasília). */
export function proximoHorarioUtil(agora: Date, fim: number): Date {
  // Descobre o deslocamento de Brasília comparando a hora local à UTC, em vez
  // de assumir -3 fixo — assim um eventual retorno do horário de verão não
  // desloca todas as mensagens em uma hora.
  const horaBr = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(agora),
  ) % 24

  let horasAte = fim - horaBr
  if (horasAte <= 0) horasAte += 24

  const alvo = new Date(agora.getTime() + horasAte * 3_600_000)
  alvo.setUTCMinutes(0, 0, 0)
  return alvo
}
