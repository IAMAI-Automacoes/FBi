import { supabase } from '@/lib/supabase/client'

/* Conta quem abriu um link de indicação (`?ref=CODIGO`), para o admin e o
   influenciador verem se o link está sendo divulgado (pedido do Raver,
   21/10/2026). Um por navegador por dia: o navegador guarda um número
   aleatório (não identifica ninguém) e o banco ignora a repetição. Falhar
   aqui não atrapalha nada. */

const CHAVE_VISITANTE = 'easyfeed_visitante'

export function registrarVisitaDoLink(): void {
  try {
    const codigo = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
    if (!codigo || !/^[A-Z0-9_-]{2,30}$/.test(codigo)) return
    let visitante = localStorage.getItem(CHAVE_VISITANTE)
    if (!visitante || !/^[A-Za-z0-9-]{8,64}$/.test(visitante)) {
      visitante = crypto.randomUUID()
      localStorage.setItem(CHAVE_VISITANTE, visitante)
    }
    // Recarregar a página no mesmo dia não chama o banco de novo.
    const doDia = `easyfeed_visita:${codigo}:${new Date().toISOString().slice(0, 10)}`
    if (sessionStorage.getItem(doDia)) return
    sessionStorage.setItem(doDia, '1')
    supabase.rpc('link_registrar_visita', { p_codigo: codigo, p_visitante: visitante }).then(() => {}, () => {})
  } catch {
    /* sem armazenamento ou sem crypto: não conta */
  }
}
