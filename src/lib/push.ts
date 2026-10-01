import { supabase } from '@/lib/supabase/client'

/**
 * Inscrição do aparelho no Web Push — usada pelo admin da plataforma
 * (mensagens de suporte) e pelo dono do restaurante (tela WhatsApp). Quem
 * mostra a notificação é o service worker (public/sw.js); quem envia é a edge
 * function enviar-push. A inscrição é por aparelho e por pessoa
 * (push_subscriptions), e a função decide quem recebe o quê.
 */

// Chave pública VAPID (é pública por design — pode ficar no bundle). A privada
// vive só no servidor (integracao_config), usada pela edge function enviar-push.
const VAPID_PUBLIC_KEY =
  'BLfkBUJBdJzyAs5A-8Q-daniHRzoie_v2PkwZPHhMIG4X9Ix8thCjJEX9Zwiw4CmsLpnHHgpfPVA3sdBXQWI_o4'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Sobre um ArrayBuffer explícito: o tipo do `applicationServerKey` não
  // aceita Uint8Array de SharedArrayBuffer (erro de tipo desde o TS 5.7).
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** O navegador sabe fazer push? (Safari no iPhone só dentro do app instalado.) */
export function pushSuportado(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

/** iPhone/iPad fora do app instalado: lá o push não existe até instalar. */
export function iphoneSemApp(): boolean {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const instalado =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !instalado
}

/**
 * Cria (ou recupera) a inscrição deste aparelho e salva para esta pessoa.
 * Só funciona com a permissão já dada — quem pede é `pedirPermissaoEInscrever`.
 */
export async function inscreverPush(authUserId: string): Promise<boolean> {
  if (!pushSuportado() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))
    const json = sub.toJSON()
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) return false
    const { error } = await supabase.from('push_subscriptions').upsert(
      { auth_user_id: authUserId, endpoint, p256dh, auth, user_agent: navigator.userAgent },
      { onConflict: 'endpoint' },
    )
    return !error
  } catch (err) {
    console.warn('Falha ao inscrever no push:', err)
    return false
  }
}

/** Pede a permissão (precisa vir de um clique) e inscreve. */
export async function pedirPermissaoEInscrever(authUserId: string): Promise<NotificationPermission> {
  if (!pushSuportado()) return 'denied'
  let p: NotificationPermission = Notification.permission
  if (p === 'default') {
    try {
      p = await Notification.requestPermission()
    } catch {
      return Notification.permission
    }
  }
  if (p === 'granted') await inscreverPush(authUserId)
  return p
}
