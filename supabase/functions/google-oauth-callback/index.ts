// Volta do Google (OAuth 2.0): troca o código pelos tokens, guarda o token de
// renovação no Vault, acha o(s) restaurante(s) do dono e redireciona para a
// página /google do site. Lógica em handler.ts.
//
// Publicar SEM verificação de JWT — quem chama é o navegador voltando do Google:
//   npx supabase functions deploy google-oauth-callback --no-verify-jwt --project-ref lixrcruilisncfhfhndo
// URL cadastrada como "URI de redirecionamento autorizado" no cliente OAuth:
//   https://lixrcruilisncfhfhndo.supabase.co/functions/v1/google-oauth-callback

import { clienteAdmin } from '../_shared/auth.ts'
import { siteUrl } from '../_shared/stripe/config.ts'
import {
  aplicarLocais, clienteGoogle, configGoogle, guardarToken, marcarAguardandoGoogle, sincronizarRestaurante,
} from '../_shared/google-operacoes.ts'
import { criarCallback } from './handler.ts'

Deno.serve(async (req: Request) => {
  // deno-lint-ignore no-explicit-any
  const db: any = clienteAdmin()
  const site = await siteUrl(db)
  const cfg = configGoogle()
  if (!cfg) return Response.redirect(`${site}/google?erro=nao_configurado`, 302)
  const google = clienteGoogle(cfg)

  const handler = criarCallback({
    google,
    redirectUri: cfg.redirectUri,
    site,
    consumirEstado: async (state) => {
      const { data } = await db.from('google_oauth_estados').delete().eq('state', state).select('restaurante_id, criado_em').maybeSingle()
      return data ? { restauranteId: Number(data.restaurante_id), criadoEm: data.criado_em } : null
    },
    guardarToken: (id, token) => guardarToken(db, id, token),
    aplicarLocais: (id, locais) => aplicarLocais(db, id, locais),
    marcarAguardandoGoogle: (id) => marcarAguardandoGoogle(db, id),
    sincronizar: async (id) => { await sincronizarRestaurante(db, google, id, { completa: true }) },
  })
  return handler(req)
})
