import { useState, useEffect, useLayoutEffect, useRef, useCallback, Fragment } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Send, Paperclip, X, Video, FileText, FileSpreadsheet,
  Trash2, Check, Play, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { easyFeedIcon } from '@/assets/brand'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  buscarSugestoes,
  criarSugestao,
  responderSugestao,
  editarSugestao,
  editarResposta,
  excluirResposta,
  excluirArquivosStorage,
  getSignedUrls,
  uploadArquivosSugestao,
  marcarClienteLeu,
  resetAdminLeu,
  reagirCliente,
  type Sugestao,
  type Reacao,
} from '@/lib/queries/sugestoes'
import { supabase } from '@/lib/supabase/client'
import { DoubleCheck } from '@/components/DoubleCheck'
import { LinkifiedText } from '@/components/LinkifiedText'
import { MessageMenu } from '@/components/MessageMenu'
import { EmojiInputButton } from '@/components/EmojiPicker'
import { QuoteBox, type QuoteInfo } from '@/components/QuoteBox'

// ── Palette ───────────────────────────────────────────────────────────────────
const WA_TEAL = '#128C7E'
const WA_BG = '#ECE5DD'
const WA_SENT = '#DCF8C6'

// ── Types ─────────────────────────────────────────────────────────────────────
type FileKind = 'image' | 'video' | 'pdf' | 'doc' | 'other'

interface ThreadMsg {
  id: string
  texto: string
  role: 'eu' | 'suporte'
  arquivos: string[]
  time: string
  tipo: 'sugestao' | 'resposta'
  respondeA: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function msgTime(date: string) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm', { locale: ptBR })
  if (isYesterday(d)) return `ontem ${format(d, 'HH:mm')}`
  return format(d, "dd/MM 'às' HH:mm")
}

function getFileKind(path: string): FileKind {
  const p = path.toLowerCase()
  if (/\.(jpe?g|png|gif|webp|heic|avif)$/.test(p)) return 'image'
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(p)) return 'video'
  if (/\.pdf$/.test(p)) return 'pdf'
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|odt|ods)$/.test(p)) return 'doc'
  return 'other'
}

function fileName(path: string) {
  const base = path.split('/').pop() ?? path
  // Novo formato: {timestamp}-{random}-{nome_original}
  const m = base.match(/^\d+-[a-z0-9]+-(.+)$/)
  return m ? m[1] : base
}

function openInSystem(url: string, path: string) {
  const name = fileName(path)
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    })
    .catch(console.error)
}


function buildThread(s: Sugestao): ThreadMsg[] {
  const msgs: ThreadMsg[] = [
    ...s.respostas.map((r) => ({
      id: r.id,
      texto: r.texto,
      role: (r.autor === 'usuario' ? 'eu' : 'suporte') as 'eu' | 'suporte',
      arquivos: r.arquivos,
      time: r.created_at,
      tipo: 'resposta' as const,
      respondeA: r.responde_a ?? null,
    })),
  ]
  // Mensagem raiz (a sugestão) só aparece se não foi "apagada" (texto + arquivos vazios)
  if (s.texto || s.arquivos.length > 0) {
    msgs.unshift({ id: s.id, texto: s.texto, role: 'eu', arquivos: s.arquivos, time: s.created_at, tipo: 'sugestao', respondeA: null })
  }
  return msgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

// ── Modal de mídia (lightbox) ─────────────────────────────────────────────────
// Foto: pode baixar e dar zoom — clique liga/desliga um zoom de verdade
// (`transform: scale`, não redimensiona a imagem) que acompanha o mouse: o
// `transform-origin` segue o cursor, então mover o mouse revela outra parte
// da foto ampliada, tipo lupa. Vídeo: só baixar — o player nativo já dá
// controle suficiente, zoom não se aplica.
function MediaModal({ url, kind, name, onClose }: {
  url: string; kind: 'image' | 'video'; name: string; onClose: () => void
}) {
  const [zoom, setZoom] = useState(false)
  const [origem, setOrigem] = useState('center')

  const posDoMouse = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return `${x}% ${y}%`
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const baixar = () => {
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      })
      .catch(console.error)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          type="button"
          title="Baixar"
          className="h-9 w-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
          onClick={(e) => { e.stopPropagation(); baixar() }}
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="Fechar"
          className="h-9 w-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {kind === 'image' ? (
        <div
          className="h-full w-full flex items-center justify-center overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={url}
            alt={name}
            onClick={(e) => {
              if (!zoom) setOrigem(posDoMouse(e))
              else setOrigem('center')
              setZoom((z) => !z)
            }}
            onMouseMove={(e) => { if (zoom) setOrigem(posDoMouse(e)) }}
            className={cn(
              'max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-150',
              zoom ? 'scale-[2.5] cursor-zoom-out' : 'cursor-zoom-in',
            )}
            style={{ transformOrigin: origem }}
          />
        </div>
      ) : (
        <video
          src={url}
          controls
          autoPlay
          className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

// ── FileCard: exibe um arquivo no bubble ──────────────────────────────────────
function FileCard({ path, url, isMe }: { path: string; url: string; isMe: boolean }) {
  const [open, setOpen] = useState(false)
  if (!url) return null
  const kind = getFileKind(path)
  const name = fileName(path)
  const Icon = kind === 'video' ? Video : kind === 'pdf' ? FileText : kind === 'doc' ? FileSpreadsheet : Paperclip

  if (kind === 'image') {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="block mt-1.5 cursor-zoom-in">
          <img src={url} alt="" className="max-h-52 max-w-[220px] rounded-xl object-cover hover:opacity-90 transition-opacity" />
        </button>
        {open && <MediaModal url={url} kind="image" name={name} onClose={() => setOpen(false)} />}
      </>
    )
  }

  if (kind === 'video') {
    return (
      <>
        <div
          className="relative mt-1.5 cursor-pointer rounded-xl overflow-hidden"
          style={{ maxWidth: '220px' }}
          onClick={() => setOpen(true)}
        >
          <video
            src={url}
            className="w-full block max-h-52 object-cover"
            preload="metadata"
            muted
            playsInline
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="h-11 w-11 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="h-5 w-5 text-white ml-0.5" />
            </div>
          </div>
        </div>
        {open && <MediaModal url={url} kind="video" name={name} onClose={() => setOpen(false)} />}
      </>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openInSystem(url, path)}
      className={cn(
        'mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium hover:opacity-80 transition-opacity',
        isMe ? 'bg-[#b7e8a8] text-gray-700' : 'bg-gray-100 text-gray-600',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[160px]">{name}</span>
    </button>
  )
}

// ── Miniatura para o modo de edição ──────────────────────────────────────────
function ThumbExistente({
  path, url, onRemove,
}: { path: string; url: string; onRemove: () => void }) {
  const kind = getFileKind(path)
  return (
    <div className="relative group/thumb">
      <div className="h-14 w-14 rounded-lg overflow-hidden border border-white/60 bg-white/40 flex items-center justify-center">
        {kind === 'image' && url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-0.5 px-1">
            {kind === 'video' ? <Video className="h-5 w-5 text-gray-500" /> :
             kind === 'pdf' ? <FileText className="h-5 w-5 text-red-500" /> :
             kind === 'doc' ? <FileSpreadsheet className="h-5 w-5 text-blue-500" /> :
             <Paperclip className="h-5 w-5 text-gray-500" />}
            <span className="text-[8px] text-gray-500 text-center leading-tight line-clamp-2">
              {fileName(path).split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
        title="Remover arquivo"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function ThumbNovo({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImg = file.type.startsWith('image/')
  const isVid = file.type.startsWith('video/')
  return (
    <div className="relative">
      <div className="h-14 w-14 rounded-lg overflow-hidden border border-white/60 bg-white/40 flex items-center justify-center">
        {isImg ? (
          <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
        ) : isVid ? (
          <Video className="h-5 w-5 text-gray-500" />
        ) : (
          <div className="flex flex-col items-center gap-0.5 px-1">
            <Paperclip className="h-5 w-5 text-gray-500" />
            <span className="text-[8px] text-gray-500 text-center leading-tight line-clamp-2">
              {file.name.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Bubble editável ───────────────────────────────────────────────────────────
interface EditBubbleProps {
  msg: ThreadMsg
  signedUrls: Record<string, string>
  quote: QuoteInfo | null
  onClearReply: () => void
  onSave: (texto: string, existentes: string[], novos: File[], removidos: string[]) => Promise<void>
  onCancel: () => void
}

function EditBubble({ msg, signedUrls, quote, onClearReply, onSave, onCancel }: EditBubbleProps) {
  const [texto, setTexto] = useState(msg.texto)
  const [existentes, setExistentes] = useState<string[]>(msg.arquivos)
  const [removidos, setRemovidos] = useState<string[]>([])
  const [novos, setNovos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = `${taRef.current.scrollHeight}px`
    }
  }, [texto])

  const removerExistente = (path: string) => {
    setExistentes((p) => p.filter((x) => x !== path))
    setRemovidos((p) => [...p, path])
    setInputKey((k) => k + 1)
  }

  const removerNovo = (idx: number) => {
    setNovos((p) => p.filter((_, i) => i !== idx))
    setInputKey((k) => k + 1)
  }

  const handleSave = async () => {
    if (!texto.trim() && existentes.length === 0 && novos.length === 0) return
    setSaving(true)
    try {
      await onSave(texto.trim(), existentes, novos, removidos)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-end">
      <div
        className="w-[80%] max-w-[80%] rounded-2xl rounded-tr-none px-3.5 py-2.5 shadow-md space-y-2.5"
        style={{ background: WA_SENT }}
      >
        {quote && (
          <QuoteBox quote={quote} onRemove={onClearReply} className="bg-black/[0.08]" />
        )}
        <textarea
          ref={taRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="w-full bg-white/60 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-[#128C7E]/30"
          rows={2}
          autoFocus
        />

        {/* Arquivos existentes + novos */}
        {(existentes.length > 0 || novos.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {existentes.map((path) => (
              <ThumbExistente
                key={path}
                path={path}
                url={signedUrls[path] ?? ''}
                onRemove={() => removerExistente(path)}
              />
            ))}
            {novos.map((file, idx) => (
              <ThumbNovo
                key={idx}
                file={file}
                onRemove={() => removerNovo(idx)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-800 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Adicionar arquivo
          </button>
          <input
            key={inputKey}
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setNovos((p) => [...p, ...Array.from(e.target.files ?? [])])
            }}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="text-[12px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-[12px] font-semibold transition-colors"
              style={{ color: WA_TEAL }}
            >
              <>
                <Check className="h-3.5 w-3.5" />
                Salvar
              </>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Bubble normal com menu hover ──────────────────────────────────────────────
interface BubbleProps {
  msg: ThreadMsg
  signedUrls: Record<string, string>
  adminLeuEm: string | null
  reacoes: Reacao[]
  quote: QuoteInfo | null
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
}

function Bubble({
  msg, signedUrls, adminLeuEm, reacoes, quote, onReact, onReply, onEdit, onDelete, selectMode, selected, onToggleSelect,
}: BubbleProps) {
  const isMe = msg.role === 'eu'
  const myReaction = reacoes.find((r) => r.autor === 'cliente')?.emoji ?? null
  // Só mensagens próprias podem ser selecionadas para exclusão
  const selectable = selectMode && isMe

  return (
    <div
      className={cn(
        'flex group items-center rounded-lg transition-colors',
        isMe ? 'justify-end' : 'justify-start',
        selectable ? 'cursor-pointer -mx-2 px-2 py-0.5' : '',
        selected ? 'bg-black/[0.06]' : '',
        reacoes.length > 0 ? 'mb-3' : '',
      )}
      onClick={selectable ? onToggleSelect : undefined}
    >
      {/* Checkbox de seleção (mensagens próprias, no modo seleção) */}
      {selectable && (
        <span
          className={cn(
            'mr-auto shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-colors',
            selected ? 'bg-[#128C7E] border-[#128C7E] text-white' : 'border-gray-400 bg-white',
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      )}

      {/* Menu à esquerda para mensagens próprias */}
      {isMe && !selectMode && (
        <MessageMenu side="left" onReact={onReact} onReply={onReply} onEdit={onEdit} onDelete={onDelete} myReaction={myReaction} />
      )}

      {/* Bubble */}
      <div
        className={cn(
          'relative max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm',
          isMe ? 'rounded-tr-none' : 'rounded-tl-none bg-white',
        )}
        style={isMe ? { background: WA_SENT } : undefined}
      >
        {!isMe && (
          <p className="text-[11px] font-semibold mb-0.5" style={{ color: WA_TEAL }}>
            Suporte EasyFeed
          </p>
        )}

        {quote && <QuoteBox quote={quote} className="mb-1" />}

        {msg.texto && (
          <LinkifiedText
            text={msg.texto}
            className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed"
          />
        )}
        {msg.arquivos.map((path) => (
          <FileCard key={path} path={path} url={signedUrls[path] ?? ''} isMe={isMe} />
        ))}
        <p className="text-[10px] text-gray-400 text-right mt-0.5 select-none">
          {msgTime(msg.time)}
          {isMe && (
            <DoubleCheck
              read={!!(adminLeuEm && new Date(adminLeuEm) >= new Date(msg.time))}
              size={15}
              className="ml-1"
            />
          )}
        </p>

        {/* Reações */}
        {reacoes.length > 0 && (
          <div className={cn('absolute -bottom-3 flex gap-0.5', isMe ? 'right-1' : 'left-1')}>
            {reacoes.map((r) => (
              <button
                key={r.autor}
                onClick={(e) => { e.stopPropagation(); onReact(r.emoji) }}
                className="text-[13px] leading-none bg-white rounded-full shadow-sm border border-gray-300 px-1 py-0.5 hover:scale-110 transition-transform"
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu à direita para mensagens do suporte */}
      {!isMe && !selectMode && (
        <MessageMenu side="right" onReact={onReact} onReply={onReply} myReaction={myReaction} />
      )}
    </div>
  )
}

// ── Preview de arquivo novo (input area) ─────────────────────────────────────
function LocalFilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImg = file.type.startsWith('image/')
  return (
    <div className="relative">
      <div className="h-12 w-12 rounded-md border border-gray-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
        {isImg ? (
          <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-0.5 p-1">
            <Paperclip className="h-4 w-4 text-gray-400" />
            <span className="text-[7px] text-gray-400 text-center leading-tight">
              {file.name.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-500 text-white flex items-center justify-center"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

// ── ChatInputBar — ref local garante abertura do seletor de arquivo ───────────
function ChatInputBar({
  text, files, sending, onTextChange, onFilesAdd, onFileRemove, onSend,
}: {
  text: string; files: File[]; sending: boolean
  onTextChange: (v: string) => void
  onFilesAdd: (f: File[]) => void
  onFileRemove: (idx: number) => void
  onSend: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!text && taRef.current) taRef.current.style.height = 'auto'
  }, [text])

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
  }

  return (
    <div className="shrink-0 px-3 py-2" style={{ background: '#F0F2F5' }}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((file, idx) => (
            <LocalFilePreview key={idx} file={file} onRemove={() => onFileRemove(idx)} />
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-white text-gray-500 hover:text-gray-700 shadow-sm transition-colors"
          title="Anexar arquivo"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <EmojiInputButton onPick={(em) => onTextChange(text + em)} />
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFilesAdd(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <textarea
          ref={taRef}
          value={text}
          onChange={autoResize}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder="Digite uma mensagem"
          rows={1}
          className="flex-1 rounded-3xl border-0 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none resize-none shadow-sm"
          style={{ minHeight: '40px', maxHeight: '128px' }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={(!text.trim() && files.length === 0) || sending}
          className={cn(
            'shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-all shadow-sm',
            (text.trim() || files.length > 0) && !sending
              ? 'text-white hover:scale-105'
              : 'bg-gray-300 text-gray-400 cursor-not-allowed',
          )}
          style={(text.trim() || files.length > 0) && !sending ? { background: '#25D366' } : undefined}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Sugestoes() {
  const { user, usuario } = useAuth()
  const { toast } = useToast()

  const [sugestao, setSugestao] = useState<Sugestao | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  // Send state
  const [replyText, setReplyText] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  // Responder (quote): alvo pendente para nova mensagem OU novo alvo ao editar
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null)
  const [replyCleared, setReplyCleared] = useState(false)
  // Seleção múltipla para exclusão
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set()) // sumiço otimista ao excluir

  const bottomRef = useRef<HTMLDivElement>(null)
  const newDividerRef = useRef<HTMLDivElement>(null)
  // dividerTime = timestamp de ANTES da última visita → posiciona o "N não lidas"
  const [dividerTime, setDividerTime] = useState<number>(0)

  // ── Snapshot de cliente_leu_em ao abrir → posiciona o divisor "N não lidas" ──
  useLayoutEffect(() => {
    if (!sugestao) return
    setDividerTime(sugestao.cliente_leu_em ? new Date(sugestao.cliente_leu_em).getTime() : 0)
  }, [sugestao?.id])

  // Marca leitura no Supabase para o admin ver os checks azuis
  useEffect(() => {
    if (!sugestao) return
    marcarClienteLeu(sugestao.id).catch(console.error)
  }, [sugestao?.id])

  // ── Carrega a conversa ──────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    try {
      const lista = await buscarSugestoes()
      setSugestao(lista.length > 0 ? lista[0] : null)
    } catch {
      toast({ title: 'Erro ao carregar', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { carregar() }, [carregar])

  // Realtime: re-carrega quando admin edita (reseta cliente_leu_em) para refletir checks
  useEffect(() => {
    if (!sugestao?.id) return
    const ch = supabase
      .channel(`client-leitura-${sugestao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma', filter: `id=eq.${sugestao.id}` },
        (payload) => {
          // Edição do admin rola cliente_leu_em para trás → move o divisor para revelar a msg editada
          const newClienteLeuEm = (payload.new as any).cliente_leu_em as string | null
          const newTs = newClienteLeuEm ? new Date(newClienteLeuEm).getTime() : 0
          setDividerTime((prev) => (newTs > 0 && newTs < prev ? newTs : prev))
          carregar()
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reacoes_sugestoes', filter: `sugestao_id=eq.${sugestao.id}` },
        () => { carregar() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sugestao?.id, carregar])

  // ── Signed URLs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sugestao) return
    const paths = [
      ...sugestao.arquivos,
      ...sugestao.respostas.flatMap((r) => r.arquivos),
    ]
    if (paths.length === 0) return
    getSignedUrls(paths)
      .then((urls) => setSignedUrls((prev) => ({ ...prev, ...urls })))
      .catch(console.error)
  }, [sugestao])

  // ── Scroll ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [sugestao?.id, sugestao?.respostas.length])

  // ── Enviar mensagem ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    const texto = replyText.trim()
    if (!texto && replyFiles.length === 0) return
    if (!user) return
    setSending(true)
    try {
      const paths = replyFiles.length > 0
        ? await uploadArquivosSugestao(user.id, replyFiles)
        : []

      if (sugestao) {
        await responderSugestao(sugestao.id, texto, paths, replyTo?.id ?? null)
      } else {
        await criarSugestao(texto, paths, usuario?.restaurante_id ?? null)
      }

      setReplyText('')
      setReplyFiles([])
      setReplyTo(null)
      await carregar()
    } catch {
      toast({ title: 'Erro ao enviar', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  // ── Salvar edição ───────────────────────────────────────────────────────────
  const handleSaveEdit = async (
    msg: ThreadMsg,
    texto: string,
    existentes: string[],
    novos: File[],
    removidos: string[],
  ) => {
    if (!user) return
    const sugestaoId = sugestao?.id
    try {
      const novosPaths = novos.length > 0
        ? await uploadArquivosSugestao(user.id, novos)
        : []
      const finalArquivos = [...existentes, ...novosPaths]

      if (removidos.length > 0) {
        await excluirArquivosStorage(removidos)
      }

      // Alvo do "responder": novo (replyTo), removido (replyCleared) ou o original
      const novoRespondeA = replyCleared ? null : (replyTo ? replyTo.id : msg.respondeA)

      if (msg.tipo === 'sugestao') {
        await editarSugestao(msg.id, texto, finalArquivos)
      } else {
        await editarResposta(msg.id, texto, finalArquivos, novoRespondeA)
      }

      // Atualização otimista: reflete texto, arquivos e checks instantaneamente
      const rollbackLeuEm = new Date(new Date(msg.time).getTime() - 1).toISOString()
      setSugestao((prev) => {
        if (!prev) return prev
        if (msg.tipo === 'sugestao') {
          return { ...prev, texto, arquivos: finalArquivos, admin_leu_em: rollbackLeuEm }
        }
        return {
          ...prev,
          admin_leu_em: rollbackLeuEm,
          respostas: prev.respostas.map((r) =>
            r.id === msg.id ? { ...r, texto, arquivos: finalArquivos, responde_a: novoRespondeA } : r
          ),
        }
      })
      setEditingId(null)
      setReplyTo(null)
      setReplyCleared(false)
      if (sugestaoId) await resetAdminLeu(sugestaoId, msg.time)
      await carregar()
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
  }

  // ── Excluir mensagem ────────────────────────────────────────────────────────
  // ── Seleção múltipla para exclusão ──────────────────────────────────────────
  const enterSelectDelete = (msg: ThreadMsg) => {
    setEditingId(null)
    setSelectMode(true)
    setSelectedIds(new Set([msg.id]))
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const exitSelect = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    const alvos = Array.from(selectedIds)
      .map((id) => thread.find((m) => m.id === id))
      .filter((m): m is ThreadMsg => !!m)
    const ids = alvos.map((m) => m.id)
    // Sumiço otimista (sem delay) + sai do modo seleção
    setHiddenIds((prev) => new Set([...prev, ...ids]))
    exitSelect()
    try {
      for (const msg of alvos) {
        if (msg.arquivos.length > 0) await excluirArquivosStorage(msg.arquivos)
        if (msg.tipo === 'sugestao') {
          // Não exclui a linha (mantém o contato e as mensagens do outro) — só "apaga" o conteúdo
          await editarSugestao(msg.id, '', [])
        } else {
          await excluirResposta(msg.id)
        }
      }
      await carregar()
      setHiddenIds(new Set())
    } catch {
      setHiddenIds(new Set())
      toast({ title: 'Erro ao excluir', variant: 'destructive' })
      await carregar()
    }
  }

  // ── Reações ─────────────────────────────────────────────────────────────────
  const reacoesMap: Record<string, Reacao[]> = {}
  for (const r of sugestao?.reacoes ?? []) {
    ;(reacoesMap[r.mensagem_id] ??= []).push(r)
  }
  const handleReact = async (mensagemId: string, emoji: string) => {
    if (!sugestao) return
    const mine = sugestao.reacoes.find((r) => r.mensagem_id === mensagemId && r.autor === 'cliente')
    // Atualização otimista (sem delay)
    setSugestao((prev) => {
      if (!prev) return prev
      let reacoes = prev.reacoes.filter((r) => !(r.mensagem_id === mensagemId && r.autor === 'cliente'))
      if (!mine || mine.emoji !== emoji) {
        reacoes = [...reacoes, { mensagem_id: mensagemId, autor: 'cliente', emoji }]
      }
      return { ...prev, reacoes }
    })
    try {
      await reagirCliente(sugestao.id, mensagemId, emoji)
    } catch {
      carregar()
    }
  }

  // ── Responder (quote) ───────────────────────────────────────────────────────
  const resolveQuote = (respondeA: string | null): QuoteInfo | null => {
    if (!respondeA || !sugestao) return null
    if (respondeA === sugestao.id) {
      return { autorLabel: 'Você', texto: sugestao.texto || (sugestao.arquivos.length > 0 ? '📎 Arquivo' : '') }
    }
    const r = sugestao.respostas.find((x) => x.id === respondeA)
    if (!r) return { autorLabel: '', texto: 'mensagem removida' }
    return {
      autorLabel: r.autor === 'usuario' ? 'Você' : 'Suporte EasyFeed',
      texto: r.texto || (r.arquivos.length > 0 ? '📎 Arquivo' : ''),
    }
  }
  const startReply = (msg: ThreadMsg) => {
    setReplyCleared(false)
    setReplyTo(msg)
  }
  // Alvo efetivo do "responder" ao editar (novo, removido ou original)
  const editingMsg = editingId && sugestao
    ? buildThread(sugestao).find((m) => m.id === editingId) ?? null
    : null
  const editEffectiveReplyId = replyCleared ? null : (replyTo ? replyTo.id : (editingMsg?.respondeA ?? null))

  // ── Thread ──────────────────────────────────────────────────────────────────
  const thread = (sugestao ? buildThread(sugestao) : []).filter((m) => !hiddenIds.has(m.id))
  const newDividerIdx = (() => {
    if (dividerTime > 0) {
      // Mostra divider antes da primeira mensagem do suporte após a última visita
      for (let i = 0; i < thread.length; i++) {
        if (thread[i].role === 'suporte' && new Date(thread[i].time).getTime() > dividerTime) {
          return i
        }
      }
      return -1
    }
    // Primeira visita: divider após a última mensagem do usuário (eu)
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].role === 'eu') return i + 1
    }
    return -1
  })()
  const newCount = newDividerIdx >= 0
    ? thread.slice(newDividerIdx).filter((m) => m.role === 'suporte').length
    : 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="-m-4 sm:-m-6 lg:-m-8 flex flex-col overflow-hidden"
      style={{ height: 'calc(100dvh - 64px)' }}
    >
      {/* Header — logo do EasyFeed com o nome do lado, sem slogan (o
          cabeçalho fixo do app com a logo grande já fica escondido nesta
          página, ver `ROTAS_SEM_TOPO` em Layout.tsx). */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ background: WA_TEAL }}
      >
        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
          <img src={easyFeedIcon} alt="Easy Feed" className="h-8 w-8 object-contain" />
        </div>
        <p className="text-lg font-semibold text-white leading-tight">Suporte EasyFeed</p>
      </div>

      {/* Mensagens */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5"
        style={{ background: WA_BG }}
      >
        {/* Boas-vindas fixo */}
        <div className="flex justify-start">
          <div className="max-w-[75%] rounded-2xl rounded-tl-none px-3.5 py-2.5 shadow-sm bg-white">
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: WA_TEAL }}>
              Suporte EasyFeed
            </p>
            <p className="text-sm text-gray-800 leading-relaxed">
              Olá! 👋 Estamos aqui para ajudar com qualquer dúvida ou sugestão sobre o EasyFeed.
              Escreva sua mensagem abaixo.
            </p>
            <p className="text-[10px] text-gray-400 text-right mt-0.5 select-none">
              Suporte EasyFeed
            </p>
          </div>
        </div>

        {!loading && thread.map((msg, i) => (
          <Fragment key={msg.id}>
            {i === newDividerIdx && newCount > 0 && (
              <div ref={newDividerRef} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-[1.5px] rounded-full" style={{ background: '#128C7E', opacity: 0.5 }} />
                <span
                  className="shrink-0 text-[11px] font-semibold px-4 py-[5px] rounded-full whitespace-nowrap select-none"
                  style={{ background: '#128C7E', color: 'white' }}
                >
                  {newCount} mensagem{newCount !== 1 ? 's' : ''} não lida{newCount !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-[1.5px] rounded-full" style={{ background: '#128C7E', opacity: 0.5 }} />
              </div>
            )}
            {editingId === msg.id ? (
              <EditBubble
                msg={msg}
                signedUrls={signedUrls}
                quote={resolveQuote(editEffectiveReplyId)}
                onClearReply={() => { setReplyTo(null); setReplyCleared(true) }}
                onSave={(texto, existentes, novos, removidos) =>
                  handleSaveEdit(msg, texto, existentes, novos, removidos)
                }
                onCancel={() => { setEditingId(null); setReplyTo(null); setReplyCleared(false) }}
              />
            ) : (
              <Bubble
                msg={msg}
                signedUrls={signedUrls}
                adminLeuEm={sugestao?.admin_leu_em ?? null}
                reacoes={reacoesMap[msg.id] ?? []}
                quote={resolveQuote(msg.respondeA)}
                onReact={(emoji) => handleReact(msg.id, emoji)}
                onReply={() => startReply(msg)}
                onEdit={() => { setReplyTo(null); setReplyCleared(false); setEditingId(msg.id) }}
                onDelete={() => enterSelectDelete(msg)}
                selectMode={selectMode}
                selected={selectedIds.has(msg.id)}
                onToggleSelect={() => toggleSelect(msg.id)}
              />
            )}
          </Fragment>
        ))}

        <div ref={bottomRef} />
      </div>

      {selectMode ? (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-200">
          <button
            onClick={exitSelect}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
          >
            Cancelar
          </button>
          <span className="text-sm text-gray-500">
            {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
        </div>
      ) : (
        <div className="shrink-0">
          {replyTo && !editingId && (
            <div className="px-3 pt-2" style={{ background: '#F0F2F5' }}>
              <QuoteBox
                quote={resolveQuote(replyTo.id) ?? { autorLabel: '', texto: '' }}
                onRemove={() => setReplyTo(null)}
                className="bg-white"
              />
            </div>
          )}
          <ChatInputBar
            text={replyText}
            files={replyFiles}
            sending={sending}
            onTextChange={setReplyText}
            onFilesAdd={(f) => setReplyFiles((p) => [...p, ...f])}
            onFileRemove={(idx) => setReplyFiles((p) => p.filter((_, i) => i !== idx))}
            onSend={handleSend}
          />
        </div>
      )}
    </div>
  )
}
