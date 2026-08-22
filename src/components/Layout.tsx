import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { HeaderExtraProvider } from '@/hooks/use-header-extra'
import { AppSidebar } from './AppSidebar'
import { TopHeader } from './TopHeader'
import { ChatFab } from './ChatFab'
import { AvisoAssinatura } from './AvisoAssinatura'

// Largura fixa do chat de IA (desktop). O conteúdo recua exatamente isso.
const LARGURA_CHAT = 380

// A barra some nessa página: "Sugestões e Dúvidas" pediu ficar de fora.
const ROTAS_SEM_BARRA_SCROLL = ['/sugestoes']

/** Indicador de rolagem — o app esconde a barra nativa em TODO lugar
 *  (ver `.sem-barra`/regra `*::-webkit-scrollbar` em `main.css`), então isto
 *  substitui visualmente por uma barrinha fina acompanhando `scrollTop`.
 *  Fica DENTRO do wrapper relativo que envolve o container de scroll (ver
 *  abaixo), não do <main>, pra cobrir só a altura do conteúdo — não o
 *  cabeçalho/aviso de assinatura que ficam acima dele. O recuo de 24px da
 *  borda (`right-6`) é pra nunca ficar embaixo da setinha lateral do chat
 *  (fixed right-0, 20px de largura) quando o chat está fechado. */
function BarraDeScroll({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [thumb, setThumb] = useState<{ topPct: number; alturaPct: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const atualizar = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight + 1) {
        setThumb(null)
        return
      }
      const alturaPct = Math.max((clientHeight / scrollHeight) * 100, 8)
      const maxScroll = scrollHeight - clientHeight
      const topPct = maxScroll > 0 ? (scrollTop / maxScroll) * (100 - alturaPct) : 0
      setThumb({ topPct, alturaPct })
    }

    atualizar()
    el.addEventListener('scroll', atualizar, { passive: true })

    // Conteúdo assíncrono (feedbacks/insights carregando) muda a altura
    // depois do primeiro render — reobserva o container E o próprio filho.
    const ro = new ResizeObserver(atualizar)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)

    return () => {
      el.removeEventListener('scroll', atualizar)
      ro.disconnect()
    }
  }, [containerRef])

  if (!thumb) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-2 right-6 top-2 z-20 w-1.5"
    >
      <div
        className="absolute w-full rounded-full bg-slate-300/70"
        style={{ top: `${thumb.topPct}%`, height: `${thumb.alturaPct}%` }}
      />
    </div>
  )
}

export default function Layout() {
  const [chatAberto, setChatAberto] = useState(false)
  // No celular o chat é overlay em tela cheia — o conteúdo NÃO recua.
  const isMobile = useIsMobile()
  const chatDesktop = chatAberto && !isMobile

  // Ao abrir o chat, o menu da esquerda FECHA (desliza pra fora). Ao fechar, volta.
  const [sidebarAberto, setSidebarAberto] = useState(true)
  useEffect(() => { setSidebarAberto(!chatDesktop) }, [chatDesktop])

  const { pathname } = useLocation()
  const mostrarBarraScroll = !ROTAS_SEM_BARRA_SCROLL.includes(pathname)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Trocar de página muda o conteúdo (e a altura de rolagem) sem disparar
  // scroll/resize sozinho — sem isto a barrinha ficava com o tamanho da
  // página anterior até o usuário rolar uma vez.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <SidebarProvider open={sidebarAberto} onOpenChange={setSidebarAberto}>
      <HeaderExtraProvider>
        <div className="flex h-screen w-full bg-background overflow-hidden">
          <AppSidebar />
          <main
            className="flex flex-1 flex-col w-full min-w-0 min-h-0 transition-[margin] duration-300 ease-in-out"
            style={{ marginRight: chatDesktop ? LARGURA_CHAT : 0 }}
          >
            <TopHeader />
            <AvisoAssinatura />
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                // `pr-8` fixo (não escala com o breakpoint como o resto do
                // padding) — é a folga mínima pra nunca o conteúdo (cards)
                // encostar na `BarraDeScroll`, que fica a 24-30px da borda
                // direita: em telas estreitas o `p-4` (16px) sozinho era menor
                // que isso, e a barra ficava por cima da borda dos cards.
                className="h-full overflow-auto sem-barra pl-4 sm:pl-6 lg:pl-8 pr-8 py-4 sm:py-6 lg:py-8 animate-fade-in"
              >
                <Outlet />
              </div>
              {mostrarBarraScroll && <BarraDeScroll containerRef={scrollRef} />}
            </div>
          </main>
          <ChatFab open={chatAberto} onOpenChange={setChatAberto} />
        </div>
      </HeaderExtraProvider>
    </SidebarProvider>
  )
}
