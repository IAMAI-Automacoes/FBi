import {
  previaMensagem,
  formatarTelefone,
  iniciais,
  duracao,
  horarioLista,
  rotuloDia,
  soEmoji,
  trechosFormatados,
  linksDoTexto,
  agregarReacoes,
  detectarAparelho,
  textoApresentacao,
  linkEnviarMensagem,
  nomeConversa,
  normalizarBusca,
  pontuarBusca,
  regexDestaque,
  trechoComTermo,
} from '../whatsapp/formatacao.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  if (cond) console.log(`PASS  ${nome}`)
  else { falhas++; console.error(`FAIL  ${nome}`, detalhe ?? '') }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// ── Prévia (valores reais do teste de 30/09) ─────────────────────────────────
{
  ok('texto', previaMensagem({ tipo: 'text', texto: 'oi' }) === 'oi')
  ok('foto sem legenda', previaMensagem({ tipo: 'image', texto: null }) === '📷 Foto')
  ok('foto com legenda', previaMensagem({ tipo: 'image', texto: 'olha' }) === '📷 olha')
  ok('áudio', previaMensagem({ tipo: 'audio', texto: null }) === '🎤 Áudio')
  ok('pdf usa o nome do arquivo', previaMensagem({ tipo: 'document', texto: null, midia_nome: 'Rec de It de Quimica.pdf' }) === '📄 Rec de It de Quimica.pdf')
  ok('figurinha', previaMensagem({ tipo: 'sticker', texto: null }) === 'Figurinha')
  ok('gif', previaMensagem({ tipo: 'gif', texto: null }) === 'GIF')
  ok('reação do cliente', previaMensagem({ tipo: 'reaction', texto: null, reacao: '👍' }) === 'Reagiu 👍')
  ok('reação removida', previaMensagem({ tipo: 'reaction', texto: null, reacao: null }) === 'Removeu uma reação')
  ok('apagada pelo cliente', previaMensagem({ tipo: 'text', texto: 'tudo bem?', status: 'DELETED' }) === 'Mensagem apagada')
  ok('apagada por mim', previaMensagem({ tipo: 'text', texto: 'x', status: 'DELETED', de_mim: true }) === 'Você apagou esta mensagem')
  ok('tipo desconhecido', previaMensagem({ tipo: 'outro', texto: null }) === 'Mensagem não suportada')
}

// ── Telefone, nome, iniciais, duração ────────────────────────────────────────
{
  ok('celular BR', formatarTelefone('5511932903005') === '+55 11 93290-3005', formatarTelefone('5511932903005'))
  ok('fixo BR', formatarTelefone('551133334444') === '+55 11 3333-4444', formatarTelefone('551133334444'))
  ok('estrangeiro', formatarTelefone('14155550100') === '+14155550100')
  ok('vazio', formatarTelefone(null) === '')
  ok('nome da conversa', nomeConversa({ nome_exibicao: 'Raver Brandi', telefone: '5511932903005', chat_id: 'x' }) === 'Raver Brandi')
  ok('sem nome usa telefone', nomeConversa({ nome_exibicao: null, telefone: '5511932903005', chat_id: 'x' }) === '+55 11 93290-3005')
  ok('iniciais', iniciais('Raver Brandi') === 'RB')
  ok('iniciais com emoji', iniciais('Promos Clube do Homem | 40') === 'P4')
  ok('iniciais vazio', iniciais('') === '?')
  ok('duração', duracao(12) === '0:12' && duracao(75) === '1:15' && duracao(3725) === '1:02:05')
  ok('duração inválida', duracao(Number.NaN) === '0:00')
}

// ── Datas (relativas a um "agora" fixo) ──────────────────────────────────────
{
  const agora = new Date(2026, 9, 1, 15, 0) // 01/10/2026 15:00, quinta-feira
  const em = (d: number, h = 10, m = 5) => new Date(2026, 9, d, h, m).toISOString()
  ok('lista: hoje mostra hora', horarioLista(em(1), agora) === '10:05')
  ok('lista: ontem', horarioLista(new Date(2026, 8, 30, 9).toISOString(), agora) === 'Ontem')
  ok('lista: semana mostra o dia', horarioLista(new Date(2026, 8, 28, 9).toISOString(), agora) === 'segunda-feira', horarioLista(new Date(2026, 8, 28, 9).toISOString(), agora))
  ok('lista: antigo mostra a data', horarioLista(new Date(2026, 8, 12, 9).toISOString(), agora) === '12/09/2026')
  ok('separador: hoje', rotuloDia(em(1), agora) === 'Hoje')
  ok('separador: ontem', rotuloDia(new Date(2026, 8, 30, 23, 59).toISOString(), agora) === 'Ontem')
  ok('separador: dia da semana com maiúscula', rotuloDia(new Date(2026, 8, 28).toISOString(), agora) === 'Segunda-feira')
}

// ── Só emoji ─────────────────────────────────────────────────────────────────
{
  ok('um emoji', soEmoji('😎') === 1)
  ok('três emojis', soEmoji('😎🔥👍') === 3)
  ok('quatro não conta', soEmoji('😎🔥👍🎉') === 0)
  ok('emoji com tom de pele', soEmoji('👍🏽') === 1)
  ok('família (ZWJ) é um só', soEmoji('👨‍👩‍👧') === 1)
  ok('bandeira', soEmoji('🇧🇷') === 1)
  ok('texto com emoji não conta', soEmoji('oi 😎') === 0)
  ok('número não é emoji', soEmoji('123') === 0)
  ok('vazio', soEmoji('') === 0)
}

// ── Formatação do WhatsApp ───────────────────────────────────────────────────
{
  ok('negrito', igual(trechosFormatados('isso é *muito* bom'), [
    { t: 'texto', v: 'isso é ' }, { t: 'negrito', v: 'muito' }, { t: 'texto', v: ' bom' }]), trechosFormatados('isso é *muito* bom'))
  ok('itálico e riscado', igual(trechosFormatados('_a_ ~b~'), [
    { t: 'italico', v: 'a' }, { t: 'texto', v: ' ' }, { t: 'riscado', v: 'b' }]))
  ok('marca com espaço dentro não vale', igual(trechosFormatados('* x *'), [{ t: 'texto', v: '* x *' }]))
  ok('marca colada em palavra não vale', igual(trechosFormatados('2*3*4'), [{ t: 'texto', v: '2*3*4' }]))
  ok('bloco de código', igual(trechosFormatados('```a *b*```'), [{ t: 'bloco', v: 'a *b*' }]))
  ok('link sem pontuação final', igual(trechosFormatados('veja https://x.com.'), [
    { t: 'texto', v: 'veja ' }, { t: 'link', v: 'https://x.com', href: 'https://x.com' }, { t: 'texto', v: '.' }]), trechosFormatados('veja https://x.com.'))
  ok('www vira https', linksDoTexto('acesse www.easyfeed.app')[0] === 'https://www.easyfeed.app')
  ok('texto puro', igual(trechosFormatados('PRA FICAR ESTILOSO NESSE FRIO\n'), [{ t: 'texto', v: 'PRA FICAR ESTILOSO NESSE FRIO\n' }]))
}

// ── Reações ──────────────────────────────────────────────────────────────────
{
  const base = { tipo: 'reaction', de_mim: false, remetente: null, telefone: '5511932903005' }
  const r = agregarReacoes([
    { ...base, responde_message_id: 'A', reacao: '👍', enviada_em: '2026-09-30T05:30:39.000Z' },
    { ...base, responde_message_id: 'A', reacao: '❤️', enviada_em: '2026-09-30T05:31:00.000Z' },
    { ...base, responde_message_id: 'B', reacao: '😂', enviada_em: '2026-09-30T05:31:00.000Z' },
    { ...base, responde_message_id: 'B', reacao: null, enviada_em: '2026-09-30T05:32:00.000Z' },
    { ...base, de_mim: true, responde_message_id: 'A', reacao: '🙏', enviada_em: '2026-09-30T05:33:00.000Z' },
    { ...base, tipo: 'text', responde_message_id: 'A', reacao: null, enviada_em: '2026-09-30T05:34:00.000Z' },
  ])
  ok('vale a reação mais recente de cada lado', igual(r.get('A')?.map((x) => x.emoji).sort(), ['❤️', '🙏'].sort()), r.get('A'))
  ok('reação tirada some', !r.has('B'))
  ok('resposta com citação não é reação', (r.get('A') ?? []).length === 2)
  const grupo = agregarReacoes([
    { ...base, remetente: 'Ana', responde_message_id: 'G', reacao: '👍', enviada_em: '2026-09-30T05:30:00.000Z' },
    { ...base, remetente: 'Bia', responde_message_id: 'G', reacao: '👍', enviada_em: '2026-09-30T05:31:00.000Z' },
  ])
  ok('em grupo cada pessoa conta', grupo.get('G')?.length === 2)
}

// ── Botão "Enviar mensagem" ──────────────────────────────────────────────────
{
  ok('android', detectarAparelho('Mozilla/5.0 (Linux; Android 14)') === 'android')
  ok('iphone', detectarAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') === 'iphone')
  ok('pc', detectarAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64)') === 'pc')

  const texto = textoApresentacao('Raver Brandi', 'Camelo')
  ok('apresentação com primeiro nome', texto === 'Oi, Raver! Aqui é do Camelo. Vi sua mensagem e queria conversar com você.', texto)
  ok('sem nome', textoApresentacao(null, 'Camelo').startsWith('Oi! Aqui é do Camelo.'))
  ok('nome que é telefone não vira saudação', textoApresentacao('+55 11 93290-3005', null).startsWith('Oi! Vi'))

  const tel = '5511932903005'
  const pc = linkEnviarMensagem({ telefoneCliente: tel, texto: 'oi', aparelho: 'pc', restauranteBusiness: true })
  ok('pc usa wa.me', pc === 'https://wa.me/5511932903005?text=oi', pc)
  ok('iphone usa wa.me', linkEnviarMensagem({ telefoneCliente: tel, texto: 'oi', aparelho: 'iphone', restauranteBusiness: true }).startsWith('https://wa.me/'))
  const camelo = linkEnviarMensagem({ telefoneCliente: tel, texto: 'oi', aparelho: 'android', restauranteBusiness: true })
  ok('android: restaurante no Business abre o WhatsApp comum', camelo.includes('package=com.whatsapp;') && camelo.startsWith('intent://send/?phone=5511932903005'), camelo)
  ok('android: com volta para wa.me', camelo.includes('S.browser_fallback_url=https%3A%2F%2Fwa.me%2F5511932903005'))
  ok('android: restaurante no comum abre o Business', linkEnviarMensagem({ telefoneCliente: tel, texto: 'oi', aparelho: 'android', restauranteBusiness: false }).includes('package=com.whatsapp.w4b;'))
  ok('android sem saber: wa.me', linkEnviarMensagem({ telefoneCliente: tel, texto: 'oi', aparelho: 'android', restauranteBusiness: null }).startsWith('https://wa.me/'))
}

// ── Pesquisa: exatos primeiro, depois parecidos ──────────────────────────────
{
  const msg = 'a comida estava fria e saborosa'
  ok('normaliza acento, maiúscula e pontuação', normalizarBusca('Ação, FRIA!  é') === 'acao fria e', normalizarBusca('Ação, FRIA!  é'))
  ok('exato vale 3', pontuarBusca('fria', msg) === 3)
  ok('maiúscula e pontuação vale 2', pontuarBusca('FRIA!', msg) === 2)
  ok('acento vale 2', pontuarBusca('sabórosa', msg) === 2)
  ok('letras trocadas vale 1', pontuarBusca('fira', msg) === 1)
  ok('uma letra a mais vale 1', pontuarBusca('saborossa', msg) === 1)
  ok('pedaço de palavra escrito igual vale 3', pontuarBusca('sabor', msg) === 3)
  ok('começo de palavra com erro de maiúscula vale 2', pontuarBusca('SABOR', msg) === 2)
  ok('várias palavras, todas parecidas', pontuarBusca('comdia fira', msg) === 1)
  ok('palavra de 3 letras não aceita erro', pontuarBusca('foa', msg) === 0)
  ok('sem relação vale 0', pontuarBusca('pizza', msg) === 0)
  ok('para não casa com fira', pontuarBusca('fira', 'vou para casa') === 0)
  const re = regexDestaque('FRIA!')!
  ok('realce ignora maiúscula e pontuação', 'Estava FRIA demais'.replace(re, '[$1]') === 'Estava [FRIA] demais')
  ok('realce ignora acento', 'Ação rápida'.replace(regexDestaque('acao')!, '[$1]') === '[Ação] rápida')
  ok('realce de duas palavras atravessa pontuação', 'comida, fria'.replace(regexDestaque('comida fria')!, '[$1]') === '[comida, fria]')
  ok('termo curto não realça', regexDestaque('a') === null)
}

// ── Trecho do resultado de pesquisa ──────────────────────────────────────────
{
  const longo = 'CHEGA DE REPETIR CAMISETA\n\nKit 5 Camisetas Básicas Algodão Premium (P ao GG)\n\nDe R$ 199 Por R$ 89\n\nLoja Oficial no ML'
  const t = trechoComTermo(longo, 'básicas')
  ok('trecho mostra o termo', t.includes('Básicas'), t)
  ok('trecho é uma linha só', !t.includes('\n'))
  ok('termo no começo não corta', trechoComTermo('oi tudo bem', 'oi') === 'oi tudo bem')
  ok('sem o termo: começo do texto', trechoComTermo('a comida estava fria', 'fira') === 'a comida estava fria')
  ok('trecho cortado no meio ganha reticências', trechoComTermo('x'.repeat(100) + ' alvo ' + 'y'.repeat(200), 'alvo').startsWith('…'))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
