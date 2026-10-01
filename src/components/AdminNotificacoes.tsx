import { useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { buscarTotalNaoLidas } from '@/lib/queries/admin'
import { atualizarBadgeApp } from '@/lib/notificacoes-app'
import { inscreverPush } from '@/lib/push'

/**
 * Inscreve o admin da plataforma no Web Push, pra receber notificação de
 * mensagem de cliente MESMO com o app fechado. Quem mostra a notificação é o
 * service worker (sw.js), a partir do push enviado pela edge function
 * `enviar-push` (disparada por gatilho no banco). Este componente só:
 *   1. pede permissão (no primeiro gesto — exigência do navegador);
 *   2. cria/recupera a inscrição de push e a salva em `push_subscriptions`.
 */
export function AdminNotificacoes() {
  const { ehAdminPlataforma, user } = useAuth()

  useEffect(() => {
    if (!ehAdminPlataforma || !user) return
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return

    let cancelado = false

    const inscrever = async () => {
      if (cancelado) return
      await inscreverPush(user.id)
    }

    let removerGesto: (() => void) | null = null
    if (Notification.permission === 'granted') {
      inscrever()
    } else if (Notification.permission === 'default') {
      // Chrome/Firefox/Safari exigem que o pedido de permissão venha de um gesto.
      const pedir = async () => {
        try {
          const p = await Notification.requestPermission()
          if (p === 'granted') inscrever()
        } catch {
          /* Safari antigo usa callback; ignoramos */
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

    return () => {
      cancelado = true
      removerGesto?.()
    }
  }, [ehAdminPlataforma, user])

  /**
   * Mantém o badge do ícone do app (celular) com o total de mensagens de
   * suporte não lidas — igual ao numerozinho que WhatsApp/Instagram mostram.
   * Este componente fica montado o tempo todo (App.tsx), então funciona em
   * qualquer página do painel, não só dentro de /admin.
   *
   * Três fontes, para o número nunca ficar desatualizado:
   *  1. Busca inicial ao montar.
   *  2. Evento `fib-unread-update`: quando o Admin.tsx está aberto, ele já
   *     recalcula o total localmente — reaproveita em vez de buscar de novo.
   *  3. Realtime: cobre quando o admin está em outra página (Admin.tsx
   *     desmontado) e chega mensagem nova ou uma conversa é marcada como lida.
   */
  useEffect(() => {
    if (!ehAdminPlataforma) return

    const atualizar = () => buscarTotalNaoLidas().then(atualizarBadgeApp).catch(() => {})
    atualizar()

    const aoAtualizarEvento = (e: Event) => {
      atualizarBadgeApp((e as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener('fib-unread-update', aoAtualizarEvento)

    const ch = supabase
      .channel('badge-app-nao-lidas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' }, atualizar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma' }, atualizar)
      .subscribe()

    return () => {
      window.removeEventListener('fib-unread-update', aoAtualizarEvento)
      supabase.removeChannel(ch)
    }
  }, [ehAdminPlataforma])

  return null
}
