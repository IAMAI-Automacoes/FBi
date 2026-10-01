import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, File as IconeArquivo, ImageOff, Loader2, MapPin, Play, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracao, formatarTelefone } from '@/lib/whatsapp/formatacao'
import { buscarConteudo, urlParaBaixar } from '@/lib/queries/whatsapp'
import { Realce } from '../pecas'

/**
 * Mídias dentro do balão. A URL vem assinada de fora (bucket privado
 * "mensagens", ver queries/whatsapp.ts). Sem URL = o arquivo não foi guardado
 * (link da uazapi expirou, mais de 40 MB…): mostra "Mídia indisponível".
 */

const LARGURA = 'w-[min(330px,72vw)]'

export function MidiaIndisponivel({ rotulo = 'Mídia indisponível' }: { rotulo?: string }) {
  return (
    <div className={cn(LARGURA, 'flex h-28 flex-col items-center justify-center gap-1 rounded-md bg-black/[0.05] text-[12px] text-gray-500')}>
      <ImageOff className="h-5 w-5" />
      {rotulo}
    </div>
  )
}

// ── Foto ───────────────────────────────────────────────────────────────────

export function MidiaImagem({ url, aoAbrir }: { url: string; aoAbrir: () => void }) {
  const [proporcao, setProporcao] = useState<number | null>(null)
  const [erro, setErro] = useState(false)
  if (erro) return <MidiaIndisponivel />
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); aoAbrir() }}
      className={cn(LARGURA, 'relative block overflow-hidden rounded-md bg-black/[0.06] cursor-zoom-in')}
      // Até carregar: altura de foto "em pé" média; depois, a proporção real
      // (limitada para uma foto muito comprida não ocupar a tela inteira).
      style={{ aspectRatio: proporcao ? `${Math.min(Math.max(proporcao, 0.6), 1.9)}` : '4 / 3' }}
      aria-label="Abrir foto"
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={(e) => setProporcao(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        onError={() => setErro(true)}
        className={cn('h-full w-full object-cover transition-opacity duration-300', proporcao ? 'opacity-100' : 'opacity-0')}
      />
      {!proporcao && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-gray-400" />}
    </button>
  )
}

// ── Vídeo ──────────────────────────────────────────────────────────────────

export function MidiaVideo({ url, aoAbrir }: { url: string; aoAbrir: () => void }) {
  const [tempo, setTempo] = useState<number | null>(null)
  const [proporcao, setProporcao] = useState<number | null>(null)
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); aoAbrir() }}
      className={cn(LARGURA, 'relative block overflow-hidden rounded-md bg-black')}
      style={{ aspectRatio: proporcao ? `${Math.min(Math.max(proporcao, 0.6), 1.9)}` : '16 / 9' }}
      aria-label="Tocar vídeo"
    >
      {/* `#t=0.1` faz o navegador mostrar o primeiro quadro como capa. */}
      <video
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (Number.isFinite(v.duration)) setTempo(v.duration)
          if (v.videoWidth && v.videoHeight) setProporcao(v.videoWidth / v.videoHeight)
        }}
        className="pointer-events-none h-full w-full object-cover"
      />
      <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/55">
        <Play className="ml-1 h-7 w-7 fill-white text-white" />
      </span>
      {tempo !== null && (
        <span className="absolute bottom-1.5 left-2 text-[11px] font-medium text-white drop-shadow">▶ {duracao(tempo)}</span>
      )}
    </button>
  )
}

// ── GIF (mp4 mudo em loop, sem controles — é assim que o WhatsApp manda) ──

export function MidiaGif({ url, aoAbrir }: { url: string; aoAbrir: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [proporcao, setProporcao] = useState<number | null>(null)
  // Só toca enquanto aparece na tela: dez gifs tocando fora da vista pesam.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {})
      else v.pause()
    }, { threshold: 0.2 })
    obs.observe(v)
    return () => obs.disconnect()
  }, [])
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); aoAbrir() }}
      className={cn(LARGURA, 'relative block overflow-hidden rounded-md bg-black/[0.06]')}
      style={{ aspectRatio: proporcao ? `${Math.min(Math.max(proporcao, 0.6), 1.9)}` : '1 / 1' }}
      aria-label="Abrir GIF"
    >
      <video
        ref={ref}
        src={url}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoWidth && v.videoHeight) setProporcao(v.videoWidth / v.videoHeight)
        }}
        className="pointer-events-none h-full w-full object-cover"
      />
      <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">GIF</span>
    </button>
  )
}

// ── Figurinha (webp, pode ser animada; sem balão) ──────────────────────────

export function Figurinha({ url }: { url: string }) {
  const [erro, setErro] = useState(false)
  if (erro) return <MidiaIndisponivel rotulo="Figurinha indisponível" />
  return <img src={url} alt="Figurinha" loading="lazy" onError={() => setErro(true)} className="h-[150px] w-[150px] object-contain" />
}

// ── Documento ──────────────────────────────────────────────────────────────

function extensao(nome: string | null, mime: string | null): string {
  const doNome = (nome ?? '').split('.').pop()
  if (nome && doNome && doNome.length <= 5 && doNome !== nome) return doNome.toUpperCase()
  const m = (mime ?? '').split('/').pop() ?? ''
  if (m === 'pdf') return 'PDF'
  return m.slice(0, 5).toUpperCase() || 'ARQUIVO'
}

function IconeDoc({ ext }: { ext: string }) {
  if (ext === 'PDF') return <FileText className="h-7 w-7 text-red-500" />
  if (['XLS', 'XLSX', 'CSV', 'ODS'].includes(ext)) return <FileSpreadsheet className="h-7 w-7 text-green-600" />
  if (['DOC', 'DOCX', 'ODT', 'TXT'].includes(ext)) return <FileText className="h-7 w-7 text-blue-600" />
  return <IconeArquivo className="h-7 w-7 text-gray-500" />
}

/** Miniatura da 1ª página do PDF (pdfjs), desenhada só quando aparece na tela. */
function CapaPdf({ url, aoContarPaginas }: { url: string; aoContarPaginas: (n: number) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [pronta, setPronta] = useState(false)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let cancelado = false
    const obs = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      try {
        const pdfjs: any = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const dados = await (await fetch(url)).arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: dados }).promise
        if (cancelado) return
        aoContarPaginas(pdf.numPages)
        const pagina = await pdf.getPage(1)
        const base = pagina.getViewport({ scale: 1 })
        const largura = el.clientWidth || 300
        const escala = (largura / base.width) * (window.devicePixelRatio || 1)
        const vp = pagina.getViewport({ scale: escala })
        const c = canvas.current
        if (!c || cancelado) return
        c.width = vp.width
        c.height = Math.min(vp.height, vp.width * 0.56)
        await pagina.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
        if (!cancelado) setPronta(true)
      } catch { /* sem capa: fica só o cartão */ }
    })
    obs.observe(el)
    return () => { cancelado = true; obs.disconnect() }
  }, [url, aoContarPaginas])
  return (
    <div ref={caixa} className={cn('overflow-hidden rounded-t-md bg-white', pronta ? 'block' : 'h-0')}>
      <canvas ref={canvas} className="block w-full" />
    </div>
  )
}

export function CartaoDocumento({ url, caminho, nome, mime, deMim, aoAbrirPdf, destaque }: {
  destaque?: string
  url: string
  caminho: string
  nome: string | null
  mime: string | null
  deMim: boolean
  aoAbrirPdf: () => void
}) {
  const ext = extensao(nome, mime)
  const ehPdf = ext === 'PDF'
  const [paginas, setPaginas] = useState<number | null>(null)
  const [baixando, setBaixando] = useState(false)
  const titulo = nome || `Documento.${ext.toLowerCase()}`

  const baixar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBaixando(true)
    const link = await urlParaBaixar(caminho, nome)
    setBaixando(false)
    if (link) window.location.href = link
  }

  return (
    <div className={cn(LARGURA, 'overflow-hidden rounded-md', deMim ? 'bg-[#cfe9ba]' : 'bg-[#f5f6f6]')}>
      {ehPdf && url && <CapaPdf url={url} aoContarPaginas={setPaginas} />}
      <div
        role={ehPdf ? 'button' : undefined}
        onClick={ehPdf ? (e) => { e.stopPropagation(); aoAbrirPdf() } : undefined}
        className={cn('flex items-center gap-3 px-3 py-2.5', ehPdf && 'cursor-pointer hover:bg-black/[0.03]')}
      >
        <IconeDoc ext={ext} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-gray-800" title={titulo}><Realce texto={titulo} termo={destaque} /></p>
          <p className="text-[11px] uppercase text-gray-500">
            {ext}{paginas ? ` · ${paginas} página${paginas > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={baixar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-gray-600 hover:bg-black/5"
          aria-label={`Baixar ${titulo}`}
          title="Baixar"
        >
          {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Localização e contato (dados só no payload; buscados sob demanda) ───────
// Nenhum dos dois foi testado com mensagem real: se o formato não bater, cai
// em "Mensagem não suportada" em vez de mostrar algo errado.

export function CartaoConteudo({ id, tipo }: { id: number; tipo: 'location' | 'contact' }) {
  const [conteudo, setConteudo] = useState<Record<string, unknown> | null | undefined>(undefined)
  useEffect(() => { buscarConteudo(id).then(setConteudo).catch(() => setConteudo(null)) }, [id])

  if (conteudo === undefined) return <div className={cn(LARGURA, 'h-16 animate-pulse rounded-md bg-black/[0.05]')} />

  if (tipo === 'location') {
    const lat = Number(conteudo?.degreesLatitude)
    const lng = Number(conteudo?.degreesLongitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return <NaoSuportada />
    const nome = String(conteudo?.name ?? '') || 'Localização'
    const endereco = String(conteudo?.address ?? '')
    return (
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(LARGURA, 'flex items-center gap-3 rounded-md bg-black/[0.04] px-3 py-3 hover:bg-black/[0.07]')}
      >
        <MapPin className="h-8 w-8 shrink-0 text-red-500" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-gray-800">{nome}</p>
          <p className="truncate text-[12px] text-gray-500">{endereco || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</p>
          <p className="text-[12px] text-[#027EB5]">Abrir no mapa</p>
        </div>
      </a>
    )
  }

  const nome = String(conteudo?.displayName ?? '')
  const vcard = String(conteudo?.vcard ?? '')
  const tel = vcard.match(/waid=(\d+)/)?.[1] ?? vcard.match(/TEL[^:]*:([+\d\s()-]+)/)?.[1]?.replace(/\D/g, '') ?? ''
  if (!nome && !tel) return <NaoSuportada />
  return (
    <div className={cn(LARGURA, 'flex items-center gap-3 rounded-md bg-black/[0.04] px-3 py-3')}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-300"><User className="h-6 w-6 text-white" /></span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-gray-800">{nome || 'Contato'}</p>
        {tel && <p className="text-[12px] text-gray-500">{formatarTelefone(tel)}</p>}
      </div>
    </div>
  )
}

export function NaoSuportada() {
  return <p className="text-[13px] italic text-gray-500">Mensagem não suportada nesta tela. Veja no WhatsApp do celular.</p>
}
