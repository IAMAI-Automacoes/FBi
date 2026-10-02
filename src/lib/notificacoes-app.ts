/**
 * Pontes entre o app (React) e as APIs do navegador ligadas a notificação:
 *  1. Avisar o Service Worker qual conversa está aberta agora, para ele não
 *     mostrar o push dela (ver `sw.js`), e fechar as notificações dela.
 *  2. Atualizar o "numerozinho" no ícone do app instalado (Badging API).
 *
 * Chaves de conversa (as mesmas do campo `chaves` do push — enviar-push):
 *   'wa:<chat_id>'  conversa do WhatsApp
 *   'suporte'       chat de suporte do dono (/sugestoes)
 *   '<usuario_id>'  conversa de suporte de um cliente, no painel do admin
 */

/**
 * Informa ao Service Worker qual conversa está com a tela aberta e visível
 * neste momento — `null` quando nenhuma está (fechou o chat, trocou de aba,
 * saiu da página). O SW só deixa de mostrar o push DESTA conversa; qualquer
 * outra ainda notifica. Abrir a conversa também fecha, neste aparelho, as
 * notificações dela que estavam na tela (como o WhatsApp).
 */
export function avisarConversaAtiva(chave: string | null): void {
  conversaAtiva = chave
  navigator.serviceWorker?.controller?.postMessage({ type: 'CONVERSA_ATIVA', usuarioId: chave })
  if (chave && document.visibilityState === 'visible') fecharNotificacoesDe(chave)
}

// A mesma informação, guardada também aqui: é o que os sons do painel usam
// para não tocar na conversa que a pessoa já está olhando.
let conversaAtiva: string | null = null

// O service worker não fica sempre vivo: ao reiniciar, esquece qual conversa
// cada janela mostra e pergunta de novo antes de decidir (sw.js).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if ((e.data as { type?: string } | null)?.type !== 'QUAL_CONVERSA') return
    const chave = document.visibilityState === 'visible' ? conversaAtiva : null
    ;(e.source as ServiceWorker | null)?.postMessage({ type: 'CONVERSA_ATIVA', usuarioId: chave })
  })
}

/** Fecha as notificações desta conversa que estão na tela deste aparelho. */
export function fecharNotificacoesDe(chave: string): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration()
    .then((reg) => reg?.getNotifications())
    .then((lista) => {
      for (const n of lista ?? []) {
        const d = n.data as { chaves?: string[]; usuarioId?: string | null } | null
        const chaves = d?.chaves ?? (d?.usuarioId ? [d.usuarioId] : [])
        if (chaves.includes(chave)) n.close()
      }
    })
    .catch(() => {})
}

/** A pessoa está olhando esta conversa agora (aberta E com a aba visível)? */
export function estaOlhando(chave: string): boolean {
  return conversaAtiva === chave && document.visibilityState === 'visible'
}

/**
 * O som cabe a ESTA aba? Um aviso, um som só:
 *  - com notificações permitidas, a aba EM FOCO toca o som, e a notificação
 *    do sistema chega SEM som (sw.js); sem aba em foco, quem avisa é a
 *    notificação do sistema, com o som dela. Assim duas abas abertas não
 *    tocam juntas, e a notificação não toca junto com a página;
 *  - sem notificações (permissão negada ou nunca pedida), o som da página é o
 *    único aviso: toca mesmo com a aba em segundo plano.
 */
export function somCabeAEstaAba(): boolean {
  const comPush = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  if (!comPush) return true
  return document.visibilityState === 'visible' && document.hasFocus()
}

/**
 * Badge do ícone do app (Badging API) — mostra a contagem de não lidas no
 * ícone, como um app de mensagens. Suporte real hoje é Chrome/Edge (Android e
 * desktop instalado); em navegadores sem suporte (ex.: Safari/iOS) a chamada
 * é simplesmente ignorada, sem erro.
 */
export function atualizarBadgeApp(total: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (!nav.setAppBadge) return
  if (total > 0) nav.setAppBadge(total).catch(() => {})
  else nav.clearAppBadge?.().catch(() => {})
}
