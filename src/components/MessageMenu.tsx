import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Pencil, Trash2, Reply } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmojiPicker, EMOJI_QUICK } from './EmojiPicker'

/**
 * Menu da mensagem (setinha) — barra de reações rápidas + "+" para lista completa,
 * e ações Editar/Excluir (apenas se fornecidas). Estilo WhatsApp.
 */
export function MessageMenu({ side, onReact, onReply, onEdit, onDelete, myReaction }: {
  side: 'left' | 'right'
  onReact: (emoji: string) => void
  onReply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  myReaction?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [dropUp, setDropUp] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Abre para cima ou para baixo conforme o espaço disponível (evita ficar atrás do header)
  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const espacoAcima = rect.top
      const espacoAbaixo = window.innerHeight - rect.bottom
      setDropUp(espacoAcima > espacoAbaixo)
    }
    setOpen((v) => !v)
  }

  // Se minha reação atual não está na barra rápida, ela vira o primeiro item da linha
  const quickList = myReaction && !EMOJI_QUICK.includes(myReaction)
    ? [myReaction, ...EMOJI_QUICK]
    : EMOJI_QUICK

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowAll(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const react = (em: string) => { onReact(em); setOpen(false); setShowAll(false) }

  return (
    <div ref={ref} className="relative flex items-end mb-1.5">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100',
          open ? 'opacity-100 bg-black/15' : 'bg-black/10 hover:bg-black/15',
        )}
      >
        <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
      </button>

      {open && (
        <div className={cn('absolute z-30', dropUp ? 'bottom-8' : 'top-8', side === 'right' ? 'left-0' : 'right-0')}>
          {showAll ? (
            <EmojiPicker onSelect={react} highlight={myReaction} />
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden min-w-[160px]">
              <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-300">
                {quickList.map((em) => (
                  <button
                    key={em}
                    onClick={() => react(em)}
                    className={cn(
                      'h-8 w-8 flex items-center justify-center text-xl rounded-full transition-colors',
                      myReaction === em ? 'bg-[#128C7E]/15 ring-1 ring-[#128C7E]' : 'hover:bg-gray-100',
                    )}
                  >
                    {em}
                  </button>
                ))}
                <button
                  onClick={() => setShowAll(true)}
                  title="Mais emojis"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xl leading-none"
                >
                  +
                </button>
              </div>
              {(onReply || onEdit || onDelete) && (
                <div className="py-1.5">
                  {onReply && (
                    <button
                      onClick={() => { onReply(); setOpen(false) }}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm w-full text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Reply className="h-3.5 w-3.5 text-gray-500" /> Responder
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={() => { onEdit(); setOpen(false) }}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm w-full text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-gray-500" /> Editar
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(); setOpen(false) }}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm w-full text-left text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
