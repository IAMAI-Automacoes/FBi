import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissoes } from '@/hooks/use-permissoes'
import { iphoneSemApp, inscreverPush, pedirPermissaoEInscrever, pushSuportado } from '@/lib/push'

// ── Som de mensagem nova (com a página aberta) ─────────────────────────────

const CHAVE_SOM = 'easyfeed:wa-som'

export function lerSomAtivo(): boolean {
  try { return localStorage.getItem(CHAVE_SOM) !== 'desligado' } catch { return true }
}
export function gravarSomAtivo(ativo: boolean) {
  try { localStorage.setItem(CHAVE_SOM, ativo ? 'ligado' : 'desligado') } catch { /* sem armazenamento: vale só nesta visita */ }
}

let ctxSom: AudioContext | null = null
/** "Plim" curto de duas notas, gerado na hora (sem arquivo de som para baixar). */
export function tocarSomMensagem() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctxSom ??= new Ctx()
    const ctx = ctxSom
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const agora = ctx.currentTime
    for (const [freq, ini] of [[880, 0], [1318.5, 0.09]] as const) {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      ganho.gain.setValueAtTime(0.0001, agora + ini)
      ganho.gain.exponentialRampToValueAtTime(0.18, agora + ini + 0.015)
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + ini + 0.22)
      osc.connect(ganho).connect(ctx.destination)
      osc.start(agora + ini)
      osc.stop(agora + ini + 0.25)
    }
  } catch { /* navegador sem áudio: só não toca */ }
}

// ── Inscrição em segundo plano (montada no Layout) ─────────────────────────

/**
 * Quem já deu permissão de notificação tem o aparelho inscrito sempre que
 * abre o painel (a inscrição pode mudar quando o navegador a renova). Nunca
 * pede permissão sozinho: quem pede é o aviso da tela WhatsApp, num clique.
 */
export function NotificacoesWhatsapp() {
  const { user, usuario } = useAuth()
  const { podeVer, carregando } = usePermissoes()
  const pode = !carregando && !!usuario?.restaurante_id && podeVer('whatsapp')
  useEffect(() => {
    if (!user || !pode || !pushSuportado() || Notification.permission !== 'granted') return
    inscreverPush(user.id)
  }, [user, pode])
  return null
}

// ── Aviso no topo da lista ─────────────────────────────────────────────────

const CHAVE_AVISO = 'easyfeed:wa-aviso-notificacao'

export function AvisoNotificacoes() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<NotificationPermission | 'sem-suporte' | 'iphone'>(() => {
    if (iphoneSemApp()) return 'iphone'
    if (!pushSuportado()) return 'sem-suporte'
    return Notification.permission
  })
  const [fechado, setFechado] = useState(() => {
    try { return localStorage.getItem(CHAVE_AVISO) === estado } catch { return false }
  })
  const [pedindo, setPedindo] = useState(false)

  if (fechado || estado === 'granted' || estado === 'sem-suporte') return null

  const fechar = () => {
    setFechado(true)
    try { localStorage.setItem(CHAVE_AVISO, estado) } catch { /* ignora */ }
  }

  const ativar = async () => {
    if (!user) return
    setPedindo(true)
    setEstado(await pedirPermissaoEInscrever(user.id))
    setPedindo(false)
  }

  return (
    <div className="flex shrink-0 items-start gap-3 bg-[#E7F3FF] px-4 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#53BDEB] text-white">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-gray-700">
        {estado === 'default' && (
          <>
            <p className="font-medium text-gray-900">Receba aviso de mensagens novas</p>
            <button type="button" onClick={ativar} disabled={pedindo} className="mt-0.5 font-medium text-[#027EB5] hover:underline disabled:opacity-60">
              {pedindo ? 'Ativando…' : 'Ativar notificações'}
            </button>
          </>
        )}
        {estado === 'denied' && (
          <p>As notificações estão bloqueadas neste navegador. Para receber avisos, libere nas permissões do site (ícone do cadeado ao lado do endereço).</p>
        )}
        {estado === 'iphone' && (
          <p>No iPhone, as notificações só funcionam com o EasyFeed na Tela de Início: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e abra por lá.</p>
        )}
      </div>
      <button type="button" onClick={fechar} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="Fechar aviso">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
