// Tema do QR Code impresso e da página que o cliente abre ao escanear.
//
// O modelo anterior era "6 fotos profissionais": cada tema trazia uma foto de
// ambiente (salão, café, sushi...) que virava o fundo da página do cliente, e
// uma paleta derivada dela para o cartaz impresso. Foi trocado pelo que o dono
// de fato escolhe quando manda imprimir um display de mesa: uma COR SÓLIDA ou
// uma TEXTURA NEUTRA (madeira, mármore, ardósia).
//
// A troca resolve dois problemas de uma vez. O primeiro é de impressão: foto
// de ambiente em display A5 sai suja, chapada e cara em tinta — cor plana e
// textura discreta imprimem bem em qualquer gráfica. O segundo é de coerência:
// como não há mais imagem para baixar, o MESMO tema serve ao cartaz e à página
// do cliente sem carregar arquivo nenhum, e a cor personalizada do dono passa a
// caber no modelo (ver `getTema`, que aceita um hex como id).

export type TipoTema = 'cor' | 'textura'
export type EstiloTextura = 'madeira' | 'marmore' | 'ardosia'

export interface QrTema {
  id: string
  nome: string
  tipo: TipoTema
  /** Gradiente do fundo. Cor sólida usa dois tons quase iguais — só profundidade. */
  fundo: [string, string]
  /** Qual desenho é pintado por cima do gradiente. `null` em cor sólida. */
  textura: EstiloTextura | null
  /** Fundo escuro o bastante para o texto precisar ser claro. */
  escuro: boolean
  /** Cor de marca do cartaz: rótulo do topo e traço de destaque. */
  acento: string
  /** Texto sobre a cor de acento. */
  acentoTexto: string
  /** Texto principal do cartaz. */
  tinta: string
  /** Texto secundário do cartaz. */
  suave: string
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Clareia (t > 0) ou escurece (t < 0) um hex, para gerar o par do gradiente. */
function mexerNoTom(hex: string, t: number): string {
  const { r, g, b } = hexRgb(hex)
  const alvo = t > 0 ? 255 : 0
  const p = Math.abs(t)
  const m = (c: number) => Math.round(c + (alvo - c) * p)
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Luminância relativa (ITU-R BT.709). O corte em 0.55 é mais alto que o 0.5
 * "matemático" de propósito: no papel impresso o texto escuro continua legível
 * sobre um fundo médio, enquanto o texto branco já começa a sumir ali.
 */
export function ehEscuro(hex: string): boolean {
  const { r, g, b } = hexRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55
}

/** Monta o tema completo a partir de uma cor sólida, derivando tinta e acento. */
function temaDeCor(id: string, nome: string, hex: string): QrTema {
  const escuro = ehEscuro(hex)
  return {
    id,
    nome,
    tipo: 'cor',
    fundo: [mexerNoTom(hex, escuro ? 0.06 : 0.035), mexerNoTom(hex, escuro ? -0.05 : -0.05)],
    textura: null,
    escuro,
    // Sobre fundo escuro a marca é o branco quente; sobre claro, um âmbar que
    // não briga com nenhuma das cores da paleta.
    acento: escuro ? '#E8D9C3' : '#B45309',
    acentoTexto: escuro ? '#1A1A1A' : '#FFFFFF',
    tinta: escuro ? '#FFFFFF' : '#241E18',
    suave: escuro ? 'rgba(255,255,255,0.72)' : 'rgba(36,30,24,0.62)',
  }
}

/**
 * A paleta que a tela mostra em "Paleta de Cores".
 *
 * A ordem importa: é a ordem em que os quadradinhos aparecem, e ela vai do
 * claro ao escuro dentro de cada linha para a grade não ficar embaralhada.
 */
export const QR_CORES: QrTema[] = [
  temaDeCor('branco', 'Branco', '#FFFFFF'),
  temaDeCor('creme', 'Creme', '#EDE0C8'),
  temaDeCor('nevoa', 'Névoa', '#B9C6D0'),
  temaDeCor('oliva', 'Oliva', '#5D6B4B'),
  temaDeCor('musgo', 'Musgo', '#3C4A38'),
  temaDeCor('floresta', 'Floresta', '#2C3A2C'),
  temaDeCor('terracota', 'Terracota', '#C2622C'),
  temaDeCor('caramelo', 'Caramelo', '#C99A6E'),
  temaDeCor('gelo', 'Gelo', '#F7F7F5'),
  temaDeCor('grafite', 'Grafite', '#9AA1A9'),
  temaDeCor('carvao', 'Carvão', '#1B1B1B'),
]

/**
 * As texturas neutras. São três e de propósito: madeira, pedra clara e pedra
 * escura cobrem praticamente todo salão sem virar catálogo de padronagem.
 */
export const QR_TEXTURAS: QrTema[] = [
  {
    id: 'madeira-clara',
    nome: 'Madeira Clara',
    tipo: 'textura',
    fundo: ['#E3C39B', '#D2A97A'],
    textura: 'madeira',
    escuro: false,
    acento: '#8C5A2B',
    acentoTexto: '#FFFFFF',
    tinta: '#3A2A19',
    suave: 'rgba(58,42,25,0.65)',
  },
  {
    id: 'marmore-neutro',
    nome: 'Mármore Neutro',
    tipo: 'textura',
    fundo: ['#FBFBFA', '#E6E5E2'],
    textura: 'marmore',
    escuro: false,
    acento: '#6B6B63',
    acentoTexto: '#FFFFFF',
    tinta: '#22221F',
    suave: 'rgba(34,34,31,0.6)',
  },
  {
    id: 'ardosia',
    nome: 'Ardósia',
    tipo: 'textura',
    fundo: ['#474F56', '#2A3036'],
    textura: 'ardosia',
    escuro: true,
    acento: '#D8DEE4',
    acentoTexto: '#1A1F24',
    tinta: '#FFFFFF',
    suave: 'rgba(255,255,255,0.72)',
  },
]

export const QR_TEMAS: QrTema[] = [...QR_CORES, ...QR_TEXTURAS]

const PADRAO = QR_CORES[0]

const HEX = /^#[0-9a-f]{6}$/i

/** A cor personalizada é guardada com o próprio hex como id (`#RRGGBB`). */
export function ehCorPersonalizada(id?: string | null): boolean {
  return !!id && HEX.test(id) && !QR_TEMAS.some((t) => t.id === id)
}

/**
 * Resolve o id salvo em `restaurantes.qr_estilo`.
 *
 * Três casos, nesta ordem: um tema da lista; uma cor personalizada, que o dono
 * escolheu na roda de cores e que é guardada como o hex puro (por isso não
 * precisou de coluna nova); ou um id que não existe mais — os antigos
 * `classico`, `moderno`, `rustico`... dos temas com foto — que cai no padrão.
 */
export function getTema(id?: string | null): QrTema {
  const achado = QR_TEMAS.find((t) => t.id === id)
  if (achado) return achado
  if (id && HEX.test(id)) return temaDeCor(id, 'Personalizada', id)
  return PADRAO
}

/**
 * O fundo do tema como valor CSS `background`.
 *
 * Existe porque o mesmo tema é pintado em três lugares que não compartilham
 * runtime: o quadradinho da paleta (React), a página do cliente (`LandingView`,
 * que roda também no bundle leve sem Tailwind) e o cartaz (canvas, que tem o
 * seu próprio pintor em `qr-poster.ts`). Os dois primeiros usam esta string.
 */
export function fundoCss(tema: QrTema): string {
  const base = `linear-gradient(160deg, ${tema.fundo[0]}, ${tema.fundo[1]})`

  if (tema.textura === 'madeira') {
    // Duas frequências de veio: a fina dá o grão, a larga dá as tábuas.
    return [
      'repeating-linear-gradient(93deg, rgba(120,82,44,0.14) 0 2px, rgba(0,0,0,0) 2px 9px)',
      'repeating-linear-gradient(93deg, rgba(96,64,32,0.10) 0 1px, rgba(0,0,0,0) 1px 27px)',
      base,
    ].join(', ')
  }
  if (tema.textura === 'marmore') {
    // Duas "veias" em ângulos diferentes: mármore é irregular, não listrado.
    return [
      'linear-gradient(115deg, rgba(0,0,0,0) 45%, rgba(120,120,114,0.26) 47.5%, rgba(0,0,0,0) 50%)',
      'linear-gradient(97deg, rgba(0,0,0,0) 67%, rgba(120,120,114,0.18) 69.5%, rgba(0,0,0,0) 73%)',
      'radial-gradient(120% 90% at 25% 15%, rgba(255,255,255,0.75), rgba(0,0,0,0) 60%)',
      base,
    ].join(', ')
  }
  if (tema.textura === 'ardosia') {
    // Ardósia é lascada em diagonal: risco claro fino, bem baixo contraste.
    return [
      'repeating-linear-gradient(125deg, rgba(255,255,255,0.05) 0 3px, rgba(0,0,0,0) 3px 11px)',
      'radial-gradient(130% 100% at 30% 10%, rgba(255,255,255,0.10), rgba(0,0,0,0) 55%)',
      base,
    ].join(', ')
  }

  return base
}
