/**
 * Atalhos do SANDBOX do Asaas para o roteiro de testes (docs/asaas/README.md).
 * Só fala com api-sandbox.asaas.com e recusa chave de produção.
 *
 * Uso (PowerShell; a chave começa com $, por isso as aspas simples):
 *   $env:ASAAS_SANDBOX_KEY = '<chave do sandbox>'
 *   deno run --allow-net --allow-env docs/asaas/sandbox.ts <comando> [id]
 *
 * Comandos:
 *   carteira            walletId da conta da chave (para cadastrar o vendedor)
 *   ver <pay_...>       status, valor, líquido e split de uma cobrança
 *   cobrancas <id>      cobranças de uma assinatura (sub_...) ou parcelamento
 *   pagar <pay_...>     paga com o cartão de teste aprovado (4444…, CCV 123)
 *   proxima <sub_...> [n] cria as cobranças até n meses à frente (padrão 1; carnê, só no sandbox)
 *   pix <pay_...>       vira Pix, para receber na hora pelo painel e ver o split executado
 *   estornar <pay_...>  estorna uma cobrança paga
 *   webhook             configuração e situação da fila do webhook
 */

const BASE = 'https://api-sandbox.asaas.com/v3'
const chave = Deno.env.get('ASAAS_SANDBOX_KEY')?.trim() ?? ''
if (!chave) sair('Falta a variável ASAAS_SANDBOX_KEY.')
if (chave.includes('_prod_')) sair('Esta é uma chave de PRODUÇÃO. Este script é só para o sandbox.')

const [comando, id] = Deno.args

function sair(msg: string): never {
  console.error(msg)
  Deno.exit(1)
}

// deno-lint-ignore no-explicit-any
async function api(metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const res = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'EasyFeed-testes', access_token: chave },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const tipo = res.headers.get('content-type') ?? ''
  const dados = tipo.includes('json') ? await res.json() : await res.arrayBuffer()
  if (!res.ok) sair(`Asaas ${metodo} ${caminho}: ${res.status} ${JSON.stringify(dados)}`)
  return dados
}

const brl = (v: unknown) => `R$ ${Number(v ?? 0).toFixed(2)}`

// deno-lint-ignore no-explicit-any
function resumo(p: any) {
  const parcela = p.installmentNumber ? ` parcela ${p.installmentNumber}` : ''
  console.log(`${p.id}${parcela}  ${p.status}  venc ${p.dueDate}  valor ${brl(p.value)}  líquido ${brl(p.netValue)}`)
  for (const s of p.split ?? []) {
    console.log(`   split → ${s.walletId}  ${brl(s.fixedValue ?? s.totalValue)}  ${s.status ?? ''}${s.refusalReason ? ` (${s.refusalReason})` : ''}`)
  }
}

function precisaId(prefixo?: string) {
  if (!id) sair(`Falta o id. Ex.: ${comando} ${prefixo ?? ''}...`)
}

switch (comando) {
  case 'carteira': {
    const w = await api('GET', '/wallets')
    for (const c of w.data ?? []) console.log(`walletId: ${c.id}`)
    break
  }
  case 'ver': {
    precisaId('pay_')
    resumo(await api('GET', `/payments/${id}`))
    break
  }
  case 'cobrancas': {
    precisaId('sub_')
    const filtro = id.startsWith('sub_') ? `subscription=${id}` : `installment=${id}`
    const lista = await api('GET', `/payments?${filtro}&limit=100`)
    // deno-lint-ignore no-explicit-any
    for (const p of (lista.data ?? []).sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))) resumo(p)
    break
  }
  case 'pagar': {
    precisaId('pay_')
    const p = await api('GET', `/payments/${id}`)
    const c = await api('GET', `/customers/${p.customer}`)
    const pago = await api('POST', `/payments/${id}/payWithCreditCard`, {
      creditCard: { holderName: 'TESTE EASYFEED', number: '4444444444444444', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      creditCardHolderInfo: {
        name: c.name,
        email: c.email || 'teste@easyfeed.com.br',
        cpfCnpj: c.cpfCnpj,
        postalCode: '01310930',
        addressNumber: '100',
        phone: '11999999999',
      },
    })
    resumo(pago)
    break
  }
  case 'proxima': {
    // Um mês por vez: assim cada cobrança chega sozinha ao webhook, como em produção.
    precisaId('sub_')
    const meses = Math.max(1, Number(Deno.args[2]) || 1)
    const hoje = new Date()
    const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1)
    await api('GET', `/subscriptions/${id}/paymentBook?month=${alvo.getMonth() + 1}&year=${alvo.getFullYear()}`)
    const lista = await api('GET', `/payments?subscription=${id}&limit=100`)
    // deno-lint-ignore no-explicit-any
    for (const p of (lista.data ?? []).sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))) resumo(p)
    break
  }
  case 'pix': {
    // O split só é executado quando a cobrança é RECEBIDA; no cartão isso leva
    // ~30 dias. Em Pix, o "Confirmar pagamento" do painel do sandbox recebe na
    // hora. Sem `split` no corpo, o split da cobrança fica como está.
    precisaId('pay_')
    const p = await api('GET', `/payments/${id}`)
    resumo(await api('PUT', `/payments/${id}`, { billingType: 'PIX', value: p.value, dueDate: p.dueDate }))
    console.log('Agora, no painel do sandbox: Cobranças → esta cobrança → Confirmar pagamento.')
    break
  }
  case 'estornar': {
    precisaId('pay_')
    resumo(await api('POST', `/payments/${id}/refund`, {}))
    break
  }
  case 'webhook': {
    const w = await api('GET', '/webhooks')
    for (const c of w.data ?? []) {
      console.log(`${c.name ?? ''}  ${c.url}`)
      console.log(`   ativo=${c.enabled}  fila pausada=${c.interrupted}  eventos=${(c.events ?? []).length}`)
    }
    break
  }
  default:
    sair('Comandos: carteira | ver | cobrancas | pagar | proxima | pix | estornar | webhook')
}
