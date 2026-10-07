// Testa o workflow do n8n "EasyFeed - Recuperação de senha" (docs/n8n/recuperar-senha.json):
// estrutura + o nó Code que monta o e-mail, rodando o MESMO código com um $input de mentira.
//   node docs/n8n/testar-recuperar-senha.cjs docs/n8n/recuperar-senha.json
const fs = require('fs')
const wf = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))

let falhas = 0
const ok = (nome, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${!cond && extra ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const nos = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
const no = (nome) => nos.find((n) => n.name === nome)

// ── Estrutura ────────────────────────────────────────────────────────────────
const wh = no('Recebe pedido')
ok('webhook POST /easyfeed-recuperar-senha', wh.parameters.httpMethod === 'POST' && wh.parameters.path === 'easyfeed-recuperar-senha')
ok('webhook exige o segredo (Header Auth)', wh.parameters.authentication === 'headerAuth' && !!wh.credentials?.httpHeaderAuth)
ok('webhook responde pelo nó de resposta', wh.parameters.responseMode === 'responseNode')
const envio = no('Envia o e-mail')
ok('remetente nao-responda@easyfeed.com.br', envio.parameters.fromEmail === 'EasyFeed <nao-responda@easyfeed.com.br>')
ok('e-mail com HTML e texto', envio.parameters.emailFormat === 'both' && envio.parameters.html.includes('$json.html') && envio.parameters.text.includes('$json.texto'))
ok('sem a assinatura "enviado pelo n8n"', envio.parameters.options.appendAttribution === false)
ok('SMTP da Hostinger como credencial', !!envio.credentials?.smtp)
ok('falha no envio vai para a resposta de erro', envio.onError === 'continueErrorOutput'
  && wf.connections['Envia o e-mail'].main[0][0].node === 'Responde enviado'
  && wf.connections['Envia o e-mail'].main[1][0].node === 'Responde falha')
ok('respostas 200 e 502', no('Responde enviado').parameters.options.responseCode === 200 && no('Responde falha').parameters.options.responseCode === 502)
for (const [de, tipos] of Object.entries(wf.connections)) {
  for (const saidas of Object.values(tipos)) for (const lista of saidas) for (const c of lista) ok(`ligação existe: ${de} -> ${c.node}`, !!no(c.node))
}

// ── Código que monta o e-mail ────────────────────────────────────────────────
const codigo = no('Monta o e-mail').parameters.jsCode
const roda = (body) => new Function('$input', codigo)({ first: () => ({ json: { body } }) })
const LINK = 'https://lixrcruilisncfhfhndo.supabase.co/auth/v1/verify?token=abc123&type=recovery&redirect_to=https://easyfeed.com.br/recuperar-senha'

let r = roda({ email: ' Raver@Exemplo.com ', nome: 'Raver Brandi', link: LINK, validadeMinutos: 60 })[0].json
ok('destinatário normalizado', r.para === 'raver@exemplo.com')
ok('assunto', r.assunto === 'Crie sua nova senha do EasyFeed')
ok('chama pelo primeiro nome', r.html.includes('Oi, Raver!') && r.texto.startsWith('Oi, Raver!'))
ok('botão com o link (& escapado no HTML)', r.html.includes('href="' + LINK.replace(/&/g, '&amp;') + '"') && r.html.includes('Criar nova senha'))
ok('texto puro com o link inteiro', r.texto.includes(LINK))
ok('validade em horas', r.html.includes('vale por 1 hora') && r.texto.includes('vale por 1 hora'))
ok('nada sobrando de variável', !/\$\{|undefined|null/.test(r.html + r.texto))
ok('sem travessão nem cara de IA', !/—|experiência|agradecemos|prezado/i.test(r.html + r.texto))

r = roda({ email: 'a@b.com', nome: '<script>alert(1)</script>', link: LINK })[0].json
ok('nome com HTML é escapado', !r.html.includes('<script>') && r.html.includes('&lt;script&gt;'))
r = roda({ email: 'a@b.com', link: LINK })[0].json
ok('sem nome: só "Oi!"', r.html.includes('>Oi!<') && r.texto.startsWith('Oi!'))
r = roda({ email: 'a@b.com', link: LINK, validadeMinutos: 30 })[0].json
ok('validade em minutos', r.texto.includes('vale por 30 minutos'))

// EasyFeed Influencers: mesmo webhook, outro texto.
r = roda({ email: 'ana@influencer.com', nome: 'Ana Souza', link: LINK, validadeMinutos: 60, tipo: 'acesso_influencer' })[0].json
ok('influencer: assunto próprio', r.assunto === 'Crie sua senha do EasyFeed Influencers')
ok('influencer: texto e botão de criar a senha', r.html.includes('Para criar sua senha do EasyFeed Influencers') && r.html.includes('>Criar minha senha<') && r.texto.includes('EasyFeed Influencers'))
ok('influencer: chama pelo primeiro nome e manda o link', r.texto.startsWith('Oi, Ana!') && r.texto.includes(LINK))
ok('influencer: nada do texto de "trocar a senha"', !/trocar a senha|continua a mesma/.test(r.html + r.texto))
ok('sem tipo: continua o e-mail da recuperação de senha', roda({ email: 'a@b.com', link: LINK })[0].json.assunto === 'Crie sua nova senha do EasyFeed')
ok('tipo desconhecido: cai no da recuperação de senha', roda({ email: 'a@b.com', link: LINK, tipo: 'outro' })[0].json.assunto === 'Crie sua nova senha do EasyFeed')

let erro = null
try { roda({ email: 'a@b.com', link: 'https://site-falso.com/roubar?x=1' }) } catch (e) { erro = e.message }
ok('link que não é do Supabase do EasyFeed é recusado', !!erro && erro.includes('Link'))
erro = null
try { roda({ email: 'nao-e-email', link: LINK }) } catch (e) { erro = e.message }
ok('e-mail inválido é recusado', !!erro)
erro = null
try { roda({}) } catch (e) { erro = e.message }
ok('corpo vazio é recusado', !!erro)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nrecuperação de senha: tudo certo')
process.exit(falhas ? 1 : 0)
