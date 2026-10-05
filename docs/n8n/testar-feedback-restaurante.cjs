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
ok('Always Output Data só onde vazio precisa seguir', nos.filter((n) => n.alwaysOutputData).map((n) => n.name).sort().join() === 'Já respondeu hoje?,Limpa o buffer')
ok('Execute Once só onde há vários itens chegando', nos.filter((n) => n.executeOnce).map((n) => n.name).sort().join() === 'Analisa a mensagem,Já respondeu hoje?,Tem resposta?')
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
ok('a IA recebe só a mensagem do cliente', montaEntrada({ nomeRestaurante: 'Camelo', textoCompleto: 'oi\na pizza veio fria' }, {}) === 'oi\na pizza veio fria')
const corpoEnvio = porNome('Envia a resposta').parameters.jsonBody
ok('envio como gente: "digitando..." e mensagem lida', corpoEnvio.includes('delay: ') && corpoEnvio.includes('digitandoMs') && corpoEnvio.includes('readmessages: true'))
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
ok('saída só com os campos usados', JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['baseUrl', 'digitandoMs', 'ehFeedback', 'pontos', 'resposta', 'restauranteId', 'sentimentoGeral', 'telefone', 'textoCompleto', 'token']))
ok('"digitando..." entre 2,5 e 8 s', o.digitandoMs >= 2500 && o.digitandoMs <= 8000)
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
ok('saudação/assunto fora: não responde nem grava', !o.ehFeedback && o.resposta === '' && o.digitandoMs === 0)

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

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nworkflow: tudo certo')
process.exit(falhas ? 1 : 0)
