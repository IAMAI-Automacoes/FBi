import { useRef, useState } from 'react'
import { Bell, BellOff, ChevronDown, Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { iphoneSemApp, pedirPermissaoEInscrever, pushSuportado } from '@/lib/push'

/**
 * Controles de conversa compartilhados pela tela WhatsApp, pelo chat de
 * suporte do dono e pelo suporte no painel do admin (mesmo jeito do WhatsApp).
 */

/**
 * Sino do cabeçalho: silencia/reativa TODAS as notificações do canal.
 * Se o aparelho ainda não deu permissão de notificação, o primeiro clique
 * pede a permissão (sem ela não há o que silenciar).
 */
export function BotaoSino({ silenciado, aoAlternar, claro = false, rotulo = 'notificações' }: {
  silenciado: boolean
  aoAlternar: () => void
  /** Ícone branco, para cabeçalho verde. */
  claro?: boolean
  rotulo?: string
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [pedindo, setPedindo] = useState(false)

  const clicar = async () => {
    if (silenciado || !pushSuportado()) {
      if (!pushSuportado() && iphoneSemApp()) {
        toast({ title: 'Notificações no iPhone', description: 'Adicione o EasyFeed à Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber notificações.' })
      }
      aoAlternar()
      return
    }
    if (Notification.permission === 'default' && user) {
      setPedindo(true)
      const p = await pedirPermissaoEInscrever(user.id)
      setPedindo(false)
      if (p === 'granted') { toast({ title: 'Notificações ativadas' }); return }
      if (p === 'denied') return
    }
    aoAlternar()
    toast({ title: `As ${rotulo} foram silenciadas`, description: 'Toque no sino de novo para voltar a receber.' })
  }

  const titulo = silenciado ? `Reativar ${rotulo}` : `Silenciar ${rotulo}`
  return (
    <button
      type="button"
      onClick={clicar}
      disabled={pedindo}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        claro ? 'text-white/90 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
      )}
      title={titulo}
      aria-label={titulo}
      aria-pressed={silenciado}
    >
      {silenciado ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
    </button>
  )
}

/**
 * Menu da conversa na lista: Fixar/Desafixar e Silenciar/Reativar. No
 * computador aparece a setinha ao passar o mouse (como no WhatsApp Web); no
 * celular, segurar o dedo na conversa abre o menu.
 */
export function MenuConversa({ fixada, silenciada, aoFixar, aoSilenciar, aberto, aoMudarAberto, className }: {
  fixada: boolean
  silenciada: boolean
  aoFixar: () => void
  aoSilenciar: () => void
  aberto: boolean
  aoMudarAberto: (v: boolean) => void
  className?: string
}) {
  return (
    <DropdownMenu open={aberto} onOpenChange={aoMudarAberto}>
      <DropdownMenuTrigger
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-black/5',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
          className,
        )}
        aria-label="Opções da conversa"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={aoFixar}>
          {fixada ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
          {fixada ? 'Desafixar conversa' : 'Fixar conversa'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={aoSilenciar}>
          {silenciada ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
          {silenciada ? 'Reativar notificações' : 'Silenciar notificações'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Segurar o dedo ~0,5 s (celular) ou clicar com o botão direito abre o menu. */
export function useSeguraParaMenu(abrir: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abriu = useRef(false)
  const cancelar = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      abriu.current = false
      if (e.pointerType === 'mouse') return
      cancelar()
      timer.current = setTimeout(() => { abriu.current = true; abrir() }, 500)
    },
    onPointerUp: cancelar,
    onPointerLeave: cancelar,
    onPointerMove: (e: React.PointerEvent) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancelar() },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); abrir() },
    /** Depois de abrir pelo "segurar", o clique que vem junto não abre a conversa. */
    engolirClique: () => { const a = abriu.current; abriu.current = false; return a },
  }
}

/** Ícones pequenos ao lado do horário/contador: fixada e silenciada. */
export function MarcasConversa({ fixada, silenciada }: { fixada: boolean; silenciada: boolean }) {
  if (!fixada && !silenciada) return null
  return (
    <span className="flex shrink-0 items-center gap-1 text-gray-400">
      {silenciada && <BellOff className="h-3.5 w-3.5" aria-label="Silenciada" />}
      {fixada && <Pin className="h-3.5 w-3.5 -rotate-45 fill-current" aria-label="Fixada" />}
    </span>
  )
}
