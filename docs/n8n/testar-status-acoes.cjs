// Testa o workflow do n8n "Status Ações" (docs/n8n/status-acoes.json): o aviso
// do PARAR depois das atualizações. Roda as MESMAS expressões dos nós com dados
// de mentira.
//   node docs/n8n/testar-status-acoes.cjs docs/n8n/status-acoes.json
const fs = require('fs')
const wf = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))

let falhas = 0
const ok = (nome, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${!cond && extra ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const nos = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
const no = (nome) => nos.find((n) => n.name === nome)
const destinos = (de, saida = 0) => (wf.connections[de]?.main?.[saida] ?? []).map((c) => c.node)

// ── Estrutura ────────────────────────────────────────────────────────────────
for (const nome of ['Manda o aviso PARAR?', 'Espera antes do aviso', 'Envia o aviso PARAR', 'Marca o aviso PARAR']) ok(`nó existe: ${nome}`, !!no(nome))
ok('"Dados Cliente" leva aviso_parar_em', no('Dados Cliente').parameters.assignments.assignments.some((a) => a.name === 'aviso_parar_em'))
ok('quem pediu PARAR continua fora (Pegar Clientes: opt_out_em vazio)', no('Pegar Clientes').parameters.filters.conditions.some((c) => c.keyName === 'opt_out_em' && c.condition === 'is' && c.keyValue === 'null'))
ok('depois de marcar o cliente, decide o aviso', destinos('Marcar cliente').join() === 'Manda o aviso PARAR?')
ok('precisa do aviso: espera, envia e grava', destinos('Manda o aviso PARAR?', 0).join() === 'Espera antes do aviso'
  && destinos('Espera antes do aviso').join() === 'Envia o aviso PARAR'
  && destinos('Envia o aviso PARAR', 0).join() === 'Marca o aviso PARAR')
ok('não precisa do aviso: segue para o próximo cliente (Wait)', destinos('Manda o aviso PARAR?', 1).join() === 'Wait')
ok('falhou o envio do aviso: não grava e segue (Wait)', no('Envia o aviso PARAR').onError === 'continueErrorOutput' && destinos('Envia o aviso PARAR', 1).join() === 'Wait')
ok('gravou o aviso: segue (Wait)', destinos('Marca o aviso PARAR').join() === 'Wait')
ok('grava a data em contatos.aviso_parar_em do cliente certo', no('Marca o aviso PARAR').parameters.tableId === 'contatos'
  && no('Marca o aviso PARAR').parameters.fieldsUi.fieldValues[0].fieldId === 'aviso_parar_em'
  && no('Marca o aviso PARAR').parameters.filters.conditions[0].keyValue.includes('contato_id'))
ok('o aviso só sai depois de uma atualização enviada (caminho de sucesso)', destinos('Enviar Mensagem', 0).join() === 'Gravar mensagem'
  && destinos('Gravar mensagem').join() === 'Uma alteração por item' && destinos('Marcar alterações').join() === 'Marcar cliente')
for (const [de, tipos] of Object.entries(wf.connections)) {
  for (const saidas of Object.values(tipos)) for (const lista of saidas) for (const c of lista) ok(`ligação existe: ${de} -> ${c.node}`, !!no(c.node))
}

// ── As expressões ────────────────────────────────────────────────────────────
const expr = (s) => s.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
const dia = 24 * 60 * 60 * 1000
const precisa = (avisoParaEm) => {
  const $ = (nome) => ({ first: () => ({ json: nome === 'Dados Cliente' ? { aviso_parar_em: avisoParaEm } : {} }) })
  const condicao = no('Manda o aviso PARAR?').parameters.conditions.conditions[0].leftValue
  return new Function('$', `return (${expr(condicao)})`)($)
}
ok('primeira atualização (nunca recebeu o aviso): manda', precisa('') === true)
ok('aviso há 3 dias: não manda', precisa(new Date(Date.now() - 3 * dia).toISOString()) === false)
ok('aviso há 13 dias: não manda', precisa(new Date(Date.now() - 13 * dia).toISOString()) === false)
ok('aviso há 15 dias: manda de novo', precisa(new Date(Date.now() - 15 * dia).toISOString()) === true)

const corpo = () => {
  const $ = (nome) => ({ first: () => ({ json: nome === 'Code in JavaScript' ? { telefone: '5511999998888' } : {} }) })
  return JSON.parse(new Function('$', `return (${expr(no('Envia o aviso PARAR').parameters.jsonBody)})`)($))
}
const textos = new Set()
const esperas = new Set()
for (let i = 0; i < 60; i++) {
  const b = corpo()
  textos.add(b.text)
  esperas.add(b.delay)
  if (b.number !== '5511999998888' || !(b.delay >= 3500 && b.delay <= 6500) || b.readchat !== true || b.readmessages !== true) ok('corpo do envio', false, JSON.stringify(b))
}
ok('aviso: número do cliente, "digitando..." sorteado (3,5 a 6,5 s) e mensagens lidas', esperas.size > 10)
ok('sorteia entre os textos prontos', textos.size >= 2, [...textos].join(' | '))
ok('todo texto pede para responder PARAR, sem travessão nem emoji', [...textos].every((t) => /PARAR/.test(t) && !/—/.test(t) && !/\p{Extended_Pictographic}/u.test(t)))

// A atualização: como gente
const envio = no('Enviar Mensagem')
const corpoAtualizacao = (output) => {
  const $ = (nome) => ({ first: () => ({ json: nome === 'Code in JavaScript' ? { telefone: '5511999998888' } : {} }) })
  return JSON.parse(new Function('$', '$json', `return (${expr(envio.parameters.jsonBody)})`)($, { output }))
}
const longo = 'Oi! Lembra que você comentou da demora no atendimento? A gente contratou mais um garçom pro fim de semana e mudou a ordem da cozinha. Volta pra ver!'
const atualizacoes = Array.from({ length: 60 }, () => corpoAtualizacao(longo))
ok('atualização: o texto da IA para o número do cliente', atualizacoes.every((b) => b.number === '5511999998888' && b.text === longo))
ok('atualização: "digitando..." sorteado pelo tamanho do texto (8 a 25 s)', atualizacoes.every((b) => b.delay >= 8000 && b.delay <= 25000) && new Set(atualizacoes.map((b) => b.delay)).size > 20)
ok('atualização curta: pelo menos 8 s; muito longa: no máximo 25 s', corpoAtualizacao('Oi!').delay >= 8000 && corpoAtualizacao('x'.repeat(5000)).delay === 25000)
ok('atualização: mensagens do cliente lidas', atualizacoes.every((b) => b.readchat === true && b.readmessages === true))
ok('atualização: timeout maior que o "digitando..." e sem retry (repetir duplicaria)', envio.parameters.options.timeout > 25000 && !envio.retryOnFail && !envio.parameters.bodyParameters)
ok('entre um cliente e outro: Wait sorteado de 20 a 40 s', no('Wait').parameters.amount === '={{ Math.floor(Math.random() * 21) + 20 }}')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nstatus ações: tudo certo')
process.exit(falhas ? 1 : 0)
