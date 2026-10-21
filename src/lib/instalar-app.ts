/**
 * Instalar o app na tela inicial (PWA).
 *
 * O Chrome/Edge (Android e computador) dispara `beforeinstallprompt` UMA vez
 * por carregamento de página, com o manifest que estava valendo. Este módulo
 * é importado no main.tsx para pegar o evento antes do React montar; a tela
 * chama `instalar()` num clique. No iPhone não existe esse evento: lá a tela
 * mostra o passo a passo (Compartilhar → Adicionar à Tela de Início). Onde o
 * navegador não oferece (Samsung Internet, Firefox, Chrome antes de "gostar"
 * do site), também: o passo a passo pelo menu do navegador.
 *
 * Três apps no mesmo site (ver ManifestPorRota): o painel ("Easy Feed"), a
 * tela WhatsApp ("ZapFeed") e o chat de suporte do admin ("Mensagens").
 * O ZapFeed é SÓ a tela WhatsApp: aberto pelo ícone dele, o resto do painel
 * não aparece (ver `noZapFeed` e o Layout).
 */

export type AppInstalavel = 'easyfeed' | 'whatsapp' | 'mensagens'

/** Qual app o manifest desta rota instala (o index.html faz a mesma conta). */
export function appDaRota(pathname: string): AppInstalavel {
  if (pathname.startsWith('/whatsapp')) return 'whatsapp'
  if (pathname.startsWith('/admin')) return 'mensagens'
  return 'easyfeed'
}

// Para onde recarregar quando o pedido do navegador é de outro app.
const ROTA_DO_APP: Record<AppInstalavel, string> = {
  easyfeed: '/',
  whatsapp: '/whatsapp',
  mensagens: '/admin',
}

// O manifest de cada app (o `related_applications` dos três aponta para eles).
const MANIFESTO_DO_APP: Record<AppInstalavel, string> = {
  easyfeed: '/manifest.webmanifest',
  whatsapp: '/manifest-whatsapp.webmanifest',
  mensagens: '/manifest-mensagens.webmanifest',
}

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pedido: EventoInstalar | null = null
// Em que página este carregamento começou: o pedido é do manifest DELA.
const appInicial: AppInstalavel = typeof window !== 'undefined' ? appDaRota(window.location.pathname) : 'easyfeed'

const CHAVE_ABERTO = 'easyfeed:app-aberto'
const chaveInstalado = (app: AppInstalavel) => `easyfeed:instalado:${app}`

function marcarInstalado(app: AppInstalavel) {
  try { localStorage.setItem(chaveInstalado(app), '1') } catch { /* sem armazenamento */ }
}

function desmarcarInstalado(app: AppInstalavel) {
  try { localStorage.removeItem(chaveInstalado(app)) } catch { /* sem armazenamento */ }
}

const ehApp = (v: string | null): v is AppInstalavel => v === 'easyfeed' || v === 'whatsapp' || v === 'mensagens'

/** Rodando como app instalado (aberto pelo ícone)? Qualquer um dos três. */
export function ehAppInstalado(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pedido = e as EventoInstalar
    // O navegador só oferece o que NÃO está instalado: se estava marcado
    // como instalado, a pessoa apagou o ícone. O botão volta a aparecer.
    desmarcarInstalado(appInicial)
    window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  })
  window.addEventListener('appinstalled', () => {
    pedido = null
    marcarInstalado(appInicial)
    window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  })
  // Aberto pelo ícone: lembra QUAL app é esta janela. O ?app= do start_url
  // de cada manifest diz na primeira carga (a tela limpa a URL depois) e
  // vale mais que o gravado; recargas na mesma janela mantêm o gravado. Sem
  // nenhum dos dois (janela aberta por uma notificação), vale a rota.
  if (ehAppInstalado()) {
    try {
      const doParam = new URLSearchParams(window.location.search).get('app')
      const gravado = sessionStorage.getItem(CHAVE_ABERTO)
      const aberto: AppInstalavel = ehApp(doParam) ? doParam : ehApp(gravado) ? gravado : appInicial
      sessionStorage.setItem(CHAVE_ABERTO, aberto)
      marcarInstalado(aberto)
    } catch { /* sem armazenamento */ }
  }
}

/** Esta janela é o app `app` instalado? */
export function abertoComoApp(app: AppInstalavel): boolean {
  if (!ehAppInstalado()) return false
  try {
    return (sessionStorage.getItem(CHAVE_ABERTO) ?? appInicial) === app
  } catch {
    return appInicial === app
  }
}

/** Esta janela é o ZapFeed (só a tela WhatsApp, sem o resto do painel)? */
export function noZapFeed(): boolean {
  return abertoComoApp('whatsapp')
}

/** Este aparelho já instalou (ou abriu pelo ícone) o app `app`? */
export function jaInstalado(app: AppInstalavel): boolean {
  try { return localStorage.getItem(chaveInstalado(app)) === '1' } catch { return false }
}

interface AppRelacionado { platform: string; url?: string; id?: string }

/**
 * `jaInstalado` + o que o navegador sabe: o Chrome (Android e computador)
 * responde, pelo `related_applications` dos manifests, quais dos três apps
 * estão instalados — inclusive os instalados antes deste aviso existir.
 */
export async function instaladoNoAparelho(app: AppInstalavel): Promise<boolean> {
  if (podeInstalarAqui(app)) return false
  if (jaInstalado(app)) return true
  try {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<AppRelacionado[]> }
    if (!nav.getInstalledRelatedApps) return false
    const apps = await nav.getInstalledRelatedApps()
    const achou = apps.some((a) => a.platform === 'webapp' && !!a.url?.endsWith(MANIFESTO_DO_APP[app]))
    if (achou) marcarInstalado(app)
    return achou
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

/** Dá para pedir ao navegador o app `app` agora, sem recarregar? */
export function podeInstalarAqui(app: AppInstalavel): boolean {
  return !!pedido && appInicial === app
}

/**
 * Como a pessoa instala aqui, quando o navegador não oferece com um toque:
 * 'iphone' (Compartilhar), 'samsung' (menu ≡), 'android' (menu ⋮ do Chrome),
 * 'outro' (computador: ícone na barra de endereço).
 */
export function jeitoDeInstalar(): 'iphone' | 'samsung' | 'android' | 'outro' {
  if (ehIphone()) return 'iphone'
  if (/SamsungBrowser/i.test(navigator.userAgent)) return 'samsung'
  if (/Android/i.test(navigator.userAgent)) return 'android'
  return 'outro'
}

/** Endereço completo que abre (e instala) o app `app` no navegador. */
export function enderecoDoApp(app: AppInstalavel): string {
  return `${window.location.origin}${ROTA_DO_APP[app]}`
}

/**
 * Pede a instalação. Se este carregamento começou na página de outro app, o
 * pedido do navegador seria do app errado (o manifest é lido no carregamento):
 * então recarrega na rota certa, e lá a pessoa toca de novo.
 * Devolve 'recarregando' | 'aceito' | 'recusado' | 'indisponivel'.
 */
export async function instalar(app: AppInstalavel): Promise<'recarregando' | 'aceito' | 'recusado' | 'indisponivel'> {
  if (pedido && appInicial !== app) {
    window.location.assign(`${ROTA_DO_APP[app]}?instalar=1`)
    return 'recarregando'
  }
  if (!pedido) return 'indisponivel'
  const atual = pedido
  await atual.prompt()
  const { outcome } = await atual.userChoice
  pedido = null
  if (outcome === 'accepted') marcarInstalado(app)
  window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  return outcome === 'accepted' ? 'aceito' : 'recusado'
}
