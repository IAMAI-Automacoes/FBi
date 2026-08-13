import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppSidebar } from './AppSidebar'
import { TopHeader } from './TopHeader'
import { ChatFab } from './ChatFab'
import { AvisoAssinatura } from './AvisoAssinatura'

// Largura fixa do chat de IA (desktop). O conteúdo recua exatamente isso.
const LARGURA_CHAT = 380

export default function Layout() {
  const [chatAberto, setChatAberto] = useState(false)
  // No celular o chat é overlay em tela cheia — o conteúdo NÃO recua.
  const isMobile = useIsMobile()
  const chatDesktop = chatAberto && !isMobile

  // Ao abrir o chat, o menu da esquerda FECHA (desliza pra fora). Ao fechar, volta.
  const [sidebarAberto, setSidebarAberto] = useState(true)
  useEffect(() => { setSidebarAberto(!chatDesktop) }, [chatDesktop])

  return (
    <SidebarProvider open={sidebarAberto} onOpenChange={setSidebarAberto}>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <main
          className="flex flex-1 flex-col w-full min-w-0 min-h-0 transition-[margin] duration-300 ease-in-out"
          style={{ marginRight: chatDesktop ? LARGURA_CHAT : 0 }}
        >
          <TopHeader />
          <AvisoAssinatura />
          <div className="flex-1 min-h-0 overflow-auto sem-barra p-4 sm:p-6 lg:p-8 animate-fade-in">
            <Outlet />
          </div>
        </main>
        <ChatFab open={chatAberto} onOpenChange={setChatAberto} />
      </div>
    </SidebarProvider>
  )
}
