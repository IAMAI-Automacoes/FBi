import { useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useTelaFixa } from '@/hooks/use-tela-fixa'
import { TelaWhatsapp, type RestauranteDaTela } from '@/components/whatsapp/TelaWhatsapp'

/**
 * Página WhatsApp do dono: as conversas do número do restaurante, como no
 * WhatsApp. O miolo (lista, conversa, painéis) é o TelaWhatsapp — o mesmo que
 * o painel do admin usa, na aba WhatsApp, em modo só leitura.
 */
export default function WhatsApp() {
  // A página não rola, só a lista e as mensagens (o topo e o rodapé da
  // conversa ficam sempre no lugar no celular).
  useTelaFixa()
  const { user, usuario } = useAuth()
  const u = usuario as (typeof usuario & { nome_restaurante?: string | null; whatsapp_dono?: string | null }) | null
  const restauranteId = u?.restaurante_id ?? null
  const restaurante = useMemo<RestauranteDaTela | null>(() => (restauranteId
    ? {
        id: restauranteId,
        nome: u?.nome_restaurante ?? null,
        conectado: !!u?.whatsapp_token,
        whatsappDono: u?.whatsapp_dono ?? null,
      }
    : null), [restauranteId, u?.nome_restaurante, u?.whatsapp_token, u?.whatsapp_dono])

  if (!restaurante || !user) return null

  return (
    <TelaWhatsapp
      modo="dono"
      restaurante={restaurante}
      // Celular: presa à tela visível (fixed inset-0, que já é a altura da
      // parte visível). Antes ela ficava dentro da área que rola do Layout,
      // cuja altura é 100vh — maior que a parte visível do celular (barra do
      // navegador) — então o cabeçalho da conversa subia para fora da tela e
      // sobrava uma faixa branca embaixo. E a página não rola (useTelaFixa):
      // puxar no fim das mensagens não leva mais a tela junto.
      // Computador: ocupa a área do Layout (o cabeçalho fixo some nesta rota,
      // ver ROTAS_SEM_TOPO), como a página de Sugestões.
      className="fixed inset-0 z-30 flex overflow-hidden bg-white md:relative md:inset-auto md:z-auto md:h-[100dvh] md:-ml-6 md:-mr-8 md:-my-6 lg:-ml-8 lg:-my-8"
    />
  )
}
