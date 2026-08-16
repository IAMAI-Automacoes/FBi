/**
 * Pontes entre o app (React) e as APIs do navegador ligadas a notificação:
 *  1. Avisar o Service Worker qual conversa do painel de suporte está aberta
 *     agora, para ele decidir se mostra ou não um push que chega (ver `sw.js`).
 *  2. Atualizar o "numerozinho" no ícone do app instalado (Badging API).
 */

/**
 * Informa ao Service Worker qual conversa (usuario_id) está com a tela aberta
 * e visível neste momento — `null` quando nenhuma está (fechou o chat, trocou
 * de aba, saiu da página). O SW usa isso para só suprimir a notificação da
 * conversa que realmente está sendo olhada; qualquer outra ainda notifica.
 */
export function avisarConversaAtiva(usuarioId: string | null): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CONVERSA_ATIVA', usuarioId })
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
