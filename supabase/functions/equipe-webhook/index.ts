// Webhook do número só do EasyFeed (o que fala com a equipe dos restaurantes):
// recebe cada mensagem que chega e guarda em `equipe_mensagens`. Quem analisa e
// responde é a rotina da função equipe (ação "tick"), depois que a pessoa para
// de escrever.
//
// Publicar SEM verificação de JWT (quem chama é a uazapi, não um usuário):
//   npx supabase functions deploy equipe-webhook --no-verify-jwt --project-ref lixrcruilisncfhfhndo
//
// Quem pode chamar: só a nossa instância. A URL leva um segredo (?s=…, criado
// na conexão do número e guardado em integracao_config) e o corpo traz o token
// da instância, que tem que ser o do número do EasyFeed.
//
// Só entra mensagem de quem está cadastrado como funcionário de algum
// restaurante: o que um desconhecido mandar para o número não é guardado.

import { clienteAdmin } from '../_shared/auth.ts'
import { lerEvento, variantesDoNumero } from '../_shared/equipe.ts'
import { lerConfigNumero } from '../_shared/equipe-numero.ts'

const resposta = (corpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
const db: any = clienteAdmin()

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resposta({ ok: true })
  try {
    const cfg = await lerConfigNumero(db)
    if (!cfg.segredo || !cfg.token) return resposta({ ok: false, motivo: 'desligado' }, 503)
    if (new URL(req.url).searchParams.get('s') !== cfg.segredo) return resposta({ ok: false }, 401)

    const evento = lerEvento(await req.json().catch(() => null))
    // O que não é mensagem nova de texto ou áudio (grupo, figurinha, edição…) só é ignorado.
    if (!evento) return resposta({ ok: true, ignorado: true })
    if (evento.token !== cfg.token) return resposta({ ok: false }, 403)

    const { data: conhecidos } = await db.from('equipe_funcionarios').select('id').in('telefone', variantesDoNumero(evento.telefone)).limit(1)
    if (!conhecidos?.length) return resposta({ ok: true, ignorado: true })

    // A mesma entrega repetida pela uazapi não duplica (message_id único).
    const { error } = await db.from('equipe_mensagens').upsert(
      { message_id: evento.messageId, direcao: 'entrada', telefone: evento.telefone, tipo: evento.tipo, texto: evento.texto },
      { onConflict: 'message_id', ignoreDuplicates: true },
    )
    if (error) throw error
    return resposta({ ok: true })
  } catch (e) {
    console.error('[equipe-webhook]', e)
    // 500 faz a uazapi tentar de novo; o message_id único segura a repetição.
    return resposta({ ok: false }, 500)
  }
})
