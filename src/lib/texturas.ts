/**
 * Texturas de material geradas por código (ruído procedural).
 *
 * ## Por que não usar foto
 *
 * Foi a primeira ideia e ela não sobrevive ao uso real. O cartaz é IMPRESSO
 * num display A5, e o mesmo material precisa aparecer em três lugares que não
 * compartilham runtime: o quadradinho da paleta, a página que o cliente abre no
 * celular e o canvas que vira PNG/PDF. Foto obriga a carregar arquivo nos três,
 * pesa no bundle leve da landing, some do canvas enquanto carrega (o piscar que
 * já custou uma correção) e, a ~120 DPI de um A5, sai borrada.
 *
 * Ruído procedural resolve os três: não tem arquivo, é síncrono e é
 * independente de resolução — a mesma função desenha o selo de 96px e o cartaz
 * de 720×1080 com o nível de detalhe certo para cada um.
 *
 * ## A técnica
 *
 * Value noise interpolado com smoothstep, somado em oitavas (fBm) — o mesmo
 * esqueleto do ruído de Perlin, que é como madeira e mármore são gerados em
 * computação gráfica desde os anos 80. Cada material usa esse ruído de um jeito:
 *
 *   - madeira: o ruído DISTORCE a distância até o centro dos anéis, e uma
 *     senoide sobre essa distância vira o anel de crescimento;
 *   - mármore: o ruído distorce uma rampa linear e a senoide vira a veia;
 *   - pedra/tecido: o ruído entra direto como mancha, com um segundo ruído
 *     fino por cima para o grão.
 *
 * O gerador é DETERMINÍSTICO (semente fixa por material): a prévia na tela e o
 * PNG que vai para a gráfica são o mesmo desenho, não duas amostras parecidas.
 */

export type EstiloTextura =
  | 'madeira'
  | 'marmore'
  | 'ardosia'
  | 'travertino'
  | 'concreto'
  | 'linho'

export interface PaletaMaterial {
  /** Tom mais fundo: veio da madeira, sombra da pedra. */
  fundo: string
  /** Tom dominante do material. */
  base: string
  /** Tom mais claro: onde a luz bate. */
  luz: string
  /** Veia do mármore. Só usado por `marmore`. */
  veia?: string
}

// ─────────────────────────── ruído ───────────────────────────

/** Hash inteiro → 0..1. Determinístico e sem estado. */
function hash(x: number, y: number, semente: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(semente, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Curva de suavização de Perlin (smoothstep): tira o xadrez do value noise. */
function suave(t: number): number {
  return t * t * (3 - 2 * t)
}

function ruido(x: number, y: number, semente: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = suave(xf)
  const v = suave(yf)
  const a = hash(xi, yi, semente)
  const b = hash(xi + 1, yi, semente)
  const c = hash(xi, yi + 1, semente)
  const d = hash(xi + 1, yi + 1, semente)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** Soma de oitavas: cada uma com o dobro da frequência e metade da amplitude. */
function fbm(x: number, y: number, semente: number, oitavas: number): number {
  let soma = 0
  let amp = 0.5
  let freq = 1
  let norma = 0
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido(x * freq, y * freq, semente + i * 101)
    norma += amp
    amp *= 0.5
    freq *= 2
  }
  return soma / norma
}

// ─────────────────────────── cor ───────────────────────────

type Rgb = [number, number, number]

function paraRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

// ─────────────────────────── materiais ───────────────────────────

/**
 * Cada material devolve, para um ponto, quanto ele puxa para a luz (0..1).
 * `e` é a escala: quantos pixels de textura valem "uma unidade" de material,
 * e é o que faz o selo de 96px e o cartaz de 1080px mostrarem o MESMO material
 * em vez de um zoom diferente dele.
 */
type Material = (x: number, y: number, e: number) => number

const MATERIAIS: Record<EstiloTextura, Material> = {
  // Anéis de crescimento de tábua serrada: a distância até o centro é
  // distorcida pelo ruído antes de virar anel, senão sai um alvo perfeito.
  madeira: (x, y, e) => {
    const dx = (x - 0.5) * 1.6
    const dy = y * 0.22
    const dist = Math.sqrt(dx * dx + dy * dy) * e
    const onda = dist * 26 + fbm(x * e * 2.2, y * e * 0.5, 11, 4) * 7
    const anel = 0.5 + 0.5 * Math.sin(onda * Math.PI * 2)
    // Estrias finas no sentido do comprimento, que é o que dá o "grão". Uma
    // oitava só: nessa frequência as seguintes já caem abaixo do pixel e o
    // que elas somam é custo, não detalhe.
    const grao = ruido(x * e * 55, y * e * 3, 23)
    return anel * 0.62 + grao * 0.38
  },

  // Mármore com domain warping: as COORDENADAS são deslocadas por ruído antes
  // de virarem banda, e é isso que faz a veia serpentear e ramificar.
  //
  // A primeira tentativa afinava a banda com uma potência alta e o resultado
  // parecia contorno de desenho — linha de espessura constante, com miolo
  // vazio. Veio de pedra não tem contorno: tem um núcleo denso que se dissolve
  // nas bordas, que é o que a banda macia entrega.
  marmore: (x, y, e) => {
    const q1 = fbm(x * e * 1.2, y * e * 1.2, 31, 3)
    const q2 = fbm(x * e * 1.2 + 5.2, y * e * 1.2 + 1.3, 37, 3)
    // A rotação leve faz a veia correr na diagonal, como em bloco serrado.
    const wx = x * 0.92 + y * 0.38 + (q1 - 0.5) * 0.7
    const wy = y * 0.92 - x * 0.38 + (q2 - 0.5) * 0.7

    const nuvem = fbm(x * e * 0.8, y * e * 0.8, 47, 3)

    // Ruído "ridged" (`1 - |2n-1|`): o cume vira o veio. Ele RAMIFICA sozinho,
    // ao contrário da banda de seno, que só ondula — e é a ramificação que
    // separa pedra de fumaça. A amostragem anisotrópica (y numa frequência
    // bem maior que x) estica o veio numa direção, como no bloco real.
    const r = fbm(wx * e * 0.85, wy * e * 1.9, 53, 4)
    const v = 1 - Math.abs(r * 2 - 1)
    const v2 = v * v
    const veio = v2 * v2 * v2 * v

    // O fundo alto e o veio fino são o que separa mármore de ágata: a pedra é
    // majoritariamente clara, com poucos veios atravessando. Densidade alta,
    // que a primeira versão tinha, lê como líquido turbulento.
    return Math.min(1, Math.max(0, 0.62 + nuvem * 0.32 - veio * 0.7))
  },

  // Ardósia: lascada em planos diagonais, com grão fino por cima.
  ardosia: (x, y, e) => {
    const gx = x * 0.82 + y * 0.57
    const plano = fbm(gx * e * 3.4, (y - x * 0.4) * e * 22, 59, 3)
    const grao = ruido(x * e * 90, y * e * 90, 67)
    return plano * 0.72 + grao * 0.28
  },

  // Travertino: poros alongados na horizontal, típicos do corte da pedra.
  travertino: (x, y, e) => {
    const nuvem = fbm(x * e * 1.5, y * e * 1.5, 71, 4)
    const poros = fbm(x * e * 26, y * e * 90, 83, 2)
    const corte = poros * poros * poros * 1.6
    return Math.min(1, Math.max(0, nuvem * 1.05 - corte * 0.5))
  },

  // Concreto queimado: mancha ampla de cura + pontinhos do agregado.
  concreto: (x, y, e) => {
    const mancha = fbm(x * e * 2.1, y * e * 2.1, 97, 4)
    const agregado = hash(Math.floor(x * e * 190), Math.floor(y * e * 190), 103)
    return mancha * 0.88 + agregado * 0.12
  },

  // Linho: urdume e trama cruzados, com espessura irregular do fio (a "graúna"
  // do linho é justamente o fio que engrossa de vez em quando).
  linho: (x, y, e) => {
    const passo = e * 62
    const fioX = Math.abs(Math.sin(x * passo * Math.PI))
    const fioY = Math.abs(Math.sin(y * passo * Math.PI))
    const trama = Math.max(fioX, fioY) * 0.5 + (fioX * fioY) * 0.5
    const irregular = fbm(x * e * 16, y * e * 16, 109, 2)
    return trama * 0.55 + irregular * 0.45
  },
}

// ─────────────────────────── pintura ───────────────────────────

/**
 * Pinta a textura direto num contexto 2D, cobrindo `w`×`h`.
 *
 * Trabalha em ImageData porque é textura per-pixel: não dá pra montar com
 * gradiente do canvas sem cair de novo no visual listrado que isto veio
 * substituir.
 */
/**
 * Maior lado em que o ruído é realmente calculado.
 *
 * O custo cresce com a ÁREA: no cartaz de 720×1080 a geração passava de meio
 * segundo, o que no clique aparece como travada. Acima deste lado o material é
 * gerado menor e ampliado no desenho.
 *
 * O detalhe que se perde nisso é menor que o que a impressão resolve: o cartaz
 * sai num A5 a ~120 DPI, então dois pixels ampliados ficam em torno de 0,4 mm —
 * mais fino que o veio de uma madeira real.
 */
const LADO_MAXIMO = 512

export function pintarTextura(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloTextura,
  paleta: PaletaMaterial,
  w: number,
  h: number,
): void {
  const lado = Math.max(w, h)
  const escala = lado > LADO_MAXIMO ? LADO_MAXIMO / lado : 1
  const gw = Math.max(1, Math.round(w * escala))
  const gh = Math.max(1, Math.round(h * escala))

  const pronto = tileDoMaterial(estilo, paleta, gw, gh)
  if (pronto) {
    ctx.drawImage(pronto, 0, 0, w, h)
    return
  }
  desenharPixels(ctx, estilo, paleta, w, h)
}

/**
 * O laço de pixels.
 *
 * Escrito inteiro em escalares, sem alocar. A primeira versão devolvia `[r,g,b]`
 * de duas funções auxiliares por pixel — a 777 mil pixels do cartaz isso é mais
 * de um milhão de arrays descartáveis por desenho, e a coleta deles dominava o
 * tempo: madeira levava 1,5 s. Feio de ler, mas é um laço quente de verdade.
 */
function desenharPixels(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloTextura,
  paleta: PaletaMaterial,
  w: number,
  h: number,
): void {
  const material = MATERIAIS[estilo]
  const [fr, fg, fb] = paraRgb(paleta.fundo)
  const [br, bg, bb] = paraRgb(paleta.base)
  const [lr, lg, lb] = paraRgb(paleta.luz)
  const veia = paleta.veia ? paraRgb(paleta.veia) : null
  const vr = veia ? veia[0] : 0
  const vg = veia ? veia[1] : 0
  const vb = veia ? veia[2] : 0

  const img = ctx.createImageData(w, h)
  const dados = img.data

  // Escala em "unidades de material" por lado maior. Fixa: é o que mantém o
  // material igual em qualquer tamanho de saída.
  const e = 3.2
  const lado = Math.max(w, h)
  let i = 0

  for (let py = 0; py < h; py++) {
    const y = py / lado
    for (let px = 0; px < w; px++) {
      const x = px / lado
      let t = material(x, y, e)
      t = t < 0 ? 0 : t > 1 ? 1 : t

      // Rampa de três paradas: fundo → base → luz. Três e não duas porque
      // material real não é um degradê entre dois tons — o veio escuro e o
      // brilho da superfície são desvios opostos a partir da cor dominante.
      let r: number
      let g: number
      let b: number
      if (t < 0.5) {
        const k = t * 2
        r = fr + (br - fr) * k
        g = fg + (bg - fg) * k
        b = fb + (bb - fb) * k
      } else {
        const k = (t - 0.5) * 2
        r = br + (lr - br) * k
        g = bg + (lg - bg) * k
        b = bb + (lb - bb) * k
      }

      // A veia do mármore entra por cima da rampa, e não dentro dela: tem cor
      // própria (branca no mármore preto, cinza no branco) e não é só um ponto
      // mais claro do mesmo tom.
      if (veia && t < 0.34) {
        const n = (0.34 - t) / 0.34
        const k = n * n * 0.85
        r += (vr - r) * k
        g += (vg - g) * k
        b += (vb - b) * k
      }

      dados[i++] = r
      dados[i++] = g
      dados[i++] = b
      dados[i++] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
}

/**
 * Um material desenhado uma vez e reaproveitado.
 *
 * O cartaz é redesenhado inteiro a cada mudança de tema, e gerar 777 mil pixels
 * de ruído de novo a cada vez custa centenas de milissegundos — no clique, isso
 * aparece como travada. Como a textura só depende do material (não da mensagem,
 * do nome nem do QR), ela vira um canvas guardado e daí em diante é uma cópia.
 */
const cacheTile = new Map<string, HTMLCanvasElement>()

function tileDoMaterial(
  estilo: EstiloTextura,
  paleta: PaletaMaterial,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null

  const id = `${estilo}|${paleta.fundo}${paleta.base}${paleta.luz}${paleta.veia ?? ''}@${w}x${h}`
  const guardado = cacheTile.get(id)
  if (guardado) return guardado

  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  if (!ctx) return null

  desenharPixels(ctx, estilo, paleta, w, h)
  cacheTile.set(id, cv)
  return cv
}

/**
 * A textura como `url(data:...)` pronta para CSS, memorizada.
 *
 * O cache é por material E tamanho porque os dois consumidores pedem tamanhos
 * bem diferentes — o selo da paleta e o fundo da página do cliente — e gerar de
 * novo a cada render seria custo por quadro num caminho que não muda nunca.
 */
const cacheCss = new Map<string, string>()

export function texturaCss(
  chave: string,
  estilo: EstiloTextura,
  paleta: PaletaMaterial,
  w = 220,
  h = 300,
): string | null {
  if (typeof document === 'undefined') return null

  const id = `${chave}@${w}x${h}`
  const pronto = cacheCss.get(id)
  if (pronto) return pronto

  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  if (!ctx) return null

  pintarTextura(ctx, estilo, paleta, w, h)
  const url = `url("${cv.toDataURL('image/png')}")`
  cacheCss.set(id, url)
  return url
}
