import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './client'

/**
 * Cliente do Supabase só da área de influencers (/influencers). A sessão fica
 * numa chave própria do navegador: o login do EasyFeed normal e o daqui não se
 * enxergam (entrar ou sair de um não mexe no outro). Só é carregado pelas
 * páginas da área.
 */
export const supabaseInfluencers = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'sb-lixrcruilisncfhfhndo-influencers-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    // O link do e-mail ("Criar minha senha") volta para /influencers/criar-senha com a sessão no endereço.
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})
