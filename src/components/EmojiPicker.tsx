import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

// Emojis rápidos para reação (estilo WhatsApp)
export const EMOJI_QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Sorrisos e pessoas',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
      '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
      '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '💩', '🤡', '👻', '👽', '🤖',
    ],
  },
  {
    label: 'Gestos e mãos',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋',
      '🤚', '🖐️', '🖖', '👋', '🤝', '👏', '🙌', '👐', '🤲', '🙏', '✍️', '💪', '🦾', '👀', '👁️', '🧠',
    ],
  },
  {
    label: 'Corações e símbolos',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '❤️‍🔥', '💯', '💥', '💫', '⭐', '🌟', '✨', '🔥', '🎉', '🎊', '🎈', '🎁', '🏆',
    ],
  },
  {
    label: 'Animais e natureza',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
      '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐢', '🐙', '🐠', '🐬', '🐳', '🌸', '🌻', '🌹', '🌈', '🌙',
    ],
  },
  {
    label: 'Comida e bebida',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
      '🍅', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🍿', '🧀', '🍗', '🍖', '🍰', '🎂', '🍩', '🍪',
      '🍫', '🍬', '🍭', '🍦', '☕', '🍵', '🍺', '🍻', '🥂', '🍷', '🥤', '🧋',
    ],
  },
  {
    label: 'Atividades e objetos',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🏸', '🥅', '🎮', '🎯', '🎲', '🎸', '🎧', '🎵',
      '📱', '💻', '⌨️', '🖥️', '📷', '💡', '🔋', '💰', '💵', '📈', '📉', '📊', '📌', '📎', '✂️', '📝',
      '📅', '⏰', '🔒', '🔑', '🔔', '🚀', '✈️', '🚗', '🏠', '⚡', '☀️', '🌧️', '❄️', '🎓', '👑', '💎',
    ],
  },
]

// ── Emojis recentes (caixa de texto) ─────────────────────────────────────────
const RECENTS_KEY = 'fib_emoji_recentes'
const RECENTS_MAX = 16

export function getRecentEmojis(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(v) ? v.slice(0, RECENTS_MAX) : []
  } catch {
    return []
  }
}

export function addRecentEmoji(emoji: string): void {
  const cur = getRecentEmojis().filter((e) => e !== emoji)
  localStorage.setItem(RECENTS_KEY, JSON.stringify([emoji, ...cur].slice(0, RECENTS_MAX)))
}

/** Painel com muitos emojis, categorizado e com rolagem. */
export function EmojiPicker({
  onSelect, className, highlight, showRecents,
}: {
  onSelect: (emoji: string) => void
  className?: string
  highlight?: string | null
  showRecents?: boolean
}) {
  const recentes = showRecents ? getRecentEmojis() : []
  const categorias = recentes.length > 0
    ? [{ label: 'Usados recentemente', emojis: recentes }, ...EMOJI_CATEGORIES]
    : EMOJI_CATEGORIES

  return (
    <div
      className={cn(
        'w-[288px] max-h-[280px] overflow-y-auto rounded-2xl bg-white shadow-xl border border-gray-300 p-2',
        className,
      )}
    >
      {categorias.map((cat) => (
        <div key={cat.label} className="mb-1.5">
          <p className="text-[10px] font-semibold text-gray-400 px-1 pb-1 pt-0.5 sticky top-0 bg-white z-10">
            {cat.label}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {cat.emojis.map((em, i) => (
              <button
                key={`${cat.label}-${em}-${i}`}
                type="button"
                onClick={() => onSelect(em)}
                className={cn(
                  'h-8 w-8 flex items-center justify-center text-xl rounded-lg transition-colors',
                  highlight === em ? 'bg-[#128C7E]/15 ring-1 ring-[#128C7E]' : 'hover:bg-gray-100',
                )}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Botão de emoji para a barra de input — abre o painel acima do botão. */
export function EmojiInputButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      {open && (
        <div className="absolute bottom-12 left-0 z-30">
          <EmojiPicker
            showRecents
            onSelect={(em) => { addRecentEmoji(em); onPick(em) }}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Emojis"
        className="h-10 w-10 flex items-center justify-center rounded-full bg-white text-gray-500 hover:text-gray-700 shadow-sm transition-colors"
      >
        <Smile className="h-4 w-4" />
      </button>
    </div>
  )
}
