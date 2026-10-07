// Testes da Salvy que rodam sem chave nenhuma e sem internet (estão no npm test):
//   node --experimental-strip-types supabase/functions/_shared/__testes__/salvy.teste.ts
//
// Assinatura do webhook, leitura do código do WhatsApp, o cliente da API (com
// um servidor de mentira) e o handler da função salvy-webhook (com um banco de
// mentira).

import { criarClienteSalvy, ErroSalvy, ambienteDaChave } from '../salvy.ts'
import { codigoDoWhatsapp } from '../salvy-codigo.ts'
import { assinar, lerSmsRecebido, verificarAssinatura } from '../salvy-webhook.ts'
import { criarHandler, type LinhaSmsSalvy } from '../../salvy-webhook/handler.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', detalhe)
  }
}

// ── 1. Assinatura do webhook ────────────────────────────────────────────────

// Exemplo da documentação da Svix (verificação manual): confere a conta contra
// uma referência de fora, não só contra o nosso próprio `assinar`.
{
  const segredo = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek'
  const ts = '1614265330'
  const corpo = '{"test": 2432232314}'
  const esperada = 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
  ok('exemplo oficial da Svix: mesma assinatura', (await assinar(segredo, id, ts, corpo)) === esperada)
  const r = await verificarAssinatura(segredo, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${esperada}` }, corpo, Number(ts) * 1000)
  ok('exemplo oficial da Svix: verificação aceita', r.ok)
}

const segredo = 'whsec_' + btoa('chave-de-teste-com-32-bytes-1234')
const agora = Date.UTC(2026, 9, 5, 12, 0, 0)
const tsAgora = String(Math.floor(agora / 1000))
const evento = {
  type: 'sms.received',
  timestamp: '2026-10-05T12:00:00Z',
  data: {
    id: 'sms_01',
    phoneAccountId: 'linha_01',
    virtualPhoneAccountId: 'linha_01',
    receivedAt: '2026-10-05T11:59:58Z',
    originPhoneNumber: 'WhatsApp',
    destinationPhoneNumber: '+5541963475701',
    message: 'Seu código do WhatsApp: 123-456. Não compartilhe esse código com ninguém.',
    detections: { whatsapp: { verificationCode: '123456' } },
  },
}
const corpo = JSON.stringify(evento)
const assinado = async (c = corpo, ts = tsAgora, seg = segredo, id = 'msg_01') => ({
  'svix-id': id,
  'svix-timestamp': ts,
  'svix-signature': `v1,${await assinar(seg, id, ts, c)}`,
})

ok('assinatura válida: aceita', (await verificarAssinatura(segredo, await assinado(), corpo, agora)).ok)
ok('corpo alterado: recusa', !(await verificarAssinatura(segredo, await assinado(), corpo.replace('123-456', '999-999'), agora)).ok)
ok('corpo reconvertido em JSON (espaços diferentes): recusa', !(await verificarAssinatura(segredo, await assinado(), JSON.stringify(evento, null, 2), agora)).ok)
ok('segredo errado: recusa', !(await verificarAssinatura('whsec_' + btoa('outra-chave-qualquer-com-32-byt'), await assinado(), corpo, agora)).ok)
ok('6 min atrás: recusa', !(await verificarAssinatura(segredo, await assinado(corpo, String(Number(tsAgora) - 360)), corpo, agora)).ok)
ok('6 min no futuro: recusa', !(await verificarAssinatura(segredo, await assinado(corpo, String(Number(tsAgora) + 360)), corpo, agora)).ok)
ok('4 min atrás: aceita', (await verificarAssinatura(segredo, await assinado(corpo, String(Number(tsAgora) - 240)), corpo, agora)).ok)
{
  const c = await assinado()
  const varias = { ...c, 'svix-signature': `v1,AAAAinvalidaAAAA= ${c['svix-signature']}` }
  ok('várias assinaturas (troca de chave): vale se uma bater', (await verificarAssinatura(segredo, varias, corpo, agora)).ok)
  ok('versão diferente de v1: recusa', !(await verificarAssinatura(segredo, { ...c, 'svix-signature': c['svix-signature'].replace('v1,', 'v2,') }, corpo, agora)).ok)
  const r = await verificarAssinatura(segredo, { 'svix-id': 'msg_01', 'svix-timestamp': tsAgora }, corpo, agora)
  ok('cabeçalho ausente: recusa com motivo', !r.ok && 'motivo' in r && r.motivo.includes('ausentes'))
  const h = new Headers({ 'Svix-Id': c['svix-id'], 'Svix-Timestamp': c['svix-timestamp'], 'Svix-Signature': c['svix-signature'] })
  ok('objeto Headers (como no Deno): aceita', (await verificarAssinatura(segredo, h, corpo, agora)).ok)
  ok('nomes com maiúscula num objeto simples: aceita', (await verificarAssinatura(segredo, { 'Svix-Id': c['svix-id'], 'SVIX-TIMESTAMP': c['svix-timestamp'], 'svix-signature': c['svix-signature'] }, corpo, agora)).ok)
  ok('segredo malformado: recusa sem estourar', !(await verificarAssinatura('whsec_%%%', c, corpo, agora)).ok)
}

// ── 2. Evento e código do WhatsApp ──────────────────────────────────────────

{
  const s = lerSmsRecebido(evento)
  ok('evento sms.received: lido', !!s && s.smsId === 'sms_01' && s.linhaId === 'linha_01' && s.numero === '+5541963475701' && s.origem === 'WhatsApp')
  ok('evento sms.received: código do WhatsApp', s?.codigoWhatsapp === '123456')
  ok('outro tipo de evento: null', lerSmsRecebido({ type: 'phone-account.activated', data: { phoneAccountId: 'x' } }) === null)
  ok('evento sem id: null', lerSmsRecebido({ type: 'sms.received', data: { phoneAccountId: 'x' } }) === null)
  ok('lixo: null', lerSmsRecebido('oi') === null && lerSmsRecebido(null) === null)
  ok('campo antigo virtualPhoneAccountId ainda serve', lerSmsRecebido({ ...evento, data: { ...evento.data, phoneAccountId: undefined } })?.linhaId === 'linha_01')
}

ok('código vem da detecção da Salvy', codigoDoWhatsapp({ message: 'qualquer coisa', detections: { whatsapp: { verificationCode: '654321' } } }) === '654321')
ok('detecção com hífen vira só dígitos', codigoDoWhatsapp({ message: '', detections: { whatsapp: { verificationCode: '123-456' } } }) === '123456')
ok('sem detecção: "123-456" no texto do WhatsApp', codigoDoWhatsapp({ message: 'Seu código do WhatsApp: 123-456. Não compartilhe.' }) === '123456')
ok('sem detecção: "123 456"', codigoDoWhatsapp({ message: 'WhatsApp code 123 456' }) === '123456')
ok('sem detecção: "445566" com <#>', codigoDoWhatsapp({ message: '<#> Seu código do WhatsApp Business é 445566' }) === '445566')
ok('SMS do Google: não é código do WhatsApp', codigoDoWhatsapp({ message: 'G-123456 é seu código de verificação do Google.', detections: { google: { verificationCode: '123456' } } }) === null)
ok('propaganda: null', codigoDoWhatsapp({ message: 'Promoção! Ligue 4002-8922 e ganhe 50% de desconto' }) === null)
ok('propaganda citando WhatsApp sem código: null', codigoDoWhatsapp({ message: 'Chame no WhatsApp e ganhe frete grátis!' }) === null)
ok('número maior não vira código', codigoDoWhatsapp({ message: 'WhatsApp: protocolo 12345678901' }) === null)

// ── 3. Cliente da API (servidor de mentira) ─────────────────────────────────

ok('ambiente pelo prefixo', ambienteDaChave('salvy_test_x') === 'sandbox' && ambienteDaChave('salvy_prod_x') === 'producao' && ambienteDaChave('semprefixo') === 'producao')

let erro: unknown = null
try { criarClienteSalvy({ chave: 'salvy_prod_abc' }) } catch (e) { erro = e }
ok('chave de produção: recusada sem permissão explícita', erro instanceof Error && erro.message.includes('produção'))
erro = null
try { criarClienteSalvy({ chave: 'chave_antiga_sem_prefixo' }) } catch (e) { erro = e }
ok('chave antiga sem prefixo: tratada como produção e recusada', erro instanceof Error)
erro = null
try { criarClienteSalvy({ chave: '  ' }) } catch (e) { erro = e }
ok('chave vazia: recusada', erro instanceof Error)

type Chamada = { url: string; init: RequestInit }
function servidor(respostas: Array<{ status: number; corpo?: unknown; cabecalhos?: Record<string, string> }>) {
  const chamadas: Chamada[] = []
  const esperas: number[] = []
  const fetchFalso = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init })
    const r = respostas.shift() ?? { status: 500, corpo: { code: 'unknown', message: 'acabou' } }
    return new Response(r.status === 204 ? null : JSON.stringify(r.corpo ?? {}), { status: r.status, headers: r.cabecalhos })
  }) as unknown as typeof fetch
  return { chamadas, esperas, fetch: fetchFalso, esperar: async (ms: number) => { esperas.push(ms) } }
}

{
  const s = servidor([{ status: 201, corpo: { id: 'linha_01', phoneNumber: '+5541963475701', status: 'available' } }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  const linha = await c.criarNumeroVirtual({ ddd: 41, nome: 'EasyFeed - teste', chaveIdempotencia: 'k-1' })
  const h = s.chamadas[0].init.headers as Record<string, string>
  ok('criar número: POST no endereço certo', s.chamadas[0].url === 'https://api.salvy.com.br/api/v3/phone-accounts/mobile-did' && s.chamadas[0].init.method === 'POST')
  ok('criar número: chave e idempotência nos cabeçalhos', h.Authorization === 'Bearer salvy_test_abc' && h['idempotency-key'] === 'k-1')
  ok('criar número: corpo com areaCode e name', s.chamadas[0].init.body === JSON.stringify({ areaCode: 41, name: 'EasyFeed - teste' }))
  ok('criar número: devolve a linha', linha.phoneNumber === '+5541963475701')
}
{
  const s = servidor([{ status: 200, corpo: { data: [], pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 } } }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  await c.linhas({ tipo: ['mobile-did'], status: ['available', 'active'] })
  const u = new URL(s.chamadas[0].url)
  ok('filtros de lista repetem o parâmetro', JSON.stringify(u.searchParams.getAll('status')) === '["available","active"]' && u.searchParams.get('productType') === 'mobile-did')
}
{
  const s = servidor([
    { status: 429, corpo: { code: 'too-many-attempts', message: 'x' }, cabecalhos: { 'Retry-After': '2' } },
    { status: 200, corpo: { data: [{ areaCode: 41, available: true }] } },
  ])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  const r = await c.ddds('mobile-did', true)
  ok('429 com Retry-After: espera e tenta de novo', r.data[0].areaCode === 41 && s.esperas[0] === 2000 && s.chamadas.length === 2)
}
{
  const s = servidor([
    { status: 429, corpo: { code: 'too-many-requests', message: 'borda' } },
    { status: 429, corpo: { code: 'too-many-requests', message: 'borda' } },
    { status: 200, corpo: { data: [] } },
  ])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  await c.ddds()
  ok('429 sem Retry-After (borda): espera crescente 1 s, 2 s', JSON.stringify(s.esperas) === '[1000,2000]')
}
{
  const s = servidor(Array.from({ length: 5 }, () => ({ status: 429, corpo: { code: 'too-many-attempts', message: 'x' }, cabecalhos: { 'Retry-After': '1' } })))
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  erro = null
  try { await c.ddds() } catch (e) { erro = e }
  ok('429 sem parar: desiste depois de 5 tentativas', erro instanceof ErroSalvy && erro.codigo === 'too-many-attempts' && s.chamadas.length === 5)
}
{
  const s = servidor([{ status: 409, corpo: { code: 'did-area-code-out-of-stock', message: 'out of stock' } }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  erro = null
  try { await c.criarNumeroVirtual({ ddd: 11, chaveIdempotencia: 'k' }) } catch (e) { erro = e }
  ok('DDD sem estoque: erro com código e mensagem em português', erro instanceof ErroSalvy && erro.status === 409 && erro.codigo === 'did-area-code-out-of-stock' && erro.message.startsWith('Sem número disponível'))
}
{
  const s = servidor([{ status: 422, corpo: { code: 'input-validation-error', message: 'x', details: [{ key: 'areaCode', message: 'inválido' }] } }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  erro = null
  try { await c.criarNumeroVirtual({ ddd: 0, chaveIdempotencia: 'k' }) } catch (e) { erro = e }
  ok('422: detalhes dos campos vêm junto', erro instanceof ErroSalvy && erro.detalhes[0]?.key === 'areaCode')
}
{
  const s = servidor([{ status: 204 }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  await c.simularSms('linha/01', { texto: 'oi', origem: 'WhatsApp' })
  ok('simular SMS: 204 sem corpo, id escapado no caminho', s.chamadas[0].url.endsWith('/phone-accounts/linha%2F01/sms') && s.chamadas[0].init.body === JSON.stringify({ rawText: 'oi', originPhoneNumber: 'WhatsApp' }))
  const p = criarClienteSalvy({ chave: 'salvy_prod_abc', permitirProducao: true, fetch: s.fetch, esperar: s.esperar })
  erro = null
  try { await p.simularSms('x', { texto: 'oi', origem: 'x' }) } catch (e) { erro = e }
  ok('simular SMS com chave de produção: recusado antes de chamar', erro instanceof Error && s.chamadas.length === 1)
}
{
  const s = servidor([{ status: 200, corpo: { id: 'l', status: 'canceled' } }])
  const c = criarClienteSalvy({ chave: 'salvy_test_abc', fetch: s.fetch, esperar: s.esperar })
  await c.cancelar('l', { motivo: 'unnecessary' })
  ok('cancelar: tipo imediato e motivo obrigatório', s.chamadas[0].init.body === JSON.stringify({ type: 'immediate', reason: 'unnecessary' }))
}

// ── 4. Handler da função salvy-webhook (banco de mentira) ───────────────────

{
  const gravadas: LinhaSmsSalvy[] = []
  let falharAoGravar = false
  const handler = criarHandler({
    segredo,
    agora: () => agora,
    gravar: async (l) => {
      if (falharAoGravar) throw new Error('banco fora')
      if (!gravadas.some((g) => g.id === l.id)) gravadas.push(l)
    },
  })
  const req = async (c = corpo, cab?: Record<string, string>, metodo = 'POST') =>
    new Request('https://exemplo/functions/v1/salvy-webhook', { method: metodo, headers: cab ?? (await assinado(c)), body: metodo === 'POST' ? c : undefined })

  let r = await handler(await req())
  ok('webhook: SMS válido grava e responde 200', r.status === 200 && gravadas.length === 1 && gravadas[0].codigo_whatsapp === '123456' && gravadas[0].numero === '+5541963475701')
  r = await handler(await req())
  ok('webhook: mesma entrega de novo não duplica', r.status === 200 && gravadas.length === 1)
  r = await handler(await req(corpo, { ...(await assinado()), 'svix-signature': 'v1,errada' }))
  ok('webhook: assinatura errada responde 401 e não grava', r.status === 401 && gravadas.length === 1)
  const outro = JSON.stringify({ type: 'phone-account.activated', timestamp: 'x', data: { phoneAccountId: 'linha_01' } })
  r = await handler(await req(outro))
  ok('webhook: outro evento responde 204 sem gravar', r.status === 204 && gravadas.length === 1)
  r = await handler(await req('{nao é json'))
  ok('webhook: JSON quebrado (mas assinado) responde 400', r.status === 400)
  r = await handler(await req(corpo, undefined, 'GET'))
  ok('webhook: GET responde 405', r.status === 405)
  falharAoGravar = true
  const novo = JSON.stringify({ ...evento, data: { ...evento.data, id: 'sms_02' } })
  r = await handler(await req(novo))
  ok('webhook: banco falhou responde 500 (a Salvy tenta de novo)', r.status === 500)
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas) process.exit(1)
