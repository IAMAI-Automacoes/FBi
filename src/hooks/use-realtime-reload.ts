import { useEffect, useId, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Tabelas sem `restaurante_id`: o filtro por restaurante não existe nelas, e
 * quem limita o que chega é a RLS (o Realtime só entrega a linha que o
 * usuário pode ler). `qr_scans` liga ao restaurante pelo `qr_code_id`.
 */
const SEM_RESTAURANTE_ID = new Set(['qr_scans'])

/**
 * Recarrega quando qualquer uma das `tabelas` muda para o restaurante — deixa a
 * plataforma em tempo real (feedbacks, KPIs, gráficos) sem recarregar a página.
 * As tabelas precisam estar na publicação `supabase_realtime`.
 *
 * Espera `esperaMs` depois da última mudança e recarrega uma vez só: uma
 * mensagem de cliente vira vários pontos em sequência, e reordenar um quadro
 * mexe em várias linhas — sem a espera, eram várias recargas seguidas.
 */
export function useRealtimeReload(
  tabelas: string[],
  restauranteId: number | null | undefined,
  recarregar: () => void,
  esperaMs = 600,
) {
  // Ref evita re-subscrever a cada render por causa da identidade do callback.
  const cb = useRef(recarregar)
  cb.current = recarregar
  const chave = tabelas.join(',')
  // Cada uso tem o próprio canal: dois componentes ouvindo as mesmas tabelas
  // não podem dividir (nem derrubar) o canal um do outro.
  const id = useId()

  useEffect(() => {
    if (!restauranteId) return
    let espera: ReturnType<typeof setTimeout> | null = null
    const agendar = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(() => cb.current(), esperaMs)
    }
    const canal = supabase.channel(`rt-${id}-${chave}-${restauranteId}`)
    for (const tabela of chave.split(',')) {
      canal.on(
        'postgres_changes',
        SEM_RESTAURANTE_ID.has(tabela)
          ? { event: '*', schema: 'public', table: tabela }
          : { event: '*', schema: 'public', table: tabela, filter: `restaurante_id=eq.${restauranteId}` },
        agendar,
      )
    }
    canal.subscribe()
    return () => {
      if (espera) clearTimeout(espera)
      supabase.removeChannel(canal)
    }
  }, [chave, restauranteId, id, esperaMs])
}
