// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { rememberMeStorage } from './auth-storage'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://lixrcruilisncfhfhndo.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM'

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: rememberMeStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // O Supabase não envia Cache-Control nas respostas; sem isto o navegador
    // reusa as respostas GET do cache de memória entre navegações do SPA, e os
    // dados só atualizavam ao dar F5 (que limpa esse cache). 'no-store' força
    // toda leitura a vir fresca do banco.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})
