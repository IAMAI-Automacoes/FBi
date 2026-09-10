// Tema do QR Code impresso e da página que o cliente abre ao escanear.
//
// O modelo anterior era "6 fotos profissionais": cada tema trazia uma foto de
// ambiente que virava o fundo da página do cliente, e uma paleta derivada dela
// para o cartaz. Foi trocado pelo que o dono de fato escolhe quando manda
// imprimir um display de mesa: uma COR SÓLIDA ou um MATERIAL.
//
// A troca resolve dois problemas. O de impressão: foto de ambiente em display
// A5 sai suja e cara em tinta, enquanto cor plana e material discreto imprimem
// bem em qualquer gráfica. E o de coerência: sem imagem para baixar, o mesmo
// tema serve ao cartaz e à página do cliente, e a cor personalizada do dono
// passa a caber no modelo (ver `getTema`, que aceita um hex como id).
//
// As texturas não são imagem nem gradiente listrado: são geradas por ruído
// procedural em `texturas.ts` — o porquê está no cabeçalho de lá.

import { pintarTextura, texturaCss, type EstiloTextura, type PaletaMaterial } from '@/lib/texturas'

export type { EstiloTextura, PaletaMaterial }
export { pintarTextura }

export type TipoTema = 'cor' | 'textura'

export interface QrTema {
  id: string
  nome: string
  tipo: TipoTema
  /** Par de tons do tema. Serve de gradiente na cor sólida e de amostra do material. */
  fundo: [string, string]
  /** Qual material é desenhado. `null` em cor sólida. */
  textura: EstiloTextura | null
  /** Cores do material. `null` em cor sólida. */
  material: PaletaMaterial | null
  /** Fundo escuro o bastante para o texto precisar ser claro. */
  escuro: boolean
  /** Cor de marca do cartaz: rótulo do topo. */
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
    fundo: [mexerNoTom(hex, escuro ? 0.06 : 0.035), mexerNoTom(hex, -0.05)],
    textura: null,
    material: null,
    escuro,
    acento: escuro ? '#E8D9C3' : '#8A6A45',
    acentoTexto: escuro ? '#1A1A1A' : '#FFFFFF',
    tinta: escuro ? '#FFFFFF' : '#241E18',
    suave: escuro ? 'rgba(255,255,255,0.72)' : 'rgba(36,30,24,0.62)',
  }
}

/**
 * A paleta pronta.
 *
 * Duas fileiras com papéis distintos: a primeira vai do branco ao neutro
 * terroso, a segunda dos terrosos aos profundos. É a divisão que a escolha real
 * do dono segue — ou ele quer algo discreto que suma na mesa, ou algo escuro
 * que se imponha —, e ela acha mais rápido que uma grade em ordem de matiz.
 *
 * Os tons saem dos lançamentos de cor de 2026 do setor (khaki terroso, ocre
 * suave, eucalipto, jade esfumaçado, umbra com carvão) porque display de mesa
 * fica dentro de um salão decorado: a cor precisa combinar com madeira, pedra e
 * tecido, não competir com eles.
 *
 * Todos são dessaturados de propósito. Cor saturada é o que mais estoura na
 * conversão para CMYK — o laranja vivo que a tela mostra volta da gráfica
 * apagado e sujo —, e um tom quebrado imprime igual ao que se viu na tela.
 */
export const QR_CORES: QrTema[] = [
  temaDeCor('branco', 'Branco', '#FFFFFF'),
  temaDeCor('marfim', 'Marfim', '#F5F0E6'),
  temaDeCor('aveia', 'Aveia', '#E6DAC3'),
  temaDeCor('nevoa', 'Névoa', '#D3D7D4'),
  temaDeCor('greige', 'Greige', '#B3A899'),
  temaDeCor('caqui', 'Caqui', '#A89B7E'),
  temaDeCor('terracota', 'Terracota', '#B8623A'),
  temaDeCor('caramelo', 'Caramelo', '#A9703F'),
  temaDeCor('eucalipto', 'Eucalipto', '#6E7F6A'),
  temaDeCor('jade', 'Jade Fumê', '#4A6560'),
  temaDeCor('petroleo', 'Azul Profundo', '#2E4055'),
  temaDeCor('umbra', 'Umbra', '#33302C'),
]

function temaDeMaterial(
  id: string,
  nome: string,
  textura: EstiloTextura,
  material: PaletaMaterial,
  escuro: boolean,
): QrTema {
  return {
    id,
    nome,
    tipo: 'textura',
    fundo: [material.luz, material.fundo],
    textura,
    material,
    escuro,
    acento: escuro ? '#EADFCB' : '#7A5C3A',
    acentoTexto: escuro ? '#1F1B16' : '#FFFFFF',
    tinta: escuro ? '#FFFFFF' : '#241E18',
    suave: escuro ? 'rgba(255,255,255,0.74)' : 'rgba(36,30,24,0.62)',
  }
}

/**
 * Os oito materiais.
 *
 * São os que de fato revestem salão de restaurante — madeira, pedra, concreto
 * queimado e tecido —, cada família num par claro/escuro. O par importa: a
 * escolha do dono é "madeira, mas combinando com o meu salão", e um salão
 * escuro com só uma madeira clara disponível acaba desistindo e indo para cor
 * sólida.
 */
export const QR_TEXTURAS: QrTema[] = [
  temaDeMaterial('carvalho', 'Carvalho', 'madeira',
    { fundo: '#B08453', base: '#DFC098', luz: '#F2E0C6' }, false),
  temaDeMaterial('nogueira', 'Nogueira', 'madeira',
    { fundo: '#33200F', base: '#6B4526', luz: '#94663A' }, true),
  temaDeMaterial('carrara', 'Mármore Carrara', 'marmore',
    { fundo: '#D8D6D1', base: '#F2F1EE', luz: '#FCFCFB', veia: '#8E8E88' }, false),
  temaDeMaterial('marquina', 'Mármore Negro', 'marmore',
    { fundo: '#111113', base: '#232326', luz: '#35363C', veia: '#DCD9D1' }, true),
  temaDeMaterial('ardosia', 'Ardósia', 'ardosia',
    { fundo: '#1E2327', base: '#3A4248', luz: '#525C64' }, true),
  temaDeMaterial('travertino', 'Travertino', 'travertino',
    { fundo: '#AC9270', base: '#D9C6A8', luz: '#F0E4CE' }, false),
  temaDeMaterial('concreto', 'Concreto', 'concreto',
    { fundo: '#87857F', base: '#B4B2AD', luz: '#D4D2CD' }, false),
  temaDeMaterial('linho', 'Linho', 'linho',
    { fundo: '#BFAE92', base: '#E3D7C1', luz: '#F5EEE0' }, false),
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
 * Três casos, nesta ordem: um tema da lista; uma cor personalizada, guardada
 * como o hex puro (por isso não precisou de coluna nova); ou um id que não
 * existe mais — os antigos `classico`, `moderno`, `madeira-clara`... — que cai
 * no padrão.
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
 * Serve os dois consumidores que desenham por CSS: o selo da paleta e a página
 * do cliente (`LandingView`, que roda também no bundle leve, sem Tailwind). O
 * cartaz não passa por aqui — ele pinta a textura direto no canvas, em
 * `qr-poster.ts`, na resolução da impressão.
 */
export function fundoCss(tema: QrTema, w?: number, h?: number): string {
  const base = `linear-gradient(160deg, ${tema.fundo[0]}, ${tema.fundo[1]})`
  if (!tema.textura || !tema.material) return base

  const url = texturaCss(tema.id, tema.textura, tema.material, w, h)
  // Sem canvas (ou antes da hidratação), o par de tons do material já entrega
  // uma aproximação decente em vez de um buraco.
  return url ? `${url} center/cover no-repeat, ${base}` : base
}
