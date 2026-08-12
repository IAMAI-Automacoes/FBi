import { useState, type CSSProperties } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppSidebar } from './AppSidebar'
import { TopHeader } from './TopHeader'
import { ChatFab } from './ChatFab'
import { AvisoAssinatura } from './AvisoAssinatura'

// Limites da largura do chat de IA (desktop). O conteúdo recua exatamente isso.
const MIN_CHAT = 320
const MAX_CHAT = 620
const PADRAO_CHAT = 380

export default function Layout() {
  const [chatAberto, setChatAberto] = useState(false)
  const [larguraChat, setLarguraChat] = useState(() => {
    const salvo = Number(localStorage.getItem('largura_chat_ia'))
    return salvo >= MIN_CHAT && salvo <= MAX_CHAT ? salvo : PADRAO_CHAT
  })
  // No celular o chat é overlay em tela cheia — o conteúdo NÃO recua.
  const isMobile = useIsMobile()
  const chatDesktop = chatAberto && !isMobile

  const mudarLargura = (v: number) => {
    const clamp = Math.min(MAX_CHAT, Math.max(MIN_CHAT, Math.round(v)))
    setLarguraChat(clamp)
    localStorage.setItem('largura_chat_ia', String(clamp))
  }

  return (
    <SidebarProvider
      // Com o chat aberto, o menu encolhe pra sobrar só um pouco à direita das
      // palavras — dá mais espaço pro conteúdo + chat.
      style={chatDesktop ? ({ '--sidebar-width': '12.5rem' } as CSSProperties) : undefined}
    >
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <main
          className="flex flex-1 flex-col w-full min-w-0 min-h-0 transition-[margin] duration-300 ease-in-out"
          style={{ marginRight: chatDesktop ? larguraChat : 0 }}
        >
          <TopHeader />
          <AvisoAssinatura />
          <div className="flex-1 min-h-0 overflow-auto sem-barra p-4 sm:p-6 lg:p-8 animate-fade-in">
            <Outlet />
          </div>
        </main>
        <ChatFab
          open={chatAberto}
          onOpenChange={setChatAberto}
          largura={larguraChat}
          onLarguraChange={mudarLargura}
        />
      </div>
    </SidebarProvider>
  )
}
