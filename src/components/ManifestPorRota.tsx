import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Permite instalar DOIS apps a partir do mesmo site:
 *   - Site inteiro  → "Easy Feed" (manifest padrão), instalável de qualquer página.
 *   - Só o chat     → "Mensagens" (manifest próprio, start_url /admin), instalável
 *                     quando você está no painel admin.
 *
 * Como é um SPA (um único index.html), trocamos as tags do <head> conforme a
 * rota: assim o "Adicionar à tela inicial" pega o app certo. No iOS, que ignora
 * o manifest e usa a URL atual + apple-touch-icon + título, isso também resolve.
 */
export function ManifestPorRota() {
  const { pathname } = useLocation()

  useEffect(() => {
    const ehMensagens = pathname.startsWith('/admin')

    const set = (seletor: string, attr: string, valor: string) => {
      const el = document.head.querySelector(seletor)
      if (el) el.setAttribute(attr, valor)
    }

    set(
      'link[rel="manifest"]',
      'href',
      ehMensagens ? '/manifest-mensagens.webmanifest' : '/manifest.webmanifest',
    )
    set(
      'link[rel="apple-touch-icon"]',
      'href',
      ehMensagens ? '/mensagens-apple-touch.png' : '/apple-touch-icon.png',
    )
    set(
      'meta[name="apple-mobile-web-app-title"]',
      'content',
      ehMensagens ? 'Mensagens' : 'Easy Feed',
    )
    set('meta[name="theme-color"]', 'content', ehMensagens ? '#128c7e' : '#ffffff')
  }, [pathname])

  return null
}
