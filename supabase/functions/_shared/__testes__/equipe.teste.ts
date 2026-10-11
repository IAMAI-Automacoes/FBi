/**
 * Testes do feedback da equipe: regras (_shared/equipe.ts) e a função equipe
 * (handler), com banco, WhatsApp e IA de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/equipe.teste.ts
 */
import {
  aberturaDoConvite, chaveWhatsapp, CONFIRMA_PARAR, destinoDaResposta, digitandoConviteMs, digitandoRespostaMs, doRestaurante,
  ehPedidoDeParar, ehSoPedidoDeParar, FRASE_ANONIMO, FRASE_PARAR, inicioDoDiaSP, intervaloEntreConvitesMs, janelaDeEnvio, lerAnalise,
  lerEvento, lerResumo, MAX_TENTATIVAS_ANALISE, montarConvite, numerarMensagens, PERGUNTA_PADRAO, pontosParaResumo, primeiroNome,
  PROMPT_ANALISE, PROMPT_RESUMO, respostaPronta, sentimentoGeral, validarPergunta, variantesDoNumero, type AnaliseEquipe,
} from '../equipe.ts'
import { rodarTick, tratarEquipe, type DepsEquipe, type EstadoNumero } from '../../equipe/handler.ts'

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

// ── Telefone ─────────────────────────────────────────────────────────────────
ok('chave: o mesmo celular com e sem o 9', chaveWhatsapp('5511987654321') === '551187654321' && chaveWhatsapp('55 (11) 8765-4321') === '551187654321')
ok('variantes: busca o número gravado com ou sem o 9', variantesDoNumero('551187654321').join() === '551187654321,5511987654321'
  && variantesDoNumero('5511987654321').join() === '551187654321,5511987654321' && variantesDoNumero('').length === 0)

// ── O convite ────────────────────────────────────────────────────────────────
ok('primeiro nome, com a inicial maiúscula', primeiroNome('maria da silva') === 'Maria' && primeiroNome('  José ') === 'José' && primeiroNome('') === '' && primeiroNome('11 99') === '')
ok('"do Camelo", mas "da Pizzaria Bella"', doRestaurante('Camelo') === 'do Camelo' && doRestaurante('Pizzaria Bella') === 'da Pizzaria Bella' && doRestaurante('') === 'do restaurante')
const convite = montarConvite({ nome: 'ana paula', restaurante: 'Cantina da Nonna', pergunta: PERGUNTA_PADRAO, sorteio: () => 0 })
ok('convite: chama pelo nome, diz quem é e de onde', convite.startsWith('Oi, Ana! Aqui é a Lia, do EasyFeed.') && convite.includes('da Cantina da Nonna'), convite)
ok('convite: a pergunta, o anonimato e o PARAR', convite.includes(PERGUNTA_PADRAO) && convite.includes(FRASE_ANONIMO) && convite.endsWith(FRASE_PARAR))
ok('convite: três aberturas diferentes, nenhuma com {sobra}', new Set([0, 0.4, 0.9].map((s) => montarConvite({ nome: 'Ana', restaurante: 'Camelo', pergunta: 'x'.repeat(12), sorteio: () => s }).split('\n\n')[0])).size === 3
  && [0, 1, 2].every((q) => !/[{}]/.test(aberturaDoConvite('Ana', 'Camelo', q))))
ok('convite sem nome não deixa vírgula solta', aberturaDoConvite('', 'Camelo', 0).startsWith('Oi! Aqui é a Lia') && aberturaDoConvite('', 'Camelo', 1).startsWith('Olá, tudo bem?'))
ok('pergunta: curta ou longa demais não serve; espaços são arrumados', validarPergunta('oi') === null && validarPergunta('x'.repeat(401)) === null
  && validarPergunta('  Como   está o trabalho?  ') === 'Como está o trabalho?')

// ── Ritmo ────────────────────────────────────────────────────────────────────
ok('janela: segunda ao meio-dia pode', janelaDeEnvio(AGORA))
ok('janela: domingo não', !janelaDeEnvio(Date.parse('2026-10-11T15:00:00Z')))
ok('janela: das 9h às 20h de Brasília', !janelaDeEnvio(Date.parse('2026-10-12T11:59:00Z')) && janelaDeEnvio(Date.parse('2026-10-12T12:00:00Z'))
  && janelaDeEnvio(Date.parse('2026-10-12T22:59:00Z')) && !janelaDeEnvio(Date.parse('2026-10-12T23:00:00Z')))
ok('intervalo entre convites: de 40 a 90 s', intervaloEntreConvitesMs(() => 0) === 40_000 && intervaloEntreConvitesMs(() => 1) === 90_000)
ok('digitando do convite: de 8 a 25 s', digitandoConviteMs('oi', () => 0) === 8_000 && digitandoConviteMs('x'.repeat(900), () => 1) === 25_000)
ok('digitando da resposta: de 3 a 12 s', digitandoRespostaMs('ok', () => 0) === 3_000 && digitandoRespostaMs('x'.repeat(900), () => 1) === 12_000)
ok('início do dia em Brasília', inicioDoDiaSP(Date.parse('2026-10-13T02:30:00Z')) === '2026-10-12T00:00:00-03:00')

// ── O que chega ──────────────────────────────────────────────────────────────
const evento = (m: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  EventType: 'messages', token: 'tok-equipe', message: { messageid: 'M1', chatid: '5511987654321@s.whatsapp.net', messageType: 'Conversation', text: ' O salário atrasa ', ...m }, ...extra,
})
const lido = lerEvento(evento({}))
ok('evento: texto de conversa individual entra, aparado', lido?.telefone === '5511987654321' && lido.texto === 'O salário atrasa' && lido.tipo === 'texto' && lido.messageId === 'M1')
ok('evento: áudio entra sem texto', lerEvento(evento({ messageType: 'AudioMessage', text: undefined }))?.tipo === 'audio')
ok('evento: grupo, mensagem do próprio número e edição não entram', lerEvento(evento({ isGroup: true })) === null && lerEvento(evento({ fromMe: true })) === null && lerEvento(evento({ edited: 'M0' })) === null)
ok('evento: figurinha, texto vazio e outro tipo de evento não entram', lerEvento(evento({ messageType: 'StickerMessage' })) === null && lerEvento(evento({ text: '  ' })) === null
  && lerEvento(evento({}, { EventType: 'messages_update' })) === null)
ok('evento: conversa no formato novo (@lid) usa o sender_pn', lerEvento(evento({ chatid: '123@lid', sender_pn: '5521999990000@s.whatsapp.net' }))?.telefone === '5521999990000')
ok('evento: sem token ou sem id não entra', lerEvento(evento({}, { token: '' })) === null && lerEvento(evento({ messageid: '' })) === null && lerEvento(null) === null)

ok('PARAR: a palavra sozinha e os pedidos claros', ['PARAR', 'parar.', 'Pare!', 'sair', 'não quero mais receber mensagem', 'para de me mandar mensagem', 'Não quero mais receber',
  'me tira da lista', 'não me mandem mais'].every(ehPedidoDeParar))
ok('PARAR: feedback com "parar" ou "receber" não é pedido', !['queria parar de trabalhar todo domingo', 'não quero mais receber salário atrasado',
  'não me mandem mais para o turno da noite', 'fui para casa mais cedo', 'o gerente não para de gritar'].some(ehPedidoDeParar))
ok('PARAR numa linha, com feedback no resto: é pedido, mas não SÓ pedido', ehPedidoDeParar('A escala muda toda hora e ninguém avisa a gente antes.\nPARAR')
  && !ehSoPedidoDeParar('A escala muda toda hora e ninguém avisa a gente antes.\nPARAR') && ehSoPedidoDeParar('PARAR'))

const func = (id: number, rest: number, criado = '2026-09-01T00:00:00Z', ativo = true) => ({ id, restaurante_id: rest, ativo, criado_em: criado })
const conv = (id: number, envio: number, rest: number, diasAtras: number, f: number | null = 1) => ({
  id, envio_id: envio, restaurante_id: rest, funcionario_id: f, enviado_em: new Date(AGORA - diasAtras * 86_400_000).toISOString(),
})
ok('destino: o convite mais recente manda', JSON.stringify(destinoDaResposta([func(1, 11)], [conv(5, 50, 11, 9), conv(6, 60, 26, 2, 3)], AGORA))
  === JSON.stringify({ restauranteId: 26, envioId: 60, conviteId: 6, funcionarioId: 3 }))
ok('destino: convite de mais de 30 dias não conta, vira resposta espontânea', JSON.stringify(destinoDaResposta([func(1, 11)], [conv(5, 50, 11, 31)], AGORA))
  === JSON.stringify({ restauranteId: 11, envioId: null, conviteId: null, funcionarioId: 1 }))
ok('destino: sem convite, o cadastro ativo mais novo', destinoDaResposta([func(1, 11, '2026-01-01T00:00:00Z'), func(2, 26, '2026-08-01T00:00:00Z'), func(3, 30, '2026-09-01T00:00:00Z', false)], [], AGORA)?.restauranteId === 26)
ok('destino: número desconhecido', destinoDaResposta([], [], AGORA) === null)

// ── A análise ────────────────────────────────────────────────────────────────
ok('prompt da análise: os quatro campos entram', ['{restaurante}', '{pergunta}', '{mensagens}', '{categorias}'].every((c) => PROMPT_ANALISE.includes(c)))
ok('prompt do resumo: os quatro campos entram', ['{restaurante}', '{pergunta}', '{total}', '{pontos}'].every((c) => PROMPT_RESUMO.includes(c)))
ok('mensagens numeradas (uma só vai sem número)', numerarMensagens(['oi', ' o salário atrasa ']) === '[1] oi\n[2] o salário atrasa' && numerarMensagens(['oi']) === 'oi')
const respostaIA = (pontos: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ tipo: 'feedback', pontos, sensivel: false, pergunta_sobre: '', ...extra })
const ponto = (sentimento: string, categoria = 'Salário e benefícios', trecho = 'o salário atrasa') => ({ trecho, resumo: 'A equipe relata atraso no pagamento.', categoria, sentimento })
let a = lerAnalise(respostaIA([ponto('Negativo'), ponto('positivo', 'clima e colegas', '[2] a equipe é unida')]))
ok('análise: pontos com categoria da lista e sentimento arrumado', a?.tipo === 'feedback' && a.pontos.length === 2 && a.pontos[1].categoria === 'Clima e colegas' && a.pontos[1].sentimento === 'Positivo'
  && a.pontos[1].texto_original === 'a equipe é unida', a)
ok('análise: categoria fora da lista vira "Outros"; sentimento estranho é descartado', lerAnalise(respostaIA([ponto('Negativo', 'Cozinha')]))?.pontos[0].categoria === 'Outros'
  && lerAnalise(respostaIA([ponto('Furioso')]))?.pontos.length === 0)
ok('análise: JSON em texto também é lido', lerAnalise(JSON.stringify(respostaIA([ponto('Sugestão')])))?.pontos[0].sentimento === 'Sugestão')
ok('análise: tem ponto válido, é feedback (mesmo que a IA diga "nada")', lerAnalise(respostaIA([ponto('Neutro')], { tipo: 'nada' }))?.tipo === 'feedback')
ok('análise: "feedback" sem ponto nenhum vira "nada"', lerAnalise(respostaIA([]))?.tipo === 'nada')
a = lerAnalise(respostaIA([], { tipo: 'pergunta', pergunta_sobre: 'anonimato', sensivel: true }))
ok('análise: pergunta guarda o assunto e nunca é "sensível"', a?.tipo === 'pergunta' && a.perguntaSobre === 'anonimato' && a.sensivel === false)
ok('análise: relato sensível', lerAnalise(respostaIA([ponto('Negativo', 'Liderança e gestão')], { sensivel: true }))?.sensivel === true)
ok('análise: fora do formato é null', lerAnalise('não sei') === null && lerAnalise({ pontos: [] }) === null && lerAnalise([]) === null)
ok('análise: objeto embrulhado numa lista de um item também é lido', lerAnalise([respostaIA([ponto('Negativo')])])?.pontos.length === 1
  && lerAnalise(JSON.stringify([respostaIA([ponto('Negativo')])]))?.tipo === 'feedback' && lerAnalise([respostaIA([]), respostaIA([])]) === null)
ok('sentimento da mensagem: os dois > negativo > positivo > sugestão > neutro', sentimentoGeral([{ sentimento: 'Positivo' }, { sentimento: 'Negativo' }]) === 'Positivo e Negativo'
  && sentimentoGeral([{ sentimento: 'Sugestão' }, { sentimento: 'Negativo' }]) === 'Negativo' && sentimentoGeral([{ sentimento: 'Sugestão' }, { sentimento: 'Neutro' }]) === 'Sugestão'
  && sentimentoGeral([{ sentimento: 'Neutro' }]) === 'Neutro' && sentimentoGeral([]) === null)

// ── As respostas prontas ─────────────────────────────────────────────────────
const analise = (over: Partial<AnaliseEquipe> = {}): AnaliseEquipe => ({ tipo: 'feedback', pontos: [{ texto_original: 'x', resumo: 'x', categoria: 'Outros', sentimento: 'Negativo' }], sensivel: false, perguntaSobre: null, ...over })
let msg = respostaPronta({ analise: analise(), apresentar: false, sorteio: () => 0 })
ok('resposta: agradece, diz que é anônimo e que pode mandar mais', !!msg && /sem o seu nome|anônima|sem identificar/.test(msg) && msg.includes('pode mandar por aqui') && !msg.includes('Lia'), msg)
msg = respostaPronta({ analise: analise(), apresentar: true, sorteio: () => 0 })
ok('resposta: ela se apresenta na primeira do dia', !!msg && msg.startsWith('Oi! Aqui é a Lia, do EasyFeed.'))
ok('resposta: cumprimento sozinho não é respondido', respostaPronta({ analise: analise({ tipo: 'nada', pontos: [] }), apresentar: true }) === null)
msg = respostaPronta({ analise: analise({ sensivel: true }), apresentar: false })
ok('resposta a relato sensível: leva a sério e indica ajuda', !!msg && msg.includes('assunto sério') && msg.includes('180') && msg.includes('100'))
ok('resposta a "é anônimo mesmo?"', respostaPronta({ analise: analise({ tipo: 'pergunta', pontos: [], perguntaSobre: 'anonimato' }), apresentar: false })?.startsWith('É anônimo, sim.') === true)
msg = respostaPronta({ analise: analise({ tipo: 'pergunta', pontos: [], perguntaSobre: 'quem_e' }), apresentar: true })
ok('resposta a "quem é você?" não se apresenta duas vezes', !!msg && msg.startsWith('Sou a Lia') && msg.split('Lia').length === 2, msg)
ok('nenhuma resposta pronta com cara de IA ou sobra de {variável}', ['positivo', 'negativo', 'misto', 'sugestao', 'neutro'].every((s) => [0, 0.4, 0.9].every((n) => {
  const t = respostaPronta({ analise: analise({ pontos: s === 'misto' ? [{ ...analise().pontos[0], sentimento: 'Positivo' }, analise().pontos[0]] : [{ ...analise().pontos[0], sentimento: s === 'positivo' ? 'Positivo' : s === 'negativo' ? 'Negativo' : s === 'sugestao' ? 'Sugestão' : 'Neutro' }] }), apresentar: true, sorteio: () => n }) ?? ''
  return t.length > 20 && !/[{}]|—|valioso|agradecemos|prezad/i.test(t)
})))

// ── O resumo ─────────────────────────────────────────────────────────────────
ok('pontos para o resumo: uma linha por ponto', pontosParaResumo([{ categoria: 'Escala e horários', sentimento: 'Negativo', resumo: 'A escala muda\n em cima da hora.', texto_original: 'x' }])
  === '- Escala e horários | Negativo | A escala muda em cima da hora.')
const resumoIA = { clima: ' A equipe gosta do ambiente. ', vai_bem: ['Equipe unida', ''], incomoda: ['a', 'b', 'c', 'd', 'e', 'f'], sugestoes: [], por_onde_comecar: 'Avisar a escala com antecedência.' }
const resumo = lerResumo(resumoIA)
ok('resumo: apara, tira vazios e corta o excesso', resumo?.clima === 'A equipe gosta do ambiente.' && resumo.vai_bem.length === 1 && resumo.incomoda.length === 5 && resumo.sugestoes.length === 0)
ok('resumo fora do formato é null', lerResumo('x') === null && lerResumo({ clima: '' }) === null)
ok('resumo embrulhado numa lista, ou em texto, também é lido', lerResumo([resumoIA])?.incomoda.length === 5 && lerResumo(`Segue: ${JSON.stringify(resumoIA)}`)?.vai_bem.length === 1)

// ── A função (handler) ───────────────────────────────────────────────────────
interface Cenario {
  quem?: { restauranteId: number | null; nomeRestaurante: string; email: string; ehAdmin: boolean } | null
  cron?: boolean
  agora?: number
  numero?: Partial<EstadoNumero>
  envia?: (p: { numero: string; texto: string; replyId?: string | null }) => { ok: boolean; incerto?: boolean; erro?: string }
  ia?: (p: { mensagens: string }) => unknown
  funcionarios?: Record<string, unknown>[]
  envios?: Record<string, unknown>[]
  convites?: Record<string, unknown>[]
  mensagens?: Record<string, unknown>[]
  ultimoConviteEm?: string | null
}
function cenario(c: Cenario = {}) {
  const agora = c.agora ?? AGORA
  // deno-lint-ignore no-explicit-any
  type L = Record<string, any>
  const funcionarios: L[] = (c.funcionarios ?? [
    { id: 1, restaurante_id: 11, nome: 'ana paula', telefone: '5511987650001', ativo: true, opt_out_em: null, criado_em: '2026-09-01T00:00:00Z' },
    { id: 2, restaurante_id: 11, nome: 'Bruno', telefone: '5511987650002', ativo: true, opt_out_em: null, criado_em: '2026-09-01T00:00:00Z' },
    { id: 3, restaurante_id: 11, nome: 'Carla', telefone: '5511987650003', ativo: false, opt_out_em: null, criado_em: '2026-09-01T00:00:00Z' },
    { id: 4, restaurante_id: 11, nome: 'Davi', telefone: '5511987650004', ativo: true, opt_out_em: '2026-10-01T00:00:00Z', criado_em: '2026-09-01T00:00:00Z' },
    { id: 9, restaurante_id: 26, nome: 'Outro', telefone: '5521987650009', ativo: true, opt_out_em: null, criado_em: '2026-09-01T00:00:00Z' },
  ]).map((x) => ({ ...x }))
  const envios: L[] = (c.envios ?? []).map((x) => ({ ...x }))
  const convites: L[] = (c.convites ?? []).map((x) => ({ ...x }))
  const mensagens: L[] = (c.mensagens ?? []).map((x) => ({ tentativas: 0, status: 'pendente', tipo: 'texto', ...x }))
  const respostas: L[] = []
  const pontos: L[] = []
  const saidas: L[] = []
  const enviadas: { numero: string; texto: string; replyId?: string | null; digitandoMs: number }[] = []
  const lidas: string[] = []
  const segundoPlano: Promise<unknown>[] = []
  const chave = (t: string) => chaveWhatsapp(t)
  const estado: EstadoNumero = { temInstancia: true, conectado: true, qrcode: null, numero: '5511900000000', ...(c.numero ?? {}) }

  const deps: DepsEquipe = {
    quemPede: async () => ('quem' in c ? c.quem! : { restauranteId: 11, nomeRestaurante: 'Camelo', email: 'Raver@Exemplo.com', ehAdmin: true }),
    ehCron: async () => c.cron === true,
    agora: () => agora,
    sorteio: () => 0,
    novoId: () => `id${saidas.length + respostas.length + 1}`,
    emSegundoPlano: (p) => { segundoPlano.push(p) },
    numero: {
      status: async () => estado,
      conectar: async () => ({ ...estado, conectado: false, qrcode: 'data:image/png;base64,QR' }),
      desconectar: async () => ({ temInstancia: false, conectado: false, qrcode: null, numero: null }),
      enviar: async (p) => {
        const r = c.envia ? c.envia(p) : { ok: true }
        if (r.ok) enviadas.push(p)
        return { ok: r.ok, incerto: r.incerto === true, messageId: r.ok ? `wa-${enviadas.length}` : null, erro: r.erro ?? null }
      },
      marcarLidas: async (ids) => { lidas.push(...ids) },
      baixarAudio: async (id) => (id.startsWith('semaudio') ? null : { base64: 'AAAA', mime: 'audio/mpeg' }),
    },
    ia: {
      transcrever: async () => 'o salário atrasa todo mês',
      analisar: async (p) => (c.ia ? c.ia(p) : respostaIA([ponto('Negativo')])),
      resumir: async () => resumoIA,
    },
    db: {
      funcionarios: async (rid) => funcionarios.filter((f) => f.restaurante_id === rid) as never,
      funcionario: async (id) => (funcionarios.find((f) => f.id === id) ?? null) as never,
      envioAberto: async (rid) => envios.some((e) => e.restaurante_id === rid && ['na_fila', 'enviando'].includes(e.status)),
      criarEnvio: async (l) => { const id = 100 + envios.length; envios.push({ id, status: 'na_fila', ...l }); return id },
      criarConvites: async (ls) => { for (const l of ls) convites.push({ id: 500 + convites.length, status: 'na_fila', enviado_em: null, ...l }) },
      envio: async (id) => (envios.find((e) => e.id === id) ?? null) as never,
      atualizarEnvio: async (id, campos) => { Object.assign(envios.find((e) => e.id === id)!, campos) },
      cancelarConvitesNaFila: async (envioId) => { for (const x of convites) if (x.envio_id === envioId && x.status === 'na_fila') x.status = 'cancelado' },
      contarConvites: async (envioId) => convites.filter((x) => x.envio_id === envioId).reduce((n: Record<string, number>, x) => ({ ...n, [x.status]: (n[x.status] ?? 0) + 1 }), {}),
      pontosDoEnvio: async (envioId) => pontos.filter((p) => respostas.some((r) => r.id === p.resposta_id && r.envio_id === envioId)) as never,
      respostasDoEnvio: async (envioId) => respostas.filter((r) => r.envio_id === envioId).length,
      nomeDoRestaurante: async () => 'Camelo',
      destravar: async () => [],
      ultimoConviteEm: async () => c.ultimoConviteEm ?? null,
      pegarConvite: async () => {
        const x = convites.find((k) => k.status === 'na_fila')
        if (x) x.status = 'enviando'
        return (x ?? null) as never
      },
      atualizarConvite: async (id, campos) => { Object.assign(convites.find((x) => x.id === id)!, campos) },
      registrarSaida: async (l) => { saidas.push(l) },
      pegarMensagens: async () => {
        const prontas = mensagens.filter((m) => m.status === 'pendente')
        for (const m of prontas) { m.status = 'processando'; m.tentativas += 1 }
        return prontas.map((m) => ({ ...m })) as never
      },
      atualizarMensagens: async (ids, campos) => { for (const m of mensagens) if (ids.includes(m.id)) Object.assign(m, campos) },
      funcionariosDoNumero: async (t) => funcionarios.filter((f) => chave(f.telefone) === chave(t)) as never,
      convitesDoNumero: async (t) => convites.filter((x) => x.status === 'enviado' && chave(x.telefone) === chave(t)) as never,
      saiuDesde: async (t) => saidas.some((s) => chave(s.telefone) === chave(t)),
      criarResposta: async (l) => { const id = `r${respostas.length + 1}`; respostas.push({ id, ...l }); return id },
      criarPontos: async (ls) => { pontos.push(...ls) },
      marcarRespondeu: async (id, quando) => { const x = convites.find((k) => k.id === id); if (x && !x.respondeu_em) x.respondeu_em = quando },
      pararNumero: async (t, motivo, quando) => {
        const alvo = funcionarios.filter((f) => chave(f.telefone) === chave(t) && !f.opt_out_em)
        for (const f of alvo) Object.assign(f, { opt_out_em: quando, opt_out_motivo: motivo })
        return alvo.length > 0
      },
    },
  }
  return { deps, funcionarios, envios, convites, mensagens, respostas, pontos, saidas, enviadas, lidas, terminar: () => Promise.all(segundoPlano) }
}

// Quem pode
let r = await tratarEquipe({ acao: 'previa' }, cenario({ quem: null }).deps)
ok('sem login: 401', r.status === 401)
r = await tratarEquipe({ acao: 'previa' }, cenario({ quem: { restauranteId: 11, nomeRestaurante: 'Camelo', email: 'dono@x.com', ehAdmin: false } }).deps)
ok('por enquanto só o admin da plataforma (SO_ADMIN)', r.status === 403 && r.corpo.motivo === 'so_admin')
r = await tratarEquipe({ acao: 'tick' }, cenario().deps)
ok('tick sem o segredo da rotina: 401', r.status === 401 && r.corpo.motivo === 'so_rotina')
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, cenario({ quem: { restauranteId: null, nomeRestaurante: '', email: 'a@x.com', ehAdmin: true } }).deps)
ok('login sem restaurante: recusa', r.status === 403 && r.corpo.motivo === 'sem_restaurante')
r = await tratarEquipe({ acao: 'qualquer' }, cenario().deps)
ok('ação desconhecida: 400', r.status === 400)

// Prévia e número
r = await tratarEquipe({ acao: 'previa' }, cenario().deps)
ok('prévia: a abertura com o nome do restaurante e as frases fixas', String(r.corpo.abertura).includes('do Camelo') && r.corpo.anonimato === FRASE_ANONIMO && r.corpo.parar === FRASE_PARAR && r.corpo.pergunta_padrao === PERGUNTA_PADRAO)
r = await tratarEquipe({ acao: 'numero_conectar' }, cenario().deps)
ok('conectar o número: devolve o QR Code', r.status === 200 && r.corpo.conectado === false && String(r.corpo.qrcode).startsWith('data:image'))

// Criar envio
let c = cenario()
r = await tratarEquipe({ acao: 'criar_envio', pergunta: 'oi' }, c.deps)
ok('pergunta curta demais: recusa', r.status === 400 && r.corpo.motivo === 'pergunta_invalida')
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, cenario({ numero: { conectado: false } }).deps)
ok('número do EasyFeed desconectado: recusa dizendo onde conectar', r.status === 409 && r.corpo.motivo === 'sem_numero' && String(r.corpo.error).includes('Admin'))
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, c.deps)
ok('criar envio: um convite só para quem está ativo e não pediu para parar', r.status === 200 && r.corpo.convites === 2 && c.convites.map((x) => x.funcionario_id).join() === '1,2', r)
ok('criar envio: a mensagem já fica pronta, com o nome de cada um', c.convites[0].texto.startsWith('Oi, Ana!') && c.convites[1].texto.includes('Bruno') && c.convites[0].texto.includes(PERGUNTA_PADRAO))
ok('criar envio: registra quem pediu', c.envios[0].criado_por === 'raver@exemplo.com' && c.envios[0].status === 'na_fila')
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO }, c.deps)
ok('já tem envio em andamento: recusa', r.status === 409 && r.corpo.motivo === 'envio_em_andamento')
c = cenario()
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO, funcionario_ids: [2, 3, 9] }, c.deps)
ok('escolhendo alguns: só os que podem receber e são deste restaurante', r.corpo.convites === 1 && c.convites[0].funcionario_id === 2)
r = await tratarEquipe({ acao: 'criar_envio', pergunta: PERGUNTA_PADRAO, funcionario_ids: [3, 4] }, cenario().deps)
ok('ninguém pode receber: recusa', r.status === 409 && r.corpo.motivo === 'sem_funcionarios')

// A rotina: convites
const fila = () => ({
  envios: [{ id: 100, restaurante_id: 11, pergunta: PERGUNTA_PADRAO, status: 'na_fila' }],
  convites: [
    { id: 500, envio_id: 100, restaurante_id: 11, funcionario_id: 1, telefone: '5511987650001', texto: 'Oi, Ana! …', status: 'na_fila', enviado_em: null },
    { id: 501, envio_id: 100, restaurante_id: 11, funcionario_id: 2, telefone: '5511987650002', texto: 'Oi, Bruno! …', status: 'na_fila', enviado_em: null },
  ],
})
c = cenario({ cron: true, ...fila() })
r = await tratarEquipe({ acao: 'tick' }, c.deps)
await c.terminar()
ok('tick: responde 202 e manda UM convite por rodada, com "digitando…"', r.status === 202 && c.enviadas.length === 1 && c.enviadas[0].numero === '5511987650001' && c.enviadas[0].digitandoMs >= 8000)
ok('tick: convite marcado como enviado e envio "enviando"', c.convites[0].status === 'enviado' && !!c.convites[0].enviado_em && c.convites[1].status === 'na_fila' && c.envios[0].status === 'enviando')
await rodarTick(c.deps)
ok('tick: acabou a fila, o envio fica concluído', c.convites[1].status === 'enviado' && c.envios[0].status === 'concluido' && !!c.envios[0].concluido_em)
c = cenario({ ...fila(), agora: Date.parse('2026-10-11T15:00:00Z') })
await rodarTick(c.deps)
ok('tick: fora do horário (domingo) não manda convite', c.enviadas.length === 0 && c.convites[0].status === 'na_fila')
c = cenario({ ...fila(), ultimoConviteEm: new Date(AGORA - 20_000).toISOString() })
await rodarTick(c.deps)
ok('tick: espera o intervalo desde o último convite', c.enviadas.length === 0)
c = cenario({ ...fila(), numero: { conectado: false } })
await rodarTick(c.deps)
ok('tick: número desconectado deixa os convites esperando na fila', c.enviadas.length === 0 && c.convites[0].status === 'na_fila')
c = cenario({ ...fila(), envia: () => ({ ok: false, incerto: true }) })
await rodarTick(c.deps)
ok('tick: envio incerto vira "falhou" e não repete', c.convites[0].status === 'falhou' && String(c.convites[0].erro).includes('confirmar'))
c = cenario({ ...fila(), convites: [{ ...fila().convites[0], funcionario_id: 4 }] })
await rodarTick(c.deps)
ok('tick: quem pediu para parar depois do envio criado não recebe', c.enviadas.length === 0 && c.convites[0].status === 'cancelado' && c.envios[0].status === 'cancelado')

// A rotina: respostas
const comConvite = () => ({
  envios: [{ id: 100, restaurante_id: 11, pergunta: 'Como está a escala?', status: 'concluido' }],
  convites: [{ id: 500, envio_id: 100, restaurante_id: 11, funcionario_id: 1, telefone: '5511987650001', texto: 'x', status: 'enviado', enviado_em: new Date(AGORA - 3_600_000).toISOString() }],
})
const entrada = (id: number, textoMsg: string, extra: Record<string, unknown> = {}) => ({
  id, message_id: `M${id}`, telefone: '551187650001', texto: textoMsg, recebida_em: new Date(AGORA - 120_000 + id * 1000).toISOString(), ...extra,
})
let pedido = ''
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'oi'), entrada(2, 'o salário atrasa todo mês')], ia: (p) => { pedido = p.mensagens; return respostaIA([ponto('Negativo')]) } })
let t = await rodarTick(c.deps)
ok('resposta: junta as mensagens da pessoa e manda numeradas para a IA', pedido === '[1] oi\n[2] o salário atrasa todo mês' && t.pessoas.join() === 'feedback', t)
ok('resposta: grava a mensagem, ligada ao envio do convite (número com ou sem o 9)', c.respostas.length === 1 && c.respostas[0].envio_id === 100 && c.respostas[0].restaurante_id === 11
  && c.respostas[0].sentimento === 'Negativo' && c.respostas[0].texto_original === 'oi\no salário atrasa todo mês')
ok('resposta: grava os pontos', c.pontos.length === 1 && c.pontos[0].categoria === 'Salário e benefícios' && c.pontos[0].resposta_id === 'r1' && c.pontos[0].restaurante_id === 11)
ok('resposta: marca que o convite foi respondido e as mensagens como lidas e processadas', !!c.convites[0].respondeu_em && c.lidas.join() === 'M1,M2' && c.mensagens.every((m) => m.status === 'processada' && m.resposta_id === 'r1'))
ok('resposta: agradece uma vez, citando a última mensagem, e se apresenta', c.enviadas.length === 1 && c.enviadas[0].replyId === 'M2' && c.enviadas[0].texto.includes('Lia') && c.enviadas[0].numero === '551187650001')
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'a equipe é ótima')], ia: () => respostaIA([ponto('Positivo', 'Clima e colegas')]) })
c.saidas.push({ telefone: '5511987650001' })
await rodarTick(c.deps)
ok('resposta: já falou com a pessoa hoje (o convite), não se apresenta de novo; uma mensagem só não é citada', c.enviadas.length === 1 && !c.enviadas[0].texto.includes('Lia') && c.enviadas[0].replyId == null)

c = cenario({ mensagens: [entrada(1, 'quero falar', { telefone: '5531999990000' })] })
t = await rodarTick(c.deps)
ok('número desconhecido: ignora, sem analisar nem responder', t.pessoas.join() === 'ignorada' && c.mensagens[0].status === 'ignorada' && c.enviadas.length === 0 && c.respostas.length === 0)

c = cenario({ ...comConvite(), mensagens: [entrada(1, 'PARAR')], ia: () => { throw new Error('não era para analisar') } })
t = await rodarTick(c.deps)
ok('PARAR sozinho: marca, confirma citando a mensagem e não analisa', t.pessoas.join() === 'parar' && !!c.funcionarios[0].opt_out_em && c.funcionarios[0].opt_out_motivo === 'PARAR'
  && c.enviadas.length === 1 && c.enviadas[0].texto === CONFIRMA_PARAR && c.enviadas[0].replyId === 'M1' && c.respostas.length === 0)
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'o gerente grita com a gente'), entrada(2, 'parar')] })
await rodarTick(c.deps)
ok('feedback + PARAR: grava o feedback, agradece e a confirmação do PARAR sai por último', c.respostas.length === 1 && c.respostas[0].texto_original === 'o gerente grita com a gente'
  && c.enviadas.length === 2 && c.enviadas[1].texto === CONFIRMA_PARAR && !!c.funcionarios[0].opt_out_em)
c = cenario({ ...comConvite(), funcionarios: [{ id: 1, restaurante_id: 11, nome: 'Ana', telefone: '5511987650001', ativo: true, opt_out_em: '2026-10-01T00:00:00Z', criado_em: '2026-09-01T00:00:00Z' }], mensagens: [entrada(1, 'parar')] })
await rodarTick(c.deps)
ok('PARAR de quem já tinha parado: não confirma de novo', c.enviadas.length === 0 && c.mensagens[0].status === 'processada')

c = cenario({ ...comConvite(), mensagens: [entrada(1, '', { tipo: 'audio' })], ia: (p) => { pedido = p.mensagens; return respostaIA([ponto('Negativo')]) } })
await rodarTick(c.deps)
ok('áudio: transcreve, guarda a transcrição e analisa', pedido === 'o salário atrasa todo mês' && c.mensagens[0].texto === 'o salário atrasa todo mês' && c.respostas[0].texto_original === 'o salário atrasa todo mês')

c = cenario({ ...comConvite(), mensagens: [entrada(1, 'oi, tudo bem?')], ia: () => respostaIA([], { tipo: 'nada' }) })
t = await rodarTick(c.deps)
ok('cumprimento sozinho: não grava e não responde', t.pessoas.join() === 'nada' && c.respostas.length === 0 && c.enviadas.length === 0 && c.mensagens[0].status === 'processada')
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'isso é anônimo mesmo?')], ia: () => respostaIA([], { tipo: 'pergunta', pergunta_sobre: 'anonimato' }) })
await rodarTick(c.deps)
ok('pergunta sobre o canal: responde e não grava como feedback', c.respostas.length === 0 && c.enviadas.length === 1 && c.enviadas[0].texto.includes('É anônimo, sim.') && !c.convites[0].respondeu_em)

c = cenario({ ...comConvite(), mensagens: [entrada(1, 'o salário atrasa')], ia: () => { throw new Error('IA fora do ar') } })
t = await rodarTick(c.deps)
ok('IA falhou: a mensagem volta para a fila, nada é gravado nem respondido', t.pessoas.join() === 'de_novo' && c.mensagens[0].status === 'pendente' && c.mensagens[0].erro === 'IA fora do ar' && c.respostas.length === 0 && c.enviadas.length === 0)
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'o salário atrasa', { tentativas: MAX_TENTATIVAS_ANALISE - 1 })], ia: () => { throw new Error('IA fora do ar') } })
await rodarTick(c.deps)
ok('IA falhou até a última tentativa: guarda o texto sem os pontos, para não perder, e agradece', c.respostas.length === 1 && c.respostas[0].sentimento === null && c.pontos.length === 0
  && c.mensagens[0].status === 'processada' && c.enviadas.length === 1)
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'o salário atrasa')], ia: () => null })
await rodarTick(c.deps)
ok('agente de IA desligado no painel: guarda o texto na hora, sem tentar de novo', c.respostas.length === 1 && c.pontos.length === 0 && c.mensagens[0].status === 'processada')
c = cenario({ mensagens: [entrada(1, 'queria dar uma ideia', { telefone: '5511987650002' })], ia: () => respostaIA([ponto('Sugestão', 'Outros')]) })
await rodarTick(c.deps)
ok('resposta sem convite recente: espontânea, do restaurante onde a pessoa está cadastrada', c.respostas.length === 1 && c.respostas[0].envio_id === null && c.respostas[0].restaurante_id === 11 && c.respostas[0].funcionario_id === 2)

// Cancelar, resumo e teste da análise
c = cenario(fila())
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, c.deps)
ok('cancelar antes de sair qualquer convite: envio cancelado', r.status === 200 && c.convites.every((x) => x.status === 'cancelado') && c.envios[0].status === 'cancelado')
c = cenario({ envios: fila().envios, convites: [{ ...fila().convites[0], status: 'enviado' }, fila().convites[1]] })
await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, c.deps)
ok('cancelar no meio: o que saiu fica, o resto é cancelado e o envio fecha', c.convites[0].status === 'enviado' && c.convites[1].status === 'cancelado' && c.envios[0].status === 'concluido')
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, c.deps)
ok('cancelar envio que já terminou: recusa', r.status === 409 && r.corpo.motivo === 'ja_terminou')
r = await tratarEquipe({ acao: 'cancelar_envio', envio_id: 100 }, cenario({ envios: [{ id: 100, restaurante_id: 26, pergunta: 'x', status: 'na_fila' }] }).deps)
ok('envio de outro restaurante: não encontrado', r.status === 404)

c = cenario(comConvite())
r = await tratarEquipe({ acao: 'gerar_resumo', envio_id: 100 }, c.deps)
ok('resumo sem nenhuma resposta: recusa', r.status === 409 && r.corpo.motivo === 'sem_respostas')
c = cenario({ ...comConvite(), mensagens: [entrada(1, 'o salário atrasa')] })
await rodarTick(c.deps)
r = await tratarEquipe({ acao: 'gerar_resumo', envio_id: 100 }, c.deps)
ok('resumo: grava no envio, com quantas respostas tinha', r.status === 200 && c.envios[0].resumo.clima === 'A equipe gosta do ambiente.' && c.envios[0].resumo.respostas === 1 && !!c.envios[0].resumo_em)

r = await tratarEquipe({ acao: 'simular', texto: 'o salário atrasa todo mês' }, cenario().deps)
ok('testar a análise: devolve os pontos, o sentimento e a resposta, sem gravar', r.status === 200 && (r.corpo.analise as AnaliseEquipe).pontos.length === 1 && r.corpo.sentimento === 'Negativo' && String(r.corpo.resposta).includes('Lia'))
r = await tratarEquipe({ acao: 'simular', texto: '  ' }, cenario().deps)
ok('testar a análise sem texto: recusa', r.status === 400)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nfeedback da equipe: tudo certo')
process.exit(falhas ? 1 : 0)
