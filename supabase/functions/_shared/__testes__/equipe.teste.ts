/**
 * Testes do pedido de feedback da equipe: regras (_shared/equipe.ts) e a função
 * equipe (handler), com banco e WhatsApp de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/equipe.teste.ts
 */
import {
  aberturaDoConvite, digitandoConviteMs, doRestaurante, FRASE_COMO_RESPONDER, FRASE_PARAR, intervaloEntreConvitesMs, prazoIdentidadeHoras,
  janelaDeEnvio, montarConvite, PERGUNTA_PADRAO, primeiroNome, validarPergunta,
} from '../equipe.ts'
import { rodarTick, tratarEquipe, type ConviteLinha, type DepsEquipe, type FuncionarioLinha } from '../../equipe/handler.ts'

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
interface Envio { id: number; restaurante_id: number; pergunta: string; status: string; criado_por: string; concluido_em?: string }
interface Convite extends ConviteLinha { status: string; erro?: string | null; tentou_em?: string | null; enviado_em?: string | null; message_id?: string | null }

function cenario(p: {
  admin?: boolean; login?: boolean; cron?: boolean; agora?: number; conectado?: boolean
  funcionarios?: FuncionarioLinha[]; envios?: Envio[]; convites?: Convite[]
  enviar?: () => { ok: boolean; incerto: boolean; messageId: string | null; erro: string | null }
  /** O valor de EQUIPE_PRAZO_IDENTIDADE_HORAS na configuração. */
  prazo?: unknown
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
    db: {
      prazoIdentidade: async () => p.prazo ?? null,
      funcionarios: async (rid) => funcionarios.filter((f) => f.restaurante_id === rid),
      funcionario: async (id) => funcionarios.find((f) => f.id === id) ?? null,
      envioAberto: async (rid) => envios.some((e) => e.restaurante_id === rid && ['na_fila', 'enviando'].includes(e.status)),
      criarEnvio: async (l) => {
        envios.push({ id: 100 + envios.length, status: 'na_fila', ...l })
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
  return { deps, envios, convites, enviados, segundoPlano, funcionarios }
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

console.log(falhas ? `\n${falhas} FALHA(S)` : '\npedido de feedback da equipe: tudo certo')
process.exit(falhas ? 1 : 0)
