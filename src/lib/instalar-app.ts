/**
 * Instalar o app na tela inicial (PWA).
 *
 * O Chrome/Edge (Android e computador) dispara `beforeinstallprompt` UMA vez
 * por carregamento de página, com o manifest que estava valendo. Este módulo
 * é importado no main.tsx para pegar o evento antes do React montar; a tela
 * chama `instalar()` num clique. No iPhone não existe esse evento: lá a tela
 * mostra o passo a passo (Compartilhar → Adicionar à Tela de Início).
 */

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pedido: EventoInstalar | null = null
// Em que página este carregamento começou: o pedido é do manifest DELA.
const paginaInicial = typeof window !== 'undefined' ? window.location.pathname : '/'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pedido = e as EventoInstalar
    window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  })
  window.addEventListener('appinstalled', () => {
    pedido = null
    window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  })
}

/** Rodando como app instalado (aberto pelo ícone)? */
export function ehAppInstalado(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

export function ehIphone(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** O navegador ofereceu instalar (em alguma página deste carregamento)? */
export function existePedidoDeInstalar(): boolean {
  return !!pedido
}

/** Dá para oferecer o botão de instalar o app DESTA rota agora? */
export function podeInstalarAqui(rota: string): boolean {
  return !!pedido && paginaInicial.startsWith(rota)
}

/**
 * Pede a instalação. Se este carregamento começou em outra página, o pedido
 * do navegador seria do app errado (o manifest é lido no carregamento): então
 * recarrega na rota certa, e lá a pessoa toca de novo.
 * Devolve 'recarregando' | 'aceito' | 'recusado' | 'indisponivel'.
 */
export async function instalar(rota: string): Promise<'recarregando' | 'aceito' | 'recusado' | 'indisponivel'> {
  if (!paginaInicial.startsWith(rota)) {
    window.location.assign(`${rota}?instalar=1`)
    return 'recarregando'
  }
  if (!pedido) return 'indisponivel'
  const atual = pedido
  await atual.prompt()
  const { outcome } = await atual.userChoice
  pedido = null
  window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  return outcome === 'accepted' ? 'aceito' : 'recusado'
}
