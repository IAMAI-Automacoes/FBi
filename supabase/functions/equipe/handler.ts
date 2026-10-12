// Feedback da equipe: o que o restaurante MANDA para a equipe (pedido de
// feedback, manual ou automático, e o aviso de ação concluída). Sem Deno nem
// banco: o index.ts liga as dependências, e o teste roda isto com tudo de
// mentira. Regras em _shared/equipe.ts.
//
// O pedido sai pelo WhatsApp do próprio restaurante (o mesmo dos clientes). O
// que a equipe responde NÃO passa por aqui: entra pelo n8n ("Feedback
// Restaurante") e é gravado pela função do banco `equipe_registrar_feedback`.
//
// Ações (POST { acao }), com o login do restaurante:
//   previa         → os pedaços fixos da mensagem do pedido
//   criar_envio    → { pergunta, funcionario_ids? }: põe um convite na fila para cada funcionário
//   cancelar_envio → { envio_id }: tira da fila o que ainda não saiu
//   rascunho_aviso → { acao_id }: o texto que a IA sugere para contar à equipe que a ação foi concluída
//   criar_aviso    → { acao_id, texto }: põe o aviso (já revisado) na fila, para a equipe toda
//   auto_ler       → como está o pedido automático
//   auto_salvar    → { ativo, cada_dias, pergunta }: liga, desliga ou muda o pedido automático
// Só a rotina do banco (x-cron-secret), de minuto em minuto:
//   tick → cria o pedido automático que venceu e manda a próxima mensagem da fila

import {
  aberturaDoAviso, aberturaDoConvite, digitandoConviteMs, FRASE_COMO_RESPONDER, FRASE_PARAR, FRASE_RESPONDER_AVISO,
  frequenciaValida, intervaloEntreConvitesMs, janelaDeEnvio, montarAviso, montarConvite, PERGUNTA_PADRAO,
  prazoIdentidadeHoras, primeiroPedidoAutomatico, proximaManha, proximoPedido, rascunhoPadraoDoAviso, TRAVADO_MS,
  validarAviso, validarPergunta,
} from '../_shared/equipe.ts'
import type { ResultadoEnvio } from '../_shared/uazapi.ts'

/**
 * Enquanto a página é só do admin da plataforma. Para liberar aos donos: false
 * aqui, `equipe_liberada()` no banco, o SoAdminPlataforma das rotas (App.tsx) e
 * o soAdmin do menu (AppSidebar.tsx).
 */
export const SO_ADMIN = true

export interface Quem { restauranteId: number | null; nomeRestaurante: string; email: string; ehAdmin: boolean }
export interface FuncionarioLinha { id: number; restaurante_id: number; nome: string; telefone: string; ativo: boolean; opt_out_em: string | null }
export interface ConviteLinha { id: number; envio_id: number; restaurante_id: number; funcionario_id: number | null; telefone: string; texto: string }
export interface EnvioLinha { id: number; restaurante_id: number; pergunta: string; status: string }
/** Uma ação do quadro da EQUIPE. `sensivel`: nasceu de um relato grave (não é para anunciar sem pensar). */
export interface AcaoLinha { id: number; restaurante_id: number; titulo: string; plano: string; categoria: string; sensivel: boolean }
export interface AutomaticoLinha {
  restaurante_id: number; ativo: boolean; cada_dias: number; pergunta: string
  proximo_em: string | null; ultimo_em: string | null; ultimo_erro: string | null
}

export interface DepsEquipe {
  /** Quem chamou (pelo login); null = sem login. */
  quemPede: () => Promise<Quem | null>
  /** A chamada veio da rotina do banco (o x-cron-secret confere)? */
  ehCron: () => Promise<boolean>
  agora: () => number
  /** Número de 0 a 1 (Math.random): variação das mensagens e dos tempos. */
  sorteio: () => number
  emSegundoPlano: (trabalho: Promise<unknown>) => void

  /** O WhatsApp do próprio restaurante (o mesmo que fala com os clientes). */
  whatsapp: {
    conectado: (restauranteId: number) => Promise<boolean>
    enviar: (p: { restauranteId: number; numero: string; texto: string; digitandoMs: number }) => Promise<ResultadoEnvio>
  }
  /** A IA que rascunha o aviso. null = desligada, sem crédito ou fora do ar (vale o texto-modelo). */
  ia: {
    rascunhoAviso: (p: { restauranteId: number; restaurante: string; titulo: string; plano: string; categoria: string }) => Promise<string | null>
  }
  db: {
    funcionarios: (restauranteId: number) => Promise<FuncionarioLinha[]>
    funcionario: (id: number) => Promise<FuncionarioLinha | null>
    envioAberto: (restauranteId: number) => Promise<boolean>
    criarEnvio: (linha: { restaurante_id: number; pergunta: string; criado_por: string; tipo?: 'pedido' | 'aviso'; acao_id?: number }) => Promise<number>
    criarConvites: (linhas: Record<string, unknown>[]) => Promise<void>
    envio: (id: number) => Promise<EnvioLinha | null>
    atualizarEnvio: (id: number, campos: Record<string, unknown>) => Promise<void>
    cancelarConvitesNaFila: (envioId: number) => Promise<void>
    /** Quantos convites do envio em cada status. */
    contarConvites: (envioId: number) => Promise<Record<string, number>>
    /**
     * O que a rotina pegou antes de `antes` e não terminou vira "falhou" (não
     * repete: pode ter saído). Devolve os envios desses convites.
     */
    destravar: (antes: string) => Promise<number[]>
    /** Quando a rotina pegou o último convite (de qualquer restaurante). */
    ultimoConviteEm: () => Promise<string | null>
    pegarConvite: () => Promise<ConviteLinha | null>
    /** O valor cru de EQUIPE_PRAZO_IDENTIDADE_HORAS (null = não configurado). */
    prazoIdentidade: () => Promise<unknown>
    /** A ação, só se for do quadro da equipe (null = não existe ou é de cliente). */
    acaoDaEquipe: (id: number) => Promise<AcaoLinha | null>
    /** Quando a equipe já foi avisada desta ação (aviso não cancelado), ou null. */
    avisoDaAcao: (acaoId: number) => Promise<string | null>
    automatico: (restauranteId: number) => Promise<AutomaticoLinha | null>
    salvarAutomatico: (restauranteId: number, campos: Record<string, unknown>) => Promise<void>
    /** Os pedidos automáticos ligados cuja hora chegou. */
    automaticosVencidos: (ate: string) => Promise<AutomaticoLinha[]>
    /** Quando saiu o último PEDIDO de feedback do restaurante (null = nunca). */
    ultimoPedidoEm: (restauranteId: number) => Promise<string | null>
    nomeDoRestaurante: (restauranteId: number) => Promise<string>
    atualizarConvite: (id: number, campos: Record<string, unknown>) => Promise<void>
  }
}

export interface Resultado { status: number; corpo: Record<string, unknown> }

const RECUSAS = {
  sem_login: [401, 'Entre de novo na sua conta.'],
  so_admin: [403, 'Disponível só para o admin por enquanto.'],
  so_rotina: [401, 'Só a rotina do sistema chama isto.'],
  sem_restaurante: [403, 'Esta conta não tem restaurante.'],
  pedido_invalido: [400, 'Pedido inválido.'],
  pergunta_invalida: [400, 'Escreva a pergunta (de 10 a 400 letras).'],
  sem_whatsapp: [409, 'O WhatsApp do restaurante não está conectado. Conecte em Configurações → WhatsApp.'],
  envio_em_andamento: [409, 'Já tem mensagens saindo para a equipe. Espere terminar ou cancele em Pedidos de feedback.'],
  sem_funcionarios: [409, 'Nenhum funcionário ativo para receber. Cadastre a equipe primeiro.'],
  nao_encontrado: [404, 'Pedido não encontrado.'],
  ja_terminou: [409, 'Este pedido já terminou.'],
  acao_nao_encontrada: [404, 'Ação não encontrada no quadro da equipe.'],
  aviso_invalido: [400, 'Escreva o aviso (de 20 a 600 letras).'],
  ja_avisou: [409, 'A equipe já foi avisada desta ação.'],
  frequencia_invalida: [400, 'Escolha toda semana, a cada 15 dias ou todo mês.'],
  falhou: [500, 'Não foi possível agora. Tente de novo.'],
} as const

function recusa(motivo: keyof typeof RECUSAS): Resultado {
  const [status, mensagem] = RECUSAS[motivo]
  return { status, corpo: { ok: false, motivo, error: mensagem } }
}

const iso = (ms: number) => new Date(ms).toISOString()
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

// ── A rotina de minuto em minuto ─────────────────────────────────────────────

/** Fecha o envio quando não sobra convite na fila. */
async function fecharSeAcabou(envioId: number, deps: DepsEquipe): Promise<void> {
  const n = await deps.db.contarConvites(envioId)
  if ((n.na_fila ?? 0) + (n.enviando ?? 0) > 0) {
    await deps.db.atualizarEnvio(envioId, { status: 'enviando' })
    return
  }
  // Nada saiu (todo mundo cancelado): o envio também é cancelado.
  const saiu = (n.enviado ?? 0) + (n.falhou ?? 0) > 0
  await deps.db.atualizarEnvio(envioId, { status: saiu ? 'concluido' : 'cancelado', concluido_em: iso(deps.agora()) })
}

async function mandarConvite(c: ConviteLinha, deps: DepsEquipe): Promise<string> {
  const f = c.funcionario_id ? await deps.db.funcionario(c.funcionario_id) : null
  if (!f || !f.ativo || f.opt_out_em) {
    await deps.db.atualizarConvite(c.id, { status: 'cancelado', erro: 'O funcionário foi removido, desativado ou pediu para parar.' })
    await fecharSeAcabou(c.envio_id, deps)
    return 'cancelado'
  }
  // WhatsApp do restaurante fora do ar: falha com o motivo certo (aparece na tela), sem tentar.
  if (!(await deps.whatsapp.conectado(c.restaurante_id).catch(() => false))) {
    await deps.db.atualizarConvite(c.id, { status: 'falhou', erro: 'O WhatsApp do restaurante estava desconectado.' })
    await fecharSeAcabou(c.envio_id, deps)
    return 'falhou'
  }
  const r = await deps.whatsapp.enviar({
    restauranteId: c.restaurante_id, numero: f.telefone, texto: c.texto, digitandoMs: digitandoConviteMs(c.texto, deps.sorteio),
  })
  if (r.ok) {
    await deps.db.atualizarConvite(c.id, { status: 'enviado', enviado_em: iso(deps.agora()), telefone: f.telefone, message_id: r.messageId, erro: null })
  } else {
    // Sem nova tentativa: no envio incerto a mensagem pode ter saído.
    await deps.db.atualizarConvite(c.id, {
      status: 'falhou',
      erro: r.incerto ? 'Não deu para confirmar se a mensagem saiu (a conexão caiu no meio).' : texto(r.erro || 'A mensagem não saiu.', 300),
    })
  }
  await fecharSeAcabou(c.envio_id, deps)
  return r.ok ? 'enviado' : 'falhou'
}

const podeReceber = (f: FuncionarioLinha) => f.ativo && !f.opt_out_em

/**
 * Pedido automático: cria o pedido de quem está com a data vencida. Roda dentro
 * do horário de envio. Nada aqui manda mensagem: só põe os convites na fila.
 */
export async function criarPedidosAutomaticos(deps: DepsEquipe): Promise<number> {
  const agora = deps.agora()
  let criados = 0
  for (const a of await deps.db.automaticosVencidos(iso(agora))) {
    const rid = a.restaurante_id
    // Outro envio saindo: espera a vez (tenta de novo no próximo minuto).
    if (await deps.db.envioAberto(rid)) continue
    // Sem WhatsApp: tenta de novo amanhã cedo, e a tela mostra por quê.
    if (!(await deps.whatsapp.conectado(rid).catch(() => false))) {
      await deps.db.salvarAutomatico(rid, { proximo_em: iso(proximaManha(agora)), ultimo_erro: 'O WhatsApp do restaurante estava desconectado.' })
      continue
    }
    const podem = (await deps.db.funcionarios(rid)).filter(podeReceber)
    if (!podem.length) {
      await deps.db.salvarAutomatico(rid, { proximo_em: iso(proximoPedido(agora, a.cada_dias)), ultimo_erro: 'Nenhum funcionário ativo para receber.' })
      continue
    }
    const pergunta = validarPergunta(a.pergunta) ?? PERGUNTA_PADRAO
    const restaurante = await deps.db.nomeDoRestaurante(rid)
    const envioId = await deps.db.criarEnvio({ restaurante_id: rid, pergunta, criado_por: 'automatico', tipo: 'pedido' })
    await deps.db.criarConvites(podem.map((f) => ({
      envio_id: envioId,
      restaurante_id: rid,
      funcionario_id: f.id,
      telefone: f.telefone,
      texto: montarConvite({ nome: f.nome, restaurante, pergunta, sorteio: deps.sorteio }),
    })))
    await deps.db.salvarAutomatico(rid, { proximo_em: iso(proximoPedido(agora, a.cada_dias)), ultimo_em: iso(agora), ultimo_erro: null })
    criados++
  }
  return criados
}

/** Uma rodada: no máximo uma mensagem, só no horário e com o intervalo sorteado desde a última. */
export async function rodarTick(deps: DepsEquipe): Promise<{ convite: string | null }> {
  const agora = deps.agora()
  for (const envioId of await deps.db.destravar(iso(agora - TRAVADO_MS))) await fecharSeAcabou(envioId, deps)

  if (!janelaDeEnvio(agora)) return { convite: null }
  // Falha aqui não pode travar a fila que já existe.
  await criarPedidosAutomaticos(deps).catch(() => 0)
  const ultimo = await deps.db.ultimoConviteEm()
  if (ultimo && agora - new Date(ultimo).getTime() < intervaloEntreConvitesMs(deps.sorteio)) return { convite: null }
  const c = await deps.db.pegarConvite()
  return { convite: c ? await mandarConvite(c, deps) : null }
}

// ── As ações ─────────────────────────────────────────────────────────────────

export async function tratarEquipe(corpo: Record<string, unknown>, deps: DepsEquipe): Promise<Resultado> {
  const acao = String(corpo?.acao ?? '')

  if (acao === 'tick') {
    if (!(await deps.ehCron())) return recusa('so_rotina')
    // O pg_net corta a conexão em segundos: responde já e termina em segundo plano.
    deps.emSegundoPlano(rodarTick(deps).catch(() => undefined))
    return { status: 202, corpo: { ok: true } }
  }

  const quem = await deps.quemPede()
  if (!quem?.email) return recusa('sem_login')
  if (SO_ADMIN && !quem.ehAdmin) return recusa('so_admin')
  if (!quem.restauranteId) return recusa('sem_restaurante')
  const restauranteId = quem.restauranteId

  try {
    if (acao === 'previa') {
      return {
        status: 200,
        corpo: {
          ok: true,
          abertura: aberturaDoConvite('Maria', quem.nomeRestaurante, 0),
          como_responder: FRASE_COMO_RESPONDER,
          parar: FRASE_PARAR,
          pergunta_padrao: PERGUNTA_PADRAO,
          whatsapp_conectado: await deps.whatsapp.conectado(restauranteId).catch(() => false),
          // Para a tela dizer o prazo certo da pergunta do anonimato.
          prazo_horas: prazoIdentidadeHoras(await deps.db.prazoIdentidade().catch(() => null)),
        },
      }
    }

    if (acao === 'criar_envio') {
      const pergunta = validarPergunta(corpo.pergunta)
      if (!pergunta) return recusa('pergunta_invalida')
      if (!(await deps.whatsapp.conectado(restauranteId))) return recusa('sem_whatsapp')
      if (await deps.db.envioAberto(restauranteId)) return recusa('envio_em_andamento')
      const podem = (await deps.db.funcionarios(restauranteId)).filter(podeReceber)
      const so = Array.isArray(corpo.funcionario_ids) ? new Set(corpo.funcionario_ids.map(Number)) : null
      const escolhidos = so ? podem.filter((f) => so.has(f.id)) : podem
      if (!escolhidos.length) return recusa('sem_funcionarios')

      const envioId = await deps.db.criarEnvio({ restaurante_id: restauranteId, pergunta, criado_por: quem.email.toLowerCase() })
      await deps.db.criarConvites(escolhidos.map((f) => ({
        envio_id: envioId,
        restaurante_id: restauranteId,
        funcionario_id: f.id,
        telefone: f.telefone,
        texto: montarConvite({ nome: f.nome, restaurante: quem.nomeRestaurante, pergunta, sorteio: deps.sorteio }),
      })))
      return { status: 200, corpo: { ok: true, envio_id: envioId, convites: escolhidos.length, no_horario: janelaDeEnvio(deps.agora()) } }
    }

    if (acao === 'cancelar_envio') {
      const envio = await deps.db.envio(Number(corpo.envio_id))
      if (!envio || envio.restaurante_id !== restauranteId) return recusa('nao_encontrado')
      if (envio.status !== 'na_fila' && envio.status !== 'enviando') return recusa('ja_terminou')
      await deps.db.cancelarConvitesNaFila(envio.id)
      await fecharSeAcabou(envio.id, deps)
      return { status: 200, corpo: { ok: true } }
    }

    // ── Aviso para a equipe toda: a ação foi concluída ──
    if (acao === 'rascunho_aviso' || acao === 'criar_aviso') {
      const a = await deps.db.acaoDaEquipe(Number(corpo.acao_id))
      if (!a || a.restaurante_id !== restauranteId) return recusa('acao_nao_encontrada')
      const jaAvisouEm = await deps.db.avisoDaAcao(a.id)
      const podem = (await deps.db.funcionarios(restauranteId)).filter(podeReceber)
      const conectado = await deps.whatsapp.conectado(restauranteId).catch(() => false)

      if (acao === 'rascunho_aviso') {
        // Já avisou: não gasta IA para um texto que não vai sair.
        const daIa = jaAvisouEm ? null : validarAviso(await deps.ia.rascunhoAviso({
          restauranteId, restaurante: quem.nomeRestaurante, titulo: a.titulo, plano: a.plano, categoria: a.categoria,
        }).catch(() => null))
        return {
          status: 200,
          corpo: {
            ok: true,
            texto: daIa ?? rascunhoPadraoDoAviso(a.titulo),
            da_ia: !!daIa,
            sensivel: a.sensivel,
            destinatarios: podem.length,
            ja_avisou_em: jaAvisouEm,
            abertura: aberturaDoAviso('Maria', quem.nomeRestaurante, 0),
            fecho: [FRASE_RESPONDER_AVISO, FRASE_PARAR].join('\n\n'),
            whatsapp_conectado: conectado,
          },
        }
      }

      const aviso = validarAviso(corpo.texto)
      if (!aviso) return recusa('aviso_invalido')
      if (jaAvisouEm) return recusa('ja_avisou')
      if (!conectado) return recusa('sem_whatsapp')
      if (await deps.db.envioAberto(restauranteId)) return recusa('envio_em_andamento')
      if (!podem.length) return recusa('sem_funcionarios')

      const envioId = await deps.db.criarEnvio({
        restaurante_id: restauranteId, pergunta: aviso, criado_por: quem.email.toLowerCase(), tipo: 'aviso', acao_id: a.id,
      })
      await deps.db.criarConvites(podem.map((f) => ({
        envio_id: envioId,
        restaurante_id: restauranteId,
        funcionario_id: f.id,
        telefone: f.telefone,
        texto: montarAviso({ nome: f.nome, restaurante: quem.nomeRestaurante, texto: aviso, sorteio: deps.sorteio }),
      })))
      return { status: 200, corpo: { ok: true, envio_id: envioId, convites: podem.length, no_horario: janelaDeEnvio(deps.agora()) } }
    }

    // ── Pedido automático ──
    if (acao === 'auto_ler' || acao === 'auto_salvar') {
      const atual = await deps.db.automatico(restauranteId)
      if (acao === 'auto_salvar') {
        const ativo = corpo.ativo === true
        const cada = Number(corpo.cada_dias)
        if (!frequenciaValida(cada)) return recusa('frequencia_invalida')
        const pergunta = validarPergunta(corpo.pergunta)
        if (!pergunta) return recusa('pergunta_invalida')
        // Mexeu só na pergunta: a data combinada continua. Ligou agora ou mudou
        // a frequência: recalcula, respeitando o último pedido que já saiu.
        const manter = ativo && atual?.ativo === true && atual.cada_dias === cada && !!atual.proximo_em
          && new Date(atual.proximo_em).getTime() > deps.agora()
        const ultimo = await deps.db.ultimoPedidoEm(restauranteId)
        const proximo = !ativo
          ? null
          : manter
            ? atual!.proximo_em
            : iso(primeiroPedidoAutomatico(deps.agora(), cada, ultimo ? new Date(ultimo).getTime() : null))
        await deps.db.salvarAutomatico(restauranteId, {
          ativo, cada_dias: cada, pergunta, proximo_em: proximo, ultimo_erro: null, atualizado_por: quem.email.toLowerCase(),
        })
        return { status: 200, corpo: { ok: true, ativo, cada_dias: cada, pergunta, proximo_em: proximo, ultimo_em: atual?.ultimo_em ?? null, ultimo_erro: null } }
      }
      return {
        status: 200,
        corpo: {
          ok: true,
          ativo: atual?.ativo === true,
          cada_dias: atual?.cada_dias ?? 30,
          pergunta: atual?.pergunta || PERGUNTA_PADRAO,
          proximo_em: atual?.ativo ? atual.proximo_em : null,
          ultimo_em: atual?.ultimo_em ?? null,
          ultimo_erro: atual?.ultimo_erro ?? null,
        },
      }
    }

    return recusa('pedido_invalido')
  } catch {
    return recusa('falhou')
  }
}
