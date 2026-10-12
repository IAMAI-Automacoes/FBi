// Feedback da equipe: o PEDIDO de feedback (página /equipe). Sem Deno nem
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
// Só a rotina do banco (x-cron-secret), de minuto em minuto:
//   tick → manda o próximo convite da fila

import {
  aberturaDoConvite, digitandoConviteMs, FRASE_COMO_RESPONDER, FRASE_PARAR, intervaloEntreConvitesMs, janelaDeEnvio,
  montarConvite, PERGUNTA_PADRAO, prazoIdentidadeHoras, TRAVADO_MS, validarPergunta,
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
  db: {
    funcionarios: (restauranteId: number) => Promise<FuncionarioLinha[]>
    funcionario: (id: number) => Promise<FuncionarioLinha | null>
    envioAberto: (restauranteId: number) => Promise<boolean>
    criarEnvio: (linha: { restaurante_id: number; pergunta: string; criado_por: string }) => Promise<number>
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
  envio_em_andamento: [409, 'Já tem um pedido de feedback sendo enviado. Espere terminar ou cancele.'],
  sem_funcionarios: [409, 'Nenhum funcionário ativo para receber. Cadastre a equipe primeiro.'],
  nao_encontrado: [404, 'Pedido não encontrado.'],
  ja_terminou: [409, 'Este pedido já terminou.'],
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

/** Uma rodada: no máximo um convite, só no horário e com o intervalo sorteado desde o último. */
export async function rodarTick(deps: DepsEquipe): Promise<{ convite: string | null }> {
  const agora = deps.agora()
  for (const envioId of await deps.db.destravar(iso(agora - TRAVADO_MS))) await fecharSeAcabou(envioId, deps)

  if (!janelaDeEnvio(agora)) return { convite: null }
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
      const podem = (await deps.db.funcionarios(restauranteId)).filter((f) => f.ativo && !f.opt_out_em)
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

    return recusa('pedido_invalido')
  } catch {
    return recusa('falhou')
  }
}
