import { easyFeedIcon } from '@/assets/brand'
import { getTema, getFiltro } from '@/lib/qr-temas'

export const POSTER_W = 720
export const POSTER_H = 1080

function carregarImg(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number): number {
  const palavras = text.split(' ')
  let linha = ''
  const linhas: string[] = []
  for (const p of palavras) {
    const teste = linha ? `${linha} ${p}` : p
    if (ctx.measureText(teste).width > maxW && linha) {
      linhas.push(linha)
      linha = p
    } else {
      linha = teste
    }
  }
  if (linha) linhas.push(linha)
  linhas.forEach((l, i) => ctx.fillText(l, cx, y + i * lh))
  return y + linhas.length * lh
}

/** URL que o QR aponta (página pública do site que conta aberturas). */
export function landingUrl(slug: string): string {
  const base = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
  return `${base}/f/${slug}`
}

/** Baixa um Blob de forma robusta (funciona mesmo após await, fora do gesto do clique). */
export function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png')
  })
}

export interface PosterOpts {
  url: string
  nome: string
  tagline?: string
  temaId?: string | null
  filtroId?: string | null
}

/** Desenha o pôster retangular (em pé) do QR no canvas. */
export async function desenharPoster(canvas: HTMLCanvasElement, opts: PosterOpts): Promise<void> {
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = POSTER_W
  const H = POSTER_H
  const t = getTema(opts.temaId)
  const filtro = getFiltro(opts.filtroId)

  // Fundo (gradiente diagonal do tema)
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, t.posterBg[0])
  g.addColorStop(1, t.posterBg[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Textura de culinária (marca d'água grande e diagonal)
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let k = 0
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 6; col++) {
      const em = t.emojis[k % t.emojis.length]; k++
      ctx.save()
      ctx.translate(col * 150 + (row % 2 ? 75 : 0), row * 150 + 40)
      ctx.rotate(-0.35)
      ctx.font = '90px serif'
      ctx.fillText(em, 0, 0)
      ctx.restore()
    }
  }
  ctx.restore()

  // Filtro sobre o fundo
  if (filtro.overlay !== 'transparent') {
    ctx.fillStyle = filtro.overlay
    ctx.fillRect(0, 0, W, H)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Faixa decorativa de emojis (tema bem visível) no topo
  const strip = [...t.emojis, ...t.emojis].slice(0, 5)
  ctx.font = '52px serif'
  strip.forEach((em, i) => ctx.fillText(em, W / 2 + (i - 2) * 96, 108))

  // Título "Restaurante {nome}"
  ctx.fillStyle = t.posterTexto
  ctx.font = 'bold 48px sans-serif'
  const yTitulo = wrapText(ctx, `Restaurante ${opts.nome}`, W / 2, 200, W - 110, 56)

  // Linha de destaque
  ctx.fillStyle = t.posterAccent
  roundRect(ctx, W / 2 - 45, yTitulo + 6, 90, 6, 3)
  ctx.fill()

  // Frase de incentivo
  ctx.fillStyle = t.posterTexto
  ctx.globalAlpha = 0.92
  ctx.font = '26px sans-serif'
  wrapText(ctx, opts.tagline?.trim() || 'É rapidinho! Escaneie e conte como foi sua experiência 💬', W / 2, yTitulo + 56, W - 140, 34)
  ctx.globalAlpha = 1

  // Cartão branco com borda em volta do QR
  const card = { x: 105, y: 400, w: 510, h: 510, r: 34 }
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 12
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.lineWidth = 9
  ctx.strokeStyle = t.posterAccent
  ctx.stroke()

  // QR (correção de erro alta para permitir o logo no centro)
  const qs = 418
  const qx = card.x + (card.w - qs) / 2
  const qy = card.y + (card.h - qs) / 2
  const qr = await carregarImg(
    `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=0&ecc=H&data=${encodeURIComponent(opts.url)}`,
    true,
  )
  ctx.drawImage(qr, qx, qy, qs, qs)

  // Ícone do Easy Feed no centro do QR (fallback: texto "Easy Feed")
  const cx = W / 2
  const cy = card.y + card.h / 2
  const r = 56
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = t.posterAccent
  ctx.stroke()
  const logo = await carregarImg(easyFeedIcon)
  if (logo && logo.width > 1) {
    const lw = r * 1.5
    const lh = (logo.height / logo.width) * lw
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh)
  } else {
    ctx.fillStyle = t.posterAccent
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText('Easy Feed', cx, cy + 7)
  }

  // Instrução abaixo do cartão
  ctx.fillStyle = t.posterTexto
  ctx.globalAlpha = 0.92
  ctx.font = '24px sans-serif'
  ctx.fillText('Aponte a câmera do celular para o QR Code', W / 2, card.y + card.h + 60)
  ctx.globalAlpha = 1

  // Rodapé: crédito do produto
  ctx.globalAlpha = 0.75
  ctx.font = '18px sans-serif'
  ctx.fillText('Easy Feed', W / 2, H - 34)
  ctx.globalAlpha = 1
}
