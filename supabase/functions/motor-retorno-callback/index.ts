/**
 * Confirmação de envio, chamada pelo n8n depois de falar com a uazapi.
 *
 * É o único ponto que avança `janela_contato.ultimo_envio_em` — o relógio do
 * cooldown de 72h. Isso é deliberado: o cooldown só corre depois que o provedor
 * confirmou. Se o n8n cair, ou a uazapi recusar, a fila continua represada e
 * sai na próxima janela, com todos os avisos (I3). Avançar o relógio no momento
 * do disparo silenciaria a pessoa por três dias por uma mensagem que talvez
 * nunca tenha chegado.
 *
 * A escrita real é feita por duas funções SQL (motor_confirmar_envio /
 * motor_falhar_envio) porque marcar os avisos e mover o cooldown precisa ser
 * atômico: um sem o outro quebra I1 ou I6.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { json, preflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/auth.ts'

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  // O n8n é o único chamador legítimo. Sem isto, qualquer um poderia marcar
  // mensagens como entregues e silenciar contatos — exatamente o problema da
  // edge function `webhook-n8n`, que aceita qualquer requisição.
  const segredo = Deno.env.get('MOTOR_RETORNO_SECRET')
  if (!segredo || req.headers.get('x-motor-secret') !== segredo) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const envioId: string | undefined = body?.envio_id
    const status: string | undefined = body?.status

    if (!envioId) return json({ error: 'envio_id é obrigatório' }, 400)
    if (status !== 'enviado' && status !== 'falhou') {
      return json({ error: "status deve ser 'enviado' ou 'falhou'" }, 400)
    }

    const db = clienteAdmin()

    if (status === 'enviado') {
      const { error } = await db.rpc('motor_confirmar_envio', {
        p_mensagem_id: envioId,
        p_provider_id: body?.provider_message_id ?? null,
      })
      if (error) throw error
    } else {
      const { error } = await db.rpc('motor_falhar_envio', {
        p_mensagem_id: envioId,
        p_codigo: body?.erro_codigo ?? null,
        p_mensagem: body?.erro_mensagem ?? null,
      })
      if (error) throw error
    }

    // As duas RPCs são idempotentes (só agem sobre status 'enviando'), então um
    // retry do n8n com o mesmo envio_id não faz nada e devolve ok do mesmo
    // jeito — o n8n não precisa deduplicar do lado dele.
    return json({ ok: true })
  } catch (err) {
    // deno-lint-ignore no-explicit-any -- erro do supabase-js não é tipado
    const e = err as any
    console.error('motor-retorno-callback:', e)
    return json({ error: e?.message ?? String(err) }, 500)
  }
})
