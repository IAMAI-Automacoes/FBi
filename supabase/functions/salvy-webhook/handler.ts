// A lógica do webhook da Salvy, sem nada do Deno: o index.ts só liga isto ao
// servidor e ao banco, e o teste roda isto no Node com um banco de mentira.

import { lerSmsRecebido, verificarAssinatura } from '../_shared/salvy-webhook.ts'

/** A linha de `salvy_sms` que o webhook grava. */
export interface LinhaSmsSalvy {
  id: string
  linha_id: string
  numero: string
  origem: string
  mensagem: string
  codigo_whatsapp: string | null
  deteccoes: Record<string, unknown>
  recebido_em: string
}

export function criarHandler(dep: {
  /** Chave do endpoint no painel da Salvy (whsec_...). */
  segredo: string
  /** Grava ignorando repetida (mesmo id): a Salvy pode entregar o mesmo evento mais de uma vez. */
  gravar: (linha: LinhaSmsSalvy) => Promise<void>
  agora?: () => number
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })

    // Corpo bruto: a assinatura é sobre o texto exatamente como chegou.
    const corpo = await req.text()
    const assinatura = await verificarAssinatura(dep.segredo, req.headers, corpo, dep.agora?.() ?? Date.now())
    if (assinatura.ok === false) return new Response(assinatura.motivo, { status: 401 })

    let evento: unknown
    try {
      evento = JSON.parse(corpo)
    } catch {
      return new Response('JSON inválido', { status: 400 })
    }

    // Outros eventos (linha ativada, cancelada…) chegam se estiverem marcados
    // no painel: responde 2xx para a Salvy não ficar reenviando.
    const sms = lerSmsRecebido(evento)
    if (!sms) return new Response(null, { status: 204 })

    try {
      await dep.gravar({
        id: sms.smsId,
        linha_id: sms.linhaId,
        numero: sms.numero,
        origem: sms.origem,
        mensagem: sms.mensagem,
        codigo_whatsapp: sms.codigoWhatsapp,
        deteccoes: sms.deteccoes,
        recebido_em: sms.recebidoEm || new Date().toISOString(),
      })
    } catch (e) {
      // Não gravou: responde erro para a Salvy tentar de novo (até 8 vezes em ~27 h).
      console.error('salvy-webhook: falha ao gravar', e)
      return new Response('falha ao gravar', { status: 500 })
    }
    return new Response(JSON.stringify({ ok: true, codigo: sms.codigoWhatsapp !== null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
