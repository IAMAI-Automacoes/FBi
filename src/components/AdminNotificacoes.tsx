import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'

/**
 * Notificação do navegador (Web Notifications API) para o admin da plataforma
 * quando chega mensagem nova de cliente no suporte:
 *   - INSERT em `sugestoes_plataforma`  → nova dúvida/sugestão
 *   - INSERT em `respostas_sugestoes` com autor='usuario' → resposta do cliente
 *
 * Fica montado no App inteiro (dentro do AuthProvider + Router), então funciona
 * em qualquer rota e mesmo com a aba em segundo plano — que é justamente quando
 * a notificação do sistema é útil. Quando a aba está visível, não notifica (o
 * badge vermelho do topo já sinaliza), pra não alertar duas vezes.
 */
export function AdminNotificacoes() {
  const { ehAdminPlataforma } = useAuth()
  const navigate = useNavigate()
  // navigate troca de identidade a cada render; guardamos numa ref pra usar no
  // onclick da notificação sem precisar recriar a subscription do realtime.
  const navRef = useRef(navigate)
  navRef.current = navigate

  useEffect(() => {
    if (!ehAdminPlataforma) return
    if (typeof Notification === 'undefined') return // navegador sem suporte

    // Pedir permissão precisa partir de um gesto do usuário (exigência de
    // Chrome/Firefox/Safari). Pedimos na primeira interação; o listener some
    // assim que dispara.
    let removerGesto: (() => void) | null = null
    if (Notification.permission === 'default') {
      const pedir = () => {
        try {
          Notification.requestPermission()
        } catch {
          /* Safari antigo usa callback; ignoramos o erro */
        }
        removerGesto?.()
      }
      window.addEventListener('pointerdown', pedir, { once: true })
      window.addEventListener('keydown', pedir, { once: true })
      removerGesto = () => {
        window.removeEventListener('pointerdown', pedir)
        window.removeEventListener('keydown', pedir)
      }
    }

    const resumo = (texto: string | null | undefined, fallback: string) => {
      const t = (texto ?? '').trim()
      if (!t) return fallback
      return t.length > 120 ? `${t.slice(0, 117)}…` : t
    }

    const notificar = (titulo: string, corpo: string) => {
      if (Notification.permission !== 'granted') return
      // Aba visível → não notifica (o admin já está de olho; badge do topo cobre).
      if (!document.hidden) return
      try {
        const n = new Notification(titulo, {
          body: corpo,
          icon: '/favicon.png',
          tag: 'easyfeed-admin-msg', // colapsa várias numa só em vez de empilhar
        })
        n.onclick = () => {
          window.focus()
          navRef.current('/admin')
          n.close()
        }
      } catch {
        /* alguns navegadores exigem Service Worker p/ Notification; ignoramos */
      }
    }

    const canal = supabase
      .channel('admin-notificacoes-navegador')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sugestoes_plataforma' },
        (payload) => {
          const nova = payload.new as { texto?: string; titulo?: string }
          notificar(
            'Nova dúvida de cliente',
            resumo(nova.titulo || nova.texto, 'Abra o painel para ver.'),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' },
        (payload) => {
          const nova = payload.new as { texto?: string; autor?: string }
          if (nova.autor !== 'usuario') return // só mensagens do cliente, não do admin
          notificar('Nova mensagem de cliente', resumo(nova.texto, 'Abra o painel para ver.'))
        },
      )
      .subscribe()

    return () => {
      removerGesto?.()
      supabase.removeChannel(canal)
    }
  }, [ehAdminPlataforma])

  return null
}
