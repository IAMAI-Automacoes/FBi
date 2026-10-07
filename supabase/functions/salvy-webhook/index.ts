// Webhook da Salvy: recebe os SMS dos números virtuais (evento sms.received)
// e grava em `salvy_sms`. Só o admin da plataforma lê essa tabela (RLS): a
// tela dele vai ouvir por Realtime e mostrar o código do WhatsApp na hora.
//
// Publicar SEM verificação de JWT (quem chama é a Salvy, não um usuário):
//   npx supabase functions deploy salvy-webhook --no-verify-jwt --project-ref lixrcruilisncfhfhndo
// Segredo: SALVY_WEBHOOK_SECRET = chave do endpoint (whsec_...), do painel da
// Salvy em Configurações > Webhooks, depois de cadastrar a URL
// https://lixrcruilisncfhfhndo.supabase.co/functions/v1/salvy-webhook
// marcando o evento "sms.received".

import { clienteAdmin } from '../_shared/auth.ts'
import { criarHandler } from './handler.ts'

const segredo = Deno.env.get('SALVY_WEBHOOK_SECRET') ?? ''

// deno-lint-ignore no-explicit-any
const db: any = clienteAdmin()

const handler = criarHandler({
  segredo,
  gravar: async (linha) => {
    // Mesma mensagem entregue de novo pela Salvy: o id já existe e é ignorada.
    const { error } = await db.from('salvy_sms').upsert(linha, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
  },
})

Deno.serve((req: Request) => {
  // Sem o segredo, nada entra: a função fica no ar, mas desligada.
  if (!segredo) return new Response('SALVY_WEBHOOK_SECRET não configurado', { status: 503 })
  return handler(req)
})
