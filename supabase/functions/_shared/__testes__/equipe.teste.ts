/**
 * Testes do pedido de feedback da equipe: regras (_shared/equipe.ts) e a função
 * equipe (handler), com banco e WhatsApp de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/equipe.teste.ts
 */
import {
  aberturaDoAviso, aberturaDoConvite, digitandoConviteMs, doRestaurante, FRASE_COMO_RESPONDER, FRASE_PARAR, FRASE_RESPONDER_AVISO,
  frequenciaValida, intervaloEntreConvitesMs, prazoIdentidadeHoras, janelaDeEnvio, montarAviso, montarConvite, PERGUNTA_PADRAO,
  primeiroNome, primeiroPedidoAutomatico, PROMPT_AVISO, proximaManha, proximoPedido, rascunhoPadraoDoAviso, validarAviso, validarPergunta,
} from '../equipe.ts'
import {
  criarPedidosAutomaticos, rodarTick, tratarEquipe,
  type AcaoLinha, type AutomaticoLinha, type ConviteLinha, type DepsEquipe, type FuncionarioLinha,
} from '../../equipe/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// Segunda, 12/10/2026, meio-dia em Brasília.
const AGORA = Date.parse('2026-10-12T15:00:00Z')

// ── O convite ────────────────────────────────────────────────────────────────
ok('primeiro nome, com a inicial maiúscula', primeiroNome('maria da silva') === 'Maria' && primeiroNome('  José ') === 'José' && primeiroNome('') === '' && primeiroNome('11 99') === '')
ok('"do Camelo", mas "da Pizzaria Bella"', doRestaurante('Camelo') === 'do Camelo' && doRestaurante('Pizzaria Bella') === 'da Pizzaria Bella' && doRestaurante('') === 'do restaurante')
const convite = montarConvite({ nome: 'ana paula', restaurante: 'Cantina da Nonna', pergunta: PERGUNTA_PADRAO, sorteio: () => 0 })
ok('convite: chama pelo nome e fala como a Helena do restaurante', convite.startsWith('Oi, Ana! Aqui é a Helena, da Cantina da Nonna.'), convite)
ok('convite: a pergunta, como responder e o PARAR', convite.includes(PERGUNTA_PADRAO) && convite.includes(FRASE_COMO_RESPONDER) && convite.endsWith(FRASE_PARAR))
ok('convite não promete anonimato de saída: avisa que a escolha vem depois',
  /depois eu pergunto se você quer que sua resposta fique anônima/i.test(convite) && !/é anônimo/i.test(convite) && !/EasyFeed/.test(convite), convite)
ok('convite: três aberturas diferentes, nenhuma com {sobra}', new Set([0, 0.4, 0.9].map((s) => montarConvite({ nome: 'Ana', restaurante: 'Camelo', pergunta: 'x'.repeat(12), sorteio: () => s }).split('\n\n')[0])).size === 3
  && [0, 1, 2].every((q) => !/[{}]/.test(aberturaDoConvite('Ana', 'Camelo', q))))
ok('convite sem nome não deixa vírgula solta', aberturaDoConvite('', 'Camelo', 0).startsWith('Oi! Aqui é a Helena') && aberturaDoConvite('', 'Camelo', 1).startsWith('Olá, tudo bem?'))
ok('pergunta: curta ou longa demais não serve; espaços são arrumados', validarPergunta('oi') === null && validarPergunta('x'.repeat(401)) === null
  && validarPergunta('  Como   está o trabalho?  ') === 'Como está o trabalho?')

// ── Ritmo ────────────────────────────────────────────────────────────────────
ok('janela: segunda ao meio-dia pode', janelaDeEnvio(AGORA))
ok('janela: domingo não', !janelaDeEnvio(Date.parse('2026-10-11T15:00:00Z')))
ok('janela: das 9h às 20h de Brasília', !janelaDeEnvio(Date.parse('2026-10-12T11:59:00Z')) && janelaDeEnvio(Date.parse('2026-10-12T12:00:00Z'))
  && janelaDeEnvio(Date.parse('2026-10-12T22:59:00Z')) && !janelaDeEnvio(Date.parse('2026-10-12T23:00:00Z')))
ok('intervalo entre convites: de 40 a 90 s', intervaloEntreConvitesMs(() => 0) === 40_000 && intervaloEntreConvitesMs(() => 1) === 90_000)
ok('digitando do convite: de 8 a 25 s', digitandoConviteMs('oi', () => 0) === 8_000 && digitandoConviteMs('x'.repeat(900), () => 1) === 25_000)

// ── A função (banco e WhatsApp de mentira) ───────────────────────────────────
interface Envio { id: number; restaurante_id: number; pergunta: string; status: string; criado_por: string; concluido_em?: string; tipo?: string; acao_id?: number; criado_em?: string }
interface Convite extends ConviteLinha { status: string; erro?: string | null; tentou_em?: string | null; enviado_em?: string | null; message_id?: string | null }

function cenario(p: {
  admin?: boolean; login?: boolean; cron?: boolean; agora?: number; conectado?: boolean
  funcionarios?: FuncionarioLinha[]; envios?: Envio[]; convites?: Convite[]
  enviar?: () => { ok: boolean; incerto: boolean; messageId: string | null; erro: string | null }
  /** O valor de EQUIPE_PRAZO_IDENTIDADE_HORAS na configuração. */
  prazo?: unknown
  acoes?: AcaoLinha[]; automaticos?: AutomaticoLinha[]
  /** O que a IA do aviso devolve; função que lança = IA fora do ar. */
  rascunho?: string | null | (() => string | null)
} = {}) {
  const funcionarios = p.funcionarios ?? [
    { id: 1, restaurante_id: 11, nome: 'Ana Paula', telefone: '5511987654321', ativo: true, opt_out_em: null },
    { id: 2, restaurante_id: 11, nome: 'Bruno', telefone: '5511912345678', ativo: true, opt_out_em: null },
    { id: 3, restaurante_id: 11, nome: 'Caio', telefone: '5511900000003', ativo: false, opt_out_em: null },
    { id: 4, restaurante_id: 11, nome: 'Duda', telefone: '5511900000004', ativo: true, opt_out_em: '2026-10-01T00:00:00Z' },
  ]
  const envios: Envio[] = p.envios ?? []
  const convites: Convite[] = p.convites ?? []
  const enviados: { restauranteId: number; numero: string; texto: string; digitandoMs: number }[] = []
  const segundoPlano: Promise<unknown>[] = []
  const agora = p.agora ?? AGORA
  const acoes: AcaoLinha[] = p.acoes ?? []
  const automaticos: AutomaticoLinha[] = p.automaticos ?? []
  const pedidosDeRascunho = { n: 0 }
  const deps: DepsEquipe = {
    quemPede: async () => (p.login === false ? null : { restauranteId: 11, nomeRestaurante: 'Camelo', email: 'dono@camelo.com', ehAdmin: p.admin !== false }),
    ehCron: async () => p.cron === true,
    agora: () => agora,
    sorteio: () => 0,
    emSegundoPlano: (t) => { segundoPlano.push(t) },
    whatsapp: {
      conectado: async () => p.conectado !== false,
      enviar: async (m) => {
        enviados.push(m)
        return p.enviar ? p.enviar() : { ok: true, incerto: false, messageId: `M${enviados.length}`, erro: null }
      },
    },
    ia: {
      rascunhoAviso: async () => {
        pedidosDeRascunho.n++
        return typeof p.rascunho === 'function' ? p.rascunho() : (p.rascunho ?? null)
      },
    },
    db: {
      prazoIdentidade: async () => p.prazo ?? null,
      acaoDaEquipe: async (id) => acoes.find((a) => a.id === id) ?? null,
      avisoDaAcao: async (acaoId) => envios.find((e) => e.tipo === 'aviso' && e.acao_id === acaoId && e.status !== 'cancelado')?.criado_em ?? null,
      automatico: async (rid) => automaticos.find((a) => a.restaurante_id === rid) ?? null,
      salvarAutomatico: async (rid, campos) => {
        const a = automaticos.find((x) => x.restaurante_id === rid)
        if (a) Object.assign(a, campos)
        else automaticos.push({ restaurante_id: rid, ativo: false, cada_dias: 30, pergunta: '', proximo_em: null, ultimo_em: null, ultimo_erro: null, ...campos } as AutomaticoLinha)
      },
      automaticosVencidos: async (ate) => automaticos.filter((a) => a.ativo && !!a.proximo_em && a.proximo_em <= ate),
      ultimoPedidoEm: async (rid) => envios.filter((e) => e.restaurante_id === rid && (e.tipo ?? 'pedido') === 'pedido' && e.status !== 'cancelado')
        .map((e) => e.criado_em ?? null).filter(Boolean).sort().pop() ?? null,
      nomeDoRestaurante: async () => 'Camelo',
      funcionarios: async (rid) => funcionarios.filter((f) => f.restaurante_id === rid),
      funcionario: async (id) => funcionarios.find((f) => f.id === id) ?? null,
      envioAberto: async (rid) => envios.some((e) => e.restaurante_id === rid && ['na_fila', 'enviando'].includes(e.status)),
      criarEnvio: async (l) => {
        envios.push({ id: 100 + envios.length, status: 'na_fila', criado_em: new Date(agora).toISOString(), ...l })
        return envios[envios.length - 1].id
      },
      criarConvites: async (ls) => {
        for (const l of ls) convites.push({ id: 500 + convites.length, status: 'na_fila', ...(l as Omit<ConviteLinha, 'id'>) })
      },
      envio: async (id) => envios.find((e) => e.id === id) ?? null,
      atualizarEnvio: async (id, campos) => { Object.assign(envios.find((e) => e.id === id)!, campos) },
      cancelarConvitesNaFila: async (envioId) => {
        for (const c of convites) if (c.envio_id === envioId && c.status === 'na_fila') c.status = 'cancelado'
      },
      contarConvites: async (envioId) => {
        const n: Record<string, number> = {}
        for (const c of convites) if (c.envio_id === envioId) n[c.status] = (n[c.status] ?? 0) + 1
        return n
      },
      destravar: async (antes) => {
        const travados = convites.filter((c) => c.status === 'enviando' && String(c.tentou_em) < antes)
        for (const c of travados) c.status = 'falhou'
        return [...new Set(travados.map((c) => c.envio_id))]
      },
      ultimoConviteEm: async () => convites.map((c) => c.tentou_em).filter(Boolean).sort().pop() ?? null,
      pegarConvite: async () => {
        const c = convites.find((x) => x.status === 'na_fila')
        if (!c) return null
        c.status = 'enviando'
        c.tentou_em = new Date(agora).toISOString()
        return c
      },
      atualizarConvite: async (id, campos) => { Object.assign(convites.find((c) => c.id === id)!, campos) },
    },
  }
  return { deps, envios, convites, enviados, segundoPlano, funcionarios, automaticos, pedidosDeRascunho }
}

let c = cenario({ login: false })
let r = await tratarEquipe({ acao: 'previa' }, c.deps)
ok('sem login: recusa', r.status === 401)
r = await tratarEquipe({ acao: 'previa' }, cenario({ admin: false }).deps)
ok('quem não é admin da plataforma: recusa (por enquanto)', r.status === 403 && r.corpo.motivo === 'so_admin')

r = await tratarEquipe({ acao: 'previa' }, cenario().deps)
ok('prévia: os pedaços fixos da mensagem e se o WhatsApp está conectado', r.status === 200 && String(r.corpo.abertura).includes('Helena, do Camelo')
  && r.corpo.como_responder === FRASE_COMO_RESPONDER && r.corpo.parar === FRASE_PARAR && r.corpo.whatsapp_conectado === true)
ok('prévia: o prazo da pergunta do anonimato é 24 horas quando ninguém configurou', r.corpo.prazo_horas === 24, r.corpo.prazo_horas)
r = await tratarEquipe({ acao: 'previa' }, cenario({ prazo: ' 48 ' }).deps)
ok('prévia: o prazo configurado vai para a tela', r.corpo.prazo_horas === 48, r.corpo.prazo_horas)
ok('prazo: fica entre 1 e 720 horas, e valor estranho volta ao padrão', prazoIdentidadeHoras('0') === 1 && prazoIdentidadeHoras('9999') === 720
  && prazoIdentidadeHoras('abc') === 24 && prazoIdentidadeHoras('-5') === 24 && prazoIdentidadeHoras('') === 24 && prazoIdentidadeHoras(null) === 24 && prazoIdentidadeHoras(72) === 72)

r = await tratarEquipe({ acao: 'criar_envio', pergunta: 'oi' }, cenario().deps)
ok('pedido com pergunta curta: recusa', r.status === 400 && r.corpo.motivo === 'pergunta_invalida')
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, cenario({ conectado: false }).deps)
ok('pedido com o WhatsApp do restaurante desconectado: recusa', r.status === 409 && r.corpo.motivo === 'sem_whatsapp')

c = cenario()
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, c.deps)
ok('pedido para todos: um convite por funcionário ativo que não pediu para parar', r.status === 200 && r.corpo.convites === 2
  && c.convites.map((x) => x.funcionario_id).join() === '1,2' && c.convites.every((x) => x.status === 'na_fila' && x.texto.includes(PERGUNTA_PADRAO)))
ok('o convite já nasce com o nome de cada um', c.convites[0].texto.startsWith('Oi, Ana!') && c.convites[1].texto.startsWith('Oi, Bruno!'))
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, c.deps)
ok('segundo pedido com um em andamento: recusa', r.status === 409 && r.corpo.motivo === 'envio_em_andamento')

c = cenario()
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO, funcionario_ids: [2, 3, 4] }, c.deps)
ok('pedido só para alguns: fica quem pode receber', r.corpo.convites === 1 && c.convites[0].funcionario_id === 2)
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO, funcionario_ids: [3, 4] }, cenario().deps)
ok('pedido sem ninguém que possa receber: recusa', r.status === 409 && r.corpo.motivo === 'sem_funcionarios')

// A rotina
r = await tratarEquipe({ acao: 'tick' }, cenario().deps)
ok('tick sem o segredo da rotina: recusa', r.status === 401 && r.corpo.motivo === 'so_rotina')
c = cenario({ cron: true })
await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, c.deps)
r = await tratarEquipe({ acao: 'tick' }, c.deps)
await Promise.all(c.segundoPlano)
ok('tick: responde na hora e manda UM convite, pelo WhatsApp do restaurante', r.status === 202 && c.enviados.length === 1
  && c.enviados[0].restauranteId === 11 && c.enviados[0].numero === '5511987654321' && c.enviados[0].digitandoMs >= 8_000)
ok('tick: o convite fica "enviado" com o id da mensagem; o envio segue "enviando"', c.convites[0].status === 'enviado' && c.convites[0].message_id === 'M1'
  && !!c.convites[0].enviado_em && c.envios[0].status === 'enviando')
let t = await rodarTick(c.deps)
ok('tick logo em seguida: espera o intervalo (não manda dois colados)', t.convite === null && c.enviados.length === 1)

const comFila = () => {
  const x = cenario({ cron: true })
  x.envios.push({ id: 100, restaurante_id: 11, pergunta: PERGUNTA_PADRAO, status: 'na_fila', criado_por: 'dono@camelo.com' })
  x.convites.push({ id: 500, envio_id: 100, restaurante_id: 11, funcionario_id: 1, telefone: '5511987654321', texto: 'Oi, Ana!', status: 'na_fila' })
  return x
}
c = comFila()
t = await rodarTick(c.deps)
ok('último convite da fila: o envio fecha como concluído', t.convite === 'enviado' && c.envios[0].status === 'concluido' && !!c.envios[0].concluido_em)

c = comFila()
c.deps.agora = () => Date.parse('2026-10-11T15:00:00Z')
t = await rodarTick(c.deps)
ok('fora do horário (domingo): o convite espera na fila', t.convite === null && c.convites[0].status === 'na_fila' && c.enviados.length === 0)

c = comFila()
c.deps.whatsapp.conectado = async () => false
t = await rodarTick(c.deps)
ok('WhatsApp do restaurante desconectado na hora: falha com o motivo, sem tentar enviar', t.convite === 'falhou' && c.enviados.length === 0
  && /desconectado/.test(String(c.convites[0].erro)))

c = comFila()
c.deps.whatsapp.enviar = async () => ({ ok: false, incerto: true, messageId: null, erro: 'timeout' })
t = await rodarTick(c.deps)
ok('envio incerto: marca que falhou e NÃO tenta de novo', t.convite === 'falhou' && /confirmar se a mensagem saiu/.test(String(c.convites[0].erro)))
t = await rodarTick(c.deps)
ok('depois do envio incerto: nada mais na fila', t.convite === null)

c = comFila()
c.funcionarios[0].opt_out_em = '2026-10-12T14:00:00Z'
t = await rodarTick(c.deps)
ok('quem pediu PARAR depois do pedido criado: o convite é cancelado', t.convite === 'cancelado' && c.enviados.length === 0 && c.envios[0].status === 'cancelado')

c = comFila()
c.convites[0].status = 'enviando'
c.convites[0].tentou_em = new Date(AGORA - 11 * 60_000).toISOString()
t = await rodarTick(c.deps)
ok('convite travado há mais de 10 min: vira "falhou" e o envio fecha', c.convites[0].status === 'falhou' && c.envios[0].status === 'concluido')

c = comFila()
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, c.deps)
ok('cancelar: tira da fila o que não saiu', r.status === 200 && c.convites[0].status === 'cancelado' && c.envios[0].status === 'cancelado')
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, c.deps)
ok('cancelar o que já terminou: recusa', r.status === 409 && r.corpo.motivo === 'ja_terminou')
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 999 }, c.deps)
ok('cancelar envio de outro restaurante ou que não existe: não encontra', r.status === 404)
r = await tratarEquipe({ acao: 'gerar_resumo', envio_id: 100 }, c.deps)
ok('ações do desenho antigo (resumo, número, simular) não existem mais', r.status === 400 && r.corpo.motivo === 'pedido_invalido')

// ── Aviso para a equipe toda (ação concluída) ────────────────────────────────
ok('aviso: texto de 20 a 600 letras, sem espaço sobrando', validarAviso('  curto ') === null && validarAviso('x'.repeat(601)) === null
  && validarAviso('A  escala agora sai\n\n\n\ntoda quarta-feira.') === 'A escala agora sai\n\ntoda quarta-feira.')
ok('aviso: sem a IA, o texto-modelo usa o título da ação', rascunhoPadraoDoAviso('Publicar a escala até quarta-feira.') === 'Vocês comentaram e a gestão cuidou disso:\nPublicar a escala até quarta-feira.'
  && rascunhoPadraoDoAviso('') === 'A gestão concluiu uma ação que nasceu do que vocês comentaram.' && validarAviso(rascunhoPadraoDoAviso('')) !== null)
const avisoMontado = montarAviso({ nome: 'ana paula', restaurante: 'Camelo', texto: 'A escala agora sai toda quarta-feira.', sorteio: () => 0 })
ok('aviso: a Helena abre, conta a novidade, convida a comentar e lembra do PARAR', avisoMontado === ['Oi, Ana! Aqui é a Helena, do Camelo.\nPassando pra contar uma novidade.',
  'A escala agora sai toda quarta-feira.', FRASE_RESPONDER_AVISO, FRASE_PARAR].join('\n\n'), avisoMontado)
ok('aviso: três aberturas, e nenhuma pede opinião como o convite', new Set([0, 1, 2].map((q) => aberturaDoAviso('Ana', 'Camelo', q))).size === 3
  && [0, 1, 2].every((q) => !/ouvi|ouvindo|saber como/.test(aberturaDoAviso('Ana', 'Camelo', q))))
ok('prompt do aviso: curto, sem dizer quem comentou, e discreto em caso grave', ['{restaurante}', '{categoria}', '{titulo}', '{plano}'].every((v) => PROMPT_AVISO.includes(v))
  && /NUNCA diga nem insinue quem comentou/.test(PROMPT_AVISO) && /NAO conte o caso/.test(PROMPT_AVISO))

const ACAO: AcaoLinha = { id: 7, restaurante_id: 11, titulo: 'Publicar a escala até quarta-feira', plano: '1. Fechar na terça.', categoria: 'Escala e horários', sensivel: false }
c = cenario({ acoes: [ACAO], rascunho: 'Vocês comentaram que a escala saía em cima da hora.\nAgora ela sai toda quarta.' })
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 7 }, c.deps)
ok('rascunho do aviso: o texto da IA, quantos recebem e os pedaços fixos', r.status === 200 && r.corpo.da_ia === true && String(r.corpo.texto).startsWith('Vocês comentaram que a escala')
  && r.corpo.destinatarios === 2 && r.corpo.sensivel === false && r.corpo.ja_avisou_em === null && String(r.corpo.abertura).includes('Helena, do Camelo')
  && String(r.corpo.fecho).endsWith(FRASE_PARAR) && r.corpo.whatsapp_conectado === true && c.envios.length === 0, r.corpo)
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 7 }, cenario({ acoes: [ACAO], rascunho: () => { throw new Error('IA fora') } }).deps)
ok('rascunho com a IA fora do ar (ou desligada): vale o texto-modelo', r.status === 200 && r.corpo.da_ia === false && r.corpo.texto === rascunhoPadraoDoAviso(ACAO.titulo))
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 7 }, cenario({ acoes: [ACAO], rascunho: 'ok' }).deps)
ok('rascunho curto demais da IA: vale o texto-modelo', r.corpo.da_ia === false && r.corpo.texto === rascunhoPadraoDoAviso(ACAO.titulo))
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 7 }, cenario({ acoes: [{ ...ACAO, sensivel: true }] }).deps)
ok('rascunho de ação que nasceu de relato grave: avisa a tela', r.corpo.sensivel === true)
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 99 }, cenario({ acoes: [ACAO] }).deps)
ok('aviso de ação que não existe, é de cliente ou de outro restaurante: não encontra', r.status === 404 && r.corpo.motivo === 'acao_nao_encontrada'
  && (await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'x'.repeat(40) }, cenario({ acoes: [{ ...ACAO, restaurante_id: 12 }] }).deps)).status === 404)

c = cenario({ acoes: [ACAO] })
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: '  A escala agora sai toda quarta-feira.  ' }, c.deps)
ok('criar aviso: um para cada pessoa que pode receber, marcado como aviso da ação', r.status === 200 && r.corpo.convites === 2 && c.envios[0].tipo === 'aviso' && c.envios[0].acao_id === 7
  && c.envios[0].pergunta === 'A escala agora sai toda quarta-feira.' && c.convites.length === 2 && c.convites.map((x) => x.funcionario_id).join() === '1,2', c.envios)
ok('criar aviso: a mensagem é a do aviso (não pede opinião nem promete botão)', c.convites[0].texto.includes('A escala agora sai toda quarta-feira.') && c.convites[0].texto.includes(FRASE_RESPONDER_AVISO)
  && c.convites[0].texto.endsWith(FRASE_PARAR) && !c.convites[0].texto.includes(FRASE_COMO_RESPONDER) && c.convites[0].texto.startsWith('Oi, Ana!'))
let t2 = await rodarTick(c.deps)
ok('o aviso sai pela mesma fila dos pedidos (um por minuto, no horário)', t2.convite === 'enviado' && c.enviados.length === 1 && c.enviados[0].texto === c.convites[0].texto)
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'A escala agora sai toda quarta-feira.' }, c.deps)
ok('a mesma ação não é avisada duas vezes', r.status === 409 && r.corpo.motivo === 'ja_avisou' && c.envios.length === 1)
r = await tratarEquipe({ acao: 'rascunho_aviso', acao_id: 7 }, c.deps)
ok('rascunho de ação já avisada: diz quando foi e não gasta IA', r.status === 200 && !!r.corpo.ja_avisou_em && c.pedidosDeRascunho.n === 0)
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'curto' }, cenario({ acoes: [ACAO] }).deps)
ok('aviso curto demais: recusa', r.status === 400 && r.corpo.motivo === 'aviso_invalido')
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'A escala agora sai toda quarta-feira.' }, cenario({ acoes: [ACAO], conectado: false }).deps)
ok('aviso com o WhatsApp desconectado: recusa', r.status === 409 && r.corpo.motivo === 'sem_whatsapp')
c = comFila()
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'A escala agora sai toda quarta-feira.' }, { ...c.deps, db: { ...c.deps.db, acaoDaEquipe: async () => ACAO } })
ok('aviso com um pedido ainda saindo: espera a vez', r.status === 409 && r.corpo.motivo === 'envio_em_andamento')
r = await tratarEquipe({ acao: 'criar_aviso', acao_id: 7, texto: 'A escala agora sai toda quarta-feira.' }, cenario({ acoes: [ACAO], admin: false }).deps)
ok('aviso: quem não é admin da plataforma não manda (por enquanto)', r.status === 403)

// ── Pedido automático ────────────────────────────────────────────────────────
// 12/10/2026 é segunda; 15h UTC = 12h de Brasília.
const dia = (iso: string) => new Date(iso).toISOString()
ok('frequências: toda semana, a cada 15 dias ou todo mês', [7, 14, 30].every(frequenciaValida) && ![0, 1, 10, 60, 'x', null].some(frequenciaValida) && frequenciaValida('14'))
ok('próxima manhã: amanhã às 10h de Brasília', dia(new Date(proximaManha(AGORA)).toISOString()) === '2026-10-13T13:00:00.000Z')
ok('próxima manhã: de sábado pula o domingo e cai na segunda', new Date(proximaManha(Date.parse('2026-10-17T15:00:00Z'))).toISOString() === '2026-10-19T13:00:00.000Z')
ok('próxima manhã: tarde da noite em Brasília ainda é "amanhã" de lá, não de UTC', new Date(proximaManha(Date.parse('2026-10-13T01:30:00Z'))).toISOString() === '2026-10-13T13:00:00.000Z')
ok('próximo pedido: conta os dias e vai para as 10h; domingo vira segunda', new Date(proximoPedido(AGORA, 7)).toISOString() === '2026-10-19T13:00:00.000Z'
  && new Date(proximoPedido(AGORA, 30)).toISOString() === '2026-11-11T13:00:00.000Z' && new Date(proximoPedido(Date.parse('2026-10-11T15:00:00Z'), 7)).toISOString() === '2026-10-19T13:00:00.000Z')
ok('ao ligar: sem pedido anterior, o primeiro sai amanhã cedo', primeiroPedidoAutomatico(AGORA, 30, null) === proximaManha(AGORA))
ok('ao ligar: com pedido recente, espera a frequência a partir dele (não manda dois em seguida)', new Date(primeiroPedidoAutomatico(AGORA, 7, Date.parse('2026-10-10T15:00:00Z'))).toISOString() === '2026-10-17T13:00:00.000Z'
  && primeiroPedidoAutomatico(AGORA, 7, Date.parse('2026-09-01T15:00:00Z')) === proximaManha(AGORA))

c = cenario()
r = await tratarEquipe({ acao: 'auto_ler' }, c.deps)
ok('automático nunca configurado: desligado, todo mês, com a pergunta padrão', r.status === 200 && r.corpo.ativo === false && r.corpo.cada_dias === 30 && r.corpo.pergunta === PERGUNTA_PADRAO && r.corpo.proximo_em === null)
r = await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 14, pergunta: 'O que mais atrapalha o seu dia de trabalho?' }, c.deps)
ok('ligar o automático: guarda a frequência e a pergunta, e marca o primeiro para amanhã cedo', r.status === 200 && r.corpo.ativo === true && r.corpo.proximo_em === '2026-10-13T13:00:00.000Z'
  && c.automaticos[0].cada_dias === 14 && c.automaticos[0].pergunta === 'O que mais atrapalha o seu dia de trabalho?' && c.envios.length === 0, r.corpo)
r = await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 14, pergunta: 'Tem alguma coisa que poderia melhorar por aqui?' }, c.deps)
ok('mudar só a pergunta: a data combinada continua', r.corpo.proximo_em === '2026-10-13T13:00:00.000Z' && c.automaticos[0].pergunta.startsWith('Tem alguma coisa'))
r = await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 7, pergunta: PERGUNTA_PADRAO }, c.deps)
ok('mudar a frequência: recalcula', r.corpo.cada_dias === 7 && r.corpo.proximo_em === '2026-10-13T13:00:00.000Z')
r = await tratarEquipe({ acao: 'auto_salvar', ativo: false, cada_dias: 7, pergunta: PERGUNTA_PADRAO }, c.deps)
ok('desligar: sem próxima data', r.corpo.ativo === false && r.corpo.proximo_em === null && c.automaticos[0].proximo_em === null)
ok('frequência ou pergunta inválida: recusa', (await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 10, pergunta: PERGUNTA_PADRAO }, c.deps)).corpo.motivo === 'frequencia_invalida'
  && (await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 7, pergunta: 'oi' }, c.deps)).corpo.motivo === 'pergunta_invalida')
ok('automático: quem não é admin da plataforma não mexe', (await tratarEquipe({ acao: 'auto_salvar', ativo: true, cada_dias: 7, pergunta: PERGUNTA_PADRAO }, cenario({ admin: false }).deps)).status === 403)

const AUTO = (extra: Partial<AutomaticoLinha> = {}): AutomaticoLinha => ({
  restaurante_id: 11, ativo: true, cada_dias: 7, pergunta: 'O que mais atrapalha o seu dia de trabalho?', proximo_em: new Date(AGORA - 60_000).toISOString(), ultimo_em: null, ultimo_erro: null, ...extra,
})
c = cenario({ automaticos: [AUTO()] })
let criados = await criarPedidosAutomaticos(c.deps)
ok('data vencida: cria o pedido para quem pode receber e marca o próximo', criados === 1 && c.envios.length === 1 && c.envios[0].criado_por === 'automatico' && c.envios[0].tipo === 'pedido'
  && c.convites.length === 2 && c.convites[0].texto.includes('O que mais atrapalha o seu dia de trabalho?') && c.convites[0].texto.includes(FRASE_COMO_RESPONDER)
  && c.automaticos[0].proximo_em === '2026-10-19T13:00:00.000Z' && c.automaticos[0].ultimo_em === new Date(AGORA).toISOString() && c.automaticos[0].ultimo_erro === null, c.automaticos)
criados = await criarPedidosAutomaticos(c.deps)
ok('não cria de novo no minuto seguinte', criados === 0 && c.envios.length === 1)
c = cenario({ automaticos: [AUTO({ proximo_em: new Date(AGORA + 3_600_000).toISOString() })] })
ok('data ainda não chegou: nada', (await criarPedidosAutomaticos(c.deps)) === 0 && c.envios.length === 0)
c = cenario({ automaticos: [AUTO({ ativo: false })] })
ok('automático desligado: nada', (await criarPedidosAutomaticos(c.deps)) === 0 && c.envios.length === 0)
c = cenario({ automaticos: [AUTO()], conectado: false })
await criarPedidosAutomaticos(c.deps)
ok('WhatsApp desconectado: não cria, tenta amanhã cedo e diz por quê', c.envios.length === 0 && c.automaticos[0].proximo_em === '2026-10-13T13:00:00.000Z' && /desconectado/.test(String(c.automaticos[0].ultimo_erro)))
c = cenario({ automaticos: [AUTO()], funcionarios: [] })
await criarPedidosAutomaticos(c.deps)
ok('sem ninguém para receber: pula para a próxima data e diz por quê', c.envios.length === 0 && c.automaticos[0].proximo_em === '2026-10-19T13:00:00.000Z' && /Nenhum funcionário/.test(String(c.automaticos[0].ultimo_erro)))
c = comFila()
c.automaticos.push(AUTO())
await criarPedidosAutomaticos(c.deps)
ok('com outro envio saindo: espera a vez, sem perder a data', c.envios.length === 1 && c.automaticos[0].proximo_em === new Date(AGORA - 60_000).toISOString())
c = cenario({ automaticos: [AUTO()] })
t2 = await rodarTick(c.deps)
ok('a rotina do minuto cria o pedido automático e já manda a primeira mensagem', c.envios.length === 1 && t2.convite === 'enviado' && c.enviados.length === 1)
c = cenario({ automaticos: [AUTO()], agora: Date.parse('2026-10-11T15:00:00Z') })
await rodarTick(c.deps)
ok('fora do horário (domingo): o automático espera', c.envios.length === 0)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\npedido de feedback da equipe: tudo certo')
process.exit(falhas ? 1 : 0)
