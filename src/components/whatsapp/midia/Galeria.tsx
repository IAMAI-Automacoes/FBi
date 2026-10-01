import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaCurta, rotuloDia } from '@/lib/whatsapp/formatacao'
import { VisualizadorPdf } from '@/components/chat/VisualizadorPdf'

export interface ItemGaleria {
  id: number
  tipo: 'image' | 'video' | 'gif'
  url: string
  legenda: string | null
  autor: string
  enviada_em: string
  nomeArquivo: string
}

async function baixarArquivo(url: string, nome: string) {
  try {
    const blob = await (await fetch(url)).blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/**
 * Fotos, vídeos e gifs da conversa em tela cheia, como o visualizador do
 * WhatsApp: setas (ou ← →), deslizar no celular, Esc fecha, miniaturas
 * embaixo no computador. Foto: lupa ao passar o mouse/segurar o dedo (mesma
 * ideia do MediaModal do chat de suporte). Vídeo: player nativo, já tocando.
 */
export function Galeria({ itens, inicial, aoFechar }: { itens: ItemGaleria[]; inicial: number; aoFechar: () => void }) {
  const [i, setI] = useState(inicial)
  const [zoom, setZoom] = useState(false)
  const [origem, setOrigem] = useState('center')
  const toque = useRef<{ x: number; y: number } | null>(null)
  const item = itens[i]

  const ir = (d: number) => {
    setZoom(false)
    setI((atual) => Math.min(Math.max(atual + d, 0), itens.length - 1))
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowLeft') ir(-1)
      if (e.key === 'ArrowRight') ir(1)
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = overflow }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoFechar, itens.length])

  if (!item) return null

  const posicao = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Mídia da conversa"
      onPointerDown={(e) => { toque.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={(e) => {
        const ini = toque.current
        toque.current = null
        if (!ini || e.pointerType === 'mouse' || zoom) return
        const dx = e.clientX - ini.x
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - ini.y)) ir(dx < 0 ? 1 : -1)
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{item.autor}</p>
          <p className="text-[12px] text-white/60">{rotuloDia(item.enviada_em)} às {horaCurta(item.enviada_em)}{itens.length > 1 ? ` · ${i + 1} de ${itens.length}` : ''}</p>
        </div>
        <button type="button" title="Baixar" onClick={() => baixarArquivo(item.url, item.nomeArquivo)}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <Download className="h-5 w-5" />
        </button>
        <button type="button" title="Fechar" onClick={aoFechar}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={aoFechar}>
        {i > 0 && (
          <button type="button" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); ir(-1) }}
            className="absolute left-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="flex h-full max-w-full items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {item.tipo === 'image' ? (
            <img
              key={item.id}
              src={item.url}
              alt={item.legenda ?? ''}
              // Clique amplia no ponto clicado e a lupa segue o mouse; outro
              // clique volta. (Não liga sozinho ao passar o mouse: a foto abre
              // exatamente sob o cursor e já apareceria ampliada.)
              onClick={(e) => { setOrigem(posicao(e)); setZoom((z) => !z) }}
              onPointerMove={(e) => { if (zoom && e.pointerType === 'mouse') setOrigem(posicao(e)) }}
              className={cn('max-h-[calc(100dvh-180px)] max-w-full select-none object-contain transition-transform duration-150', zoom ? 'scale-[2.5] cursor-zoom-out' : 'cursor-zoom-in')}
              style={{ transformOrigin: origem }}
              draggable={false}
            />
          ) : item.tipo === 'gif' ? (
            <video key={item.id} src={item.url} autoPlay loop muted playsInline className="max-h-[calc(100dvh-180px)] max-w-full" />
          ) : (
            <video key={item.id} src={item.url} autoPlay controls playsInline className="max-h-[calc(100dvh-180px)] max-w-full" />
          )}
        </div>
        {i < itens.length - 1 && (
          <button type="button" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); ir(1) }}
            className="absolute right-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {item.legenda && <p className="mx-auto max-w-2xl px-4 py-2 text-center text-[14px] text-white/90 whitespace-pre-wrap">{item.legenda}</p>}

      {itens.length > 1 && (
        <div className="hidden justify-center gap-1.5 overflow-x-auto px-4 pb-4 pt-1 md:flex">
          {itens.map((it, n) => (
            <button key={it.id} type="button" onClick={() => { setZoom(false); setI(n) }}
              className={cn('h-14 w-14 shrink-0 overflow-hidden rounded border-2', n === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100')}>
              {it.tipo === 'image'
                ? <img src={it.url} alt="" className="h-full w-full object-cover" />
                : <video src={`${it.url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}
      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </div>
  )
}

/** PDF em tela cheia (reaproveita o VisualizadorPdf do chat de IA). */
export function LeitorPdf({ url, nome, aoFechar }: { url: string; nome: string; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-100" role="dialog" aria-modal="true" aria-label={nome}>
      <div className="flex items-center gap-2 border-b bg-white px-3 py-2" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{nome}</p>
        <button type="button" title="Baixar" onClick={() => baixarArquivo(url, nome)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
          <Download className="h-4 w-4" />
        </button>
        <button type="button" title="Fechar" onClick={aoFechar}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1">
        <VisualizadorPdf url={url} />
      </div>
    </div>
  )
}
