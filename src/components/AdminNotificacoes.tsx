import { useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { buscarTotalNaoLidas } from '@/lib/queries/admin'
import { atualizarBadgeApp } from '@/lib/notificacoes-app'

// Chave pública VAPID (é pública por design — pode ficar no bundle). A privada
// vive só no servidor (integracao_config), usada pela edge function enviar-push.
const VAPID_PUBLIC_KEY =
  'BLfkBUJBdJzyAs5A-8Q-daniHRzoie_v2PkwZPHhMIG4X9Ix8thCjJEX9Zwiw4CmsLpnHHgpfPVA3sdBXQWI_o4'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

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
      if (Notification.permission !== 'granted') return
      try {
        const reg = await navigator.serviceWorker.ready
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }))
        if (cancelado) return

        const json = sub.toJSON()
        const endpoint = json.endpoint
        const p256dh = json.keys?.p256dh
        const auth = json.keys?.auth
        if (!endpoint || !p256dh || !auth) return

        await supabase.from('push_subscriptions').upsert(
          { auth_user_id: user.id, endpoint, p256dh, auth, user_agent: navigator.userAgent },
          { onConflict: 'endpoint' },
        )
      } catch (err) {
        console.warn('Falha ao inscrever no push:', err)
      }
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
