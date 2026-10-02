import { supabase } from '@/lib/supabase/client'
import { idDoAparelho } from '@/lib/aparelho'

/**
 * Inscrição do aparelho no Web Push — usada pelo admin da plataforma
 * (mensagens de suporte) e pelo dono do restaurante (tela WhatsApp). Quem
 * mostra a notificação é o service worker (public/sw.js); quem envia é a edge
 * function enviar-push. A inscrição é por aparelho (push_subscriptions, com o
 * id de `idDoAparelho`) e pertence a quem está logado nele; a função decide
 * quem recebe o quê, respeitando o silenciar de cada aparelho.
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
  if (!authUserId || !pushSuportado() || Notification.permission !== 'granted') return false
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
    // Pela RPC (e não upsert direto): se outra conta usou este navegador
    // antes, a inscrição passa para quem está logado agora — a RLS não deixava.
    // A RPC usa a conta da sessão (auth.uid()), que é a mesma de `authUserId`.
    const { error } = await supabase.rpc('registrar_push', {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: navigator.userAgent,
      p_aparelho: idDoAparelho(),
    })
    if (error) console.warn('Falha ao salvar a inscrição de push:', error.message)
    return !error
  } catch (err) {
    console.warn('Falha ao inscrever no push:', err)
    return false
  }
}

/**
 * Ao sair da conta: este aparelho para de receber as notificações dela.
 * A inscrição do navegador continua (a permissão também); no próximo login,
 * `inscreverPush` a registra para a conta que entrar.
 */
export async function desinscreverDesteAparelho(): Promise<void> {
  if (!pushSuportado()) return
  try {
    const apagar = async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
    // Sair nunca fica esperando por isto mais que 3 s.
    await Promise.race([apagar(), new Promise((r) => setTimeout(r, 3000))])
  } catch {
    /* sem rede ou sem service worker: na pior das hipóteses, o próximo login assume a inscrição */
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
