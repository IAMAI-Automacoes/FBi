import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ShieldCheck, ArrowLeft, Send, Paperclip, Plus, Pencil, Trash2,
  X, Video, FileText, FileSpreadsheet, Check, Play, MessageSquare, Tag, Users,
  RotateCcw, Search, Download,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { usePlatformAdmin } from '@/hooks/use-platform-admin'
import { PainelAgentes } from '@/pages/admin/PainelAgentes'
import { ConhecimentoGlobal } from '@/pages/admin/ConhecimentoGlobal'
import { PainelUsoIA } from '@/pages/admin/PainelUsoIA'
import {
  buscarTodasSugestoes, responderSugestao, uploadArquivosResposta,
  editarRespostaAdmin, excluirRespostaAdmin, excluirArquivosAdmin,
  marcarAdminLeu, resetClienteLeu, reagirAdmin,
  buscarDivisoes, criarDivisao, atualizarDivisao, excluirDivisao,
  buscarAfiliados, criarAfiliado, atualizarAfiliado, excluirAfiliado,
  buscarCupons, criarCupon, atualizarCupon, excluirCupon,
  type SugestaoAdmin, type DivisaoReceita, type Afiliado, type Cupon, type ReacaoAdmin,
  buscarContas,
  definirExclusaoConta,
  type ContaAdmin,
} from '@/lib/queries/admin'
import { getSignedUrls } from '@/lib/queries/sugestoes'
import { supabase } from '@/lib/supabase/client'
import { avisarConversaAtiva } from '@/lib/notificacoes-app'
import { DoubleCheck } from '@/components/DoubleCheck'
import { LinkifiedText } from '@/components/LinkifiedText'
import { MessageMenu } from '@/components/MessageMenu'
import { EmojiInputButton } from '@/components/EmojiPicker'
import { QuoteBox, type QuoteInfo } from '@/components/QuoteBox'

// ── Palette ───────────────────────────────────────────────────────────────────
const WA_TEAL = '#128C7E'
const WA_SENT = '#DCF8C6'
const WA_BG = '#ECE5DD'
const WA_GREEN = '#25D366'

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  aberta:     { label: 'Aberta',     cls: 'bg-gray-100 text-gray-600' },
  respondida: { label: 'Respondida', cls: 'bg-blue-100 text-blue-700' },
  finalizada: { label: 'Finalizada', cls: 'bg-emerald-100 text-emerald-700' },
}

const AVATAR_COLORS = [
  'bg-blue-500','bg-violet-500','bg-emerald-500','bg-orange-500',
  'bg-rose-500','bg-indigo-500','bg-pink-500','bg-teal-500',
]

function avatarColor(str: string | null) {
  if (!str) return AVATAR_COLORS[0]
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

function initials(nome: string | null, email: string | null) {
  const src = nome ?? email ?? '?'
  const parts = src.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src[0].toUpperCase()
}

function msgTime(date: string) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'ontem'
  return format(d, 'dd/MM')
}

function getFileKind(path: string) {
  const p = path.toLowerCase()
  if (/\.(jpe?g|png|gif|webp|heic|avif)$/.test(p)) return 'image'
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(p)) return 'video'
  if (/\.pdf$/.test(p)) return 'pdf'
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|odt|ods)$/.test(p)) return 'doc'
  return 'other'
}
function fileName(path: string) {
  const base = path.split('/').pop() ?? path
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

interface ThreadMsg { id: string; texto: string; role: 'usuario' | 'suporte'; arquivos: string[]; time: string; respondeA: string | null }

function buildThread(s: SugestaoAdmin): ThreadMsg[] {
  const msgs: ThreadMsg[] = s.respostas.map((r) => ({
    id: r.id, texto: r.texto,
    role: (r.autor === 'usuario' ? 'usuario' : 'suporte') as 'usuario' | 'suporte',
    arquivos: r.arquivos, time: r.created_at, respondeA: r.responde_a ?? null,
  }))
  // Mensagem raiz só aparece se não foi "apagada" pelo cliente (texto + arquivos vazios)
  if (s.texto || s.arquivos.length > 0) {
    msgs.unshift({ id: s.id + '-m', texto: s.texto, role: 'usuario', arquivos: s.arquivos, time: s.created_at, respondeA: null })
  }
  return msgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

function msgPreview(texto: string, arquivos: string[]): string {
  return texto || (arquivos.length > 0 ? '📎 Arquivo' : '')
}

function lastActivity(s: SugestaoAdmin): { preview: string; time: string; isAdmin: boolean; read: boolean } {
  // Última mensagem de conteúdo (a raiz só conta se não foi apagada)
  const rootPresent = !!(s.texto || s.arquivos.length > 0)
  let lastMsg: { texto: string; arquivos: string[]; time: string; isAdmin: boolean } | null = null
  if (s.respostas.length > 0) {
    const last = s.respostas[s.respostas.length - 1]
    lastMsg = { texto: last.texto, arquivos: last.arquivos, time: last.created_at, isAdmin: last.autor !== 'usuario' }
  } else if (rootPresent) {
    lastMsg = { texto: s.texto, arquivos: s.arquivos, time: s.created_at, isAdmin: false }
  }

  // Última reação
  const reacoes = s.reacoes ?? []
  const lastReac = reacoes.length > 0
    ? reacoes.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b))
    : null

  // Se a reação é mais recente que a última mensagem, ela vira o preview
  if (lastReac && (!lastMsg || new Date(lastReac.created_at) > new Date(lastMsg.time))) {
    let alvo = ''
    if (lastReac.mensagem_id === s.id) {
      alvo = msgPreview(s.texto, s.arquivos)
    } else {
      const r = s.respostas.find((x) => x.id === lastReac.mensagem_id)
      if (r) alvo = msgPreview(r.texto, r.arquivos)
    }
    const prefixo = lastReac.autor === 'admin' ? 'Você reagiu' : 'reagiu'
    return {
      preview: `${prefixo} com ${lastReac.emoji} a: ${alvo}`,
      time: lastReac.created_at,
      isAdmin: lastReac.autor === 'admin',
      read: true,
    }
  }

  // Tudo apagado → preview vazio
  if (!lastMsg) {
    return { preview: '', time: s.created_at, isAdmin: false, read: true }
  }

  const read = lastMsg.isAdmin
    ? !!(s.cliente_leu_em && new Date(s.cliente_leu_em) >= new Date(lastMsg.time))
    : false
  return { preview: msgPreview(lastMsg.texto, lastMsg.arquivos), time: lastMsg.time, isAdmin: lastMsg.isAdmin, read }
}

function unreadCount(s: SugestaoAdmin): number {
  const lastRead = s.admin_leu_em ? new Date(s.admin_leu_em).getTime() : 0
  if (lastRead > 0) {
    // Conta mensagens do usuário chegadas após a última vez que a conversa foi aberta
    let count = new Date(s.created_at).getTime() > lastRead ? 1 : 0
    count += s.respostas.filter(
      (r) => r.autor === 'usuario' && new Date(r.created_at).getTime() > lastRead,
    ).length
    return count
  }
  // Nunca aberta: heurística — mensagens do usuário após a última resposta do admin
  let lastAdminIdx = -1
  for (let i = s.respostas.length - 1; i >= 0; i--) {
    if (s.respostas[i].autor !== 'usuario') { lastAdminIdx = i; break }
  }
  if (lastAdminIdx === -1) {
    return 1 + s.respostas.filter((r) => r.autor === 'usuario').length
  }
  return s.respostas.slice(lastAdminIdx + 1).filter((r) => r.autor === 'usuario').length
}

function fmtDesconto(c: Cupon) {
  return c.tipo_desconto === 'porcentagem'
    ? `${c.porcentagem_desconto ?? 0}%`
    : `R$ ${Number(c.valor_desconto ?? 0).toFixed(2)}`
}

// ── ConvItem ──────────────────────────────────────────────────────────────────
function ConvItem({ s, selected, onClick }: { s: SugestaoAdmin; selected: boolean; onClick: () => void }) {
  const { preview, time, isAdmin, read } = lastActivity(s)
  const count = unreadCount(s)
  const name = s.perfil?.nome_restaurante ?? s.usuario_nome ?? s.usuario_email ?? s.usuario_id.slice(0, 8)
  const logo = s.perfil?.logo_url
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-center gap-3 px-4 py-3 transition-colors border-b border-gray-300 last:border-0',
        selected ? 'bg-[#EFF6FF]' : 'hover:bg-gray-50',
      )}
    >
      {logo ? (
        <img src={logo} alt={name} className="h-10 w-10 rounded-full shrink-0 object-cover bg-gray-100" />
      ) : (
        <div className={cn('h-10 w-10 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-semibold', avatarColor(name))}>
          {initials(s.perfil?.nome_restaurante ?? s.usuario_nome, s.usuario_email)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-sm font-semibold truncate', selected ? 'text-[#1D4ED8]' : 'text-gray-800')}>
            {name}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0">{msgTime(time)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {isAdmin && <DoubleCheck read={read} size={18} />}
            <p className="text-[12px] text-gray-500 truncate">{preview}</p>
          </div>
          {count > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center px-1">
              {count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── PerfilPanel (restaurante + pessoa) — painel lateral direito ────────────────
function PerfilPanel({ s, onClose }: { s: SugestaoAdmin; onClose: () => void }) {
  const p = s.perfil
  const nomeRest = p?.nome_restaurante ?? 'Restaurante'
  const nomePessoa = p?.nome ?? s.usuario_nome ?? '—'
  const email = p?.email ?? s.usuario_email ?? '—'

  const Linha = ({ label, valor }: { label: string; valor: string | null }) =>
    valor ? (
      <div className="flex justify-between gap-3 py-2 border-b border-gray-300 last:border-0">
        <span className="text-[12px] text-gray-500 shrink-0">{label}</span>
        <span className="text-[13px] text-gray-800 text-right break-words">{valor}</span>
      </div>
    ) : null

  return (
    <div className="w-full md:w-80 shrink-0 h-full flex flex-col border-l border-gray-200 bg-white animate-in slide-in-from-right duration-200">
      <div className="shrink-0 flex items-center gap-2 px-4 h-16 border-b border-gray-300">
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
          <X className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">Perfil</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Restaurante */}
        <div className="flex flex-col items-center text-center gap-2 pb-4 border-b border-gray-300">
          {p?.logo_url ? (
            <img src={p.logo_url} alt={nomeRest} className="h-24 w-24 rounded-full object-cover bg-gray-100" />
          ) : (
            <div className={cn('h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-semibold', avatarColor(nomeRest))}>
              {initials(nomeRest, null)}
            </div>
          )}
          <p className="text-base font-semibold text-gray-900">{nomeRest}</p>
          {p?.tipo_culinaria && <p className="text-[12px] text-gray-500">{p.tipo_culinaria}</p>}
        </div>

        <div className="pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Restaurante</p>
          <Linha label="Nome" valor={p?.nome_restaurante ?? null} />
          <Linha label="Culinária" valor={p?.tipo_culinaria ?? null} />
          <Linha label="Mesas" valor={p?.numero_mesas != null ? String(p.numero_mesas) : null} />
          <Linha label="WhatsApp" valor={p?.numero_whatsapp ?? null} />
          <Linha label="Detalhes" valor={p?.detalhes ?? null} />
        </div>

        {/* Pessoa */}
        <div className="pt-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Pessoa</p>
          <div className="flex items-center gap-3">
            {p?.avatar_url ? (
              <img src={p.avatar_url} alt={nomePessoa} className="h-11 w-11 rounded-full object-cover bg-gray-100 shrink-0" />
            ) : (
              <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0', avatarColor(nomePessoa))}>
                {initials(nomePessoa, email)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-800 truncate">{nomePessoa}</p>
              <p className="text-[12px] text-gray-500 truncate">{email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
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

// ── FilePreview ───────────────────────────────────────────────────────────────
function FilePreview({ path, url, isMe }: { path: string; url: string; isMe: boolean }) {
  const [open, setOpen] = useState(false)
  if (!url) return null
  const kind = getFileKind(path)
  const name = fileName(path)
  const Icon = kind === 'video' ? Video : kind === 'pdf' ? FileText : kind === 'doc' ? FileSpreadsheet : Paperclip

  if (kind === 'image') return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block mt-1.5 cursor-zoom-in">
        <img src={url} alt="" className="max-h-52 max-w-[220px] rounded-xl object-cover hover:opacity-90 transition-opacity" />
      </button>
      {open && <MediaModal url={url} kind="image" name={name} onClose={() => setOpen(false)} />}
    </>
  )

  if (kind === 'video') return (
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

  return (
    <button type="button" onClick={() => openInSystem(url, path)}
      className={cn('mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium hover:opacity-80 transition-opacity',
        isMe ? 'bg-[#b7e8a8] text-gray-700' : 'bg-gray-100 text-gray-600')}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[160px]">{name}</span>
    </button>
  )
}

// ── Miniaturas no modo edição ─────────────────────────────────────────────────
function ThumbExistente({ path, url, onRemove }: { path: string; url: string; onRemove: () => void }) {
  const kind = getFileKind(path)
  return (
    <div className="relative">
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
      <button onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
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
      <button onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── AdminEditBubble ───────────────────────────────────────────────────────────
function AdminEditBubble({ msg, signedUrls, quote, onClearReply, onSave, onCancel }: {
  msg: ThreadMsg; signedUrls: Record<string, string>
  quote: QuoteInfo | null; onClearReply: () => void
  onSave: (texto: string, existentes: string[], novos: File[], removidos: string[]) => Promise<void>
  onCancel: () => void
}) {
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
    try { await onSave(texto.trim(), existentes, novos, removidos) } finally { setSaving(false) }
  }

  return (
    <div className="flex justify-end">
      <div className="w-[80%] max-w-[80%] rounded-2xl rounded-tr-none px-3.5 py-2.5 shadow-md space-y-2.5"
        style={{ background: WA_SENT }}>
        {quote && <QuoteBox quote={quote} onRemove={onClearReply} className="bg-black/[0.08]" />}
        <textarea ref={taRef} value={texto} onChange={(e) => setTexto(e.target.value)}
          className="w-full bg-white/60 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-[#128C7E]/30"
          rows={2} autoFocus />
        {(existentes.length > 0 || novos.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {existentes.map((path) => (
              <ThumbExistente key={path} path={path} url={signedUrls[path] ?? ''} onRemove={() => removerExistente(path)} />
            ))}
            {novos.map((file, idx) => (
              <ThumbNovo key={idx} file={file} onRemove={() => removerNovo(idx)} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button type="button"
            className="flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-800 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" /> Adicionar arquivo
          </button>
          <input key={inputKey} ref={fileRef} type="file" multiple className="hidden"
            onChange={(e) => { setNovos((p) => [...p, ...Array.from(e.target.files ?? [])]) }} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={onCancel} className="text-[12px] text-gray-500 hover:text-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-1 text-[12px] font-semibold transition-colors"
              style={{ color: WA_TEAL }}>
              <><Check className="h-3.5 w-3.5" /> Salvar</>

            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AdminBubble ───────────────────────────────────────────────────────────────
function AdminBubble({ msg, signedUrls, reacoes, quote, onReact, onReply, onEdit, onDelete, selectMode, selected, onToggleSelect, clienteLeuEm }: {
  msg: ThreadMsg; signedUrls: Record<string, string>
  reacoes: ReacaoAdmin[]; quote: QuoteInfo | null
  onReact: (emoji: string) => void; onReply: () => void
  onEdit: () => void; onDelete: () => void
  selectMode: boolean; selected: boolean; onToggleSelect: () => void
  clienteLeuEm: string | null
}) {
  const isMe = msg.role === 'suporte'
  const myReaction = reacoes.find((r) => r.autor === 'admin')?.emoji ?? null
  const msgRead = isMe
    ? !!(clienteLeuEm && new Date(clienteLeuEm) >= new Date(msg.time))
    : false

  // Só mensagens do suporte podem ser selecionadas para exclusão
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
      {isMe && !selectMode && (
        <MessageMenu side="left" onReact={onReact} onReply={onReply} onEdit={onEdit} onDelete={onDelete} myReaction={myReaction} />
      )}
      <div className={cn('relative max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm', isMe ? 'rounded-tr-none' : 'rounded-tl-none bg-white')}
        style={isMe ? { background: WA_SENT } : undefined}>
        {quote && <QuoteBox quote={quote} className="mb-1" />}
        {msg.texto && (
          <LinkifiedText text={msg.texto} className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" />
        )}
        {msg.arquivos.map((path) => (
          <FilePreview key={path} path={path} url={signedUrls[path] ?? ''} isMe={isMe} />
        ))}
        <p className="text-[10px] text-gray-400 text-right mt-0.5 select-none">
          {msgTime(msg.time)}{isMe && <DoubleCheck read={msgRead} size={15} className="ml-1" />}
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
      {!isMe && !selectMode && (
        <MessageMenu side="right" onReact={onReact} onReply={onReply} myReaction={myReaction} />
      )}
    </div>
  )
}

// ── ConversaView ──────────────────────────────────────────────────────────────
function ConversaView({
  s, signedUrls, replyText, replyFiles, sending,
  onReplyTextChange, onReplyFilesChange, onRemoveFile, onSend, onRefresh, onRead, onReact, onVoltar,
}: {
  s: SugestaoAdmin; signedUrls: Record<string, string>
  replyText: string; replyFiles: File[]; sending: boolean
  onReplyTextChange: (v: string) => void; onReplyFilesChange: (f: File[]) => void
  onRemoveFile: (i: number) => void; onSend: (respondeA: string | null) => void; onRefresh: () => void; onRead: () => void
  onReact: (mensagemId: string, emoji: string) => void
  /** Volta pra lista (só no mobile, onde o chat é single-pane). */
  onVoltar?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const newDividerRef = useRef<HTMLDivElement>(null)
  // Captura limiar ao montar (snapshot de admin_leu_em); atualizado via setDividerThreshold quando há edição
  const [dividerThreshold, setDividerThreshold] = useState<number>(() => {
    if (s.admin_leu_em) return new Date(s.admin_leu_em).getTime()
    // Nunca lida: threshold = timestamp da última resposta do suporte
    const initialThread = buildThread(s)
    for (let i = initialThread.length - 1; i >= 0; i--) {
      if (initialThread[i].role === 'suporte') {
        return new Date(initialThread[i].time).getTime()
      }
    }
    return 0 // sem resposta do suporte: todas as msgs do usuário são não lidas
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPerfil, setShowPerfil] = useState(false)
  // Responder (quote)
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null)
  const [replyCleared, setReplyCleared] = useState(false)
  // Seleção múltipla para exclusão
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set()) // sumiço otimista ao excluir

  const thread = buildThread(s).filter((m) => !hiddenIds.has(m.id))
  // Id canônico da mensagem para reações (raiz usa o id da sugestão, sem o sufixo "-m")
  const canonicalId = (id: string) => (id.endsWith('-m') ? id.slice(0, -2) : id)
  const reacoesMap: Record<string, ReacaoAdmin[]> = {}
  for (const r of s.reacoes ?? []) {
    ;(reacoesMap[r.mensagem_id] ??= []).push(r)
  }
  const name = s.perfil?.nome_restaurante ?? s.usuario_nome ?? s.usuario_email ?? s.usuario_id.slice(0, 8)
  const logo = s.perfil?.logo_url

  // Responder (quote): resolve o alvo (id canônico) para exibição
  const resolveQuote = (respondeA: string | null): QuoteInfo | null => {
    if (!respondeA) return null
    if (respondeA === s.id) {
      return { autorLabel: name, texto: s.texto || (s.arquivos.length > 0 ? '📎 Arquivo' : '') }
    }
    const r = s.respostas.find((x) => x.id === respondeA)
    if (!r) return { autorLabel: '', texto: 'mensagem removida' }
    return {
      autorLabel: r.autor === 'usuario' ? name : 'Você',
      texto: r.texto || (r.arquivos.length > 0 ? '📎 Arquivo' : ''),
    }
  }
  const startReply = (msg: ThreadMsg) => { setReplyCleared(false); setReplyTo(msg) }
  const editingMsg = editingId ? buildThread(s).find((m) => m.id === editingId) ?? null : null
  const editEffectiveReplyId = replyCleared ? null : (replyTo ? canonicalId(replyTo.id) : (editingMsg?.respondeA ?? null))
  const doSend = () => {
    onSend(replyTo ? canonicalId(replyTo.id) : null)
    setReplyTo(null)
  }
  // dividerThreshold fixo → posição do divisor estável mesmo após enviar mensagem
  const newDividerIdx = (() => {
    for (let i = 0; i < thread.length; i++) {
      if (thread[i].role === 'usuario' && new Date(thread[i].time).getTime() > dividerThreshold) {
        return i
      }
    }
    return -1
  })()
  const newCount = newDividerIdx >= 0
    ? thread.slice(newDividerIdx).filter((m) => m.role === 'usuario').length
    : 0

  // Marca como lido somente quando o admin chega ao fim da conversa
  const onReadRef = useRef(onRead)
  useEffect(() => { onReadRef.current = onRead })
  useEffect(() => {
    const bottom = bottomRef.current
    const container = scrollContainerRef.current
    if (!bottom || !container) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          marcarAdminLeu(s.id).catch(console.error)
          onReadRef.current()
        }
      },
      { root: container, threshold: 0.1 },
    )
    obs.observe(bottom)
    return () => obs.disconnect()
  }, [s.id])

  // Realtime: atualiza checks quando o cliente lê (cliente_leu_em muda)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })
  useEffect(() => {
    const ch = supabase
      .channel(`leitura-${s.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma', filter: `id=eq.${s.id}` },
        (payload) => {
          const newAdminLeuEm = (payload.new as any).admin_leu_em as string | null
          const newTs = newAdminLeuEm ? new Date(newAdminLeuEm).getTime() : 0
          // Edição do cliente rola admin_leu_em para trás → move o divisor para revelar a msg editada
          setDividerThreshold((prev) => (newTs > 0 && newTs < prev ? newTs : prev))
          onRefreshRef.current()
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [s.id])

  // Avisa o Service Worker que ESTA conversa (usuario_id) está aberta e
  // visível — é o que faz ele só suprimir a notificação de push desta
  // conversa específica, e continuar notificando qualquer outra. Se a aba sai
  // de foco (troca de app, minimiza), avisa "nenhuma" para voltar a notificar
  // mesmo esta, já que o admin deixou de estar olhando.
  useEffect(() => {
    const aoMudarVisibilidade = () => {
      avisarConversaAtiva(document.visibilityState === 'visible' ? s.usuario_id : null)
    }
    aoMudarVisibilidade() // estado inicial já respeitando a visibilidade atual da aba
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      avisarConversaAtiva(null)
    }
  }, [s.usuario_id])

  // Scroll: ao montar vai à última mensagem
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

  // Scroll suave ao enviar/receber mensagem nova
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length])

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onReplyTextChange(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
  }

  async function handleSaveEdit(msg: ThreadMsg, texto: string, existentes: string[], novos: File[], removidos: string[]) {
    if (removidos.length > 0) await excluirArquivosAdmin(removidos)
    const novosPaths = novos.length > 0 ? await uploadArquivosResposta(s.id, novos) : []
    const novoRespondeA = replyCleared ? null : (replyTo ? canonicalId(replyTo.id) : (msg.respondeA ?? null))
    await editarRespostaAdmin(msg.id, texto, [...existentes, ...novosPaths], novoRespondeA)
    setEditingId(null)
    setReplyTo(null)
    setReplyCleared(false)
    // Reseta leitura do cliente ANTES do refresh — mensagem editada deve ser re-lida pelo cliente
    await resetClienteLeu(s.id, msg.time)
    onRefresh()
  }

  // ── Seleção múltipla para exclusão (mensagens do suporte) ──
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
  async function handleDeleteSelected() {
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
        if (msg.arquivos.length > 0) await excluirArquivosAdmin(msg.arquivos)
        await excluirRespostaAdmin(msg.id)
      }
      onRefresh()
      setHiddenIds(new Set())
    } catch (err) {
      console.error(err)
      setHiddenIds(new Set())
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col h-full flex-1 min-w-0">
      <div className="shrink-0 flex items-stretch" style={{ background: WA_TEAL, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            className="md:hidden flex items-center pl-3 pr-1 text-white/90 hover:text-white"
            aria-label="Voltar para a lista"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowPerfil((v) => !v)}
          className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-3 hover:brightness-95 transition-all"
          title="Ver perfil"
        >
          {logo ? (
            <img src={logo} alt={name} className="h-9 w-9 rounded-full object-cover shrink-0 bg-white/20" />
          ) : (
            <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0', avatarColor(name))}>
              {initials(s.perfil?.nome_restaurante ?? s.usuario_nome, s.usuario_email)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">{name}</p>
            {s.usuario_email && <p className="text-[12px] text-white/70 truncate">{s.usuario_email}</p>}
          </div>
        </button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5" style={{ background: WA_BG }}>
        {thread.map((msg, i) => (
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
              <AdminEditBubble
                msg={msg}
                signedUrls={signedUrls}
                quote={resolveQuote(editEffectiveReplyId)}
                onClearReply={() => { setReplyTo(null); setReplyCleared(true) }}
                onSave={(texto, existentes, novos, removidos) => handleSaveEdit(msg, texto, existentes, novos, removidos)}
                onCancel={() => { setEditingId(null); setReplyTo(null); setReplyCleared(false) }}
              />
            ) : (
              <AdminBubble
                msg={msg}
                signedUrls={signedUrls}
                clienteLeuEm={s.cliente_leu_em}
                reacoes={reacoesMap[canonicalId(msg.id)] ?? []}
                quote={resolveQuote(msg.respondeA)}
                onReact={(emoji) => onReact(canonicalId(msg.id), emoji)}
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
          <button onClick={exitSelect} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-2">
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
      <div className="shrink-0 px-3 py-3" style={{ background: '#F0F2F5', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}>
        {replyTo && (
          <div className="mb-2">
            <QuoteBox
              quote={resolveQuote(canonicalId(replyTo.id)) ?? { autorLabel: '', texto: '' }}
              onRemove={() => setReplyTo(null)}
              className="bg-white"
            />
          </div>
        )}
        {replyFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {replyFiles.map((file, idx) => (
              <div key={idx} className="relative">
                <div className="h-12 w-12 rounded-md border border-gray-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
                  {file.type.startsWith('image/') ? (
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
                <button onClick={() => onRemoveFile(idx)}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-500 text-white flex items-center justify-center">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => fileInputRef.current?.click()}
            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-white text-gray-500 hover:text-gray-700 shadow-sm transition-colors"
            title="Anexar arquivo">
            <Paperclip className="h-4 w-4" />
          </button>
          <EmojiInputButton onPick={(em) => onReplyTextChange(replyText + em)} />
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => { onReplyFilesChange([...replyFiles, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
          <textarea ref={textareaRef} value={replyText} onChange={autoResize}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }}
            placeholder="Digite uma mensagem"
            rows={1}
            className="flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none shadow-sm"
            style={{ minHeight: '40px', maxHeight: '128px' }} />
          <button onClick={doSend} disabled={(!replyText.trim() && replyFiles.length === 0) || sending}
            className={cn(
              'shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-all shadow-sm',
              (replyText.trim() || replyFiles.length > 0) && !sending ? 'text-white hover:scale-105' : 'bg-gray-300 text-gray-400 cursor-not-allowed',
            )}
            style={(replyText.trim() || replyFiles.length > 0) && !sending ? { background: WA_GREEN } : undefined}>
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      )}
      </div>
      {showPerfil && <PerfilPanel s={s} onClose={() => setShowPerfil(false)} />}
    </div>
  )
}

// ── CRUD Table genérica ───────────────────────────────────────────────────────
function CrudTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      {/* min-w: no celular a tabela rola dentro do card em vez de espremer/cortar. */}
      <table className="w-full text-sm min-w-[560px]">{children}</table>
    </div>
  )
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2.5 text-[12px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-300">{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}
function BadgeBool({ v }: { v: boolean }) {
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', v ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
      {v ? 'Sim' : 'Não'}
    </span>
  )
}
function RowActions({ onEdit, onDelete, deleting }: { onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDelete} disabled={deleting}
        className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Admin ─────────────────────────────────────────────────────────────────────
type Tab = 'suporte' | 'contas' | 'pagamentos' | 'cupons' | 'afiliados' | 'agentes' | 'conhecimento' | 'uso_ia'

const TAB_LABELS: Record<Tab, string> = {
  suporte: 'Suporte', contas: 'Contas', pagamentos: 'Pagamentos', cupons: 'Cupons', afiliados: 'Afiliados', agentes: 'Agentes de IA', conhecimento: 'Conhecimento', uso_ia: 'Uso de IA',
}

// Filtro da aba Contas: separa os dois eixos (pagamento e exclusão) para o
// admin achar rápido cada situação.
type FiltroConta = 'todas' | 'pagantes' | 'nao_pagantes' | 'excluidas'
const FILTROS_CONTA: { key: FiltroConta; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pagantes', label: 'Pagantes' },
  { key: 'nao_pagantes', label: 'Não pagantes' },
  { key: 'excluidas', label: 'Excluídas' },
]

// Form defaults
const EMPTY_DIVISAO = { nome: '', chave_pix: '', tipo: 'porcentagem' as 'porcentagem' | 'valor_fixo', valor: '', ativo: true }
const EMPTY_AFILIADO = {
  nome: '', email: '', telefone: '', codigo: '',
  comissao_tipo: 'porcentagem' as 'porcentagem' | 'valor_fixo', comissao_valor: '',
  stripe_account_id: '', cpf_cnpj: '', chave_pix: '',
  codigo_banco: '', banco: '', agencia: '', conta: '', tipo_conta: 'corrente' as 'corrente' | 'poupanca',
  observacoes: '', ativo: true,
}
const EMPTY_CUPON = {
  cupom: '', tipo_desconto: 'porcentagem' as 'porcentagem' | 'valor_fixo',
  valor: '', dias_validade: '', vezes_uso_maximo: '', ativo: true,
}

export default function Admin() {
  const navigate = useNavigate()
  const { isAdmin, loading: loadingAdmin } = usePlatformAdmin()
  const location = useLocation()
  // App "Mensagens" instalado (start_url /admin?app=mensagens rodando em standalone):
  // abre direto na lista, sem a barra do Painel Admin — estilo WhatsApp.
  const ehAppMensagens =
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true) &&
    new URLSearchParams(location.search).get('app') === 'mensagens'
  const [activeTab, setActiveTab] = useState<Tab>('suporte')

  // ── Suporte ──
  const [sugestoes, setSugestoes] = useState<SugestaoAdmin[]>([])
  const [loadingSugestoes, setLoadingSugestoes] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})
  const [replyFilesMap, setReplyFilesMap] = useState<Record<string, File[]>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)

  // ── Pagamentos ──
  const [divisoes, setDivisoes] = useState<DivisaoReceita[]>([])
  const [loadingDiv, setLoadingDiv] = useState(false)
  const [showDivDialog, setShowDivDialog] = useState(false)
  const [editingDivId, setEditingDivId] = useState<string | null>(null)
  const [divForm, setDivForm] = useState(EMPTY_DIVISAO)
  const [savingDiv, setSavingDiv] = useState(false)
  const [deletingDivId, setDeletingDivId] = useState<string | null>(null)

  // ── Afiliados ──
  const [afiliados, setAfiliados] = useState<Afiliado[]>([])
  const [loadingAfil, setLoadingAfil] = useState(false)
  // afilDetailId: null = lista (cards); 'new' = criando; outro = editando aquele afiliado
  const [afilDetailId, setAfilDetailId] = useState<string | null>(null)
  const [afilForm, setAfilForm] = useState(EMPTY_AFILIADO)
  const [savingAfil, setSavingAfil] = useState(false)
  const [deletingAfilId, setDeletingAfilId] = useState<string | null>(null)

  // ── Contas (assinatura) ──
  const [contas, setContas] = useState<ContaAdmin[]>([])
  const [loadingContas, setLoadingContas] = useState(false)
  const [salvandoContaId, setSalvandoContaId] = useState<number | null>(null)
  const [buscaConta, setBuscaConta] = useState('')
  const [filtroConta, setFiltroConta] = useState<FiltroConta>('todas')

  // ── Cupons ──
  const [cupons, setCupons] = useState<Cupon[]>([])
  const [loadingCupons, setLoadingCupons] = useState(false)
  const [showCuponDialog, setShowCuponDialog] = useState(false)
  const [editingCuponId, setEditingCuponId] = useState<number | null>(null)
  const [cuponForm, setCuponForm] = useState(EMPTY_CUPON)
  const [savingCupon, setSavingCupon] = useState(false)
  const [deletingCuponId, setDeletingCuponId] = useState<number | null>(null)

  useEffect(() => { if (!loadingAdmin && !isAdmin) navigate('/') }, [isAdmin, loadingAdmin, navigate])

  // Suporte: carrega uma vez
  useEffect(() => {
    if (!isAdmin) return
    buscarTodasSugestoes()
      .then((data) => { setSugestoes(data) })
      .catch(console.error)
      .finally(() => setLoadingSugestoes(false))
  }, [isAdmin])

  // Global Realtime: re-carrega ao chegar mensagem nova ou edição (unreadCount deriva de admin_leu_em)
  useEffect(() => {
    if (!isAdmin) return
    const refetch = () => buscarTodasSugestoes().then(setSugestoes).catch(console.error)
    const ch = supabase
      .channel('admin-global-leitura')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sugestoes_plataforma' }, refetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_sugestoes' }, refetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'respostas_sugestoes' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reacoes_sugestoes' }, refetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isAdmin])

  // Signed URLs
  useEffect(() => {
    if (!selectedId) return
    const s = sugestoes.find((x) => x.id === selectedId)
    if (!s) return
    const paths = [...s.arquivos, ...s.respostas.flatMap((r) => r.arquivos)]
    if (paths.length === 0) return
    getSignedUrls(paths).then((urls) => setSignedUrls((p) => ({ ...p, ...urls }))).catch(console.error)
  }, [selectedId, sugestoes])

  // Pagamentos: carrega ao entrar na aba
  const loadDivisoes = useCallback(async () => {
    setLoadingDiv(true)
    try { setDivisoes(await buscarDivisoes()) } finally { setLoadingDiv(false) }
  }, [])
  useEffect(() => { if (isAdmin && activeTab === 'pagamentos') loadDivisoes() }, [isAdmin, activeTab, loadDivisoes])

  // Contas: carrega ao entrar na aba
  const loadContas = useCallback(async () => {
    setLoadingContas(true)
    try { setContas(await buscarContas()) } finally { setLoadingContas(false) }
  }, [])
  useEffect(() => { if (isAdmin && activeTab === 'contas') loadContas() }, [isAdmin, activeTab, loadContas])


  const alternarExclusao = useCallback(async (conta: ContaAdmin) => {
    const excluindo = !conta.excluida_em
    if (excluindo && !confirm(
      `Excluir a conta "${conta.nome_restaurante || conta.email}"?\n\n` +
      'A pessoa perde o acesso na hora e não recupera sozinha — nem criando conta de novo ' +
      'com o mesmo email. Os dados continuam no banco e só você pode restaurar, quando quiser.',
    )) return

    setSalvandoContaId(conta.id)
    try {
      await definirExclusaoConta(conta.id, excluindo)
      setContas((prev) => prev.map((c) => (
        c.id === conta.id ? { ...c, excluida_em: excluindo ? new Date().toISOString() : null } : c
      )))
    } catch (e) {
      console.error('Erro ao alterar exclusão:', e)
      alert('Não foi possível alterar o estado desta conta.')
    } finally {
      setSalvandoContaId(null)
    }
  }, [])

  // Afiliados: carrega ao entrar na aba (e ao entrar em Cupons — precisamos dos nomes)
  const loadAfiliados = useCallback(async () => {
    setLoadingAfil(true)
    try { setAfiliados(await buscarAfiliados()) } finally { setLoadingAfil(false) }
  }, [])
  useEffect(() => {
    if (isAdmin && (activeTab === 'afiliados' || activeTab === 'cupons')) loadAfiliados()
  }, [isAdmin, activeTab, loadAfiliados])

  // Cupons
  const loadCupons = useCallback(async () => {
    setLoadingCupons(true)
    try { setCupons(await buscarCupons()) } finally { setLoadingCupons(false) }
  }, [])
  useEffect(() => { if (isAdmin && activeTab === 'cupons') loadCupons() }, [isAdmin, activeTab, loadCupons])

  // ── Suporte handlers ──
  const [badgeVersion, setBadgeVersion] = useState(0)
  const refreshBadges = useCallback(() => setBadgeVersion((v) => v + 1), [])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleSend = async (sugestaoId: string, respondeA: string | null = null) => {
    const texto = (replyTexts[sugestaoId] ?? '').trim()
    const files = replyFilesMap[sugestaoId] ?? []
    if (!texto && files.length === 0) return
    setSendingId(sugestaoId)
    try {
      const paths = files.length > 0 ? await uploadArquivosResposta(sugestaoId, files) : []
      await responderSugestao(sugestaoId, texto, paths, respondeA)
      await marcarAdminLeu(sugestaoId)
      refreshBadges()
      setReplyTexts((p) => ({ ...p, [sugestaoId]: '' }))
      setReplyFilesMap((p) => ({ ...p, [sugestaoId]: [] }))
      setSugestoes(await buscarTodasSugestoes())
    } catch (err) { console.error(err) }
    finally { setSendingId(null) }
  }

  const handleReactAdmin = async (sugestaoId: string, mensagemId: string, emoji: string) => {
    // Atualização otimista (sem delay)
    setSugestoes((prev) => prev.map((s) => {
      if (s.id !== sugestaoId) return s
      const mine = s.reacoes.find((r) => r.mensagem_id === mensagemId && r.autor === 'admin')
      let reacoes = s.reacoes.filter((r) => !(r.mensagem_id === mensagemId && r.autor === 'admin'))
      if (!mine || mine.emoji !== emoji) {
        reacoes = [...reacoes, { mensagem_id: mensagemId, autor: 'admin', emoji, created_at: new Date().toISOString() }]
      }
      return { ...s, reacoes }
    }))
    try {
      await reagirAdmin(sugestaoId, mensagemId, emoji)
    } catch {
      buscarTodasSugestoes().then(setSugestoes).catch(console.error)
    }
  }

  // Presença: fica "online" para clientes somente quando admin está na aba suporte
  useEffect(() => {
    if (!isAdmin || activeTab !== 'suporte') return
    const ch = supabase.channel('fib-admin-presence')
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ online: true })
    })
    return () => { ch.untrack().finally(() => supabase.removeChannel(ch)) }
  }, [isAdmin, activeTab])

  // Total não lidas → localStorage + evento para badge no TopHeader
  useEffect(() => {
    void badgeVersion // força reexecução quando reads são marcados
    const total = sugestoes.reduce((sum, s) => sum + unreadCount(s), 0)
    localStorage.setItem('fib_adm_total', String(total))
    window.dispatchEvent(new CustomEvent('fib-unread-update', { detail: { count: total } }))
  }, [sugestoes, badgeVersion])

  // ── Divisão handlers ──
  const openAddDiv = () => { setEditingDivId(null); setDivForm(EMPTY_DIVISAO); setShowDivDialog(true) }
  const openEditDiv = (d: DivisaoReceita) => {
    setEditingDivId(d.id)
    setDivForm({ nome: d.nome, chave_pix: d.chave_pix ?? '', tipo: d.tipo, valor: String(d.valor), ativo: d.ativo })
    setShowDivDialog(true)
  }
  const saveDiv = async () => {
    if (!divForm.nome || !divForm.valor) return
    setSavingDiv(true)
    try {
      const p = { nome: divForm.nome, chave_pix: divForm.chave_pix || null, tipo: divForm.tipo, valor: Number(divForm.valor), ativo: divForm.ativo }
      if (editingDivId) await atualizarDivisao(editingDivId, p); else await criarDivisao(p)
      setDivisoes(await buscarDivisoes()); setShowDivDialog(false)
    } catch (err) { console.error(err) } finally { setSavingDiv(false) }
  }
  const deleteDiv = async (id: string) => {
    setDeletingDivId(id)
    try { await excluirDivisao(id); setDivisoes((p) => p.filter((d) => d.id !== id)) }
    catch (err) { console.error(err) } finally { setDeletingDivId(null) }
  }

  // ── Afiliado handlers ──
  const openAddAfil = () => { setAfilForm(EMPTY_AFILIADO); setAfilDetailId('new') }
  const openDetailAfil = (a: Afiliado) => {
    setAfilForm({
      nome: a.nome, email: a.email ?? '', telefone: a.telefone ?? '', codigo: a.codigo,
      comissao_tipo: a.comissao_tipo, comissao_valor: String(a.comissao_valor),
      stripe_account_id: a.stripe_account_id ?? '', cpf_cnpj: a.cpf_cnpj ?? '', chave_pix: a.chave_pix ?? '',
      codigo_banco: a.codigo_banco ?? '', banco: a.banco ?? '', agencia: a.agencia ?? '',
      conta: a.conta ?? '', tipo_conta: (a.tipo_conta === 'poupanca' ? 'poupanca' : 'corrente'),
      observacoes: a.observacoes ?? '', ativo: a.ativo,
    })
    setAfilDetailId(a.id)
  }
  const saveAfil = async () => {
    if (!afilForm.nome || !afilForm.codigo) return
    setSavingAfil(true)
    try {
      const p = {
        nome: afilForm.nome, email: afilForm.email || null, telefone: afilForm.telefone || null,
        codigo: afilForm.codigo.toUpperCase(), comissao_tipo: afilForm.comissao_tipo,
        comissao_valor: Number(afilForm.comissao_valor) || 0,
        stripe_account_id: afilForm.stripe_account_id || null, cpf_cnpj: afilForm.cpf_cnpj || null,
        chave_pix: afilForm.chave_pix || null, codigo_banco: afilForm.codigo_banco || null,
        banco: afilForm.banco || null, agencia: afilForm.agencia || null, conta: afilForm.conta || null,
        tipo_conta: afilForm.tipo_conta || null,
        observacoes: afilForm.observacoes || null, ativo: afilForm.ativo,
      }
      if (afilDetailId && afilDetailId !== 'new') await atualizarAfiliado(afilDetailId, p)
      else await criarAfiliado(p)
      setAfiliados(await buscarAfiliados()); setAfilDetailId(null)
    } catch (err) { console.error(err) } finally { setSavingAfil(false) }
  }
  const deleteAfil = async (id: string) => {
    setDeletingAfilId(id)
    try { await excluirAfiliado(id); setAfiliados((p) => p.filter((a) => a.id !== id)); setAfilDetailId(null) }
    catch (err) { console.error(err) } finally { setDeletingAfilId(null) }
  }

  // ── Cupon handlers ──
  const openAddCupon = () => { setEditingCuponId(null); setCuponForm(EMPTY_CUPON); setShowCuponDialog(true) }
  const openEditCupon = (c: Cupon) => {
    setEditingCuponId(c.id)
    setCuponForm({
      cupom: c.cupom,
      tipo_desconto: c.tipo_desconto,
      valor: String(c.tipo_desconto === 'porcentagem' ? (c.porcentagem_desconto ?? '') : (c.valor_desconto ?? '')),
      dias_validade: c.dias_validade != null ? String(c.dias_validade) : '',
      vezes_uso_maximo: String(c.vezes_uso_maximo),
      ativo: c.ativo,
    })
    setShowCuponDialog(true)
  }
  const saveCupon = async () => {
    if (!cuponForm.cupom || !cuponForm.valor) return
    setSavingCupon(true)
    try {
      const p = {
        cupom: cuponForm.cupom.toUpperCase(),
        tipo_desconto: cuponForm.tipo_desconto,
        valor: Number(cuponForm.valor),
        dias_validade: cuponForm.dias_validade ? Number(cuponForm.dias_validade) : null,
        vezes_uso_maximo: cuponForm.vezes_uso_maximo ? Number(cuponForm.vezes_uso_maximo) : null,
        ativo: cuponForm.ativo,
      }
      if (editingCuponId) await atualizarCupon(editingCuponId, p); else await criarCupon(p)
      setCupons(await buscarCupons()); setShowCuponDialog(false)
    } catch (err) { console.error(err) } finally { setSavingCupon(false) }
  }
  const deleteCupon = async (id: number) => {
    setDeletingCuponId(id)
    try { await excluirCupon(id); setCupons((p) => p.filter((c) => c.id !== id)) }
    catch (err) { console.error(err) } finally { setDeletingCuponId(null) }
  }

  const totalPct = divisoes.filter((d) => d.ativo && d.tipo === 'porcentagem').reduce((a, d) => a + d.valor, 0)
  const selectedConv = sugestoes.find((s) => s.id === selectedId) ?? null

  if (loadingAdmin || !isAdmin) return null

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header — escondido no app "Mensagens" instalado (fica só a lista, tipo WhatsApp) */}
      {!ehAppMensagens && (
      <div className="shrink-0 bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-gray-800 text-[15px]">Painel Admin</span>
          </div>
        </div>
        <div className="flex px-4 overflow-x-auto">
          {(['suporte', 'contas', 'pagamentos', 'cupons', 'afiliados', 'agentes', 'conhecimento', 'uso_ia'] as Tab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab ? 'border-[#1D4ED8] text-[#1D4ED8]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── SUPORTE ── */}
        {activeTab === 'suporte' && (
          <>
            <div
              className={cn(
                'shrink-0 border-r border-gray-200 flex-col overflow-hidden md:w-72 md:flex',
                // No mobile é single-pane: lista some quando há conversa aberta.
                selectedId ? 'hidden md:flex' : 'flex w-full',
              )}
            >
              <div className="px-4 py-3" style={{ background: WA_TEAL, paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}>
                <p className="text-[15px] font-semibold text-white">Suporte</p>
              </div>
              {loadingSugestoes ? (
                <p className="text-center py-8 text-sm text-gray-400">Carregando…</p>
              ) : sugestoes.length === 0 ? (
                <p className="text-center py-8 text-sm text-gray-400">Nenhuma mensagem.</p>
              ) : (
                <div className="overflow-y-auto flex-1">
                  {sugestoes.map((s) => (
                    <ConvItem key={s.id} s={s} selected={selectedId === s.id} onClick={() => handleSelect(s.id)} />
                  ))}
                </div>
              )}
            </div>
            <div
              className={cn(
                'flex-1 overflow-hidden',
                // No mobile: só aparece com conversa aberta; no desktop sempre.
                selectedId ? '' : 'hidden md:block',
              )}
            >
              {selectedConv ? (
                <ConversaView
                  key={selectedId}
                  onVoltar={() => setSelectedId(null)}
                  s={selectedConv} signedUrls={signedUrls}
                  replyText={replyTexts[selectedId!] ?? ''} replyFiles={replyFilesMap[selectedId!] ?? []}
                  sending={sendingId === selectedId}
                  onReplyTextChange={(v) => setReplyTexts((p) => ({ ...p, [selectedId!]: v }))}
                  onReplyFilesChange={(files) => setReplyFilesMap((p) => ({ ...p, [selectedId!]: files }))}
                  onRemoveFile={(idx) => setReplyFilesMap((p) => ({ ...p, [selectedId!]: (p[selectedId!] ?? []).filter((_, i) => i !== idx) }))}
                  onSend={(respondeA) => handleSend(selectedId!, respondeA)}
                  onRefresh={() => buscarTodasSugestoes().then(setSugestoes).catch(console.error)}
                  onRead={() => {
                    const nowIso = new Date().toISOString()
                    setSugestoes((prev) => prev.map((x) => (x.id === selectedId ? { ...x, admin_leu_em: nowIso } : x)))
                    refreshBadges()
                  }}
                  onReact={(mensagemId, emoji) => handleReactAdmin(selectedId!, mensagemId, emoji)}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2" style={{ background: WA_BG }}>
                  <MessageSquare className="h-10 w-10 opacity-20" style={{ color: WA_TEAL }} />
                  <p className="text-[13px] text-gray-500 opacity-60">Selecione uma conversa para começar</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CONTAS ── */}
        {activeTab === 'contas' && (() => {
          const busca = buscaConta.trim().toLowerCase()
          const contasBusca = contas.filter((c) =>
            !busca || [c.nome, c.nome_restaurante, c.email].some((v) => (v ?? '').toLowerCase().includes(busca)),
          )
          const casaFiltro = (c: ContaAdmin, f: FiltroConta) => {
            const excluida = !!c.excluida_em
            const pagante = c.assinatura_status === 'ativa'
            if (f === 'excluidas') return excluida
            if (f === 'pagantes') return !excluida && pagante
            if (f === 'nao_pagantes') return !excluida && !pagante
            return true
          }
          const contasFiltradas = contasBusca.filter((c) => casaFiltro(c, filtroConta))

          return (
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-800">Contas</h2>
                <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                  São duas coisas diferentes. <b className="text-gray-700">Pagamento</b>: parar de
                  pagar tira o acesso ao software (a conta cai na tela de planos), mas guarda tudo — a
                  pessoa pode voltar a pagar quando quiser. <b className="text-gray-700">Excluir</b>:
                  remove o acesso de vez — a pessoa não recupera sozinha, nem criando conta com o mesmo
                  email. Os dados ficam no banco e só você restaura.
                </p>
              </div>

              {/* Busca */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={buscaConta}
                  onChange={(e) => setBuscaConta(e.target.value)}
                  placeholder="Buscar por nome, restaurante ou email…"
                  className="w-full h-9 pl-9 pr-3 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-[#1D4ED8]"
                />
              </div>

              {/* Filtros por situação, com contagem */}
              <div className="flex flex-wrap gap-2 mb-4">
                {FILTROS_CONTA.map((f) => {
                  const n = contasBusca.filter((c) => casaFiltro(c, f.key)).length
                  const on = filtroConta === f.key
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFiltroConta(f.key)}
                      className={cn(
                        'px-3 py-1 rounded-full text-[12px] font-medium border transition-colors',
                        on
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {f.label}
                      <span className={cn('ml-1.5', on ? 'text-blue-200' : 'text-gray-400')}>{n}</span>
                    </button>
                  )
                })}
              </div>

              {loadingContas ? (
                <p className="text-center py-10 text-sm text-gray-400">Carregando…</p>
              ) : contasFiltradas.length === 0 ? (
                <p className="text-center py-10 text-sm text-gray-400">
                  {contas.length === 0 ? 'Nenhuma conta ainda.' : 'Nenhuma conta neste filtro.'}
                </p>
              ) : (
                <CrudTable>
                  <thead>
                    <tr>
                      <Th>Conta</Th>
                      <Th>Pagamento</Th>
                      <Th>Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasFiltradas.map((c) => {
                      const pagante = c.assinatura_status === 'ativa'
                      const excluida = !!c.excluida_em
                      const salvando = salvandoContaId === c.id
                      return (
                        <tr key={c.id} className={cn('border-t border-gray-300', excluida && 'bg-red-50/40')}>
                          {/* Conta */}
                          <Td>
                            <div className="flex flex-col">
                              <span className={cn('font-medium', excluida ? 'text-gray-500' : 'text-gray-800')}>
                                {c.nome_restaurante || 'Sem nome'}
                                {c.nome && <span className="text-gray-400 font-normal"> · {c.nome}</span>}
                                {excluida && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold tracking-wide align-middle">
                                    EXCLUÍDA
                                  </span>
                                )}
                              </span>
                              <span className="text-[12px] text-gray-400">{c.email || '—'}</span>
                            </div>
                          </Td>

                          {/* Pagamento */}
                          <Td>
                            <span className={cn(
                              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                              pagante ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                            )}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', pagante ? 'bg-emerald-500' : 'bg-gray-400')} />
                              {pagante ? 'Pagante' : 'Não pagante'}
                            </span>
                            {(c.assinatura_status === 'inadimplente' || c.assinatura_status === 'cancelada') && (
                              <span className="ml-1.5 text-[10px] text-gray-400">{c.assinatura_status}</span>
                            )}
                            {pagante && c.plano_ciclo && (
                              <span className="ml-1.5 text-[10px] text-gray-400">{c.plano_ciclo}</span>
                            )}
                          </Td>

                          {/* Ação: só exclusão reversível. O acesso pago é
                              controlado por pagamento real ou cupom — não há
                              como "tornar pagante" pelo painel. */}
                          <Td>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => alternarExclusao(c)}
                                disabled={salvando}
                                title={excluida
                                  ? 'Restaurar: devolve o acesso e os dados'
                                  : 'Excluir: remove o acesso de vez, mas guarda os dados no banco'}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition-colors disabled:opacity-40',
                                  excluida
                                    ? 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                    : 'border border-red-200 text-red-600 hover:bg-red-50',
                                )}
                              >
                                {excluida ? (
                                  <><RotateCcw className="h-3.5 w-3.5" /> Restaurar</>
                                ) : (
                                  <><Trash2 className="h-3.5 w-3.5" /> Excluir</>
                                )}
                              </button>
                            </div>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </CrudTable>
              )}
            </div>
          </div>
          )
        })()}

        {/* ── PAGAMENTOS ── */}
        {activeTab === 'pagamentos' && (
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Divisão de Receita</h2>
                  {divisoes.some((d) => d.ativo && d.tipo === 'porcentagem') && (
                    <p className={cn('text-[12px] mt-0.5', Math.abs(totalPct - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600')}>
                      Total %: {totalPct}%{Math.abs(totalPct - 100) >= 0.01 && ' — deve somar 100%'}
                    </p>
                  )}
                </div>
                <Button size="sm" onClick={openAddDiv}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
              </div>
              {loadingDiv ? (
                <p className="text-center py-12 text-sm text-gray-400">Carregando…</p>
              ) : divisoes.length === 0 ? (
                <p className="text-center py-12 text-sm text-gray-400">Nenhuma configuração.</p>
              ) : (
                <CrudTable>
                  <thead><tr>{['Nome','Chave PIX','Tipo','Valor','Ativo',''].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {divisoes.map((d) => (
                      <tr key={d.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                        <Td className="font-medium text-gray-800">{d.nome}</Td>
                        <Td className="text-gray-500 text-[13px]">{d.chave_pix ?? '—'}</Td>
                        <Td className="text-gray-500 text-[13px]">{d.tipo === 'porcentagem' ? 'Porcentagem' : 'Valor fixo'}</Td>
                        <Td className="font-semibold text-gray-700">{d.tipo === 'porcentagem' ? `${d.valor}%` : `R$ ${d.valor.toFixed(2)}`}</Td>
                        <Td><BadgeBool v={d.ativo} /></Td>
                        <Td><RowActions onEdit={() => openEditDiv(d)} onDelete={() => deleteDiv(d.id)} deleting={deletingDivId === d.id} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </CrudTable>
              )}
            </div>
          </div>
        )}

        {/* ── CUPONS ── */}
        {activeTab === 'cupons' && (
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-gray-500" />
                  <h2 className="text-base font-semibold text-gray-800">Cupons de Desconto</h2>
                </div>
                <Button size="sm" onClick={openAddCupon}><Plus className="h-4 w-4 mr-1" /> Novo cupom</Button>
              </div>
              {loadingCupons ? (
                <p className="text-center py-12 text-sm text-gray-400">Carregando…</p>
              ) : cupons.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum cupom criado ainda.</p>
                </div>
              ) : (
                <CrudTable>
                  <thead>
                    <tr>{['Código','Desconto','Validade','Usos','Ativo',''].map((h) => <Th key={h}>{h}</Th>)}</tr>
                  </thead>
                  <tbody>
                    {cupons.map((c) => (
                      <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                        <Td>
                          <span className="font-mono font-semibold text-[13px] bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                            {c.cupom}
                          </span>
                        </Td>
                        <Td className="font-semibold text-emerald-700">{fmtDesconto(c)}</Td>
                        <Td>
                          {c.dias_validade != null ? (
                            <span className="text-[13px] text-gray-600">{c.dias_validade} dias</span>
                          ) : <span className="text-gray-400 text-[13px]">Sem limite</span>}
                        </Td>
                        <Td className="text-[13px] text-gray-600">
                          {c.vezes_usado}/{c.vezes_uso_maximo ?? '∞'}
                        </Td>
                        <Td><BadgeBool v={c.ativo} /></Td>
                        <Td><RowActions onEdit={() => openEditCupon(c)} onDelete={() => deleteCupon(c.id)} deleting={deletingCuponId === c.id} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </CrudTable>
              )}
            </div>
          </div>
        )}

        {/* ── AFILIADOS ── */}
        {activeTab === 'afiliados' && (
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {afilDetailId ? (
              <AfiliadoDetalhe
                novo={afilDetailId === 'new'}
                form={afilForm}
                setForm={setAfilForm}
                saving={savingAfil}
                deleting={deletingAfilId === afilDetailId}
                onSave={saveAfil}
                onBack={() => setAfilDetailId(null)}
                onDelete={afilDetailId !== 'new' ? () => deleteAfil(afilDetailId) : undefined}
              />
            ) : (
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-gray-500" />
                    <h2 className="text-base font-semibold text-gray-800">Afiliados</h2>
                  </div>
                  <Button size="sm" onClick={openAddAfil}><Plus className="h-4 w-4 mr-1" /> Novo afiliado</Button>
                </div>
                {loadingAfil ? (
                  <p className="text-center py-12 text-sm text-gray-400">Carregando…</p>
                ) : afiliados.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum afiliado cadastrado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {afiliados.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openDetailAfil(a)}
                        className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-violet-300 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0', avatarColor(a.nome))}>
                            {initials(a.nome, a.email)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-800 truncate">{a.nome}</p>
                            <p className="text-[12px] text-gray-500 truncate">{a.email ?? a.telefone ?? '—'}</p>
                          </div>
                          {!a.ativo && <span className="text-[10px] text-gray-400 shrink-0">inativo</span>}
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-300">
                          <span className="font-mono text-[12px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded font-semibold">{a.codigo}</span>
                          <span className="text-[13px] font-semibold text-gray-700">
                            {a.comissao_tipo === 'porcentagem' ? `${a.comissao_valor}%` : `R$ ${Number(a.comissao_valor).toFixed(2)}`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── AGENTES DE IA ── */}
        {activeTab === 'agentes' && <PainelAgentes />}

        {/* ── CONHECIMENTO GLOBAL ── */}
        {activeTab === 'conhecimento' && <ConhecimentoGlobal />}

        {/* ── USO E CUSTO DE IA ── */}
        {activeTab === 'uso_ia' && (
          <div className="flex-1 overflow-y-auto sem-barra p-6">
            <PainelUsoIA />
          </div>
        )}
      </div>

      {/* ── Dialog: Divisão ── */}
      <Dialog open={showDivDialog} onOpenChange={setShowDivDialog}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader><DialogTitle>{editingDivId ? 'Editar entrada' : 'Adicionar entrada'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-[13px]">Nome</Label>
              <Input value={divForm.nome} onChange={(e) => setDivForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex: Raver" className="mt-1" />
            </div>
            <div>
              <Label className="text-[13px]">Chave PIX</Label>
              <Input value={divForm.chave_pix} onChange={(e) => setDivForm((p) => ({ ...p, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone…" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px]">Tipo</Label>
                <Select value={divForm.tipo} onValueChange={(v) => setDivForm((p) => ({ ...p, tipo: v as any }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentagem">Porcentagem (%)</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px]">Valor</Label>
                <Input type="number" value={divForm.valor} onChange={(e) => setDivForm((p) => ({ ...p, valor: e.target.value }))} placeholder={divForm.tipo === 'porcentagem' ? '70' : '200'} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="div-ativo" checked={divForm.ativo} onChange={(e) => setDivForm((p) => ({ ...p, ativo: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
              <Label htmlFor="div-ativo" className="text-[13px] cursor-pointer">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDivDialog(false)}>Cancelar</Button>
            <Button onClick={saveDiv} disabled={savingDiv || !divForm.nome || !divForm.valor}>{savingDiv ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Cupom ── */}
      <Dialog open={showCuponDialog} onOpenChange={setShowCuponDialog}>
        <DialogContent className="sm:max-w-[480px] rounded-xl">
          <DialogHeader><DialogTitle>{editingCuponId ? 'Editar cupom' : 'Novo cupom'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-[13px]">Código *</Label>
              <Input value={cuponForm.cupom} onChange={(e) => setCuponForm((p) => ({ ...p, cupom: e.target.value.toUpperCase() }))} placeholder="DESC20" className="mt-1 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px]">Tipo desconto</Label>
                <Select value={cuponForm.tipo_desconto} onValueChange={(v) => setCuponForm((p) => ({ ...p, tipo_desconto: v as 'porcentagem' | 'valor_fixo' }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentagem">Porcentagem (%)</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px]">Valor *</Label>
                <Input type="number" value={cuponForm.valor} onChange={(e) => setCuponForm((p) => ({ ...p, valor: e.target.value }))} placeholder={cuponForm.tipo_desconto === 'porcentagem' ? '20' : '50'} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px]">Validade (dias)</Label>
                <Input type="number" value={cuponForm.dias_validade} onChange={(e) => setCuponForm((p) => ({ ...p, dias_validade: e.target.value }))} placeholder="30" className="mt-1" />
                <p className="text-[11px] text-gray-400 mt-1">Vazio = sem limite</p>
              </div>
              <div>
                <Label className="text-[13px]">Usos máximos</Label>
                <Input type="number" value={cuponForm.vezes_uso_maximo} onChange={(e) => setCuponForm((p) => ({ ...p, vezes_uso_maximo: e.target.value }))} placeholder="Ilimitado" className="mt-1" />
                <p className="text-[11px] text-gray-400 mt-1">Vazio = ilimitado</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="cupon-ativo" checked={cuponForm.ativo} onChange={(e) => setCuponForm((p) => ({ ...p, ativo: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
              <Label htmlFor="cupon-ativo" className="text-[13px] cursor-pointer">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCuponDialog(false)}>Cancelar</Button>
            <Button onClick={saveCupon} disabled={savingCupon || !cuponForm.cupom || !cuponForm.valor}>{savingCupon ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── AfiliadoDetalhe (tela de detalhe/edição — não é popup) ─────────────────────
type AfilForm = typeof EMPTY_AFILIADO
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[13px]">{label}</Label>
      {children}
    </div>
  )
}
function AfiliadoDetalhe({ novo, form, setForm, saving, deleting, onSave, onBack, onDelete }: {
  novo: boolean
  form: AfilForm
  setForm: React.Dispatch<React.SetStateAction<AfilForm>>
  saving: boolean
  deleting: boolean
  onSave: () => void
  onBack: () => void
  onDelete?: () => void
}) {
  const set = (patch: Partial<AfilForm>) => setForm((p) => ({ ...p, ...patch }))
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {onDelete && (
          <Button variant="outline" size="sm" onClick={onDelete} disabled={deleting}
            className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1" /> {deleting ? 'Excluindo…' : 'Excluir'}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className={cn('h-14 w-14 rounded-full flex items-center justify-center text-white text-lg font-semibold shrink-0', avatarColor(form.nome || '?'))}>
            {initials(form.nome || '?', form.email)}
          </div>
          <h2 className="text-lg font-semibold text-gray-800">{novo ? 'Novo afiliado' : (form.nome || 'Afiliado')}</h2>
        </div>

        {/* Dados */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Dados</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome *"><Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="João Silva" className="mt-1" /></Campo>
            <Campo label="Código único *"><Input value={form.codigo} onChange={(e) => set({ codigo: e.target.value.toUpperCase() })} placeholder="JOAO10" className="mt-1 font-mono" /></Campo>
            <Campo label="E-mail"><Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="joao@email.com" className="mt-1" /></Campo>
            <Campo label="Telefone"><Input value={form.telefone} onChange={(e) => set({ telefone: e.target.value })} placeholder="(11) 90000-0000" className="mt-1" /></Campo>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input type="checkbox" id="afil-ativo" checked={form.ativo} onChange={(e) => set({ ativo: e.target.checked })} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
            <Label htmlFor="afil-ativo" className="text-[13px] cursor-pointer">Ativo</Label>
          </div>
        </div>

        {/* Comissão */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Comissão por venda</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo">
              <Select value={form.comissao_tipo} onValueChange={(v) => set({ comissao_tipo: v as 'porcentagem' | 'valor_fixo' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentagem">Porcentagem (%)</SelectItem>
                  <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label={form.comissao_tipo === 'porcentagem' ? '% por venda' : 'R$ por venda'}>
              <Input type="number" value={form.comissao_valor} onChange={(e) => set({ comissao_valor: e.target.value })} placeholder={form.comissao_tipo === 'porcentagem' ? '10' : '50'} className="mt-1" />
            </Campo>
          </div>
        </div>

        {/* Pagamento via Stripe */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Pagamento (Stripe)</p>
          <div className="space-y-3">
            <Campo label="Stripe Connect Account ID">
              <Input value={form.stripe_account_id} onChange={(e) => set({ stripe_account_id: e.target.value })} placeholder="acct_1AbC..." className="mt-1 font-mono" />
              <p className="text-[11px] text-gray-400 mt-1">Conta conectada do afiliado — usada para depositar a comissão via transferência.</p>
            </Campo>
            <Campo label="CPF ou CNPJ"><Input value={form.cpf_cnpj} onChange={(e) => set({ cpf_cnpj: e.target.value })} placeholder="000.000.000-00" className="mt-1" /></Campo>
          </div>
        </div>

        {/* Conta bancária (Brasil) */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Conta bancária</p>
          <div className="space-y-3">
            <Campo label="Chave PIX"><Input value={form.chave_pix} onChange={(e) => set({ chave_pix: e.target.value })} placeholder="CPF, e-mail, telefone…" className="mt-1" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Banco (nome)"><Input value={form.banco} onChange={(e) => set({ banco: e.target.value })} placeholder="Nubank" className="mt-1" /></Campo>
              <Campo label="Código do banco"><Input value={form.codigo_banco} onChange={(e) => set({ codigo_banco: e.target.value })} placeholder="260" className="mt-1 font-mono" /></Campo>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Agência"><Input value={form.agencia} onChange={(e) => set({ agencia: e.target.value })} placeholder="0001" className="mt-1" /></Campo>
              <Campo label="Conta"><Input value={form.conta} onChange={(e) => set({ conta: e.target.value })} placeholder="12345-6" className="mt-1" /></Campo>
              <Campo label="Tipo">
                <Select value={form.tipo_conta} onValueChange={(v) => set({ tipo_conta: v as 'corrente' | 'poupanca' })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <p className="text-[11px] text-gray-400">O Stripe (Brasil) exige conta corrente no mesmo CPF/CNPJ do titular para receber os repasses.</p>
          </div>
        </div>

        {/* Observações */}
        <Campo label="Observações">
          <textarea value={form.observacoes} onChange={(e) => set({ observacoes: e.target.value })} rows={3}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Anotações internas…" />
        </Campo>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-300">
          <Button variant="outline" onClick={onBack}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving || !form.nome || !form.codigo}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  )
}
