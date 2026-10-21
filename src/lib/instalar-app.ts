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
// De qual app é o `pedido`: o do manifest ligado na página quando o
// navegador ofereceu (ManifestPorRota troca o manifest ao trocar de página, e
// o Chrome oferece de novo para o manifest novo).
let appDoPedido: AppInstalavel | null = null
// Em que página este carregamento começou (janela aberta pelo ícone).
const appInicial: AppInstalavel = typeof window !== 'undefined' ? appDaRota(window.location.pathname) : 'easyfeed'

/** De qual app é o manifest ligado na página agora. */
function appDoManifestAtual(): AppInstalavel {
  const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? ''
  const achado = (Object.keys(MANIFESTO_DO_APP) as AppInstalavel[]).find((a) => href.endsWith(MANIFESTO_DO_APP[a]))
  return achado ?? appDaRota(window.location.pathname)
}

function ligarManifest(app: AppInstalavel) {
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', MANIFESTO_DO_APP[app])
}

// Quem está esperando o navegador oferecer um app (ver `instalar`).
const esperandoPedido = new Set<() => void>()

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
    appDoPedido = appDoManifestAtual()
    // O navegador só oferece o que NÃO está instalado: se estava marcado
    // como instalado, a pessoa apagou o ícone. O botão volta a aparecer.
    desmarcarInstalado(appDoPedido)
    esperandoPedido.forEach((avisar) => avisar())
    window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  })
  window.addEventListener('appinstalled', () => {
    marcarInstalado(appDoPedido ?? appDoManifestAtual())
    pedido = null
    appDoPedido = null
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
  try {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<AppRelacionado[]> }
    if (nav.getInstalledRelatedApps) {
      const apps = await nav.getInstalledRelatedApps()
      const achou = apps.some((a) => a.platform === 'webapp' && !!a.url?.endsWith(MANIFESTO_DO_APP[app]))
      if (achou) { marcarInstalado(app); return true }
      // No Android a resposta do Chrome vale: não achou = foi desinstalado,
      // e a marca deste aparelho estava velha. (No computador ele nem sempre
      // enxerga os apps instalados; lá a marca continua valendo.)
      if (/Android/i.test(navigator.userAgent)) { desmarcarInstalado(app); return false }
    }
  } catch { /* sem resposta do navegador: vale a marca */ }
  return jaInstalado(app)
}

export function ehIphone(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** O navegador ofereceu instalar (em alguma página deste carregamento)? */
export function existePedidoDeInstalar(): boolean {
  return !!pedido
}

/** O navegador já ofereceu o app `app` (com o manifest dele ligado na página)? */
export function podeInstalarAqui(app: AppInstalavel): boolean {
  return !!pedido && appDoPedido === app && appDoManifestAtual() === app
}

/** Navegador que oferece instalar com um toque (Chrome, Edge, Samsung Internet novo). */
export function navegadorInstalaComUmToque(): boolean {
  return typeof window !== 'undefined' && 'onbeforeinstallprompt' in window
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

/** A página de onde o app `app` se instala (no iPhone, é preciso estar nela). */
export function rotaDoApp(app: AppInstalavel): string {
  return ROTA_DO_APP[app]
}

/**
 * Enquanto o passo a passo pelo menu do navegador está aberto, a página
 * apresenta o manifest do app pedido: o "Instalar app" do menu instala ESTE
 * app, e não o da página onde a pessoa está (o ZapFeed pedido no Perfil).
 */
export function apresentarApp(app: AppInstalavel) {
  ligarManifest(app)
}

/** Volta ao manifest da página atual (ao fechar o passo a passo). */
export function apresentarAppDaPagina() {
  ligarManifest(appDaRota(window.location.pathname))
}

/** Endereço completo que abre (e instala) o app `app` no navegador. */
export function enderecoDoApp(app: AppInstalavel): string {
  return `${window.location.origin}${ROTA_DO_APP[app]}`
}

// Quanto esperar o navegador oferecer depois de trocar o manifest. O Chrome
// só deixa abrir a janela de instalar até ~5 s depois do clique.
const ESPERA_PEDIDO_MS = 4000

function esperarPedido(app: AppInstalavel): Promise<boolean> {
  return new Promise((resolver) => {
    const terminar = (veio: boolean) => {
      clearTimeout(prazo)
      esperandoPedido.delete(avisar)
      resolver(veio)
    }
    const avisar = () => { if (appDoPedido === app) terminar(true) }
    const prazo = setTimeout(() => terminar(false), ESPERA_PEDIDO_MS)
    esperandoPedido.add(avisar)
  })
}

/**
 * Pede a instalação do app `app` — de qualquer página, num toque só.
 *
 * O navegador só oferece o app do manifest ligado na página, e só se ele
 * ainda não está instalado: na página do Easy Feed já instalado, por exemplo,
 * não há oferta nenhuma, e o ZapFeed caía no passo a passo dos três pontinhos.
 * Então, se a oferta não é deste app, liga o manifest dele e espera o
 * navegador oferecer (ele reavalia quando o manifest muda) — ainda dentro do
 * tempo do clique. Depois devolve o manifest da página.
 * Devolve 'aceito' | 'recusado' | 'indisponivel' (sem oferta: passo a passo).
 */
export async function instalar(app: AppInstalavel): Promise<'aceito' | 'recusado' | 'indisponivel'> {
  if (!navegadorInstalaComUmToque()) return 'indisponivel'
  const devolverManifest = () => ligarManifest(appDaRota(window.location.pathname))
  if (!podeInstalarAqui(app)) {
    // O manifest já é o deste app e o navegador não ofereceu: trocar não muda nada.
    if (appDoManifestAtual() === app) return 'indisponivel'
    pedido = null
    appDoPedido = null
    ligarManifest(app)
    if (!(await esperarPedido(app))) {
      devolverManifest()
      return 'indisponivel'
    }
  }
  const atual = pedido
  if (!atual) return 'indisponivel'
  try {
    await atual.prompt()
  } catch {
    devolverManifest()
    return 'indisponivel'
  }
  const { outcome } = await atual.userChoice
  pedido = null
  appDoPedido = null
  if (outcome === 'accepted') marcarInstalado(app)
  devolverManifest()
  window.dispatchEvent(new Event('easyfeed:pode-instalar'))
  return outcome === 'accepted' ? 'aceito' : 'recusado'
}
