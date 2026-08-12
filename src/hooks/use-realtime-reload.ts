import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Recarrega quando qualquer uma das `tabelas` muda para o restaurante — deixa a
 * plataforma em tempo real (feedbacks, KPIs, gráficos) sem recarregar a página.
 * As tabelas precisam estar na publicação `supabase_realtime`.
 */
export function useRealtimeReload(
  tabelas: string[],
  restauranteId: number | null | undefined,
  recarregar: () => void,
) {
  // Ref evita re-subscrever a cada render por causa da identidade do callback.
  const cb = useRef(recarregar)
  cb.current = recarregar
  const chave = tabelas.join(',')

  useEffect(() => {
    if (!restauranteId) return
    const canal = supabase.channel(`rt-${chave}-${restauranteId}`)
    for (const tabela of chave.split(',')) {
      canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela, filter: `restaurante_id=eq.${restauranteId}` },
        () => cb.current(),
      )
    }
    canal.subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [chave, restauranteId])
}
