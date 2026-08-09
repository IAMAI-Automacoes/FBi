import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppSidebar } from './AppSidebar'
import { TopHeader } from './TopHeader'
import { ChatFab } from './ChatFab'

/** Largura do painel do chat — o conteúdo recua exatamente isso (só no desktop). */
const LARGURA_CHAT = 380

export default function Layout() {
  // O chat não cobre a página: ela encolhe para o lado enquanto ele está aberto
  const [chatAberto, setChatAberto] = useState(false)
  // No celular o chat é overlay em tela cheia — o conteúdo NÃO recua (senão a
  // página some atrás dos 380px numa tela de ~375px).
  const isMobile = useIsMobile()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <main
          className="flex flex-1 flex-col w-full min-w-0 min-h-0 transition-[margin] duration-300 ease-in-out"
          style={{ marginRight: chatAberto && !isMobile ? LARGURA_CHAT : 0 }}
        >
          <TopHeader />
          <div className="flex-1 min-h-0 overflow-auto sem-barra p-4 sm:p-6 lg:p-8 animate-fade-in">
            <Outlet />
          </div>
        </main>
        <ChatFab open={chatAberto} onOpenChange={setChatAberto} />
      </div>
    </SidebarProvider>
  )
}
