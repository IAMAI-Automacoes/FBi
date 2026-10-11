// Feedback da equipe (página /equipe e aba Equipe do painel do admin). Sem Deno
// nem banco: o index.ts liga as dependências, e o teste roda isto com tudo de
// mentira. Regras em _shared/equipe.ts.
//
// Ações (POST { acao }), com o login do restaurante:
//   previa                → os pedaços fixos da mensagem do convite
//   criar_envio           → { pergunta, funcionario_ids? }: põe um convite na fila para cada funcionário
//   cancelar_envio        → { envio_id }: tira da fila o que ainda não saiu
//   gerar_resumo          → { envio_id }: a IA resume o que a equipe respondeu
//   simular               → { texto }: roda a análise num texto, sem WhatsApp e sem gravar
// Só o admin da plataforma (o número só do EasyFeed):
//   numero_status · numero_conectar · numero_desconectar
// Só a rotina do banco (x-cron-secret), de minuto em minuto:
//   tick → manda o próximo convite da fila e processa as respostas de quem já
//          parou de escrever (transcreve, analisa, grava, agradece, PARAR)

import {
  aberturaDoConvite, chaveWhatsapp, CONFIRMA_PARAR, destinoDaResposta, digitandoConviteMs, digitandoRespostaMs,
  ehPedidoDeParar, ehSoPedidoDeParar, ESPERA_BUFFER_S, FRASE_ANONIMO, FRASE_PARAR, inicioDoDiaSP, intervaloEntreConvitesMs,
  janelaDeEnvio, lerAnalise, lerResumo, MAX_TENTATIVAS_ANALISE, MINIMO_ANONIMO, montarConvite, numerarMensagens,
  PERGUNTA_PADRAO, pontosParaResumo, respostaPronta, sentimentoGeral, TRAVADO_MS, validarPergunta,
  type AnaliseEquipe, type ConviteDoNumero, type FuncionarioDoNumero,
} from '../_shared/equipe.ts'
import type { ResultadoEnvio } from '../_shared/uazapi.ts'

/**
 * Enquanto a página é só do admin da plataforma. Para liberar aos donos: false
 * aqui, tirar o SoAdminPlataforma da rota (App.tsx) e o soAdmin do menu
 * (AppSidebar.tsx), e dar a eles a RLS própria (hoje é só admin).
 */
export const SO_ADMIN = true

export interface Quem { restauranteId: number | null; nomeRestaurante: string; email: string; ehAdmin: boolean }
export interface FuncionarioLinha { id: number; restaurante_id: number; nome: string; telefone: string; ativo: boolean; opt_out_em: string | null }
export interface ConviteLinha { id: number; envio_id: number; restaurante_id: number; funcionario_id: number | null; telefone: string; texto: string }
export interface MensagemLinha { id: number; message_id: string; telefone: string; tipo: string; texto: string; tentativas: number; recebida_em: string }
export interface EnvioLinha { id: number; restaurante_id: number; pergunta: string; status: string }
export interface EstadoNumero { temInstancia: boolean; conectado: boolean; qrcode: string | null; numero: string | null; recusado?: string }

/** Erro que a tela mostra como está (ex.: limite de instâncias da uazapi). */
export class ErroEquipe extends Error {
  status: number
  motivo: string
  constructor(motivo: string, mensagem: string, status = 409) {
    super(mensagem)
    this.motivo = motivo
    this.status = status
  }
}

export interface DepsEquipe {
  /** Quem chamou (pelo login); null = sem login. */
  quemPede: () => Promise<Quem | null>
  /** A chamada veio da rotina do banco (o x-cron-secret confere)? */
  ehCron: () => Promise<boolean>
  agora: () => number
  /** Número de 0 a 1 (Math.random): variação das mensagens e dos tempos. */
  sorteio: () => number
  novoId: () => string
  emSegundoPlano: (trabalho: Promise<unknown>) => void

  /** O número só do EasyFeed. */
  numero: {
    status: () => Promise<EstadoNumero>
    conectar: () => Promise<EstadoNumero>
    desconectar: () => Promise<EstadoNumero>
    enviar: (p: { numero: string; texto: string; digitandoMs: number; replyId?: string | null }) => Promise<ResultadoEnvio>
    marcarLidas: (ids: string[]) => Promise<void>
    baixarAudio: (messageId: string) => Promise<{ base64: string; mime: string } | null>
  }
  ia: {
    transcrever: (base64: string, mime: string) => Promise<string>
    /** A resposta crua da IA; null = o agente está desligado no painel. Lança se falhar. */
    analisar: (p: { restauranteId: number; restaurante: string; pergunta: string; mensagens: string }) => Promise<unknown>
    resumir: (p: { restauranteId: number; restaurante: string; pergunta: string; total: number; pontos: string }) => Promise<unknown>
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
    pontosDoEnvio: (envioId: number) => Promise<{ categoria: string; sentimento: string; resumo: string; texto_original: string }[]>
    respostasDoEnvio: (envioId: number) => Promise<number>
    nomeDoRestaurante: (id: number) => Promise<string>

    /**
     * O que a rotina pegou antes de `antes` e não terminou: o convite vira
     * "falhou" (não repete, pode ter saído) e a mensagem volta para a fila.
     * Devolve os envios dos convites que travaram.
     */
    destravar: (antes: string) => Promise<number[]>
    /** Quando a rotina pegou o último convite (de qualquer restaurante). */
    ultimoConviteEm: () => Promise<string | null>
    pegarConvite: () => Promise<ConviteLinha | null>
    atualizarConvite: (id: number, campos: Record<string, unknown>) => Promise<void>
    registrarSaida: (linha: { message_id: string; telefone: string; texto: string; restaurante_id: number | null }) => Promise<void>

    pegarMensagens: (esperaSegundos: number, telefones: number) => Promise<MensagemLinha[]>
    atualizarMensagens: (ids: number[], campos: Record<string, unknown>) => Promise<void>
    funcionariosDoNumero: (telefone: string) => Promise<FuncionarioDoNumero[]>
    convitesDoNumero: (telefone: string) => Promise<ConviteDoNumero[]>
    /** A atendente já mandou alguma mensagem para este número desde `desde`? */
    saiuDesde: (telefone: string, desde: string) => Promise<boolean>
    criarResposta: (linha: Record<string, unknown>) => Promise<string>
    criarPontos: (linhas: Record<string, unknown>[]) => Promise<void>
    /** Marca a primeira resposta do convite (não sobrescreve). */
    marcarRespondeu: (conviteId: number, quando: string) => Promise<void>
    /** Marca o PARAR em todo cadastro deste número. true = marcou agora (não estava parado). */
    pararNumero: (telefone: string, motivo: string, quando: string) => Promise<boolean>
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
  sem_numero: [409, 'O número do EasyFeed para a equipe não está conectado. Conecte em Admin → Equipe.'],
  envio_em_andamento: [409, 'Já tem um pedido de feedback sendo enviado. Espere terminar ou cancele.'],
  sem_funcionarios: [409, 'Nenhum funcionário ativo para receber. Cadastre a equipe primeiro.'],
  nao_encontrado: [404, 'Envio não encontrado.'],
  ja_terminou: [409, 'Este envio já terminou.'],
  sem_respostas: [409, 'Ainda não chegou nenhuma resposta deste envio.'],
  texto_invalido: [400, 'Escreva o texto para testar (até 2000 letras).'],
  ia_desligada: [409, 'O agente de IA da equipe está desligado no painel (Agentes de IA).'],
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
  const r = await deps.numero.enviar({ numero: f.telefone, texto: c.texto, digitandoMs: digitandoConviteMs(c.texto, deps.sorteio) })
  if (r.ok) {
    const messageId = r.messageId ?? `saida-${deps.novoId()}`
    await deps.db.atualizarConvite(c.id, { status: 'enviado', enviado_em: iso(deps.agora()), telefone: f.telefone, message_id: messageId, erro: null })
    await deps.db.registrarSaida({ message_id: messageId, telefone: f.telefone, texto: c.texto, restaurante_id: c.restaurante_id }).catch(() => undefined)
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

const NEUTRA: AnaliseEquipe = { tipo: 'feedback', pontos: [], sensivel: false, perguntaSobre: null }

/** As mensagens de UMA pessoa que já parou de escrever. Lança = tenta de novo no próximo minuto. */
async function processarPessoa(grupo: MensagemLinha[], deps: DepsEquipe): Promise<string> {
  const agora = deps.agora()
  const telefone = grupo[0].telefone
  const ids = grupo.map((m) => m.id)
  // Última tentativa: guarda o que der, mesmo sem áudio ou sem análise.
  const ultima = Math.max(...grupo.map((m) => m.tentativas)) >= MAX_TENTATIVAS_ANALISE

  const destino = destinoDaResposta(await deps.db.funcionariosDoNumero(telefone), await deps.db.convitesDoNumero(telefone), agora)
  if (!destino) {
    await deps.db.atualizarMensagens(ids, { status: 'ignorada', processada_em: iso(agora) })
    return 'ignorada'
  }
  await deps.numero.marcarLidas(grupo.map((m) => m.message_id)).catch(() => undefined)

  const partes: { messageId: string; texto: string }[] = []
  for (const m of grupo) {
    let t = m.texto
    if (m.tipo === 'audio' && !t) {
      const audio = await deps.numero.baixarAudio(m.message_id)
      if (!audio && !ultima) throw new Error('O áudio não baixou.')
      try {
        t = audio ? await deps.ia.transcrever(audio.base64, audio.mime) : ''
      } catch (e) {
        if (!ultima) throw e
        t = ''
      }
      // Guarda a transcrição: a próxima tentativa não transcreve de novo.
      if (t) await deps.db.atualizarMensagens([m.id], { texto: t.slice(0, 4000) })
    }
    if (t.trim()) partes.push({ messageId: m.message_id, texto: t.trim() })
  }

  const pedidosDeParar = partes.filter((p) => ehPedidoDeParar(p.texto))
  const paraAnalise = partes.filter((p) => !ehSoPedidoDeParar(p.texto))
  const responder = async (mensagem: string, replyId: string | null) => {
    const r = await deps.numero.enviar({ numero: telefone, texto: mensagem, digitandoMs: digitandoRespostaMs(mensagem, deps.sorteio), replyId })
    if (r.ok) {
      await deps.db.registrarSaida({ message_id: r.messageId ?? `saida-${deps.novoId()}`, telefone, texto: mensagem, restaurante_id: destino.restauranteId })
        .catch(() => undefined)
    }
  }

  let respostaId: string | null = null
  let tipo = 'nada'
  if (paraAnalise.length) {
    const restaurante = await deps.db.nomeDoRestaurante(destino.restauranteId)
    const pergunta = (destino.envioId ? (await deps.db.envio(destino.envioId))?.pergunta : null) ?? PERGUNTA_PADRAO
    let analise: AnaliseEquipe | null = null
    let desligada = false
    try {
      const bruto = await deps.ia.analisar({
        restauranteId: destino.restauranteId, restaurante, pergunta, mensagens: numerarMensagens(paraAnalise.map((p) => p.texto)),
      })
      if (bruto === null) desligada = true
      else analise = lerAnalise(bruto)
    } catch (e) {
      if (!ultima) throw e
    }
    if (!analise && !desligada && !ultima) throw new Error('A análise veio fora do formato.')

    // Sem análise (IA desligada ou falhou até o fim): guarda o texto, para não perder.
    if (!analise || analise.tipo === 'feedback') {
      respostaId = await deps.db.criarResposta({
        restaurante_id: destino.restauranteId,
        envio_id: destino.envioId,
        funcionario_id: destino.funcionarioId,
        texto_original: paraAnalise.map((p) => p.texto).join('\n').slice(0, 8000),
        sentimento: analise ? sentimentoGeral(analise.pontos) : null,
        sensivel: analise?.sensivel ?? false,
      })
      if (analise?.pontos.length) {
        await deps.db.criarPontos(analise.pontos.map((p) => ({ ...p, resposta_id: respostaId, restaurante_id: destino.restauranteId })))
      }
      if (destino.conviteId) await deps.db.marcarRespondeu(destino.conviteId, iso(agora))
    }
    tipo = analise?.tipo ?? 'feedback'

    // Ela se apresenta só na primeira mensagem do dia (o convite já conta).
    const apresentar = !(await deps.db.saiuDesde(telefone, inicioDoDiaSP(agora)))
    const mensagem = respostaPronta({ analise: analise ?? NEUTRA, apresentar, sorteio: deps.sorteio })
    // Mandou mais de uma mensagem: a resposta cita a última que entrou na análise.
    if (mensagem) await responder(mensagem, grupo.length > 1 ? paraAnalise[paraAnalise.length - 1].messageId : null)
  }

  // PARAR: marca e confirma por último (é a última mensagem que a pessoa recebe).
  if (pedidosDeParar.length) {
    const pedido = pedidosDeParar[pedidosDeParar.length - 1]
    const marcouAgora = await deps.db.pararNumero(telefone, pedido.texto.slice(0, 300), iso(agora))
    if (marcouAgora) await responder(CONFIRMA_PARAR, pedido.messageId)
    if (tipo === 'nada') tipo = 'parar'
  }

  await deps.db.atualizarMensagens(ids, {
    status: 'processada', processada_em: iso(deps.agora()), restaurante_id: destino.restauranteId, resposta_id: respostaId, erro: null,
  })
  return tipo
}

/** Uma rodada: no máximo um convite, e as respostas de até 4 pessoas. */
export async function rodarTick(deps: DepsEquipe): Promise<{ convite: string | null; pessoas: string[] }> {
  const agora = deps.agora()
  for (const envioId of await deps.db.destravar(iso(agora - TRAVADO_MS))) await fecharSeAcabou(envioId, deps)

  // 1. O próximo convite, só no horário e com o intervalo sorteado desde o último.
  let convite: string | null = null
  if (janelaDeEnvio(agora)) {
    const ultimo = await deps.db.ultimoConviteEm()
    const passou = !ultimo || agora - new Date(ultimo).getTime() >= intervaloEntreConvitesMs(deps.sorteio)
    // Número desconectado: os convites esperam na fila em vez de falharem um a um.
    if (passou && (await deps.numero.status().catch(() => null))?.conectado) {
      const c = await deps.db.pegarConvite()
      if (c) convite = await mandarConvite(c, deps)
    }
  }

  // 2. As respostas de quem já parou de escrever, uma pessoa de cada vez.
  const mensagens = await deps.db.pegarMensagens(ESPERA_BUFFER_S, 4)
  const porPessoa = new Map<string, MensagemLinha[]>()
  for (const m of [...mensagens].sort((a, b) => a.recebida_em.localeCompare(b.recebida_em) || a.id - b.id)) {
    const chave = chaveWhatsapp(m.telefone)
    porPessoa.set(chave, [...(porPessoa.get(chave) ?? []), m])
  }
  const pessoas: string[] = []
  for (const grupo of porPessoa.values()) {
    try {
      pessoas.push(await processarPessoa(grupo, deps))
    } catch (e) {
      // Volta para a fila: a próxima rodada tenta de novo (até MAX_TENTATIVAS_ANALISE).
      await deps.db.atualizarMensagens(grupo.map((m) => m.id), { status: 'pendente', erro: texto((e as Error)?.message ?? e, 300) }).catch(() => undefined)
      pessoas.push('de_novo')
    }
  }
  return { convite, pessoas }
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

  try {
    if (acao === 'numero_status' || acao === 'numero_conectar' || acao === 'numero_desconectar') {
      if (!quem.ehAdmin) return recusa('so_admin')
      const estado = acao === 'numero_status' ? await deps.numero.status()
        : acao === 'numero_conectar' ? await deps.numero.conectar()
        : await deps.numero.desconectar()
      return { status: 200, corpo: { ok: true, ...estado } }
    }

    if (!quem.restauranteId) return recusa('sem_restaurante')
    const restauranteId = quem.restauranteId

    if (acao === 'previa') {
      return {
        status: 200,
        corpo: {
          ok: true,
          abertura: aberturaDoConvite('Maria', quem.nomeRestaurante, 0),
          anonimato: FRASE_ANONIMO,
          parar: FRASE_PARAR,
          pergunta_padrao: PERGUNTA_PADRAO,
          minimo_anonimo: MINIMO_ANONIMO,
        },
      }
    }

    if (acao === 'criar_envio') {
      const pergunta = validarPergunta(corpo.pergunta)
      if (!pergunta) return recusa('pergunta_invalida')
      if (!(await deps.numero.status()).conectado) return recusa('sem_numero')
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

    if (acao === 'cancelar_envio' || acao === 'gerar_resumo') {
      const envio = await deps.db.envio(Number(corpo.envio_id))
      if (!envio || envio.restaurante_id !== restauranteId) return recusa('nao_encontrado')

      if (acao === 'cancelar_envio') {
        if (envio.status !== 'na_fila' && envio.status !== 'enviando') return recusa('ja_terminou')
        await deps.db.cancelarConvitesNaFila(envio.id)
        await fecharSeAcabou(envio.id, deps)
        return { status: 200, corpo: { ok: true } }
      }

      const pontos = await deps.db.pontosDoEnvio(envio.id)
      if (!pontos.length) return recusa('sem_respostas')
      const total = await deps.db.respostasDoEnvio(envio.id)
      const bruto = await deps.ia.resumir({
        restauranteId, restaurante: quem.nomeRestaurante, pergunta: envio.pergunta, total, pontos: pontosParaResumo(pontos),
      })
      if (bruto === null) return recusa('ia_desligada')
      const resumo = lerResumo(bruto)
      if (!resumo) return recusa('falhou')
      const gravado = { ...resumo, respostas: total }
      await deps.db.atualizarEnvio(envio.id, { resumo: gravado, resumo_em: iso(deps.agora()) })
      return { status: 200, corpo: { ok: true, resumo: gravado } }
    }

    if (acao === 'simular') {
      const escrito = texto(corpo.texto, 2000)
      if (!escrito) return recusa('texto_invalido')
      const bruto = await deps.ia.analisar({ restauranteId, restaurante: quem.nomeRestaurante, pergunta: PERGUNTA_PADRAO, mensagens: escrito })
      if (bruto === null) return recusa('ia_desligada')
      const analise = lerAnalise(bruto)
      if (!analise) return recusa('falhou')
      return {
        status: 200,
        corpo: {
          ok: true,
          analise,
          sentimento: sentimentoGeral(analise.pontos),
          resposta: respostaPronta({ analise, apresentar: true, sorteio: deps.sorteio }),
          parar: ehPedidoDeParar(escrito),
        },
      }
    }

    return recusa('pedido_invalido')
  } catch (e) {
    if (e instanceof ErroEquipe) return { status: e.status, corpo: { ok: false, motivo: e.motivo, error: e.message } }
    return recusa('falhou')
  }
}
