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
    // Três apps no mesmo site: o painel inteiro ("Easy Feed"), o chat de
    // suporte do admin ("Mensagens") e a tela WhatsApp ("Whatsapp EasyFeed").
    // O index.html faz a mesma escolha antes do React, no carregamento.
    const app = pathname.startsWith('/whatsapp') ? 'whatsapp' : pathname.startsWith('/admin') ? 'mensagens' : 'easyfeed'
    const tags = {
      whatsapp: { manifest: '/manifest-whatsapp.webmanifest', icone: '/whatsapp-apple-touch.png', titulo: 'Whatsapp EasyFeed', cor: '#128c7e' },
      mensagens: { manifest: '/manifest-mensagens.webmanifest', icone: '/mensagens-apple-touch.png', titulo: 'Mensagens', cor: '#128c7e' },
      easyfeed: { manifest: '/manifest.webmanifest', icone: '/apple-touch-icon.png', titulo: 'Easy Feed', cor: '#ffffff' },
    }[app]

    const set = (seletor: string, attr: string, valor: string) => {
      const el = document.head.querySelector(seletor)
      if (el) el.setAttribute(attr, valor)
    }

    set('link[rel="manifest"]', 'href', tags.manifest)
    set('link[rel="apple-touch-icon"]', 'href', tags.icone)
    set('meta[name="apple-mobile-web-app-title"]', 'content', tags.titulo)
    set('meta[name="theme-color"]', 'content', tags.cor)
  }, [pathname])

  return null
}
