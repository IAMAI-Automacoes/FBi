// Testa o workflow do n8n "Feedback Restaurante" (docs/n8n/feedback-restaurante.json):
// estrutura do JSON + a lógica de cada nó Code, rodando o MESMO texto de código
// com um "$input"/"$()" de mentira. Roda no `npm test`:
//   node docs/n8n/testar-feedback-restaurante.cjs docs/n8n/feedback-restaurante.json
// Mudou o workflow no n8n? Exporte, salve por cima do JSON e rode de novo.
const fs = require('fs')
const wf = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))

let falhas = 0
const ok = (nome, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${!cond && extra ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ── 1. Estrutura ─────────────────────────────────────────────────────────────
const nos = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
const porNome = (nome) => nos.find((n) => n.name === nome)
const nomes = new Set(nos.map((n) => n.name))
ok('nomes únicos', nomes.size === nos.length)
ok('arquivo só com o necessário (name, nodes, connections, settings)',
  JSON.stringify(Object.keys(wf).sort()) === JSON.stringify(['connections', 'name', 'nodes', 'settings']))
const entradas = new Map()
for (const [de, tipos] of Object.entries(wf.connections)) {
  ok(`origem existe: ${de}`, nomes.has(de))
  for (const saidas of Object.values(tipos)) for (const lista of saidas) for (const c of lista) {
    ok(`destino existe: ${de} -> ${c.node}`, nomes.has(c.node))
    entradas.set(c.node, (entradas.get(c.node) || 0) + 1)
  }
}
for (const n of nos) {
  if (n.type === 'n8n-nodes-base.webhook' || n.type.includes('lmChat')) continue
  ok(`"${n.name}" tem entrada`, (entradas.get(n.name) || 0) > 0)
}
const texto = JSON.stringify(wf)
for (const m of texto.matchAll(/\$\('([^']+)'\)/g)) ok(`referência existe: ${m[1]}`, nomes.has(m[1]))
ok('nenhum .item (pareamento ambíguo)', !/\$\('[^']+'\)\.item/.test(texto))
for (const n of nos.filter((n) => n.parameters.operation === 'delete')) {
  ok(`delete "${n.name}" usa allFilters`, n.parameters.matchType === 'allFilters')
}
// Configurações que precisam estar exatamente assim
const wh = porNome('Recebe mensagem')
ok('webhook continua em /easyfeed (POST)', wh.parameters.path === 'easyfeed' && wh.parameters.httpMethod === 'POST')
ok('espera de 20 s', porNome('Espera 20 segundos').parameters.amount === 20 && porNome('Espera 20 segundos').parameters.unit === 'seconds')
ok('restaurante é achado pelo token', JSON.stringify(porNome('Acha o restaurante').parameters).includes('whatsapp_token'))
ok('Always Output Data só onde vazio precisa seguir', nos.filter((n) => n.alwaysOutputData).map((n) => n.name).sort().join() === 'Já respondeu hoje?,Limpa o buffer,Quem escreveu?')
ok('Execute Once só onde há vários itens chegando', nos.filter((n) => n.executeOnce).map((n) => n.name).sort().join() === 'Analisa a equipe,Analisa a mensagem,Começa o prazo,Já respondeu hoje?,Tem resposta?,Vai perguntar?')
ok('modelo: só temperatura e formato JSON', JSON.stringify(porNome('Modelo de análise').parameters.options) === '{"temperature":0.1,"responseFormat":"json_object"}')
const jaFalou = JSON.stringify(porNome('Já respondeu hoje?').parameters)
ok('apresentação: procura resposta do número para esse telefone desde o início do dia (horário de Brasília)',
  jaFalou.includes('mensagens_whatsapp') && jaFalou.includes('"por_api"') && jaFalou.includes('"telefone"') && jaFalou.includes('"restaurante_id"')
  && jaFalou.includes("setZone('America/Sao_Paulo').startOf('day')") && /DateTime\.fromISO\('\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-03:00'\)/.test(jaFalou))
ok('nota explica como testar a apresentação de novo', JSON.stringify(wf.nodes).includes('Para testar de novo hoje'))
const entradaIA = porNome('Analisa a mensagem').parameters.text
// A expressão roda de verdade (um \n literal dentro das aspas quebraria o JS no n8n).
const montaEntrada = (ultima, falou) => new Function('$', 'return ' + entradaIA.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, ''))(
  (n) => ({ first: () => ({ json: n === 'Já respondeu hoje?' ? falou : ultima }) }))
ok('a IA recebe só as mensagens do cliente, numeradas', montaEntrada({ nomeRestaurante: 'Camelo', textoCompleto: 'oi\na pizza veio fria', textoParaIA: '[1] oi\n[2] a pizza veio fria' }, {}) === '[1] oi\n[2] a pizza veio fria')
const corpoEnvio = porNome('Envia a resposta').parameters.jsonBody
ok('envio como gente: cita a mensagem, "digitando..." e mensagens lidas', corpoEnvio.includes('delay: $json.digitandoMs') && corpoEnvio.includes('replyid: $json.replyid') && corpoEnvio.includes('readmessages: true') && corpoEnvio.includes('readchat: true'))
ok('envio sem retry (a uazapi avisa: timeout pode já ter enviado; repetir duplica)', !porNome('Envia a resposta').retryOnFail && porNome('Envia a resposta').parameters.options.timeout >= 30000)
ok('nenhum nó desativado', !nos.some((n) => n.disabled))

// ── 2. Lógica dos nós Code ───────────────────────────────────────────────────
const codigoDe = (nome) => porNome(nome).parameters.jsCode
function roda(nome, entrada, outros = {}) {
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((j) => ({ json: j }))
  const $input = { first: () => itens[0], all: () => itens }
  const $ = (n) => {
    if (!(n in outros)) throw new Error(`teste não preparou $('${n}')`)
    const v = outros[n]
    const lista = (Array.isArray(v) ? v : [v]).map((j) => ({ json: j }))
    return { first: () => lista[0], all: () => lista }
  }
  // eslint-disable-next-line no-new-func
  return new Function('$input', '$', codigoDe(nome))($input, $)
}

// Eventos reais da uazapi (campos conferidos em mensagens_whatsapp.payload)
const base = (msg, extra = {}) => ({
  body: {
    EventType: 'messages', BaseUrl: 'https://iamai-ia.uazapi.com', token: 'tok-123',
    chat: { wa_chatid: '5511932903005@s.whatsapp.net', name: 'Raver Brandi' },
    message: {
      chatid: '5511932903005@s.whatsapp.net', sender_pn: '5511932903005@s.whatsapp.net',
      messageid: '3EB0ABC', fromMe: false, isGroup: false, wasSentByApi: false, edited: '', ...msg,
    },
    ...extra,
  },
})
const lê = (msg) => roda('Lê a mensagem', base(msg))
let r = lê({ type: 'text', messageType: 'Conversation', text: 'A comida estava fria' })
ok('texto: entra', r.length === 1 && r[0].json.tipo === 'texto' && r[0].json.texto === 'A comida estava fria')
ok('texto: só os campos usados', JSON.stringify(Object.keys(r[0].json).sort()) === JSON.stringify(['baseUrl', 'messageId', 'telefone', 'texto', 'tipo', 'token']))
const lido = r[0].json
ok('texto com link (ExtendedTextMessage) entra', lê({ type: 'text', messageType: 'ExtendedTextMessage', text: 'olha https://x.com' }).length === 1)
ok('áudio entra', lê({ type: 'media', messageType: 'AudioMessage', mediaType: 'ptt', text: '' })[0]?.json.tipo === 'audio')
ok('foto COM legenda: não entra', lê({ type: 'media', messageType: 'ImageMessage', mediaType: 'image', text: 'veio frio' }).length === 0)
ok('vídeo com legenda: não entra', lê({ type: 'media', messageType: 'VideoMessage', mediaType: 'video', text: 'olha isso' }).length === 0)
ok('figurinha: não entra', lê({ type: 'media', messageType: 'StickerMessage', mediaType: 'sticker' }).length === 0)
ok('reação: não entra', lê({ type: 'reaction', messageType: 'ReactionMessage', text: '👍' }).length === 0)
ok('documento: não entra', lê({ type: 'media', messageType: 'DocumentMessage', mediaType: 'document' }).length === 0)
ok('álbum: não entra', lê({ type: 'media', messageType: 'AlbumMessage', text: 'Album: 3 images' }).length === 0)
ok('grupo: não entra', lê({ type: 'text', messageType: 'Conversation', text: 'oi', isGroup: true, chatid: '1203@g.us' }).length === 0)
ok('do próprio número (ou da resposta automática): não entra', lê({ type: 'text', messageType: 'Conversation', text: 'oi', fromMe: true }).length === 0)
ok('edição: não entra', lê({ type: 'text', messageType: 'Conversation', text: 'olá', edited: '3EB0OLD' }).length === 0)
ok('texto vazio: não entra', lê({ type: 'text', messageType: 'Conversation', text: '   ' }).length === 0)
ok('outro evento: não entra', roda('Lê a mensagem', { body: { ...base({}).body, EventType: 'messages_update' } }).length === 0)
ok('sem token: não entra', roda('Lê a mensagem', { body: { ...base({ messageType: 'Conversation', text: 'oi' }).body, token: '' } }).length === 0)
ok('corpo vazio não quebra', roda('Lê a mensagem', {}).length === 0)
ok('conversa @lid usa o sender_pn', lê({ type: 'text', messageType: 'Conversation', text: 'boa', chatid: '1117@lid' })[0]?.json.telefone === '5511932903005')

// Restaurante ativo?
const rest = { id: 11, nome_restaurante: 'Camelo', assinatura_status: 'ativa', onboarding_completo: true, excluida_em: null, whatsapp_token: 'tok-123', telefone_contato: '5511987654321' }
r = roda('Restaurante ativo?', rest, { 'Lê a mensagem': lido })
ok('ativo: segue com id, nome e contato', r.length === 1 && r[0].json.restauranteId === 11 && r[0].json.nomeRestaurante === 'Camelo' && r[0].json.telefoneContato === '5511987654321' && r[0].json.token === 'tok-123')
const ativo = r[0].json
ok('excluída: para', roda('Restaurante ativo?', { ...rest, excluida_em: '2026-10-01' }, { 'Lê a mensagem': lido }).length === 0)
ok('sem onboarding: para', roda('Restaurante ativo?', { ...rest, onboarding_completo: false }, { 'Lê a mensagem': lido }).length === 0)
ok('assinatura não ativa: para', roda('Restaurante ativo?', { ...rest, assinatura_status: 'sem_assinatura' }, { 'Lê a mensagem': lido }).length === 0)
ok('sem contato: null', roda('Restaurante ativo?', { ...rest, telefone_contato: null }, { 'Lê a mensagem': lido })[0].json.telefoneContato === null)

// Texto do áudio
ok('áudio transcrito vira texto', roda('Texto do áudio', { text: ' A pizza estava ótima ' }, { 'Restaurante ativo?': ativo })[0].json.texto === 'A pizza estava ótima')
ok('transcrição com erro: para em silêncio', roda('Texto do áudio', { error: 'falhou' }, { 'Restaurante ativo?': ativo }).length === 0)

// Sou a última mensagem?
const rid = '11:5511932903005'
const linha = (id, txt, mid) => ({ id, remote_id: rid, message_content: txt, message_data: { messageid: mid } })
const meu = { id: 7, remote_id: rid }
const ultima = (linhas) => roda('Sou a última mensagem?', linhas, { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })
r = ultima([linha(5, 'oi', 'a'), linha(6, 'a comida estava fria', 'b'), linha(7, 'e o garçom foi ótimo', 'c')])
ok('última: junta tudo em ordem', r.length === 1 && r[0].json.textoCompleto === 'oi\na comida estava fria\ne o garçom foi ótimo' && r[0].json.ateId === 7 && r[0].json.remoteId === rid)
ok('última: numera as mensagens para a IA', r[0].json.textoParaIA === '[1] oi\n[2] a comida estava fria\n[3] e o garçom foi ótimo', r[0].json.textoParaIA)
ok('última: guarda o id de cada mensagem (para citar e marcar como lida)', r[0].json.ids.join() === 'a,b,c' && r[0].json.mensagens[1].id === 'b' && r[0].json.mensagens[1].texto === 'a comida estava fria')
ok('não é a última: para', ultima([linha(7, 'x', 'c'), linha(5, 'y', 'a'), linha(9, 'z', 'd')]).length === 0)
ok('evento repetido conta uma vez', ultima([linha(6, 'a comida estava fria', 'b'), linha(7, 'a comida estava fria', 'b')])[0]?.json.textoCompleto === 'a comida estava fria')
ok('message_data como texto também tira a repetida', ultima([{ ...linha(6, 'oi', 'b'), message_data: '{"messageid":"b"}' }, { ...linha(7, 'oi', 'b'), message_data: '{"messageid":"b"}' }])[0]?.json.textoCompleto === 'oi')
const juntada = ultima([linha(7, 'A comida estava fria. Vocês abrem domingo?', 'c')])[0].json

// Monta a resposta
const P = (s, c = 'Comida', t = 'texto') => ({ feedback_original: t, categoria: c, sentimento: s, resumo: 'resumo' })
// `falou`: o que o "Já respondeu hoje?" achou ({} = primeira conversa).
const JA_FALOU = { id: 99 }
const monta = (obj, b = juntada, falou = JA_FALOU) => roda('Monta a resposta', { text: typeof obj === 'string' ? obj : JSON.stringify(obj) }, { 'Sou a última mensagem?': b, 'Já respondeu hoje?': falou })[0].json
let o = monta({ tipo: 'feedback', tem_pergunta_restaurante: false, assunto_pergunta: '', pontos: [P('Positivo')] })
ok('positivo: grava e agradece', o.ehFeedback && o.sentimentoGeral === 'Positivo' && o.resposta.length > 20 && !o.resposta.includes('pergunta'))
ok('saída só com os campos usados', JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['baseUrl', 'ehFeedback', 'pontos', 'resposta', 'respostas', 'restauranteId', 'sentimentoGeral', 'telefone', 'textoCompleto', 'token']))
ok('uma mensagem só: a resposta cita ela', o.respostas.length === 1 && o.respostas[0].replyid === 'c' && o.respostas[0].texto === o.resposta)
const tempos = Array.from({ length: 80 }, () => monta({ tipo: 'feedback', pontos: [P('Positivo')] }).respostas[0].digitandoMs)
ok('"digitando..." sorteado entre 3 e 12 s', tempos.every((d) => d >= 3000 && d <= 12000) && new Set(tempos).size > 20, tempos.join())
ok('negativo', monta({ tipo: 'feedback', pontos: [P('Negativo')] }).sentimentoGeral === 'Negativo')
ok('positivo e negativo', monta({ tipo: 'feedback', pontos: [P('Positivo'), P('Negativo', 'Atendimento')] }).sentimentoGeral === 'Positivo e Negativo')
o = monta({ tipo: 'feedback', pontos: [P('Neutro', 'Ambiente')] })
ok('neutro: grava como Neutro e agradece', o.ehFeedback && o.sentimentoGeral === 'Neutro' && o.pontos[0].sentimento === 'Neutro' && !/sugest/i.test(o.resposta))
o = monta({ tipo: 'feedback', pontos: [P('Sugestão', 'Cardápio/Variedade')] })
ok('sugestão: grava como Sugestão e agradece a sugestão', o.sentimentoGeral === 'Sugestão' && o.pontos[0].sentimento === 'Sugestão' && /sugest|ideia/i.test(o.resposta))
o = monta({ tipo: 'feedback', pontos: [P('neutra', 'Ambiente'), P('sugestao', 'Música/Som')] })
ok('neutro e sugestão juntos: cada um no seu', o.pontos[0].sentimento === 'Neutro' && o.pontos[1].sentimento === 'Sugestão' && o.sentimentoGeral === 'Sugestão')
o = monta({ tipo: 'feedback', pontos: [P('Positivo'), P('Sugestão', 'Cardápio/Variedade')] })
ok('positivo + sugestão: geral Positivo e cita a sugestão', o.sentimentoGeral === 'Positivo' && /sugest|ideia/i.test(o.resposta))
o = monta({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'o horário de funcionamento.', pontos: [P('Negativo')] })
ok('feedback + pergunta: agradece e encaminha com o contato (bloco separado, número em outra linha)', o.ehFeedback && /\n\n(Ah, s|S)obre o horário de funcionamento[^\n]*\n(Pra isso|Mas) é só chamar a gente no número 5511987654321\.$/.test(o.resposta), o.resposta)
ok('encaminhamento só com o número, sem link', !/wa\.me|https?:/.test(o.resposta))
ok('número com 55, sem parênteses nem hífen', !/[()-]/.test(o.resposta.split('no número')[1]))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] })
ok('só pergunta: não grava, encaminha só com o número', !o.ehFeedback && o.resposta.includes('com reservas') && o.resposta.endsWith('chamar a gente no número 5511987654321.'))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }, { ...juntada, telefoneContato: null })
ok('pergunta sem contato configurado: só avisa', o.resposta.includes('com reservas') && !/chamar a gente|número 55/.test(o.resposta))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }, { ...juntada, telefoneContato: '11987654321' })
ok('contato sem o 55 ganha o 55', o.resposta.endsWith('no número 5511987654321.'))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: '', pontos: [] })
ok('pergunta incompleta (sem assunto): não responde', !o.ehFeedback && o.resposta === '')
o = monta({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: ' ', pontos: [P('Positivo')] })
ok('feedback + pergunta incompleta: só agradece', o.ehFeedback && o.resposta.length > 20 && !o.resposta.includes('\n\n'))
o = monta({ tipo: 'outro', tem_pergunta_restaurante: false, assunto_pergunta: '', pontos: [] })
ok('saudação/assunto fora: não responde nem grava', !o.ehFeedback && o.resposta === '' && o.respostas.length === 0)

// A Helena: mensagens prontas sorteadas. Sorteia muitas vezes cada caso e
// confere o que vale para TODAS as respostas.
const amostras = (obj, b = juntada, falou = JA_FALOU, n = 150) => Array.from({ length: n }, () => monta(obj, b, falou).resposta)
const CARA_DE_IA = /feedback|experiência|agradecemos|lamentamos|valios|importante para nós|nossa equipe está|—/i
const todos = [
  ...amostras({ tipo: 'feedback', pontos: [P('Positivo')], elogio: 'a comida' }, juntada, {}),
  ...amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'a pizza fria' }),
  ...amostras({ tipo: 'feedback', pontos: [P('Positivo'), P('Negativo', 'Atendimento')], elogio: 'o garçom', problema: 'a demora no atendimento' }, juntada, {}),
  ...amostras({ tipo: 'feedback', pontos: [P('Neutro', 'Ambiente')] }),
  ...amostras({ tipo: 'feedback', pontos: [P('Sugestão', 'Música/Som')], ideia: 'a música ao vivo' }, juntada, {}),
  ...amostras({ tipo: 'feedback', pontos: [P('Positivo'), P('Sugestão', 'Música/Som')], ideia: 'a música ao vivo' }),
  ...amostras({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [P('Negativo')] }),
  ...amostras({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }, juntada, {}),
]
const primeiras = [
  ...amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'a pizza fria' }, juntada, {}),
  ...amostras({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }, juntada, {}),
]
ok('primeira resposta do dia: começa com a apresentação, numa linha só, e uma linha em branco',
  primeiras.every((t) => /^(Oi|Olá)[^\n]*Helena[^\n]*\n\n\S/.test(t)), primeiras.find((t) => !/^(Oi|Olá)[^\n]*Helena[^\n]*\n\n\S/.test(t)))
const seguintes = [
  ...amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'a pizza fria' }),
  ...amostras({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }),
]
ok('já respondeu hoje: sem apresentação e sem cumprimento', seguintes.every((t) => !/Helena|^Oi|^Olá/.test(t)), seguintes.find((t) => /Helena|^Oi|^Olá/.test(t)))
ok('nunca "de novo"', [...todos, ...primeiras, ...seguintes].every((t) => !/de novo/i.test(t)))
ok('mensagem quebrada em linhas (reação numa linha, o resto na outra)', seguintes.every((t) => t.includes('\n')))
ok('Helena: nenhuma {variável} sobra sem preencher', todos.every((t) => !/[{}]|undefined|null/.test(t)), todos.find((t) => /[{}]|undefined|null/.test(t)))
ok('Helena: nada com cara de IA (feedback, experiência, agradecemos, travessão…)', todos.every((t) => !CARA_DE_IA.test(t)), todos.find((t) => CARA_DE_IA.test(t)))
ok('Helena: o sorteio varia (várias mensagens diferentes)', new Set(todos).size > 60)
const negativos = amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'a pizza fria' })
ok('problema completa a mensagem com contração ("pela pizza fria", "da pizza fria")', negativos.some((t) => /pela pizza fria|da pizza fria/.test(t)) && negativos.every((t) => !/por a |de a /.test(t)))
ok('problema no plural: "pelas mesas bambas"', amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'as mesas bambas' }).some((t) => t.includes('pelas mesas bambas') || t.includes('das mesas bambas')))
ok('pedaço estranho da IA é ignorado', amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'Pizza fria.' }).every((t) => !/pizza/i.test(t)))
ok('pedaço longo demais é ignorado', amostras({ tipo: 'feedback', pontos: [P('Negativo')], problema: 'a pizza que veio fria e sem queijo nenhum hoje' }).every((t) => !/pizza/i.test(t)))
ok('sem pedaço: ainda responde com mensagem pronta', amostras({ tipo: 'feedback', pontos: [P('Negativo')] }).every((t) => t.length > 30))
ok('nunca chama o cliente pelo nome (mesmo se a IA mandar um)', [
  ...amostras({ tipo: 'feedback', pontos: [P('Positivo')], primeiro_nome: 'Ana' }, juntada, {}),
  ...amostras({ tipo: 'feedback', pontos: [P('Negativo')], primeiro_nome: 'Ana' }),
].every((t) => !t.includes('Ana')))
ok('apresentação diz o restaurante ("do Camelo")', amostras({ tipo: 'feedback', pontos: [P('Positivo')] }, juntada, {}).every((t) => t.includes('Helena, do Camelo.')))
ok('restaurante com nome feminino: "da Pizzaria Bella"', amostras({ tipo: 'feedback', pontos: [P('Positivo')] }, { ...juntada, nomeRestaurante: 'Pizzaria Bella' }, {}).some((t) => t.includes('da Pizzaria Bella')))
o = monta({ tipo: 'feedback', pontos: [P('Positivo')] }, juntada, { error: 'falhou a consulta' })
ok('consulta do "já respondeu hoje" falhou: se apresenta', o.resposta.includes('Helena'))
o = monta({ tipo: 'feedback', pontos: [] })
ok('"feedback" sem ponto: silêncio', !o.ehFeedback && o.resposta === '')
o = monta({ tipo: 'feedback', pontos: [P('Positivo', 'Decoração'), P('Excelente'), { categoria: 'Comida', sentimento: 'Positivo' }, P('Positivo e Negativo', 'música/som')] })
ok('categoria inventada vira Outros', o.pontos[0].categoria === 'Outros')
ok('sentimento fora da lista e ponto sem texto são descartados', o.pontos.length === 2)
ok('misto num ponto vira Negativo; categoria sem maiúscula acha a certa', o.pontos[1].sentimento === 'Negativo' && o.pontos[1].categoria === 'Música/Som')
ok('texto longo é cortado', monta({ tipo: 'feedback', pontos: [P('Positivo', 'Comida', 'x'.repeat(5000))] }).pontos[0].texto_original.length === 1000)
ok('JSON com texto em volta ainda é lido', monta('Resultado: {"tipo":"feedback","pontos":[{"feedback_original":"ok","categoria":"Comida","sentimento":"Positivo","resumo":"ok"}]}').ehFeedback)
let erro = null
try { monta('desculpe, não entendi') } catch (e) { erro = e.message }
ok('resposta sem JSON vira erro visível (não grava lixo)', !!erro && erro.includes('fora do formato'))
erro = null
try { monta([P('Positivo')]) } catch (e) { erro = e.message }
ok('lista solta (formato antigo) vira erro visível', !!erro)

// Separa os pontos
const montado = monta({ tipo: 'feedback', pontos: [P('Positivo'), P('Sugestão', 'Bebidas')] })
r = roda('Separa os pontos', { id: 'uuid-1' }, { 'Monta a resposta': montado })
ok('um item por ponto, ligado à origem', r.length === 2 && r.every((i) => i.json.origem_id === 'uuid-1' && i.json.restaurante_id === 11 && i.json.telefone_cliente === '5511932903005'))
erro = null
try { roda('Separa os pontos', {}, { 'Monta a resposta': montado }) } catch (e) { erro = e.message }
ok('sem id da origem: erro visível', !!erro)

// ── 3. PARAR (as atualizações das ações) ─────────────────────────────────────
const destinos = (de, saida = 0, tipo = 'main') => (wf.connections[de]?.[tipo]?.[saida] ?? []).map((c) => c.node)
for (const nome of ['Pediu para parar?', 'Conversa recente', 'Monta o contexto', 'Decide se é para parar', 'Modelo do parar', 'É para parar?', 'Marca para não receber']) ok(`PARAR: nó existe: ${nome}`, !!porNome(nome))
// Depois do buffer vem "Quem escreveu?" (cliente ou equipe); é do "Junta quem escreveu" que os ramos saem.
const SAIDA_DO_BUFFER = 'Junta quem escreveu'
ok('depois do buffer: pergunta quem escreveu e só então abre os ramos', destinos('Sou a última mensagem?').join() === 'Quem escreveu?' && destinos('Quem escreveu?').join() === SAIDA_DO_BUFFER)
ok('PARAR: sai da mensagem juntada, junto com a resposta normal', destinos(SAIDA_DO_BUFFER).includes('Pediu para parar?') && destinos(SAIDA_DO_BUFFER).includes('Limpa o buffer'))
ok('PARAR: roda antes da resposta normal (fica acima no canvas, executionOrder v1)', wf.settings.executionOrder === 'v1'
  && porNome('Pediu para parar?').position[1] < porNome('Limpa o buffer').position[1] && porNome('Pediu para parar?').position[1] < porNome('Limpa buffer antigo').position[1])
const caminho = ['Pediu para parar?', 'Conversa recente', 'Monta o contexto', 'Decide se é para parar', 'É para parar?', 'Marca para não receber']
ok('PARAR: caminho na ordem certa', caminho.slice(0, -1).every((de, i) => destinos(de).join() === caminho[i + 1]))
ok('PARAR: o caminho só marca, não manda nada (a confirmação sai junto das outras respostas)', !wf.connections['Marca para não receber'])
ok('PARAR: a IA do parar usa o próprio modelo (temperatura 0, JSON)', destinos('Modelo do parar', 0, 'ai_languageModel').join() === 'Decide se é para parar'
  && JSON.stringify(porNome('Modelo do parar').parameters.options) === '{"temperature":0,"responseFormat":"json_object"}')
ok('PARAR: nenhum nó que chama fora trava o fluxo (falhou, segue)', ['Conversa recente', 'Decide se é para parar', 'Marca para não receber'].every((n) => porNome(n).onError === 'continueRegularOutput'))
// O endereço é uma expressão: função do cliente, ou a da equipe quando quem escreveu é funcionário.
const urlDe = (nome, json) => new Function('$json', 'return (' + porNome(nome).parameters.url.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')(json)
for (const [nome, fn, fnEquipe] of [['Conversa recente', 'contato_contexto_parar', 'equipe_contexto_parar'], ['Marca para não receber', 'contato_parar_atualizacoes', 'equipe_parar']]) {
  const n = porNome(nome)
  ok(`PARAR: "${nome}" chama a função ${fn} com a credencial do Supabase`, n.parameters.method === 'POST' && urlDe(nome, {}).endsWith('/rest/v1/rpc/' + fn) && urlDe(nome, { daEquipe: false }).endsWith('/rest/v1/rpc/' + fn)
    && n.parameters.authentication === 'predefinedCredentialType' && n.parameters.nodeCredentialType === 'supabaseApi' && !!n.credentials?.supabaseApi)
  ok(`PARAR: "${nome}" de funcionário chama ${fnEquipe}`, urlDe(nome, { daEquipe: true }) === 'https://lixrcruilisncfhfhndo.supabase.co/rest/v1/rpc/' + fnEquipe)
}
const corpoDe = (nome, json) => JSON.parse(new Function('$json', 'return (' + porNome(nome).parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')(json))
ok('PARAR: busca a conversa pelo restaurante e telefone', JSON.stringify(corpoDe('Conversa recente', { restauranteId: 11, telefone: '5511932903005' })) === '{"p_restaurante_id":11,"p_telefone":"5511932903005"}')
ok('PARAR: marca com o motivo', JSON.stringify(corpoDe('Marca para não receber', { restauranteId: 11, telefone: '5511932903005', motivo: 'PARAR' })) === '{"p_restaurante_id":11,"p_telefone":"5511932903005","p_motivo":"PARAR"}')

// Pediu para parar? (o filtro barato)
const juntadaParar = (textoCompleto) => ({ restauranteId: 11, telefone: '5511932903005', baseUrl: 'https://iamai-ia.uazapi.com', token: 'tok-123', textoCompleto, ateId: 9, remoteId: 'r' })
const passa = (txt) => roda('Pediu para parar?', juntadaParar(txt)).length === 1
for (const txt of ['PARAR', 'parar', 'Pare', 'pare!', 'Para!', 'Oi\nPara', 'stop', 'Para de me mandar mensagem', 'para de mandar essas coisas', 'Não quero mais receber', 'nao quero mais essas mensagens', 'Não me mande mais isso', 'Me tira da lista', 'chega de mensagem', 'quero cancelar essas mensagens', 'Como faço pra não receber mais?', 'não precisa mais me avisar', 'quero me descadastrar', 'A comida estava ótima. Mas pode PARAR de mandar novidade']) {
  ok(`PARAR: filtro deixa passar "${txt.replace('\n', ' / ')}"`, passa(txt))
}
for (const txt of ['Fui lá para comemorar meu aniversário', 'O garçom não parava de falar', 'Parei o carro na frente e fui bem atendido', 'Parabéns pelo atendimento!', 'Comprei para minha mãe e ela amou', 'Separaram minha mesa rapidinho', 'Obrigado!', 'A música não para nunca']) {
  ok(`PARAR: filtro barra "${txt}"`, !passa(txt))
}
r = roda('Pediu para parar?', juntadaParar('PARAR'))[0].json
ok('PARAR: o filtro leva só o necessário', JSON.stringify(Object.keys(r).sort()) === '["baseUrl","daEquipe","mensagemId","ordem","restauranteId","telefone","textoCompleto","token"]' && r.daEquipe === false)
r = roda('Pediu para parar?', { ...juntadaParar('A comida tava ótima\nPARAR'), mensagens: [{ id: 'm1', texto: 'A comida tava ótima' }, { id: 'm2', texto: 'PARAR' }] })
ok('PARAR: acha QUAL mensagem pediu para parar (é ela que a confirmação cita)', r.length === 1 && r[0].json.ordem === 2 && r[0].json.mensagemId === 'm2')
r = roda('Pediu para parar?', { ...juntadaParar(''), mensagens: [{ id: 'm1', texto: 'Para!' }, { id: 'm2', texto: 'fui lá para comemorar' }] })
ok('PARAR: "Para!" sozinho numa mensagem conta; "para" no meio da outra não', r.length === 1 && r[0].json.ordem === 1 && r[0].json.mensagemId === 'm1')

// Monta o contexto
const pediu = roda('Pediu para parar?', juntadaParar('Para de me mandar mensagem'))[0].json
const ctxParar = (ctx) => roda('Monta o contexto', ctx, { 'Pediu para parar?': pediu })
ok('PARAR: telefone que não é contato das atualizações: não segue', ctxParar({ contato_id: null, ja_parou: false, conversa: [] }).length === 0)
ok('PARAR: quem já parou: não segue (nem confirma de novo)', ctxParar({ contato_id: 5, ja_parou: true, conversa: [] }).length === 0)
ok('PARAR: falhou a consulta: não segue', ctxParar({ error: 'falhou' }).length === 0)
r = ctxParar({
  contato_id: 5, ja_parou: false, aviso_parar_em: '2026-10-08T15:00:00Z',
  ultima_atualizacao: { texto: 'Trocamos a música ambiente por sua causa!', enviada_em: '2026-10-08T14:59:00Z' },
  conversa: [
    { quem: 'restaurante', texto: 'Trocamos a música ambiente por sua causa!', enviada_em: '2026-10-08T14:59:00Z' },
    { quem: 'restaurante', texto: 'Se não quiser mais receber, responda PARAR.', enviada_em: '2026-10-08T15:00:00Z' },
    { quem: 'cliente', texto: 'Para de me mandar mensagem', enviada_em: '2026-10-08T15:10:00Z' },
  ],
})
const contexto = r[0]?.json.contexto || ''
ok('PARAR: o contexto tem a mensagem nova, a conversa e a última atualização',
  contexto.includes('Para de me mandar mensagem') && contexto.includes('RESTAURANTE: Trocamos a música') && contexto.includes('CLIENTE: Para de me mandar')
  && contexto.includes('ÚLTIMA ATUALIZAÇÃO') && contexto.includes('já avisou'), contexto)
ok('PARAR: horário da conversa em Brasília', contexto.includes('[08/10, 12:10]') || contexto.includes('[08/10 12:10]'), contexto)
ok('PARAR: o contexto continua com os dados do envio', r[0].json.restauranteId === 11 && r[0].json.token === 'tok-123')
ok('PARAR: sem conversa nem atualização ainda: avisa a IA', ctxParar({ contato_id: 5, ja_parou: false, conversa: [] })[0].json.contexto.includes('nenhuma mensagem anterior')
  && ctxParar({ contato_id: 5, ja_parou: false, conversa: [] })[0].json.contexto.includes('ainda não mandou nenhuma atualização'))

// É para parar? (a decisão da IA)
const montado2 = ctxParar({ contato_id: 5, ja_parou: false, conversa: [] })[0].json
const decide = (text) => roda('É para parar?', { text }, { 'Monta o contexto': montado2 })
r = decide('{"parar": true, "certeza": "alta", "motivo": "pediu para parar"}')
ok('PARAR: "parar" com certeza alta: marca', r.length === 1 && r[0].json.restauranteId === 11 && r[0].json.telefone === '5511932903005' && r[0].json.motivo === 'Para de me mandar mensagem')
ok('PARAR: certeza média: não marca', decide('{"parar": true, "certeza": "media", "motivo": "x"}').length === 0)
ok('PARAR: certeza baixa: não marca', decide('{"parar": true, "certeza": "baixa", "motivo": "x"}').length === 0)
ok('PARAR: "parar": false: não marca', decide('{"parar": false, "certeza": "alta", "motivo": "preposição"}').length === 0)
ok('PARAR: "parar" como texto ("true"): não marca', decide('{"parar": "true", "certeza": "alta"}').length === 0)
ok('PARAR: JSON com texto em volta ainda é lido', decide('Resultado: {"parar": true, "certeza": "Alta", "motivo": "x"}').length === 1)
ok('PARAR: resposta fora do formato: não marca', decide('acho que sim').length === 0 && decide('').length === 0)
r = roda('É para parar?', { error: 'OpenAI fora' }, { 'Monta o contexto': montado2 })
ok('PARAR: IA falhou: não marca', r.length === 0)
const longo = roda('Monta o contexto', { contato_id: 5, ja_parou: false, conversa: [] }, { 'Pediu para parar?': { ...pediu, textoCompleto: 'PARAR ' + 'x'.repeat(900) } })[0].json
ok('PARAR: motivo curto (300)', roda('É para parar?', { text: '{"parar":true,"certeza":"alta"}' }, { 'Monta o contexto': longo })[0].json.motivo.length === 300)

// O prompt da IA do parar
const promptParar = porNome('Decide se é para parar').parameters.messages.messageValues[0].message
ok('PARAR: prompt pede cuidado ("Na dúvida", false) e só JSON', promptParar.includes('Na dúvida') && promptParar.includes('"parar": false') && promptParar.includes('SOMENTE com um objeto JSON'))
ok('PARAR: a IA lê o contexto montado', porNome('Decide se é para parar').parameters.text === '={{ $json.contexto }}')
ok('PARAR: a IA principal trata pedido para parar como "outro" (não responde "só opiniões")', porNome('Analisa a mensagem').parameters.messages.messageValues[0].message.includes('[1] PARAR\n→ {"tipo": "outro"'))

// ── 4. Várias coisas juntas: uma mensagem para cada, citando a do cliente ───
const tres = ultima([linha(5, 'Oi', 'a'), linha(6, 'A comida estava ótima!', 'b'), linha(7, 'Vocês fazem reserva pra sábado?', 'c')])[0].json
const montaCom = (obj, b, falou = JA_FALOU, extra = {}) =>
  roda('Monta a resposta', { text: JSON.stringify(obj) }, { 'Sou a última mensagem?': b, 'Já respondeu hoje?': falou, ...extra })[0].json
const Pn = (s, n, t = 'texto') => ({ ...P(s, 'Comida', t), mensagem: n })
o = montaCom({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', mensagem_pergunta: 3, pontos: [Pn('Positivo', 2)] }, tres)
ok('feedback + pergunta: duas mensagens, na ordem do cliente', o.respostas.length === 2 && !o.respostas[0].texto.includes('reservas') && o.respostas[1].texto.includes('reservas'))
ok('cada uma cita a mensagem de que fala (feedback → 2, pergunta → 3)', o.respostas[0].replyid === 'b' && o.respostas[1].replyid === 'c')
ok('cada uma com o seu "digitando..."', o.respostas.every((x) => x.digitandoMs >= 3000 && x.digitandoMs <= 12000))
o = montaCom({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', mensagem_pergunta: 1, pontos: [Pn('Negativo', 3)] }, tres, {})
ok('pergunta antes do feedback: a resposta da pergunta sai primeiro', o.respostas[0].replyid === 'a' && o.respostas[0].texto.includes('reservas') && o.respostas[1].replyid === 'c')
ok('a apresentação vai só no começo da primeira', /^(Oi|Olá)[^\n]*Helena[^\n]*\n\n\S/.test(o.respostas[0].texto) && !/Helena/.test(o.respostas[1].texto))
o = montaCom({ tipo: 'feedback', pontos: [Pn('Positivo', 2, '[2] A comida estava ótima'), Pn('Negativo', 3)] }, tres)
ok('feedback em várias mensagens: um agradecimento só, citando a primeira', o.respostas.length === 1 && o.respostas[0].replyid === 'b')
ok('o número [n] não vai para o texto gravado', o.pontos[0].texto_original === 'A comida estava ótima')
o = montaCom({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [P('Positivo')] }, tres)
ok('IA sem os números: feedback primeiro, pergunta depois, sem citar (não dá para saber qual)', o.respostas.length === 2 && o.respostas[1].texto.includes('reservas') && o.respostas.every((x) => x.replyid === ''))
o = montaCom({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', mensagem_pergunta: 9, pontos: [Pn('Positivo', 0)] }, juntada)
ok('uma mensagem só com feedback e pergunta: as duas respostas citam ela', o.respostas.length === 2 && o.respostas.every((x) => x.replyid === 'c'))

// PARAR junto com outras coisas
const comParar = ultima([linha(6, 'A comida tava ótima', 'a'), linha(7, 'mas para de me mandar essas novidades', 'b')])[0].json
const marcou = (ordem, marcado = { marcou: true }) => ({ 'Marca para não receber': marcado, 'Pediu para parar?': { ordem } })
const CONFIRMA = 'Pronto, não vou mais te mandar essas novidades.'
o = montaCom({ tipo: 'feedback', pontos: [Pn('Positivo', 1)] }, comParar, JA_FALOU, marcou(2))
ok('feedback + PARAR: duas mensagens, agradecimento e depois a confirmação', o.respostas.length === 2 && o.respostas[0].replyid === 'a' && o.respostas[1].texto === CONFIRMA && o.respostas[1].replyid === 'b')
const soParar = ultima([linha(7, 'PARAR', 'p')])[0].json
o = montaCom({ tipo: 'outro', pontos: [] }, soParar, {}, marcou(1))
ok('só PARAR: só "Pronto, não vou mais te mandar essas novidades." (sem apresentação), citando o PARAR', o.respostas.length === 1 && o.respostas[0].texto === CONFIRMA && o.respostas[0].replyid === 'p')
o = montaCom({ tipo: 'feedback', pontos: [Pn('Positivo', 2)] }, ultima([linha(6, 'PARAR', 'a'), linha(7, 'mas a comida tava ótima', 'b')])[0].json, {}, marcou(1))
ok('PARAR antes do feedback: confirmação primeiro e ninguém se apresenta depois de já ter falado', o.respostas[0].texto === CONFIRMA && o.respostas[1].replyid === 'b' && !/Helena/.test(o.resposta))
ok('quem já tinha parado (marcou: false): sem confirmação de novo', montaCom({ tipo: 'outro', pontos: [] }, soParar, JA_FALOU, marcou(1, { marcou: false })).respostas.length === 0)
ok('marcação falhou: sem confirmação', montaCom({ tipo: 'outro', pontos: [] }, soParar, JA_FALOU, marcou(1, { error: 'falhou' })).respostas.length === 0)
ok('caminho do PARAR não rodou: segue normal', montaCom({ tipo: 'outro', pontos: [] }, soParar).respostas.length === 0)
o = montaCom({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'como parar de receber mensagens', mensagem_pergunta: 1, pontos: [] }, soParar, JA_FALOU, marcou(1))
ok('"pergunta" que é o próprio PARAR não ganha o "esse número é só pra opiniões"', o.respostas.length === 1 && o.respostas[0].texto === CONFIRMA)
o = montaCom({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', mensagem_pergunta: 1, pontos: [] }, comParar, JA_FALOU, marcou(2))
ok('pergunta de verdade + PARAR: as duas respostas', o.respostas.length === 2 && o.respostas[0].texto.includes('reservas') && o.respostas[1].texto === CONFIRMA)

// O envio: uma mensagem por vez, no laço
ok('envio: uma resposta por item, no laço "Uma de cada vez"', destinos('Tem resposta?').join() === 'Uma resposta por mensagem'
  && destinos('Uma resposta por mensagem').join() === 'Uma de cada vez' && destinos('Uma de cada vez', 1).join() === 'Envia a resposta'
  && destinos('Envia a resposta').join() === 'Uma de cada vez' && destinos('Uma de cada vez', 0).length === 0)
ok('laço de um em um', porNome('Uma de cada vez').type === 'n8n-nodes-base.splitInBatches' && porNome('Uma de cada vez').parameters.batchSize === 1)
const varias = montaCom({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', mensagem_pergunta: 3, pontos: [Pn('Positivo', 2)] }, tres)
r = roda('Uma resposta por mensagem', {}, { 'Monta a resposta': varias })
ok('um item por resposta, na ordem', r.length === 2 && r[0].json.texto === varias.respostas[0].texto && r[1].json.replyid === 'c')
const temResposta = (resp) => new Function('$', 'return (' + porNome('Tem resposta?').parameters.conditions.conditions[0].leftValue.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')((n) => ({ first: () => ({ json: resp }) }))
ok('"Tem resposta?": só com alguma mensagem para mandar', temResposta(varias) === true && temResposta({ ...varias, respostas: [] }) === false)
const corpoDoEnvio = (item) => {
  const $ = (n) => ({ first: () => ({ json: n === 'Monta a resposta' ? varias : {} }) })
  return JSON.parse(new Function('$', '$json', 'return (' + porNome('Envia a resposta').parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')($, item))
}
let env = corpoDoEnvio(varias.respostas[1])
ok('envio: número, texto, "digitando...", cita a mensagem e marca como lida', env.number === '5511932903005' && env.text === varias.respostas[1].texto
  && env.delay === varias.respostas[1].digitandoMs && env.replyid === 'c' && env.readchat === true && env.readmessages === true, JSON.stringify(env))
env = corpoDoEnvio({ texto: 'oi', replyid: '', digitandoMs: 3000 })
ok('envio sem mensagem para citar: vai sem replyid', !('replyid' in env))

// Lida
const lida = porNome('Marca como lida')
ok('lida: sai da mensagem juntada e roda antes de tudo (mais acima no canvas)', destinos(SAIDA_DO_BUFFER).includes('Marca como lida')
  && destinos(SAIDA_DO_BUFFER).every((n) => n === 'Marca como lida' || porNome(n).position[1] > lida.position[1]))
ok('lida: marca todas as mensagens juntadas (/message/markread) e não trava o fluxo', lida.parameters.url.endsWith('/message/markread') && lida.onError === 'continueRegularOutput'
  && new Function('$json', 'return (' + lida.parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')({ ids: ['a', 'b'] }) === '{"id":["a","b"]}')

// ── 5. Equipe: o funcionário escreve para o mesmo número ─────────────────────
const NOS_EQUIPE = ['É clique no botão?', 'Quem escreveu?', 'Junta quem escreveu', 'É da equipe?', 'Respondeu a pergunta?', 'Analisa a equipe', 'Modelo da equipe',
  'Monta a resposta da equipe', 'É feedback da equipe?', 'Grava o feedback da equipe', 'Respostas da equipe', 'Uma de cada vez (equipe)', 'Envia à equipe',
  'Vai perguntar?', 'Manda o botão', 'Pergunta por escrito', 'Começa o prazo', 'Prepara a escolha', 'Registra a escolha', 'Confirma a escolha', 'Envia a confirmação']
for (const nome of NOS_EQUIPE) ok(`equipe: nó existe: ${nome}`, !!porNome(nome))
const condicaoDe = (nome) => porNome(nome).parameters.conditions.conditions[0].leftValue.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
const seVale = (nome, json, outros = {}) => new Function('$json', '$', 'return (' + condicaoDe(nome) + ')')(json, (n) => ({ first: () => ({ json: outros[n] ?? {} }) }))

// O cliente não passa pelo ramo da equipe
ok('cliente: o caminho de sempre continua inteiro, só com um desvio antes da análise', destinos('Já respondeu hoje?').join() === 'É da equipe?'
  && destinos('É da equipe?', 1).join() === 'Analisa a mensagem' && destinos('Analisa a mensagem').join() === 'Monta a resposta' && destinos('Monta a resposta').join() === 'É feedback?')
ok('cliente (equipe nula) segue para a análise de sempre; funcionário vai para o ramo da equipe', seVale('É da equipe?', {}, { 'Junta quem escreveu': { equipe: null } }) === false
  && seVale('É da equipe?', {}, { 'Junta quem escreveu': { equipe: { funcionarioId: 3 } } }) === true && destinos('É da equipe?', 0).join() === 'Respondeu a pergunta?')
ok('a consulta de quem escreveu nunca trava o fluxo do cliente (falhou, segue; vazio, segue)', porNome('Quem escreveu?').onError === 'continueRegularOutput' && porNome('Quem escreveu?').alwaysOutputData === true
  && porNome('Quem escreveu?').parameters.url.endsWith('/rest/v1/rpc/equipe_quem_e') && JSON.stringify(corpoDe('Quem escreveu?', { restauranteId: 11, telefone: '5511932903005' })) === '{"p_restaurante_id":11,"p_telefone":"5511932903005"}')

// Junta quem escreveu
const junta = (q, b = juntada) => roda('Junta quem escreveu', q, { 'Sou a última mensagem?': b })[0].json
o = junta({ ok: true, funcionario_id: null })
ok('cliente: mesmos campos da mensagem juntada, mais equipe e escolha nulas', o.equipe === null && o.escolha === null && o.textoCompleto === juntada.textoCompleto && o.ateId === juntada.ateId && o.remoteId === juntada.remoteId
  && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...Object.keys(juntada), 'equipe', 'escolha'].sort()))
ok('consulta falhou (erro do banco): trata como cliente', junta({ error: { message: 'timeout' } }).equipe === null && junta({}).equipe === null)
const FUNC = { ok: true, funcionario_id: 3, nome: 'Ana Paula', pode_escolher: false, aguardando_escolha: false }
o = junta(FUNC)
ok('funcionário: leva o id e o nome; sem pergunta feita, nada é lido como escolha', o.equipe.funcionarioId === 3 && o.equipe.nome === 'Ana Paula' && o.escolha === null)
const diz = (txt, extra = {}) => junta({ ...FUNC, pode_escolher: true, ...extra }, { ...juntada, textoCompleto: txt }).escolha
for (const txt of ['Anônimo', 'anonimo', 'ANÔNIMO', 'Ficar anônimo', 'quero ficar anônimo', 'prefiro anônimo por favor', 'anônima', 'sem meu nome', 'não quero mostrar meu nome', 'Não mostrar']) {
  ok(`escolha por escrito: "${txt}" = anônimo`, diz(txt) === 'anonimo')
}
for (const txt of ['Mostrar', 'MOSTRAR', 'Mostrar meu nome', 'pode mostrar', 'Pode mostrar meu nome', 'pode mostrar sim, obrigada', 'com meu nome', 'não precisa ser anônimo', 'pode colocar meu nome']) {
  ok(`escolha por escrito: "${txt}" = com o nome`, diz(txt) === 'identificado')
}
for (const txt of ['O salário atrasa todo mês', 'Queria que o gerente não mostrasse a escala só na sexta', 'anônimo? como assim', 'Oi', 'A equipe é ótima, pode mostrar pro dono', 'sim', 'não']) {
  ok(`não é escolha: "${txt}"`, diz(txt) === null)
}
ok('"sim" e "não" soltos só valem com a pergunta no ar', diz('Sim', { aguardando_escolha: true }) === 'anonimo' && diz('não', { aguardando_escolha: true }) === 'identificado' && diz('Não precisa', { aguardando_escolha: true }) === 'identificado')
ok('cliente escrevendo "anônimo" nunca vira escolha', junta({ ok: true, funcionario_id: null }, { ...juntada, textoCompleto: 'Anônimo' }).escolha === null)
ok('quem nunca recebeu a pergunta: "anônimo" segue como mensagem comum', junta(FUNC, { ...juntada, textoCompleto: 'Anônimo' }).escolha === null)
ok('escolha por escrito vai para o registro; o resto, para a análise da equipe', destinos('Respondeu a pergunta?', 0).join() === 'Prepara a escolha' && destinos('Respondeu a pergunta?', 1).join() === 'Analisa a equipe'
  && seVale('Respondeu a pergunta?', {}, { 'Junta quem escreveu': { escolha: 'anonimo' } }) === true && seVale('Respondeu a pergunta?', {}, { 'Junta quem escreveu': { escolha: null } }) === false)

// O clique no botão
r = lê({ messageType: 'TemplateButtonReplyMessage', text: 'Ficar anônimo', buttonOrListid: 'equipe_anonimo' })
ok('clique em "Ficar anônimo": entra como botão, com a escolha', r.length === 1 && r[0].json.tipo === 'botao' && r[0].json.escolha === 'anonimo' && r[0].json.telefone === '5511932903005' && r[0].json.texto === '')
ok('clique em "Mostrar meu nome"', lê({ messageType: 'ButtonsResponseMessage', text: 'Mostrar meu nome', buttonOrListid: 'equipe_mostrar' })[0]?.json.escolha === 'identificado')
ok('o clique vale com qualquer tipo de mensagem (o que identifica é o id do botão)', lê({ messageType: 'InteractiveResponseMessage', buttonOrListid: 'equipe_anonimo' })[0]?.json.escolha === 'anonimo'
  && lê({ messageType: 'Conversation', text: 'equipe_mostrar', buttonOrListid: '' })[0]?.json.escolha === 'identificado')
ok('botão de outra coisa (id desconhecido) não vira escolha', lê({ messageType: 'ButtonsResponseMessage', text: '', buttonOrListid: 'outro_botao' }).length === 0
  && lê({ messageType: 'Conversation', text: 'Ficar anônimo', buttonOrListid: '' })[0]?.json.tipo === 'texto')
ok('clique do próprio número ou em grupo: não entra', lê({ buttonOrListid: 'equipe_anonimo', fromMe: true }).length === 0 && lê({ buttonOrListid: 'equipe_anonimo', isGroup: true, chatid: '1203@g.us' }).length === 0)
ok('o clique vai direto para o registro, sem esperar o buffer; o resto segue igual', destinos('Restaurante ativo?').join() === 'É clique no botão?' && destinos('É clique no botão?', 0).join() === 'Prepara a escolha'
  && destinos('É clique no botão?', 1).join() === 'É áudio?' && seVale('É clique no botão?', { tipo: 'botao' }) === true && seVale('É clique no botão?', { tipo: 'texto' }) === false && seVale('É clique no botão?', { tipo: 'audio' }) === false)

// Prepara / Registra / Confirma a escolha
const clique = { ...ativo, tipo: 'botao', texto: '', escolha: 'anonimo' }
const semRodar = () => { throw new Error('nó não rodou') }
const rodaCom = (nome, entrada, outros) => {
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((j) => ({ json: j }))
  const $ = (n) => {
    if (!(n in outros)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: outros[n] }), all: () => [{ json: outros[n] }] }
  }
  return new Function('$input', '$', codigoDe(nome))({ first: () => itens[0], all: () => itens }, $)
}
r = rodaCom('Prepara a escolha', {}, { 'Restaurante ativo?': clique })
ok('clique: o buffer não rodou, e a escolha sai da entrada', r.length === 1 && r[0].json.escolha === 'anonimo' && r[0].json.restauranteId === 11 && r[0].json.telefone === '5511932903005' && r[0].json.token === 'tok-123'
  && JSON.stringify(Object.keys(r[0].json).sort()) === '["baseUrl","escolha","restauranteId","telefone","token"]')
r = rodaCom('Prepara a escolha', {}, { 'Restaurante ativo?': ativo, 'Junta quem escreveu': { ...juntada, equipe: { funcionarioId: 3 }, escolha: 'identificado' } })
ok('por escrito: a escolha sai da mensagem juntada', r.length === 1 && r[0].json.escolha === 'identificado' && r[0].json.telefone === '5511932903005')
ok('sem escolha válida: para', rodaCom('Prepara a escolha', {}, { 'Restaurante ativo?': ativo }).length === 0 && rodaCom('Prepara a escolha', {}, { 'Restaurante ativo?': { ...clique, escolha: 'talvez' } }).length === 0)
ok('registro: chama equipe_escolher_identidade com o restaurante, o telefone e a escolha', porNome('Registra a escolha').parameters.url.endsWith('/rest/v1/rpc/equipe_escolher_identidade')
  && JSON.stringify(corpoDe('Registra a escolha', { restauranteId: 11, telefone: '5511932903005', escolha: 'anonimo' })) === '{"p_restaurante_id":11,"p_telefone":"5511932903005","p_escolha":"anonimo"}'
  && destinos('Prepara a escolha').join() === 'Registra a escolha' && destinos('Registra a escolha').join() === 'Confirma a escolha' && destinos('Confirma a escolha').join() === 'Envia a confirmação')
const confirma = (escolha, resultado) => roda('Confirma a escolha', resultado, { 'Prepara a escolha': { restauranteId: 11, telefone: '5511932903005', baseUrl: 'https://iamai-ia.uazapi.com', token: 'tok-123', escolha } })
r = confirma('anonimo', { ok: true, escolha: 'anonimo', mudou: 1 })
ok('anônimo: confirma que fica sem o nome, sem prometer mais que o sistema faz', r.length === 1 && /sem o seu nome/.test(r[0].json.texto) && /sistema/.test(r[0].json.texto) && r[0].json.digitandoMs >= 2500 && r[0].json.token === 'tok-123')
ok('com o nome: confirma e agradece', /com o seu nome/.test(confirma('identificado', { ok: true, mudou: 2 })[0].json.texto))
ok('clique repetido (nada mudou), quem não é da equipe ou falha no banco: silêncio', confirma('anonimo', { ok: true, mudou: 0 }).length === 0
  && confirma('anonimo', { ok: false, motivo: 'nao_e_da_equipe' }).length === 0 && confirma('anonimo', { error: 'falhou' }).length === 0)
const corpoSolto = (nome, json) => JSON.parse(new Function('$json', 'return (' + porNome(nome).parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')(json))
env = corpoSolto('Envia a confirmação', r[0].json)
ok('confirmação: texto com "digitando..." e mensagens lidas, sem retry', env.number === '5511932903005' && env.text === r[0].json.texto && env.delay === r[0].json.digitandoMs && env.readchat === true
  && porNome('Envia a confirmação').parameters.url === '={{ $json.baseUrl }}/send/text' && !porNome('Envia a confirmação').retryOnFail)

// A análise da equipe
const promptEquipe = porNome('Analisa a equipe').parameters.messages.messageValues[0].message
const CATS_EQUIPE = ['Liderança e gestão', 'Salário e benefícios', 'Escala e horários', 'Carga de trabalho', 'Clima e colegas', 'Estrutura e equipamentos',
  'Treinamento e crescimento', 'Reconhecimento', 'Comunicação', 'Segurança e saúde', 'Clientes', 'Outros']
ok('prompt da equipe: mesma estrutura do cliente (tipo, pontos, cenários, agrupamento) com as categorias da equipe', ['PARTE 1', 'PARTE 2', 'CENÁRIO A', 'CENÁRIO B', 'CENÁRIO C', 'REGRA DE AGRUPAMENTO', 'NEUTRO NÃO É SUGESTÃO', 'FORMATO DE SAÍDA']
  .every((p) => promptEquipe.includes(p)) && CATS_EQUIPE.every((c) => promptEquipe.includes(`"${c}"`)) && !/"Comida"|"Tempo de Espera"/.test(promptEquipe))
ok('prompt da equipe: relato grave, PARAR e a resposta do anonimato como "outro"', promptEquipe.includes('"sensivel"') && promptEquipe.includes('[1] PARAR\n→ {"tipo": "outro"') && promptEquipe.includes('[1] Anônimo\n→ {"tipo": "outro"'))
ok('a IA da equipe recebe as mensagens numeradas e tem o próprio modelo', porNome('Analisa a equipe').parameters.text === porNome('Analisa a mensagem').parameters.text
  && destinos('Modelo da equipe', 0, 'ai_languageModel').join() === 'Analisa a equipe' && destinos('Modelo de análise', 0, 'ai_languageModel').join() === 'Analisa a mensagem')

// Monta a resposta da equipe
const juntadaEq = ultima([linha(7, 'O salário atrasa todo mês', 'e1')])[0].json
const PE = (s, c = 'Salário e benefícios', t = 'O salário atrasa') => ({ feedback_original: t, categoria: c, sentimento: s, resumo: 'Salário atrasado' })
const montaEq = (obj, b = juntadaEq, falou = JA_FALOU, extra = {}) =>
  roda('Monta a resposta da equipe', { text: typeof obj === 'string' ? obj : JSON.stringify(obj) }, { 'Sou a última mensagem?': b, 'Já respondeu hoje?': falou, ...extra })[0].json
o = montaEq({ tipo: 'feedback', pontos: [PE('Negativo')], sensivel: false })
ok('equipe: feedback vira ponto com a categoria da equipe e agradece', o.ehFeedback && o.sentimentoGeral === 'Negativo' && o.pontos[0].categoria === 'Salário e benefícios' && o.respostas.length === 1 && o.respostas[0].tipo === 'feedback' && o.respostas[0].replyid === 'e1')
ok('equipe: saída com o que a gravação precisa (e nada de telefone dentro dos pontos)', JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['baseUrl', 'ehFeedback', 'pontos', 'resposta', 'respostas', 'restauranteId', 'sensivel', 'sentimentoGeral', 'telefone', 'textoCompleto', 'token'])
  && JSON.stringify(Object.keys(o.pontos[0]).sort()) === '["categoria","resumo","sentimento","texto_original"]')
ok('equipe: categoria de cliente (ou inventada) vira Outros; sem acento acha a certa', montaEq({ tipo: 'feedback', pontos: [PE('Negativo', 'Comida')] }).pontos[0].categoria === 'Outros'
  && montaEq({ tipo: 'feedback', pontos: [PE('Positivo', 'clima e colegas')] }).pontos[0].categoria === 'Clima e colegas')
ok('equipe: positivo e negativo juntos', montaEq({ tipo: 'feedback', pontos: [PE('Positivo', 'Clima e colegas'), PE('Negativo')] }).sentimentoGeral === 'Positivo e Negativo')
o = montaEq({ tipo: 'feedback', pontos: [PE('Negativo', 'Liderança e gestão', 'O gerente me humilha')], sensivel: true })
ok('equipe: relato grave marca sensível e a resposta indica onde pedir ajuda', o.sensivel === true && /Ligue 180/.test(o.resposta) && /Disque 100/.test(o.resposta))
ok('equipe: "sensivel" só vale com feedback e quando a IA disse true', montaEq({ tipo: 'outro', pontos: [], sensivel: true }).sensivel === false && montaEq({ tipo: 'feedback', pontos: [PE('Negativo')], sensivel: 'true' }).sensivel === false)
const amostrasEq = (obj, falou = JA_FALOU, n = 120) => Array.from({ length: n }, () => montaEq(obj, juntadaEq, falou).resposta)
const todasEq = [
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Positivo', 'Clima e colegas')] }, {}),
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Negativo')] }),
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Positivo', 'Clima e colegas'), PE('Negativo')] }),
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Neutro', 'Outros')] }),
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Sugestão', 'Estrutura e equipamentos')] }, {}),
  ...amostrasEq({ tipo: 'feedback', pontos: [PE('Positivo', 'Clima e colegas'), PE('Sugestão', 'Estrutura e equipamentos')] }),
  ...amostrasEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'anonimato', mensagem_pergunta: 1, pontos: [] }),
  ...amostrasEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'outro', mensagem_pergunta: 1, pontos: [] }, {}),
]
ok('equipe: nenhuma {variável} sobra e nada com cara de IA', todasEq.every((x) => !/[{}]|undefined|null/.test(x) && !CARA_DE_IA.test(x)), todasEq.find((x) => /[{}]|undefined|null/.test(x) || CARA_DE_IA.test(x)))
ok('equipe: o agradecimento NÃO promete anonimato (a pessoa ainda vai escolher) nem chama de cliente', todasEq.filter((x) => !/Você que escolhe/.test(x)).every((x) => !/an[oô]nim|sem o seu nome|cliente/i.test(x)), todasEq.find((x) => !/Você que escolhe/.test(x) && /an[oô]nim|sem o seu nome|cliente/i.test(x)))
ok('equipe: o sorteio varia', new Set(todasEq).size > 25)
ok('equipe: primeira resposta do dia se apresenta como a Helena do restaurante; nas outras, não', amostrasEq({ tipo: 'feedback', pontos: [PE('Negativo')] }, {}).every((x) => /^(Oi|Olá)[^\n]*Helena, do Camelo\.\n\n\S/.test(x))
  && amostrasEq({ tipo: 'feedback', pontos: [PE('Negativo')] }).every((x) => !/Helena/.test(x)))
o = montaEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'anonimato', mensagem_pergunta: 1, pontos: [] })
ok('equipe: "isso é anônimo?" explica que a pessoa escolhe depois, sem gravar nada', !o.ehFeedback && /Você que escolhe/.test(o.resposta) && /sem o seu nome/.test(o.resposta))
o = montaEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'quem_e', mensagem_pergunta: 1, pontos: [] }, juntadaEq, {})
ok('equipe: "quem é você?" não repete a apresentação', (o.resposta.match(/Helena/g) || []).length === 1 && o.resposta.startsWith('Sou a Helena'))
ok('equipe: pedido do dia a dia (folga, pagamento) manda falar com a gerência', /ger[êe]ncia/.test(montaEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'outro', mensagem_pergunta: 1, pontos: [] }).resposta))
ok('equipe: saudação, "ok" ou a resposta do anonimato que sobrou: silêncio', montaEq({ tipo: 'outro', pontos: [] }).respostas.length === 0 && !montaEq({ tipo: 'outro', pontos: [] }).ehFeedback)
const duasEq = ultima([linha(6, 'O clima é ótimo', 'e1'), linha(7, 'Isso é anônimo?', 'e2')])[0].json
o = montaEq({ tipo: 'feedback', tem_pergunta: true, pergunta_sobre: 'anonimato', mensagem_pergunta: 2, pontos: [{ ...PE('Positivo', 'Clima e colegas'), mensagem: 1 }] }, duasEq)
ok('equipe: feedback + pergunta saem em duas mensagens, cada uma citando a sua', o.respostas.length === 2 && o.respostas[0].replyid === 'e1' && o.respostas[1].replyid === 'e2' && o.respostas[1].tipo === 'pergunta')
const pararEq = ultima([linha(7, 'PARAR', 'p')])[0].json
o = montaEq({ tipo: 'outro', pontos: [] }, pararEq, {}, marcou(1))
ok('equipe: PARAR marcado agora confirma em uma frase só, sem apresentação', o.respostas.length === 1 && o.respostas[0].texto === 'Pronto, não vou mais te mandar essas mensagens.' && o.respostas[0].replyid === 'p')
ok('equipe: PARAR que não marcou (já tinha parado): silêncio', montaEq({ tipo: 'outro', pontos: [] }, pararEq, JA_FALOU, marcou(1, { marcou: false })).respostas.length === 0)
erro = null
try { montaEq('não entendi') } catch (e) { erro = e.message }
ok('equipe: resposta da IA sem JSON vira erro visível', !!erro && erro.includes('fora do formato'))

// PARAR do funcionário
r = roda('Pediu para parar?', { ...juntadaParar('PARAR'), equipe: { funcionarioId: 3 } })[0].json
ok('PARAR: quem é da equipe segue marcado como equipe', r.daEquipe === true)
const ctxEq = roda('Monta o contexto', {
  contato_id: 3, ja_parou: false, aviso_parar_em: '2026-10-08T15:00:00Z', ultima_atualizacao: { texto: 'Como está sendo trabalhar aqui?', enviada_em: '2026-10-08T15:00:00Z' },
  conversa: [{ quem: 'restaurante', texto: 'Como está sendo trabalhar aqui?', enviada_em: '2026-10-08T15:00:00Z' }, { quem: 'cliente', texto: 'PARAR', enviada_em: '2026-10-08T15:10:00Z' }],
}, { 'Pediu para parar?': r })[0].json
ok('PARAR da equipe: o contexto avisa a IA que é funcionário e que pedido sobre o trabalho não conta', ctxEq.contexto.includes('FUNCIONÁRIO do restaurante') && ctxEq.contexto.includes('FUNCIONÁRIO: PARAR')
  && ctxEq.contexto.includes('ÚLTIMO PEDIDO DE OPINIÃO') && ctxEq.contexto.includes('parar de trabalhar no domingo') && !ctxEq.contexto.includes('CLIENTE'))
ok('PARAR do cliente: o contexto não muda', !contexto.includes('FUNCIONÁRIO') && contexto.startsWith('MENSAGEM NOVA DO CLIENTE'))
r = roda('É para parar?', { text: '{"parar": true, "certeza": "alta"}' }, { 'Monta o contexto': ctxEq })
ok('PARAR da equipe: a marcação sabe que é da equipe (vai para equipe_parar)', r.length === 1 && r[0].json.daEquipe === true && urlDe('Marca para não receber', r[0].json).endsWith('/rpc/equipe_parar'))
ok('PARAR do cliente: a marcação continua em contato_parar_atualizacoes', roda('É para parar?', { text: '{"parar": true, "certeza": "alta"}' }, { 'Monta o contexto': montado2 })[0].json.daEquipe === false)

// Gravar
const montadoEq = montaEq({ tipo: 'feedback', pontos: [PE('Negativo'), PE('Positivo', 'Clima e colegas', 'A equipe é unida')], sensivel: false })
ok('equipe: só grava quando é feedback', destinos('É feedback da equipe?', 0).join() === 'Grava o feedback da equipe' && destinos('É feedback da equipe?', 1).join() === 'Respostas da equipe'
  && seVale('É feedback da equipe?', montadoEq) === true && seVale('É feedback da equipe?', { ehFeedback: false }) === false)
const gravar = porNome('Grava o feedback da equipe')
env = corpoDe('Grava o feedback da equipe', montadoEq)
ok('equipe: grava pela função equipe_registrar_feedback (texto inteiro, sentimento, pontos e relato grave)', gravar.parameters.url.endsWith('/rest/v1/rpc/equipe_registrar_feedback') && !!gravar.credentials?.supabaseApi
  && env.p_restaurante_id === 11 && env.p_telefone === '5511932903005' && env.p_texto === 'O salário atrasa todo mês' && env.p_sentimento === 'Positivo e Negativo' && env.p_pontos.length === 2 && env.p_sensivel === false)
ok('equipe: o feedback da equipe NÃO passa pelos nós que gravam o telefone do cliente', !['Salva a mensagem', 'Separa os pontos', 'Salva os pontos'].some((n) => [...destinos('É feedback da equipe?', 0), ...destinos('É feedback da equipe?', 1), ...destinos('Grava o feedback da equipe')].includes(n)))

// Respostas da equipe e a pergunta do anonimato
const GRAVOU = { ok: true, original_id: 'u1', autoria_id: 'a1', identidade: 'pendente', perguntar_identidade: true, sensivel: false, prazo_horas: 24 }
const respostasEq = (m, gravado) => rodaCom('Respostas da equipe', {}, gravado === undefined ? { 'Monta a resposta da equipe': m } : { 'Monta a resposta da equipe': m, 'Grava o feedback da equipe': gravado })
r = respostasEq(montadoEq, GRAVOU)
ok('equipe: uma resposta por item, levando a pergunta do anonimato', r.length === 1 && r[0].json.texto === montadoEq.respostas[0].texto && r[0].json.perguntar === true && !!r[0].json.pergunta)
const pg = r[0].json.pergunta
ok('pergunta: dois botões de resposta com os ids que o "Lê a mensagem" reconhece', JSON.stringify(pg.botoes) === '["Ficar anônimo|equipe_anonimo","Mostrar meu nome|equipe_mostrar"]'
  && pg.botoes.every((b) => lê({ messageType: 'ButtonsResponseMessage', buttonOrListid: b.split('|')[1] }).length === 1))
ok('pergunta: rótulo do botão cabe no WhatsApp (até 20 letras) e o rodapé também (até 60)', pg.botoes.every((b) => b.split('|')[0].length <= 20) && pg.rodape.length <= 60)
ok('pergunta: diz o que acontece sem resposta (aparece o nome em 24 horas) e como responder sem botão', pg.rodape === 'Sem resposta em 24 horas, aparece com o seu nome.' && /ANÔNIMO ou MOSTRAR/.test(pg.texto) && /fique anônima\?/.test(pg.texto))
ok('pergunta por escrito (reserva): mesma explicação, as duas palavras e o prazo', /ANÔNIMO ou MOSTRAR/.test(pg.textoSemBotao) && pg.textoSemBotao.endsWith(pg.rodape)
  && diz('ANÔNIMO') === 'anonimo' && diz('MOSTRAR') === 'identificado')
ok('prazo configurado em dias aparece em dias', respostasEq(montadoEq, { ...GRAVOU, prazo_horas: 72 })[0].json.pergunta.rodape === 'Sem resposta em 3 dias, aparece com o seu nome.')
ok('relato grave: sem resposta fica ANÔNIMO (nunca promete mostrar o nome)', respostasEq(montadoEq, { ...GRAVOU, sensivel: true })[0].json.pergunta.rodape === 'Sem resposta, fica anônima.')
r = respostasEq(montadoEq, { ...GRAVOU, perguntar_identidade: false })
ok('já perguntou nesta leva: agradece e não pergunta de novo', r.length === 1 && r[0].json.perguntar === false && r[0].json.pergunta === null)
ok('feedback que o banco não gravou (saiu do cadastro): não agradece nem pergunta', respostasEq(montadoEq, { ok: false, motivo: 'nao_e_da_equipe' }).length === 0)
r = respostasEq(montaEq({ tipo: 'pergunta', tem_pergunta: true, pergunta_sobre: 'anonimato', mensagem_pergunta: 1, pontos: [] }))
ok('só pergunta (nada gravado): responde e não manda o botão', r.length === 1 && r[0].json.perguntar === false)
ok('nada a responder: o ramo para', respostasEq(montaEq({ tipo: 'outro', pontos: [] })).length === 0)

// O envio da equipe
ok('equipe: respostas uma de cada vez; a pergunta só depois de todas', destinos('Respostas da equipe').join() === 'Uma de cada vez (equipe)' && destinos('Uma de cada vez (equipe)', 1).join() === 'Envia à equipe'
  && destinos('Envia à equipe').join() === 'Uma de cada vez (equipe)' && destinos('Uma de cada vez (equipe)', 0).join() === 'Vai perguntar?' && porNome('Uma de cada vez (equipe)').parameters.batchSize === 1)
const exprCom = (expr, $json, outros) => new Function('$', '$json', 'return (' + expr.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '') + ')')((n) => ({ first: () => ({ json: outros[n] ?? {} }) }), $json)
const item = respostasEq(montadoEq, GRAVOU)[0].json
const CTX = { 'Monta a resposta da equipe': montadoEq, 'Respostas da equipe': item }
env = JSON.parse(exprCom(porNome('Envia à equipe').parameters.jsonBody, item, CTX))
ok('equipe: o agradecimento cita a mensagem, com "digitando..." e sem retry', env.number === '5511932903005' && env.text === item.texto && env.replyid === 'e1' && env.delay === item.digitandoMs && !porNome('Envia à equipe').retryOnFail)
ok('"Vai perguntar?": só quando o banco mandou perguntar', exprCom(condicaoDe('Vai perguntar?'), {}, CTX) === true && exprCom(condicaoDe('Vai perguntar?'), {}, { ...CTX, 'Respostas da equipe': { perguntar: false } }) === false
  && destinos('Vai perguntar?', 0).join() === 'Manda o botão' && destinos('Vai perguntar?', 1).length === 0)
const botao = porNome('Manda o botão')
env = JSON.parse(exprCom(botao.parameters.jsonBody, {}, CTX))
ok('botão: /send/menu da uazapi, type "button", com os dois botões, o rodapé e o "digitando..."', exprCom(botao.parameters.url.replace('/send/menu', ''), {}, CTX) + '/send/menu' === 'https://iamai-ia.uazapi.com/send/menu' && botao.parameters.url.endsWith('}}/send/menu')
  && env.number === '5511932903005' && env.type === 'button' && env.text === pg.texto && JSON.stringify(env.choices) === JSON.stringify(pg.botoes) && env.footerText === pg.rodape && env.delay >= 2500 && env.readchat === true)
ok('botão: só botões de resposta (misturar com link ou ligação quebra no WhatsApp Web)', env.choices.every((c) => !/https?:|call:|copy:|url:/.test(c)))
ok('botão falhou (recurso fora do ar): a pergunta vai por escrito, e o prazo começa do mesmo jeito', botao.onError === 'continueErrorOutput' && !botao.retryOnFail && destinos('Manda o botão', 0).join() === 'Começa o prazo'
  && destinos('Manda o botão', 1).join() === 'Pergunta por escrito' && destinos('Pergunta por escrito').join() === 'Começa o prazo')
env = JSON.parse(exprCom(porNome('Pergunta por escrito').parameters.jsonBody, {}, CTX))
ok('pergunta por escrito: /send/text com o texto de reserva', porNome('Pergunta por escrito').parameters.url.endsWith('}}/send/text') && env.text === pg.textoSemBotao && env.number === '5511932903005')
const prazo = porNome('Começa o prazo')
ok('prazo: começa quando a pergunta saiu (equipe_identidade_perguntada), uma vez só', prazo.parameters.url.endsWith('/rest/v1/rpc/equipe_identidade_perguntada') && prazo.executeOnce === true
  && exprCom(prazo.parameters.jsonBody, {}, CTX) === '{"p_restaurante_id":11,"p_telefone":"5511932903005"}' && !wf.connections['Começa o prazo'])
ok('equipe: o ramo fica abaixo do caminho do cliente no canvas (não muda a ordem dos ramos de cima)', ['Analisa a equipe', 'Monta a resposta da equipe', 'Prepara a escolha'].every((n) => porNome(n).position[1] > porNome('Limpa buffer antigo').position[1])
  && porNome('Quem escreveu?').position[1] === porNome('Sou a última mensagem?').position[1])
const posicoes = nos.map((n) => n.position.join())
ok('nenhum nó em cima de outro no canvas', new Set(posicoes).size === posicoes.length, posicoes.filter((p, i) => posicoes.indexOf(p) !== i))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nworkflow: tudo certo')
process.exit(falhas ? 1 : 0)
