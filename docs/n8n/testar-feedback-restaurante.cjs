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
const nomes = new Set(nos.map((n) => n.name))
ok('nomes únicos', nomes.size === nos.length)
const entradas = new Map()
for (const [de, tipos] of Object.entries(wf.connections)) {
  ok(`origem existe: ${de}`, nomes.has(de))
  for (const saidas of Object.values(tipos)) for (const lista of saidas) for (const c of lista) {
    ok(`destino existe: ${de} -> ${c.node}`, nomes.has(c.node))
    entradas.set(c.node, (entradas.get(c.node) || 0) + 1)
  }
}
for (const n of nos) {
  if (n.type === 'n8n-nodes-base.webhook') continue
  ok(`"${n.name}" tem entrada`, (entradas.get(n.name) || 0) > 0 || Object.values(wf.connections[n.name] || {}).length > 0)
}
// Referências $('Nome') apontam para nós que existem; nada de .item (ambíguo)
const texto = JSON.stringify(wf)
for (const m of texto.matchAll(/\$\('([^']+)'\)/g)) ok(`referência existe: ${m[1]}`, nomes.has(m[1]))
for (const m of texto.matchAll(/\$\(\\?"([^"\\]+)\\?"\)/g)) ok(`referência existe: ${m[1]}`, nomes.has(m[1]))
ok('nenhum .item (pareamento ambíguo)', !/\$\('[^']+'\)\.item/.test(texto))
// Delete do buffer com DOIS filtros precisa ser "allFilters" (senão apaga por OU)
for (const n of nos.filter((n) => n.parameters.operation === 'delete')) {
  ok(`delete "${n.name}" usa allFilters`, n.parameters.matchType === 'allFilters')
}
const wh = nos.find((n) => n.type === 'n8n-nodes-base.webhook')
ok('webhook continua em /easyfeed (POST)', wh.parameters.path === 'easyfeed' && wh.parameters.httpMethod === 'POST')
ok('espera de 20 s explícita', nos.find((n) => n.name === 'Espera 20 segundos').parameters.amount === 20)
ok('restaurante é achado pelo token', JSON.stringify(nos.find((n) => n.name === 'Acha o restaurante').parameters).includes('whatsapp_token'))

// ── 2. Lógica dos nós Code ───────────────────────────────────────────────────
const codigoDe = (nome) => nos.find((n) => n.name === nome).parameters.jsCode
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
  const f = new Function('$input', '$', codigoDe(nome))
  return f($input, $)
}

// Eventos reais da uazapi (campos conferidos em mensagens_whatsapp.payload)
const base = (msg, extra = {}) => ({
  body: {
    EventType: 'messages', BaseUrl: 'https://iamai-ia.uazapi.com', token: 'tok-123', instanceName: 'Camelo',
    chat: { owner: '5511952138636', wa_chatid: '5511932903005@s.whatsapp.net', name: 'Raver Brandi' },
    message: {
      chatid: '5511932903005@s.whatsapp.net', sender: '1117@lid', sender_pn: '5511932903005@s.whatsapp.net',
      messageid: '3EB0ABC', fromMe: false, isGroup: false, wasSentByApi: false, edited: '',
      messageTimestamp: 1791033407000, ...msg,
    },
    ...extra,
  },
})
const texto1 = base({ type: 'text', messageType: 'Conversation', text: 'A comida estava fria', content: 'A comida estava fria' })
let r = roda('Lê a mensagem', texto1)
ok('texto: entra', r.length === 1 && r[0].json.tipo === 'texto' && r[0].json.texto === 'A comida estava fria')
ok('texto: telefone e token', r[0].json.telefone === '5511932903005' && r[0].json.token === 'tok-123' && r[0].json.baseUrl === 'https://iamai-ia.uazapi.com')
const lido = r[0].json
ok('texto estendido entra', roda('Lê a mensagem', base({ type: 'text', messageType: 'ExtendedTextMessage', text: 'olha https://x.com' })).length === 1)
ok('áudio (ptt) entra como audio', roda('Lê a mensagem', base({ type: 'media', messageType: 'AudioMessage', mediaType: 'ptt', text: '', content: { PTT: true } }))[0]?.json.tipo === 'audio')
ok('foto com legenda entra (a legenda)', roda('Lê a mensagem', base({ type: 'media', messageType: 'ImageMessage', mediaType: 'image', text: 'veio frio', content: {} }))[0]?.json.texto === 'veio frio')
ok('foto sem legenda: ignora', roda('Lê a mensagem', base({ type: 'media', messageType: 'ImageMessage', mediaType: 'image', text: '', content: {} })).length === 0)
ok('figurinha: ignora', roda('Lê a mensagem', base({ type: 'media', messageType: 'StickerMessage', mediaType: 'sticker', text: '' })).length === 0)
ok('reação: ignora', roda('Lê a mensagem', base({ type: 'reaction', messageType: 'ReactionMessage', text: '👍' })).length === 0)
ok('documento: ignora', roda('Lê a mensagem', base({ type: 'media', messageType: 'DocumentMessage', mediaType: 'document', text: '' })).length === 0)
ok('grupo: ignora', roda('Lê a mensagem', base({ type: 'text', messageType: 'Conversation', text: 'oi', isGroup: true, chatid: '1203@g.us' })).length === 0)
ok('do próprio número: ignora', roda('Lê a mensagem', base({ type: 'text', messageType: 'Conversation', text: 'oi', fromMe: true })).length === 0)
ok('enviada pela API: ignora', roda('Lê a mensagem', base({ type: 'text', messageType: 'Conversation', text: 'oi', wasSentByApi: true })).length === 0)
ok('edição: ignora', roda('Lê a mensagem', base({ type: 'text', messageType: 'Conversation', text: 'olá', edited: '3EB0OLD' })).length === 0)
ok('outro evento: ignora', roda('Lê a mensagem', { body: { ...texto1.body, EventType: 'messages_update' } }).length === 0)
ok('sem token: ignora', roda('Lê a mensagem', { body: { ...texto1.body, token: '' } }).length === 0)
ok('texto vazio: ignora', roda('Lê a mensagem', base({ type: 'text', messageType: 'Conversation', text: '   ' })).length === 0)
ok('corpo vazio não quebra', roda('Lê a mensagem', {}).length === 0)
const lid = base({ type: 'text', messageType: 'Conversation', text: 'boa', chatid: '1117@lid', sender_pn: '5511932903005@s.whatsapp.net' })
lid.body.chat.wa_chatid = '1117@lid'
ok('conversa @lid usa o sender_pn', roda('Lê a mensagem', lid)[0]?.json.telefone === '5511932903005')

// Restaurante ativo?
const rest = { id: 11, assinatura_status: 'ativa', onboarding_completo: true, excluida_em: null, whatsapp_token: 'tok-123', telefone_contato: '5511987654321' }
r = roda('Restaurante ativo?', rest, { 'Lê a mensagem': lido })
ok('ativo: segue com id, token e contato', r.length === 1 && r[0].json.restauranteId === 11 && r[0].json.telefoneContato === '5511987654321' && r[0].json.texto === 'A comida estava fria')
const ativo = r[0].json
ok('não achado ({}): para', roda('Restaurante ativo?', {}, { 'Lê a mensagem': lido }).length === 0)
ok('excluída: para', roda('Restaurante ativo?', { ...rest, excluida_em: '2026-10-01' }, { 'Lê a mensagem': lido }).length === 0)
ok('sem onboarding: para', roda('Restaurante ativo?', { ...rest, onboarding_completo: false }, { 'Lê a mensagem': lido }).length === 0)
ok('assinatura não ativa: para', roda('Restaurante ativo?', { ...rest, assinatura_status: 'sem_assinatura' }, { 'Lê a mensagem': lido }).length === 0)
ok('sem contato: null', roda('Restaurante ativo?', { ...rest, telefone_contato: null }, { 'Lê a mensagem': lido })[0].json.telefoneContato === null)

// Texto do áudio
ok('áudio transcrito vira texto', roda('Texto do áudio', { text: ' A pizza estava ótima ' }, { 'Restaurante ativo?': ativo })[0].json.texto === 'A pizza estava ótima')
ok('transcrição vazia/erro: para', roda('Texto do áudio', { error: 'falhou' }, { 'Restaurante ativo?': ativo }).length === 0)

// Sou a última mensagem?
const rid = '11:5511932903005'
const linha = (id, txt, mid) => ({ id, remote_id: rid, message_content: txt, message_data: { messageid: mid }, created_at: '2026-10-04T10:00:00Z' })
let meu = { id: 7, remote_id: rid }
r = roda('Sou a última mensagem?', [linha(5, 'oi', 'a'), linha(6, 'a comida estava fria', 'b'), linha(7, 'e o garçom foi ótimo', 'c')], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })
ok('última: junta tudo em ordem', r.length === 1 && r[0].json.textoCompleto === 'oi\na comida estava fria\ne o garçom foi ótimo' && r[0].json.ateId === 7)
r = roda('Sou a última mensagem?', [linha(7, 'x', 'c'), linha(5, 'y', 'a'), linha(9, 'z', 'd')], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })
ok('não é a última: para', r.length === 0)
r = roda('Sou a última mensagem?', [linha(6, 'a comida estava fria', 'b'), linha(7, 'a comida estava fria', 'b')], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })
ok('evento repetido da uazapi conta uma vez', r[0]?.json.textoCompleto === 'a comida estava fria')
r = roda('Sou a última mensagem?', [{ ...linha(6, 'oi', 'b'), message_data: '{"messageid":"b"}' }, { ...linha(7, 'oi', 'b'), message_data: '{"messageid":"b"}' }], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })
ok('message_data como texto também tira a repetida', r[0]?.json.textoCompleto === 'oi')
ok('buffer vazio ({}): para', roda('Sou a última mensagem?', [{}], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo }).length === 0)
const juntada = roda('Sou a última mensagem?', [linha(7, 'A comida estava fria. Vocês abrem domingo?', 'c')], { 'Guarda no buffer': meu, 'Restaurante ativo?': ativo })[0].json

// Monta a resposta
const ia = (obj) => ({ text: typeof obj === 'string' ? obj : JSON.stringify(obj) })
const P = (s, c = 'Comida', t = 'texto') => ({ feedback_original: t, categoria: c, sentimento: s, resumo: 'resumo' })
const monta = (obj, b = juntada) => roda('Monta a resposta', ia(obj), { 'Sou a última mensagem?': b })[0].json
let o = monta({ tipo: 'feedback', tem_pergunta_restaurante: false, assunto_pergunta: '', pontos: [P('Positivo')] })
ok('positivo: grava e agradece', o.ehFeedback && o.sentimentoGeral === 'Positivo' && o.resposta.length > 20 && !o.resposta.includes('pergunta'))
o = monta({ tipo: 'feedback', pontos: [P('Negativo')] })
ok('negativo', o.sentimentoGeral === 'Negativo')
o = monta({ tipo: 'feedback', pontos: [P('Positivo'), P('Negativo', 'Atendimento')] })
ok('positivo e negativo', o.sentimentoGeral === 'Positivo e Negativo')
o = monta({ tipo: 'feedback', pontos: [P('Neutro', 'Ambiente')] })
ok('neutro: grava e agradece', o.ehFeedback && o.sentimentoGeral === 'Neutro' && o.resposta.length > 20)
o = monta({ tipo: 'feedback', pontos: [P('Sugestão', 'Cardápio/Variedade')] })
ok('sugestão: grava e agradece a sugestão', o.sentimentoGeral === 'Sugestão' && /sugest/i.test(o.resposta))
o = monta({ tipo: 'feedback', pontos: [P('Positivo'), P('sugestao', 'Cardápio/Variedade')] })
ok('positivo + sugestão: geral Positivo e cita a sugestão', o.sentimentoGeral === 'Positivo' && o.resposta.endsWith('Anotamos também a sua sugestão.') && o.pontos[1].sentimento === 'Sugestão')
o = monta({ tipo: 'feedback', tem_pergunta_restaurante: true, assunto_pergunta: 'o horário de funcionamento.', pontos: [P('Negativo')] })
ok('feedback + pergunta: agradece e encaminha com o contato', o.ehFeedback && o.resposta.includes('\n\nSobre a sua pergunta') && o.resposta.includes('(11) 98765-4321') && o.resposta.includes('https://wa.me/5511987654321') && o.resposta.includes('o horário de funcionamento por aqui'))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] })
ok('só pergunta: não grava, encaminha', !o.ehFeedback && o.resposta.startsWith('Este número é só para receber a sua opinião') && o.resposta.includes('reservas') && o.resposta.includes('wa.me/5511987654321'))
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: '', pontos: [] }, { ...juntada, telefoneContato: null })
ok('pergunta sem contato configurado: só avisa', o.resposta === 'Este número é só para receber a sua opinião sobre a experiência no restaurante, então não consigo te ajudar com esse assunto por aqui.')
o = monta({ tipo: 'pergunta_restaurante', tem_pergunta_restaurante: true, assunto_pergunta: 'reservas', pontos: [] }, { ...juntada, telefoneContato: '11987654321' })
ok('contato sem o 55 também funciona', o.resposta.includes('https://wa.me/5511987654321') && o.resposta.includes('(11) 98765-4321'))
o = monta({ tipo: 'outro', tem_pergunta_restaurante: false, assunto_pergunta: '', pontos: [] })
ok('saudação/assunto fora: não responde nem grava', !o.ehFeedback && o.resposta === '')
o = monta({ tipo: 'feedback', pontos: [] })
ok('"feedback" sem ponto (só informação incidental): silêncio', !o.ehFeedback && o.resposta === '')
o = monta({ tipo: 'feedback', pontos: [P('Positivo', 'Decoração'), P('Excelente'), { categoria: 'Comida', sentimento: 'Positivo' }, P('Positivo e Negativo', 'música/som')] })
ok('categoria inventada vira Outros', o.pontos[0].categoria === 'Outros')
ok('sentimento fora da lista é descartado', o.pontos.length === 2)
ok('ponto sem texto é descartado; misto num ponto vira Negativo; categoria sem maiúscula acha a certa', o.pontos[1].sentimento === 'Negativo' && o.pontos[1].categoria === 'Música/Som')
o = roda('Monta a resposta', { text: '```json\n{"tipo":"feedback","pontos":[{"feedback_original":"ok","categoria":"Comida","sentimento":"Positivo","resumo":"ok"}]}\n```' }, { 'Sou a última mensagem?': juntada })[0].json
ok('aceita ```json em volta', o.ehFeedback)
o = roda('Monta a resposta', { text: '[{"feedback_original":"ok","categoria":"Comida","sentimento":"Negativo","resumo":"ok"}]' }, { 'Sou a última mensagem?': juntada })[0].json
ok('aceita o formato antigo (lista)', o.ehFeedback && o.sentimentoGeral === 'Negativo')
let erro = null
try { roda('Monta a resposta', { text: 'desculpe, não entendi' }, { 'Sou a última mensagem?': juntada }) } catch (e) { erro = e.message }
ok('resposta sem JSON vira erro visível (não grava lixo)', !!erro && erro.includes('fora do formato'))
ok('texto longo é cortado', monta({ tipo: 'feedback', pontos: [P('Positivo', 'Comida', 'x'.repeat(5000))] }).pontos[0].texto_original.length === 1000)

// Separa os pontos
const montado = monta({ tipo: 'feedback', pontos: [P('Positivo'), P('Sugestão', 'Bebidas')] })
r = roda('Separa os pontos', { id: 'uuid-1' }, { 'Monta a resposta': montado })
ok('um item por ponto, ligado à origem', r.length === 2 && r.every((i) => i.json.origem_id === 'uuid-1' && i.json.restaurante_id === 11 && i.json.telefone_cliente === '5511932903005'))
erro = null
try { roda('Separa os pontos', {}, { 'Monta a resposta': montado }) } catch (e) { erro = e.message }
ok('sem id da origem: erro visível', !!erro)

// Segue para a resposta / Segue com a mensagem
ok('resposta sai uma vez só', roda('Segue para a resposta', [{ id: 1 }, { id: 2 }], { 'Monta a resposta': montado }).length === 1)
ok('depois do delete segue com um item', roda('Segue com a mensagem', [{ id: 1 }, { id: 2 }], { 'Sou a última mensagem?': juntada }).length === 1)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nworkflow: tudo certo')
process.exit(falhas ? 1 : 0)
