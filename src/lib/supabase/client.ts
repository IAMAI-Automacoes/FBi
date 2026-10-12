// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { rememberMeStorage } from './auth-storage'
import { MODO_DEMO } from '@/lib/demo'
import { NA_AREA_INFLUENCERS } from '@/lib/influencers'
import { CABECALHO_PUBLICO, levaOPublico, naRotaDaEquipe } from '@/lib/publico-rota'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://lixrcruilisncfhfhndo.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM'

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: rememberMeStorage,
    // Demonstração (/demo): chave própria. Assim ela nem lê nem apaga o login
    // normal do navegador, e o aviso de login/logout que o supabase-js troca
    // entre abas (pelo nome desta chave) não derruba as outras abas.
    ...(MODO_DEMO ? { storageKey: 'sb-lixrcruilisncfhfhndo-demo-auth-token' } : {}),
    persistSession: true,
    autoRefreshToken: true,
    // Na área de influencers, o link do e-mail (criar senha) é da sessão de lá
    // (`cliente-influencers.ts`): este cliente não pode pegá-lo para si.
    detectSessionInUrl: !NA_AREA_INFLUENCERS,
  },
  global: {
    // O Supabase não envia Cache-Control nas respostas; sem isto o navegador
    // reusa as respostas GET do cache de memória entre navegações do SPA, e os
    // dados só atualizavam ao dar F5 (que limpa esse cache). 'no-store' força
    // toda leitura a vir fresca do banco.
    //
    // Nas páginas da equipe (/equipe/*), toda chamada ao banco leva
    // `x-publico: equipe`: é por ele que o banco entrega e aceita só as linhas
    // do feedback da equipe (ver `lib/publico-rota.ts`). Fora delas não vai
    // nada, e vale 'cliente'.
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (levaOPublico(url) && naRotaDaEquipe()) {
        const headers = new Headers(init?.headers)
        if (!headers.has(CABECALHO_PUBLICO)) headers.set(CABECALHO_PUBLICO, 'equipe')
        return fetch(input, { ...init, headers, cache: 'no-store' })
      }
      return fetch(input, { ...init, cache: 'no-store' })
    },
  },
})
