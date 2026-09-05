import QRCode from 'qrcode'
import { easyFeedIcon } from '@/assets/brand'
import { getTema, type QrTema } from '@/lib/qr-temas'

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

/**
 * Cache do QR (por URL) e da logo.
 *
 * Existe por causa de um piscar, não por micro-otimização. `desenharPoster`
 * LIMPA o canvas na primeira linha e só desenha o QR e a logo depois de dois
 * `await` — gerar o QR e carregar as imagens. Enquanto esses await não voltam,
 * o navegador tem uma janela para pintar, e pinta o cartaz sem QR e sem logo.
 *
 * Numa troca de tema isolada ninguém percebe. Arrastando no seletor de cor, que
 * redesenha a cada movimento do mouse, vira um pisca-pisca em cima justamente
 * dos dois elementos que NÃO mudaram — o QR depende só da URL e a logo é sempre
 * a mesma.
 *
 * Com o cache, da segunda chamada em diante os dois `await` resolvem em
 * microtask, antes do próximo paint: o limpar e o redesenhar caem no mesmo
 * quadro e o piscar some.
 */
const cacheQr = new Map<string, Promise<HTMLImageElement>>()
let cacheLogo: Promise<HTMLImageElement> | null = null

function qrDaUrl(url: string): Promise<HTMLImageElement> {
  const emCache = cacheQr.get(url)
  if (emCache) return emCache

  const p = QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 560,
    color: { dark: '#171717ff', light: '#ffffffff' },
  })
    .then((dataUrl: string) => carregarImg(dataUrl))
    .catch(() => carregarImg(''))

  cacheQr.set(url, p)
  return p
}

function logoDoProduto(): Promise<HTMLImageElement> {
  if (!cacheLogo) cacheLogo = carregarImg(easyFeedIcon)
  return cacheLogo
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
}

/**
 * Desenha o cartaz retangular (em pé) do QR no canvas.
 * Design limpo para impressão: fundo suave do tema, tipografia forte, QR num
 * cartão branco (sem borda colorida) e um quadradinho com a logo no centro.
 * O QR é gerado localmente (lib `qrcode`), sem depender de API externa.
 */
export async function desenharPoster(canvas: HTMLCanvasElement, opts: PosterOpts): Promise<void> {
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = POSTER_W
  const H = POSTER_H
  const t = getTema(opts.temaId)
  const cx = W / 2

  // ── Fundo: cor sólida ou textura neutra do tema ──
  pintarFundo(ctx, t, W, H)

  // Brilho suave da cor de acento no topo (profundidade, sem poluir)
  const glow = ctx.createRadialGradient(cx, 40, 20, cx, 40, 520)
  glow.addColorStop(0, hexComAlpha(t.acento, 0.14))
  glow.addColorStop(1, hexComAlpha(t.acento, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 560)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // ── Sobrenome/rótulo ──
  ctx.fillStyle = t.acento
  ctx.font = 'bold 24px sans-serif'
  ctx.save()
  espacado(ctx, 'RESTAURANTE', cx, 132, 6)
  ctx.restore()

  // ── Nome do restaurante (fonte adaptativa: nomes longos não invadem o QR) ──
  ctx.fillStyle = t.tinta
  const tamNome = opts.nome.length > 22 ? 38 : opts.nome.length > 15 ? 46 : 52
  ctx.font = `bold ${tamNome}px Georgia, serif`
  const yTitulo = wrapText(ctx, opts.nome, cx, 196, W - 110, tamNome + 10)

  // ── Frase de incentivo ──
  ctx.fillStyle = t.suave
  ctx.font = '25px sans-serif'
  wrapText(ctx, opts.tagline?.trim() || 'Escaneie e conte como foi sua experiência com a gente.', cx, yTitulo + 44, W - 150, 33)

  // ── Cartão branco do QR (sem borda colorida) ──
  // O `y` centra o cartão no espaço que sobra entre a frase de incentivo e o
  // rodapé. Ele subia até 402 quando havia duas linhas de instrução embaixo;
  // sem elas, manter o valor antigo deixaria um vão morto no pé do cartaz.
  const card = { x: 130, y: 440, w: 460, h: 460, r: 40 }
  ctx.save()
  ctx.shadowColor = 'rgba(23,23,23,0.16)'
  ctx.shadowBlur = 42
  ctx.shadowOffsetY = 18
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // ── QR (gerado localmente, correção alta p/ caber a logo no centro) ──
  const qs = 372
  const qx = card.x + (card.w - qs) / 2
  const qy = card.y + (card.h - qs) / 2
  const qr = await qrDaUrl(opts.url)
  if (qr.width > 1) ctx.drawImage(qr, qx, qy, qs, qs)

  // ── Quadrado central com a logo do Easy Feed (não é mais um círculo) ──
  const plate = 104
  const px = cx - plate / 2
  const py = card.y + card.h / 2 - plate / 2
  ctx.save()
  ctx.shadowColor = 'rgba(23,23,23,0.18)'
  ctx.shadowBlur = 12
  roundRect(ctx, px, py, plate, plate, 22)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  const logo = await logoDoProduto()
  if (logo && logo.width > 1) {
    // Respiro pequeno de propósito: a logo preenche quase todo o quadrado.
    const pad = 6
    const box = plate - pad * 2
    const escala = Math.min(box / logo.width, box / logo.height)
    const lw = logo.width * escala
    const lh = logo.height * escala
    ctx.drawImage(logo, cx - lw / 2, card.y + card.h / 2 - lh / 2, lw, lh)
  } else {
    ctx.fillStyle = t.acento
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('Easy Feed', cx, card.y + card.h / 2 + 6)
  }

  // ── Rodapé: crédito do produto ──
  ctx.fillStyle = t.suave
  ctx.globalAlpha = 0.85
  ctx.font = '18px sans-serif'
  espacado(ctx, 'FEITO COM EASY FEED', cx, H - 40, 3)
  ctx.globalAlpha = 1
}

/**
 * Pinta o fundo do cartaz: o gradiente do tema e, quando é textura, o desenho
 * por cima.
 *
 * É o gêmeo em canvas de `fundoCss` (qr-temas.ts) — o mesmo tema aparece no
 * quadradinho da paleta e na página do cliente via CSS, e aqui via canvas,
 * porque o cartaz precisa virar PNG/PDF para impressão. Mantê-los parecidos é
 * o que faz a prévia da tela corresponder ao que sai na gráfica.
 */
function pintarFundo(ctx: CanvasRenderingContext2D, t: QrTema, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H)
  g.addColorStop(0, t.fundo[0])
  g.addColorStop(1, t.fundo[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  if (!t.textura) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()

  const diag = Math.hypot(W, H)
  const inclinar = (graus: number) => {
    ctx.translate(W / 2, H / 2)
    ctx.rotate((graus * Math.PI) / 180)
    ctx.translate(-W / 2, -H / 2)
  }

  if (t.textura === 'madeira') {
    // Duas frequências, como no CSS: o grão fino e a junta larga das tábuas.
    inclinar(3)
    ctx.fillStyle = t.veio
    for (let x = -diag; x < diag; x += 9) ctx.fillRect(x, -diag, 2, diag * 2)
    for (let x = -diag; x < diag; x += 27) ctx.fillRect(x, -diag, 1, diag * 2)
  } else if (t.textura === 'marmore') {
    const brilho = ctx.createRadialGradient(W * 0.25, H * 0.15, 0, W * 0.25, H * 0.15, W * 1.2)
    brilho.addColorStop(0, t.escuro ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)')
    brilho.addColorStop(0.6, 'rgba(255,255,255,0)')
    ctx.fillStyle = brilho
    ctx.fillRect(0, 0, W, H)

    // Veias irregulares: uma curva larga e outra fina cruzando em ângulos
    // diferentes. Mármore listrado denuncia que é gerado.
    ctx.strokeStyle = t.veio
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(-40, H * 0.72)
    ctx.bezierCurveTo(W * 0.3, H * 0.5, W * 0.45, H * 0.34, W + 40, H * 0.06)
    ctx.stroke()

    ctx.globalAlpha = 0.7
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-40, H * 0.95)
    ctx.bezierCurveTo(W * 0.42, H * 0.8, W * 0.5, H * 0.66, W + 40, H * 0.44)
    ctx.stroke()
    ctx.globalAlpha = 1
  } else if (t.textura === 'ardosia') {
    const brilho = ctx.createRadialGradient(W * 0.3, H * 0.1, 0, W * 0.3, H * 0.1, W * 1.3)
    brilho.addColorStop(0, 'rgba(255,255,255,0.10)')
    brilho.addColorStop(0.55, 'rgba(255,255,255,0)')
    ctx.fillStyle = brilho
    ctx.fillRect(0, 0, W, H)

    inclinar(35)
    ctx.fillStyle = t.veio
    for (let x = -diag; x < diag; x += 11) ctx.fillRect(x, -diag, 3, diag * 2)
  } else if (t.textura === 'concreto') {
    const brilho = ctx.createRadialGradient(W * 0.3, H * 0.1, 0, W * 0.3, H * 0.1, W * 1.2)
    brilho.addColorStop(0, 'rgba(255,255,255,0.35)')
    brilho.addColorStop(0.6, 'rgba(255,255,255,0)')
    ctx.fillStyle = brilho
    ctx.fillRect(0, 0, W, H)

    // Manchas de cura do cimento. As posições vêm de uma sequência fixa, e não
    // de Math.random, porque a prévia da tela e o PNG baixado são dois desenhos
    // separados do mesmo tema — com aleatório eles sairiam diferentes.
    const manchas: [number, number, number][] = [
      [0.22, 0.28, 0.30], [0.74, 0.18, 0.26], [0.58, 0.72, 0.34],
      [0.14, 0.82, 0.22], [0.86, 0.60, 0.24], [0.40, 0.46, 0.28],
    ]
    for (const [mx, my, mr] of manchas) {
      const g2 = ctx.createRadialGradient(W * mx, H * my, 0, W * mx, H * my, W * mr)
      g2.addColorStop(0, t.veio)
      g2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, W, H)
    }
  } else if (t.textura === 'linho') {
    // Trama: dois pentes cruzados em 90°, é o que lê como tecido.
    ctx.fillStyle = t.veio
    for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1)
    for (let x = 0; x < W; x += 5) ctx.fillRect(x, 0, 1, H)
  }

  ctx.restore()
}

/** Escreve um texto com espaçamento entre letras (canvas não tem letter-spacing nativo confiável). */
function espacado(ctx: CanvasRenderingContext2D, texto: string, cx: number, y: number, sp: number) {
  const larguras = [...texto].map((ch) => ctx.measureText(ch).width + sp)
  const total = larguras.reduce((a, b) => a + b, 0) - sp
  let x = cx - total / 2
  const antes = ctx.textAlign
  ctx.textAlign = 'left'
  for (let i = 0; i < texto.length; i++) {
    ctx.fillText(texto[i], x, y)
    x += larguras[i]
  }
  ctx.textAlign = antes
}

/** Converte '#rrggbb' + alpha (0..1) em 'rgba(...)'. */
function hexComAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const gg = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${gg},${b},${alpha})`
}
