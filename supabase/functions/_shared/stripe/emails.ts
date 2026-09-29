/**
 * Gancho de comunicação por fatura — e-mails com a marca EasyFeed.
 *
 * Por que existe: os e-mails automáticos do Stripe (recibo, fatura, falha de
 * pagamento) só levam a marca da CONTA (IAMAI): logo, cor e nome são por
 * conta, não por produto. Para o cliente do restaurante ver "EasyFeed", o
 * caminho é desligar os e-mails automáticos no Dashboard e enviar os nossos a
 * partir destes eventos, com os links que o próprio Stripe já hospeda:
 *   - `hosted_invoice_url` — página da fatura (paga/pagar), com PDF;
 *   - `invoice_pdf` — o PDF direto.
 *
 * Hoje não há provedor de e-mail configurado no projeto, então este módulo
 * só registra o que seria enviado. Quando o provedor entrar (Resend, SES,
 * Postmark...), a implementação vai aqui e o webhook não muda.
 *
 * Também é o ponto de plug para NFS-e: `invoice.paid` é o momento certo de
 * chamar o emissor (a nota só existe para pagamento confirmado). Ver
 * docs/stripe/README.md.
 */
import type { Stripe } from './cliente.ts'

// deno-lint-ignore no-explicit-any
type Db = any

export type TipoEventoFatura =
  | 'invoice.finalized'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | string

export interface MensagemFatura {
  para: string
  assunto: string
  /** Links hospedados pelo Stripe — não guardamos o PDF. */
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  valor_centavos: number
  moeda: string
}

export function montarMensagem(tipo: TipoEventoFatura, fatura: Stripe.Invoice): MensagemFatura | null {
  const para = fatura.customer_email
  if (!para) return null
  const base = {
    para,
    hosted_invoice_url: fatura.hosted_invoice_url ?? null,
    invoice_pdf: fatura.invoice_pdf ?? null,
    valor_centavos: fatura.amount_due ?? 0,
    moeda: (fatura.currency ?? 'brl').toUpperCase(),
  }
  switch (tipo) {
    case 'invoice.paid':
      return { ...base, assunto: 'EasyFeed — pagamento confirmado' }
    case 'invoice.payment_failed':
      return { ...base, assunto: 'EasyFeed — não conseguimos cobrar sua assinatura' }
    case 'invoice.payment_action_required':
      return { ...base, assunto: 'EasyFeed — confirme o pagamento da sua assinatura' }
    case 'invoice.finalized':
      // Fatura emitida (ainda não paga). Útil para boleto/Pix, que exigem ação.
      return fatura.collection_method === 'send_invoice'
        ? { ...base, assunto: 'EasyFeed — sua fatura está disponível' }
        : null
    default:
      return null
  }
}

/** Chamada pelo webhook. Nunca lança: e-mail é acessório, o espelho é o serviço. */
export async function notificarFatura(_db: Db, tipo: TipoEventoFatura, fatura: Stripe.Invoice): Promise<void> {
  try {
    const msg = montarMensagem(tipo, fatura)
    if (!msg) return
    // TODO(email): enviar via provedor. Enquanto não há, só o log — sem o
    // e-mail do destinatário (LGPD): o invoice id basta para investigar.
    console.info(`[stripe-email] ${tipo} fatura=${fatura.id} assunto="${msg.assunto}"`)
    // TODO(nfse): em `invoice.paid`, chamar o emissor de NFS-e com
    // fatura.id, amount_paid, customer (CNPJ vem de customer.tax_ids).
  } catch (e) {
    console.warn('[stripe-email] falhou:', (e as Error).message)
  }
}
