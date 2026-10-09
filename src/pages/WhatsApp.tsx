import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useTelaFixa } from '@/hooks/use-tela-fixa'
import { supabase } from '@/lib/supabase/client'
import { TelaWhatsapp, type RestauranteDaTela } from '@/components/whatsapp/TelaWhatsapp'
import { WhatsappDesconectado } from '@/components/whatsapp/WhatsappDesconectado'
import { WA } from '@/components/whatsapp/pecas'

/** De quanto em quanto tempo a página confere se o WhatsApp continua conectado. */
const CONFERIR_A_CADA_MS = 120_000

// Celular: presa à tela visível (fixed inset-0, que já é a altura da parte
// visível). Antes ela ficava dentro da área que rola do Layout, cuja altura é
// 100vh — maior que a parte visível do celular (barra do navegador) — então o
// cabeçalho da conversa subia para fora da tela e sobrava uma faixa branca
// embaixo. E a página não rola (useTelaFixa): puxar no fim das mensagens não
// leva mais a tela junto.
// Computador: ocupa a área do Layout (o cabeçalho fixo some nesta rota, ver
// ROTAS_SEM_TOPO), como a página de Sugestões.
const CLASSE_TELA =
  'fixed inset-0 z-30 flex overflow-hidden bg-white md:relative md:inset-auto md:z-auto md:h-[100dvh] md:-ml-6 md:-mr-8 md:-my-6 lg:-ml-8 lg:-my-8'

/**
 * Página WhatsApp do dono: as conversas do número do restaurante, como no
 * WhatsApp. O miolo (lista, conversa, painéis) é o TelaWhatsapp — o mesmo que
 * o painel do admin usa, na aba WhatsApp, em modo só leitura.
 *
 * Só mostra as conversas com o WhatsApp conectado DE VERDADE (pergunta à
 * uazapi ao abrir, a cada 2 min e ao voltar para a aba). Desconectado ou nunca
 * conectado: a tela de "WhatsApp desconectado".
 */
export default function WhatsApp() {
  // A página não rola, só a lista e as mensagens (o topo e o rodapé da
  // conversa ficam sempre no lugar no celular).
  useTelaFixa()
  const { user, usuario } = useAuth()
  const u = usuario as (typeof usuario & { nome_restaurante?: string | null; whatsapp_dono?: string | null; whatsapp_conectado?: boolean | null }) | null
  const restauranteId = u?.restaurante_id ?? null
  const conectadoNoBanco = u?.whatsapp_conectado === true
  // null = ainda conferindo.
  const [conectado, setConectado] = useState<boolean | null>(null)

  useEffect(() => {
    if (!restauranteId) return
    let vivo = true
    const conferir = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('whatsapp-instancia', { body: { action: 'status' } })
        if (error || (data as { error?: string } | null)?.error) throw new Error('sem resposta')
        if (vivo) setConectado((data as { connected?: boolean }).connected === true)
      } catch {
        // Sem resposta (rede, demonstração): vale o último estado gravado no banco.
        if (vivo) setConectado((atual) => atual ?? conectadoNoBanco)
      }
    }
    conferir()
    const intervalo = setInterval(conferir, CONFERIR_A_CADA_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [restauranteId, conectadoNoBanco])

  const restaurante = useMemo<RestauranteDaTela | null>(() => (restauranteId
    ? {
        id: restauranteId,
        nome: u?.nome_restaurante ?? null,
        conectado: conectado === true,
        whatsappDono: u?.whatsapp_dono ?? null,
      }
    : null), [restauranteId, u?.nome_restaurante, conectado, u?.whatsapp_dono])

  if (!restaurante || !user) return null

  if (conectado === null) {
    return (
      <div className={CLASSE_TELA}>
        <div className="m-auto"><Loader2 className="h-7 w-7 animate-spin" style={{ color: WA.TEAL }} /></div>
      </div>
    )
  }

  if (!conectado) return <WhatsappDesconectado modo="dono" className={CLASSE_TELA} />

  return <TelaWhatsapp modo="dono" restaurante={restaurante} className={CLASSE_TELA} />
}
