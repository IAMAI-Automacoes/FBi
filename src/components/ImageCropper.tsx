import { useRef, useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Maior lado da moldura na tela (o outro sai da proporção outputWidth:outputHeight). */
const FRAME_LONG_SIDE = 320
const MARGIN = 36 // borda escurecida ao redor da moldura
/** Zoom máximo permitido, como múltiplo do zoom mínimo (o que só cobre a moldura). */
const ZOOM_MAX_MULT = 4

/**
 * Recorte manual reutilizável: moldura com a proporção de `outputWidth`x
 * `outputHeight` (poster de QR, logo quadrada, avatar redondo — quem chama
 * decide); a imagem fica atrás, dá pra arrastar pra posicionar e dar zoom.
 *
 * Zoom por duas vias, as duas mantendo a moldura sempre coberta:
 * - roda do mouse: o zoom foca exatamente no ponto embaixo do cursor (a
 *   matemática de "zoom to cursor" abaixo), então o que está sob o mouse não
 *   sai do lugar enquanto a imagem cresce;
 * - pinça de dois dedos: mesma matemática, ancorada no ponto médio entre eles.
 *
 * A pinça não é enfeite. Havia um slider de zoom, e era ele o ÚNICO caminho no
 * celular — roda do mouse não existe no toque. Tirar o slider sem a pinça
 * deixaria quem usa o celular sem nenhuma forma de dar zoom, e é justamente no
 * celular que a foto costuma ser escolhida.
 */
export function ImageCropper({
  file, onConfirm, onCancel, salvando,
  outputWidth = 1080, outputHeight = 1920,
  shape = 'rect',
  title = 'Ajuste a imagem',
  instructions = 'Arraste ou dê zoom para ajustar.',
}: {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
  salvando?: boolean
  /** Tamanho de saída em pixels — também define a proporção da moldura. */
  outputWidth?: number
  outputHeight?: number
  /** Só muda a prévia visual (moldura redonda) — a imagem exportada continua
   *  retangular; útil quando quem exibe depois já corta em círculo via CSS
   *  (ex.: avatar), pra pré-visualizar exatamente como vai ficar. */
  shape?: 'rect' | 'circle'
  title?: string
  instructions?: string
}) {
  const aspecto = outputWidth / outputHeight
  const FRAME_W = aspecto >= 1 ? FRAME_LONG_SIDE : Math.round(FRAME_LONG_SIDE * aspecto)
  const FRAME_H = aspecto >= 1 ? Math.round(FRAME_LONG_SIDE / aspecto) : FRAME_LONG_SIDE
  const BOX_W = FRAME_W + MARGIN * 2
  const BOX_H = FRAME_H + MARGIN * 2
  const FRAME_L = MARGIN
  const FRAME_T = MARGIN

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(1)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => {
      // escala mínima para a imagem cobrir a moldura inteira
      const s = Math.max(FRAME_W / i.naturalWidth, FRAME_H / i.naturalHeight)
      setMinScale(s)
      setScale(s)
      const dw = i.naturalWidth * s
      const dh = i.naturalHeight * s
      // centraliza a imagem na moldura
      setOffset({ x: FRAME_L + FRAME_W / 2 - dw / 2, y: FRAME_T + FRAME_H / 2 - dh / 2 })
      setImg(i)
    }
    i.src = url
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0

  // mantém a moldura sempre coberta pela imagem, em qualquer zoom/posição
  const clamp = useCallback((x: number, y: number, w: number, h: number) => {
    const minX = FRAME_L + FRAME_W - w
    const minY = FRAME_T + FRAME_H - h
    return { x: Math.min(FRAME_L, Math.max(minX, x)), y: Math.min(FRAME_T, Math.max(minY, y)) }
  }, [FRAME_L, FRAME_T, FRAME_W, FRAME_H])

  /** Ponteiros encostados agora. Dois = pinça; um = arrasto. */
  const pontosRef = useRef(new Map<number, { x: number; y: number }>())
  const pincaRef = useRef<{ dist: number; escala: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pontosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pontosRef.current.size === 2) {
      const [a, b] = [...pontosRef.current.values()]
      pincaRef.current = { dist: Math.hypot(b.x - a.x, b.y - a.y), escala: scale }
      dragRef.current = null
    } else {
      dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const ponto = pontosRef.current.get(e.pointerId)
    if (!ponto) return
    ponto.x = e.clientX
    ponto.y = e.clientY

    if (pontosRef.current.size >= 2 && pincaRef.current) {
      const [a, b] = [...pontosRef.current.values()]
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      if (pincaRef.current.dist > 0) {
        const caixa = boxRef.current?.getBoundingClientRect()
        if (!caixa) return
        // Âncora no ponto médio entre os dedos: é o que faz a imagem crescer
        // "de onde os dedos estão", e não do centro da moldura.
        const focoX = (a.x + b.x) / 2 - caixa.left
        const focoY = (a.y + b.y) / 2 - caixa.top
        aplicarZoom(pincaRef.current.escala * (dist / pincaRef.current.dist), focoX, focoY)
      }
      return
    }

    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, dispW, dispH))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pontosRef.current.delete(e.pointerId)
    pincaRef.current = null
    // Ao soltar um dedo no meio da pinça, o que sobrou vira o novo arrasto —
    // sem isto a imagem salta, porque o arrasto retomaria da posição antiga.
    const resto = [...pontosRef.current.values()][0]
    dragRef.current = resto ? { x: resto.x, y: resto.y, ox: offset.x, oy: offset.y } : null
  }

  /** Muda a escala mantendo `focoX`/`focoY` (coordenadas relativas ao box,
   *  ex.: onde o mouse está) parados no lugar — é o que faz o zoom "focar"
   *  ali em vez de crescer sempre a partir do canto/centro da imagem. */
  const aplicarZoom = (novaEscalaBruta: number, focoX: number, focoY: number) => {
    if (!img) return
    const maxScale = minScale * ZOOM_MAX_MULT
    const novaEscala = Math.min(maxScale, Math.max(minScale, novaEscalaBruta))
    const fatorImagemX = (focoX - offset.x) / scale
    const fatorImagemY = (focoY - offset.y) / scale
    const novoW = img.naturalWidth * novaEscala
    const novoH = img.naturalHeight * novaEscala
    const novoOffsetX = focoX - fatorImagemX * novaEscala
    const novoOffsetY = focoY - fatorImagemY * novaEscala
    setScale(novaEscala)
    setOffset(clamp(novoOffsetX, novoOffsetY, novoW, novoH))
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const focoX = e.clientX - rect.left
    const focoY = e.clientY - rect.top
    const fator = Math.exp(-e.deltaY * 0.0015)
    aplicarZoom(scale * fator, focoX, focoY)
  }

  const confirmar = () => {
    if (!img) return
    const sx = (FRAME_L - offset.x) / scale
    const sy = (FRAME_T - offset.y) / scale
    const sw = FRAME_W / scale
    const sh = FRAME_H / scale
    const c = document.createElement('canvas')
    c.width = outputWidth
    c.height = outputHeight
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, outputWidth, outputHeight)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight)
    c.toBlob((b) => { if (b) onConfirm(b) }, 'image/jpeg', 0.9)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-[12px] text-muted-foreground -mt-1">{instructions}</p>
        <div className="flex justify-center">
          <div
            ref={boxRef}
            className="relative overflow-hidden bg-neutral-900 touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: BOX_W, height: BOX_H, borderRadius: shape === 'circle' ? 9999 : 12 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {img && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none' }}
              />
            )}
            {/* Moldura: escurece tudo em volta e deixa o miolo transparente */}
            <div
              className={cn(
                'pointer-events-none absolute ring-2 ring-white/90',
                shape === 'circle' ? 'rounded-full' : 'rounded-md',
              )}
              style={{
                left: FRAME_L, top: FRAME_T, width: FRAME_W, height: FRAME_H,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || !img}>{salvando ? 'Enviando…' : 'Usar imagem'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
