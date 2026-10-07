// Teste contra a Salvy de verdade, no SANDBOX (nada é real, nada é cobrado).
// Fica fora do `npm test` porque precisa de chave e internet. No PowerShell:
//   $env:SALVY_API_KEY='salvy_test_...'; node --experimental-strip-types supabase/functions/_shared/__testes__/salvy-sandbox.ts
//   (com --manter no fim, o número de teste não é cancelado)
//
// Só aceita chave salvy_test_. Chave de produção é recusada: aqui nada pode
// criar número de verdade nem cobrar.
//
// No sandbox, o número virtual é sempre o de demonstração +5541963475701 e só
// o DDD 41 existe.

import { criarClienteSalvy, ErroSalvy, type Linha, type SmsSalvy } from '../salvy.ts'
import { codigoDoWhatsapp } from '../salvy-codigo.ts'

const NOME_DO_TESTE = 'EasyFeed - teste Salvy'
const manter = process.argv.includes('--manter')

const chave = (process.env.SALVY_API_KEY ?? '').trim()
if (!chave) {
  console.log("Falta a chave de sandbox da Salvy: $env:SALVY_API_KEY='salvy_test_...' antes do comando.")
  console.log('Crie em https://app.salvy.com.br/settings/api > "Criar chave de API" > ambiente Sandbox.')
  process.exit(2)
}
if (!chave.startsWith('salvy_test_')) {
  console.log('A chave não é de sandbox (não começa com salvy_test_). Este teste não usa chave de produção.')
  process.exit(2)
}

const salvy = criarClienteSalvy({ chave })
let falhas = 0
const passo = (n: number, t: string) => console.log(`\n${n}. ${t}`)
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`   ${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('      ', JSON.stringify(detalhe))
  }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

try {
  passo(1, 'Chave e empresa')
  const empresas = await salvy.empresas()
  const empresa = empresas.data[0]
  ok('a chave funciona e é de sandbox', salvy.ambiente === 'sandbox' && !!empresa)
  console.log(`   empresa: ${String(empresa?.name ?? empresa?.id ?? '?')}`)

  passo(2, 'DDDs com número virtual disponível')
  const ddds = await salvy.ddds('mobile-did', true)
  console.log(`   DDDs: ${ddds.data.map((d) => d.areaCode).join(', ') || '(nenhum)'}`)
  ok('o DDD 41 está disponível (o único do sandbox)', ddds.data.some((d) => d.areaCode === 41 && d.available))

  passo(3, 'Número virtual')
  // Reaproveita o número de teste se já existir — é o que a Salvy recomenda
  // (em produção, cancelar e criar outro cobra o mês inteiro).
  const existentes = await salvy.linhas({ tipo: ['mobile-did'], status: ['pending', 'available', 'active'] })
  let linha: Linha | undefined = existentes.data.find((l) => l.name === NOME_DO_TESTE) ?? existentes.data[0]
  let criadaAgora = false
  if (linha) {
    console.log(`   reaproveitando ${linha.phoneNumber} (${linha.status}, id ${linha.id})`)
  } else {
    // Chave de idempotência nova a cada execução: a mesma chave devolveria a
    // linha da execução anterior, que pode já ter sido cancelada.
    linha = await salvy.criarNumeroVirtual({ ddd: 41, nome: NOME_DO_TESTE, chaveIdempotencia: `easyfeed-teste-${Date.now()}` })
    criadaAgora = true
    console.log(`   criado ${linha.phoneNumber} (${linha.status}, id ${linha.id})`)
  }
  ok('é um número virtual (mobile-did)', linha.productType === 'mobile-did', linha.productType)
  ok('número de demonstração do sandbox', linha.phoneNumber === '+5541963475701', linha.phoneNumber)
  ok('pronto para uso', ['available', 'active'].includes(linha.status), linha.status)
  const conferida = await salvy.linha(linha.id)
  ok('a linha é encontrada pelo id', conferida.id === linha.id)

  passo(4, 'SMS simulados')
  const inicio = new Date(Date.now() - 60_000).toISOString()
  const marca = String(Date.now()).slice(-5)
  const textoWhatsapp = `Seu codigo do WhatsApp: 123-456. Nao compartilhe esse codigo com ninguem. ${marca}`
  const textoSpam = `Promocao imperdivel! Responda SAIR para nao receber mais. ${marca}`
  await salvy.simularSms(linha.id, { texto: textoWhatsapp, origem: 'WhatsApp' })
  await salvy.simularSms(linha.id, { texto: textoSpam, origem: '28000' })
  console.log('   enviados: um do WhatsApp (código 123-456) e uma propaganda')

  passo(5, 'Leitura dos SMS pela API')
  let doWhatsapp: SmsSalvy | undefined
  let spam: SmsSalvy | undefined
  for (let i = 0; i < 15 && (!doWhatsapp || !spam); i++) {
    const lista = await salvy.sms(linha.id, { desde: inicio, porPagina: 50 })
    doWhatsapp = lista.data.find((s) => s.message === textoWhatsapp)
    spam = lista.data.find((s) => s.message === textoSpam)
    if (!doWhatsapp || !spam) await esperar(2000)
  }
  ok('o SMS do WhatsApp chegou', !!doWhatsapp)
  ok('a propaganda chegou', !!spam)
  if (doWhatsapp) {
    console.log(`   detecções da Salvy: ${JSON.stringify(doWhatsapp.detections)}`)
    const daSalvy = doWhatsapp.detections?.whatsapp?.verificationCode ?? null
    ok('a Salvy detectou o código do WhatsApp (123456)', daSalvy === '123456', daSalvy)
    ok('o nosso codigo.ts lê 123456', codigoDoWhatsapp(doWhatsapp) === '123456', codigoDoWhatsapp(doWhatsapp))
    ok('número de destino é o virtual', doWhatsapp.destinationPhoneNumber === linha.phoneNumber, doWhatsapp.destinationPhoneNumber)
  }
  if (spam) ok('a propaganda não vira código', codigoDoWhatsapp(spam) === null, codigoDoWhatsapp(spam))
  const soWhatsapp = await salvy.sms(linha.id, { desde: inicio, servicos: ['whatsapp'] })
  ok('filtro service=whatsapp traz o do WhatsApp e não a propaganda',
    soWhatsapp.data.some((s) => s.message === textoWhatsapp) && !soWhatsapp.data.some((s) => s.message === textoSpam))

  passo(6, 'Limpeza')
  if (manter) {
    console.log('   --manter: o número fica ativo no sandbox.')
  } else if (criadaAgora || linha.name === NOME_DO_TESTE) {
    const cancelada = await salvy.cancelar(linha.id, { motivo: 'unnecessary' })
    ok('número de teste cancelado no sandbox (grátis)', cancelada.status === 'canceled', cancelada.status)
  } else {
    console.log('   o número reaproveitado não foi criado por este teste: fica como estava.')
  }
} catch (e) {
  falhas++
  if (e instanceof ErroSalvy) {
    console.log(`\nERRO da Salvy ${e.status} (${e.codigo}): ${e.message}`)
    if (e.detalhes.length) console.log('   ', JSON.stringify(e.detalhes))
  } else {
    console.log('\nERRO:', e)
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nSANDBOX: TUDO CERTO')
process.exit(falhas ? 1 : 0)
