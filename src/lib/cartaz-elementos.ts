/**
 * Textos e logo que o dono posiciona livremente no cartaz do QR.
 *
 * Guardados em `restaurantes.qr_elementos` (jsonb) e desenhados por cima do
 * cartaz em `qr-poster.ts`.
 *
 * Duas coisas do cartaz NUNCA entram aqui, de propósito: o ícone do Easy Feed
 * no centro do QR e o rodapé "feito com Easy Feed". São a marca do produto no
 * material impresso do cliente — se coubessem na lista, bastaria arrastar para
 * fora da página para sumirem.
 */

/**
 * Onde um elemento novo nasce, em ordem de preferência.
 *
 * Nascer sempre no centro (como era antes) cai EM CIMA do QR, e o segundo
 * elemento cai em cima do primeiro: toda vez que se adiciona algo, a primeira
 * tarefa é arrastar aquilo pra fora de onde não devia estar.
 *
 * Estes são os vãos que sobram num cartaz sem nada adicionado, medidos no
 * layout de `qr-poster.ts` (720×1080) e guardados em fração:
 *
 *   - faixa entre a mensagem ao cliente e o cartão do QR (y ≈ 330-440)
 *   - faixa entre o cartão do QR e o rodapé do produto (y ≈ 900-1010)
 *   - as duas margens laterais ao lado do cartão do QR (x < 130 e x > 590)
 *   - os cantos de cima, antes do rótulo
 *
 * Do melhor pro pior: primeiro os vãos largos e centrais, depois os estreitos.
 */
/**
 * Cada lugar fica a mais de `RAIO_OCUPADO` de todos os outros — senão dois
 * lugares vizinhos se "ocupam" um ao outro e a lista perde entradas na
 * prática (foi o que um teste pegou aqui: dois pontos a 0.05 de distância
 * faziam o quarto elemento voltar pro lugar do primeiro).
 */
export const LUGARES_LIVRES: { x: number; y: number }[] = [
  { x: 0.5, y: 0.36 },  // entre a mensagem ao cliente e o QR — o vão mais largo
  { x: 0.5, y: 0.88 },  // entre o QR e o rodapé do produto
  { x: 0.13, y: 0.62 }, // margem esquerda, na altura do QR
  { x: 0.87, y: 0.62 }, // margem direita
  { x: 0.13, y: 0.06 }, // canto superior esquerdo, antes do rótulo
  { x: 0.87, y: 0.06 }, // canto superior direito
  { x: 0.13, y: 0.45 }, // margem esquerda, mais alta
  { x: 0.87, y: 0.45 },
  { x: 0.13, y: 0.79 }, // margem esquerda, mais baixa
  { x: 0.87, y: 0.79 },
]

/** Fallback quando todo lugar bom já está ocupado. */
export const POSICAO_INICIAL = LUGARES_LIVRES[0]

/** Perto o bastante pra considerar um lugar "ocupado" (em fração do cartaz). */
const RAIO_OCUPADO = 0.07

/**
 * O primeiro lugar da lista que ninguém está usando.
 *
 * Se todos estiverem ocupados, desce em degraus a partir do último — assim o
 * décimo primeiro elemento ainda aparece em algum lugar visível, e não
 * exatamente embaixo de outro.
 */
export function proximaPosicaoLivre(existentes: { x: number; y: number }[]): { x: number; y: number } {
  const ocupado = (lugar: { x: number; y: number }) =>
    existentes.some((e) => Math.hypot(e.x - lugar.x, e.y - lugar.y) < RAIO_OCUPADO)

  const livre = LUGARES_LIVRES.find((lugar) => !ocupado(lugar))
  if (livre) return { ...livre }

  // Acabaram os lugares bons: cai numa grade de três colunas na faixa livre de
  // cima, descendo aos poucos. Nunca em cima do QR, e nunca duas vezes no
  // mesmo ponto — a partir daqui quem organiza é o dono, arrastando.
  const extra = Math.max(0, existentes.length - LUGARES_LIVRES.length)
  const coluna = extra % 3
  const linha = Math.floor(extra / 3)
  return {
    x: 0.25 + coluna * 0.25,
    y: Math.min(0.93, 0.3 + linha * 0.03),
  }
}

export interface ElementoCartaz {
  id: string
  tipo: 'texto' | 'logo'
  /** Centro do elemento, em FRAÇÃO do cartaz (0..1) — nunca em pixel. */
  x: number
  y: number
  // ── texto ──
  texto: string
  /** Chave de `FONTES`. */
  fonte: string
  /** Corpo em pixels do cartaz (720×1080), não da tela. */
  tamanho: number
  negrito: boolean
  italico: boolean
  /** `null` = usa a tinta do tema, que já contrasta com o fundo escolhido. */
  cor: string | null
  // ── logo ──
  url: string | null
  /** Largura da logo, em fração da largura do cartaz. */
  escala: number
}

/** Grupos do seletor: 50 fontes numa lista corrida é impossível de navegar. */
export type GrupoFonte = 'Serifadas' | 'Sem serifa' | 'Impacto' | 'Manuscritas' | 'Monoespaçadas'

export interface Fonte {
  id: string
  nome: string
  /** Nome exato da família no Google Fonts — é o que monta a URL do CSS. */
  familia: string
  /** Pilha completa pro `ctx.font` e pro `font-family` do preview. */
  css: string
  grupo: GrupoFonte
}

/**
 * As fontes oferecidas — famílias de verdade, do Google Fonts.
 *
 * Fonte de web em canvas tem uma armadilha: o canvas NÃO espera a fonte
 * carregar. Se ela ainda não chegou, ele desenha na reserva sem avisar, e o
 * PNG que vai para a gráfica sai com outra tipografia. Por isso existem as
 * duas funções abaixo — `garantirCssDasFontes`, que injeta o CSS, e
 * `garantirFontesCarregadas`, que o desenho ESPERA antes de escrever.
 *
 * A pilha de reserva de cada uma é uma família de sistema do mesmo gênero, pra
 * que uma falha de rede degrade para algo parecido em vez de cair no serif
 * padrão do navegador.
 */
export const FONTES: Fonte[] = [
  // ── Serifadas ──
  { id: 'playfair', nome: 'Playfair Display', familia: 'Playfair Display', css: '"Playfair Display", Georgia, serif', grupo: 'Serifadas' },
  { id: 'cormorant', nome: 'Cormorant Garamond', familia: 'Cormorant Garamond', css: '"Cormorant Garamond", Garamond, serif', grupo: 'Serifadas' },
  { id: 'lora', nome: 'Lora', familia: 'Lora', css: 'Lora, Georgia, serif', grupo: 'Serifadas' },
  { id: 'merriweather', nome: 'Merriweather', familia: 'Merriweather', css: 'Merriweather, Georgia, serif', grupo: 'Serifadas' },
  { id: 'baskerville', nome: 'Libre Baskerville', familia: 'Libre Baskerville', css: '"Libre Baskerville", Georgia, serif', grupo: 'Serifadas' },
  { id: 'garamond', nome: 'EB Garamond', familia: 'EB Garamond', css: '"EB Garamond", Garamond, serif', grupo: 'Serifadas' },
  { id: 'crimson', nome: 'Crimson Text', familia: 'Crimson Text', css: '"Crimson Text", Georgia, serif', grupo: 'Serifadas' },
  { id: 'ptserif', nome: 'PT Serif', familia: 'PT Serif', css: '"PT Serif", Georgia, serif', grupo: 'Serifadas' },
  { id: 'spectral', nome: 'Spectral', familia: 'Spectral', css: 'Spectral, Georgia, serif', grupo: 'Serifadas' },
  { id: 'domine', nome: 'Domine', familia: 'Domine', css: 'Domine, Georgia, serif', grupo: 'Serifadas' },
  { id: 'vollkorn', nome: 'Vollkorn', familia: 'Vollkorn', css: 'Vollkorn, Georgia, serif', grupo: 'Serifadas' },
  { id: 'bitter', nome: 'Bitter', familia: 'Bitter', css: 'Bitter, Georgia, serif', grupo: 'Serifadas' },
  { id: 'abril', nome: 'Abril Fatface', familia: 'Abril Fatface', css: '"Abril Fatface", Georgia, serif', grupo: 'Serifadas' },
  { id: 'prata', nome: 'Prata', familia: 'Prata', css: 'Prata, Georgia, serif', grupo: 'Serifadas' },
  { id: 'zilla', nome: 'Zilla Slab', familia: 'Zilla Slab', css: '"Zilla Slab", Georgia, serif', grupo: 'Serifadas' },
  { id: 'arvo', nome: 'Arvo', familia: 'Arvo', css: 'Arvo, Georgia, serif', grupo: 'Serifadas' },
  { id: 'rokkitt', nome: 'Rokkitt', familia: 'Rokkitt', css: 'Rokkitt, Georgia, serif', grupo: 'Serifadas' },

  // ── Sem serifa ──
  { id: 'montserrat', nome: 'Montserrat', familia: 'Montserrat', css: 'Montserrat, "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'poppins', nome: 'Poppins', familia: 'Poppins', css: 'Poppins, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'inter', nome: 'Inter', familia: 'Inter', css: 'Inter, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'raleway', nome: 'Raleway', familia: 'Raleway', css: 'Raleway, "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'worksans', nome: 'Work Sans', familia: 'Work Sans', css: '"Work Sans", "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'nunito', nome: 'Nunito', familia: 'Nunito', css: 'Nunito, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'rubik', nome: 'Rubik', familia: 'Rubik', css: 'Rubik, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'quicksand', nome: 'Quicksand', familia: 'Quicksand', css: 'Quicksand, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'josefin', nome: 'Josefin Sans', familia: 'Josefin Sans', css: '"Josefin Sans", "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'barlow', nome: 'Barlow', familia: 'Barlow', css: 'Barlow, "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'manrope', nome: 'Manrope', familia: 'Manrope', css: 'Manrope, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'dmsans', nome: 'DM Sans', familia: 'DM Sans', css: '"DM Sans", "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'karla', nome: 'Karla', familia: 'Karla', css: 'Karla, "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },
  { id: 'mulish', nome: 'Mulish', familia: 'Mulish', css: 'Mulish, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'outfit', nome: 'Outfit', familia: 'Outfit', css: 'Outfit, "Segoe UI", sans-serif', grupo: 'Sem serifa' },
  { id: 'lato', nome: 'Lato', familia: 'Lato', css: 'Lato, "Helvetica Neue", sans-serif', grupo: 'Sem serifa' },

  // ── Impacto (condensadas e pesadas, pra título curto) ──
  { id: 'oswald', nome: 'Oswald', familia: 'Oswald', css: 'Oswald, "Arial Narrow", sans-serif', grupo: 'Impacto' },
  { id: 'bebas', nome: 'Bebas Neue', familia: 'Bebas Neue', css: '"Bebas Neue", Impact, sans-serif', grupo: 'Impacto' },
  { id: 'anton', nome: 'Anton', familia: 'Anton', css: 'Anton, Impact, sans-serif', grupo: 'Impacto' },
  { id: 'archivoblack', nome: 'Archivo Black', familia: 'Archivo Black', css: '"Archivo Black", Impact, sans-serif', grupo: 'Impacto' },
  { id: 'fjalla', nome: 'Fjalla One', familia: 'Fjalla One', css: '"Fjalla One", "Arial Narrow", sans-serif', grupo: 'Impacto' },
  { id: 'teko', nome: 'Teko', familia: 'Teko', css: 'Teko, "Arial Narrow", sans-serif', grupo: 'Impacto' },
  { id: 'staatliches', nome: 'Staatliches', familia: 'Staatliches', css: 'Staatliches, Impact, sans-serif', grupo: 'Impacto' },

  // ── Manuscritas ──
  { id: 'dancing', nome: 'Dancing Script', familia: 'Dancing Script', css: '"Dancing Script", cursive', grupo: 'Manuscritas' },
  { id: 'pacifico', nome: 'Pacifico', familia: 'Pacifico', css: 'Pacifico, cursive', grupo: 'Manuscritas' },
  { id: 'greatvibes', nome: 'Great Vibes', familia: 'Great Vibes', css: '"Great Vibes", cursive', grupo: 'Manuscritas' },
  { id: 'satisfy', nome: 'Satisfy', familia: 'Satisfy', css: 'Satisfy, cursive', grupo: 'Manuscritas' },
  { id: 'caveat', nome: 'Caveat', familia: 'Caveat', css: 'Caveat, cursive', grupo: 'Manuscritas' },
  { id: 'sacramento', nome: 'Sacramento', familia: 'Sacramento', css: 'Sacramento, cursive', grupo: 'Manuscritas' },
  { id: 'lobster', nome: 'Lobster', familia: 'Lobster', css: 'Lobster, cursive', grupo: 'Manuscritas' },
  { id: 'courgette', nome: 'Courgette', familia: 'Courgette', css: 'Courgette, cursive', grupo: 'Manuscritas' },

  // ── Monoespaçadas ──
  { id: 'spacemono', nome: 'Space Mono', familia: 'Space Mono', css: '"Space Mono", "Courier New", monospace', grupo: 'Monoespaçadas' },
  { id: 'jetbrains', nome: 'JetBrains Mono', familia: 'JetBrains Mono', css: '"JetBrains Mono", "Courier New", monospace', grupo: 'Monoespaçadas' },
]

/** Ordem em que os grupos aparecem no seletor. */
export const GRUPOS_DE_FONTE: GrupoFonte[] = ['Serifadas', 'Sem serifa', 'Impacto', 'Manuscritas', 'Monoespaçadas']

export function fonteCss(id: string): string {
  return (FONTES.find((f) => f.id === id) ?? FONTES[0]).css
}

/**
 * A URL do CSS é MONTADA a partir de `FONTES`, nunca escrita à mão: com 50
 * famílias, uma lista paralela sairia do lugar no primeiro acréscimo e a fonte
 * escolhida cairia calada na reserva.
 *
 * O mesmo pedido de variações vai pra todas (regular, negrito, itálico e
 * negrito-itálico). Pedir o que a família não tem é seguro — verificado contra
 * a API: ela responde 200 e devolve só o que existe, em vez de recusar o
 * pedido inteiro (Bebas Neue, por exemplo, volta só com o regular).
 *
 * O CSS é grande (~230 KB), mas são só as regras `@font-face`: o navegador
 * baixa o arquivo de uma família apenas quando ela é de fato usada.
 */
const CSS_FONTES =
  'https://fonts.googleapis.com/css2?' +
  FONTES.map(
    (f) => `family=${encodeURIComponent(f.familia).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700`,
  ).join('&') +
  '&display=swap'

/**
 * Injeta o CSS das fontes, uma vez.
 *
 * Sob demanda, e não no `main.css` do app: são dez famílias com itálico, e
 * baixá-las no carregamento de todas as páginas pesaria no app inteiro por
 * causa de um editor que vive numa tela só.
 */
let cssPronto: Promise<void> | null = null

export function garantirCssDasFontes(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (cssPronto) return cssPronto

  cssPronto = new Promise<void>((resolve) => {
    const jaTem = document.getElementById('fontes-cartaz')
    if (jaTem) return resolve()

    const link = document.createElement('link')
    link.id = 'fontes-cartaz'
    link.rel = 'stylesheet'
    link.href = CSS_FONTES
    // Resolve no load E no erro: com a rede fora, o desenho deve seguir na
    // reserva em vez de ficar preso esperando para sempre.
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
  return cssPronto
}

/** O que já sabemos carregado — evita reconsultar a cada redesenho do cartaz. */
const carregadas = new Set<string>()

/**
 * Espera as fontes dos elementos estarem prontas para desenhar.
 *
 * É esta espera que impede o cartaz de sair com a tipografia errada. Depois da
 * primeira vez o Set responde na hora, então o redesenho não ganha atraso —
 * o mesmo cuidado que o cache do QR tem contra o piscar.
 */
export async function garantirFontesCarregadas(elementos: ElementoCartaz[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return

  // ESPERAR o <link> é obrigatório, e essa espera foi uma correção: chamando
  // `document.fonts.load` antes de a folha ser processada, as regras
  // @font-face ainda não existem no documento, a chamada não encontra nada
  // para carregar e resolve como se tivesse dado certo. O desenho seguia e o
  // canvas escrevia na fonte de reserva — e como é uma corrida, umas famílias
  // saíam certas e outras não, sem padrão aparente.
  await garantirCssDasFontes()

  const pedidos = new Set<string>()
  for (const el of elementos) {
    if (el.tipo !== 'texto' || !el.texto.trim()) continue
    // O tamanho não muda a face carregada, mas a API exige um valor na string.
    const spec = `${el.italico ? 'italic ' : ''}${el.negrito ? '700' : '400'} 40px ${fonteCss(el.fonte)}`
    if (!carregadas.has(spec)) pedidos.add(spec)
  }
  if (pedidos.size === 0) return

  await Promise.all(
    [...pedidos].map(async (spec) => {
      try {
        await document.fonts.load(spec)
      } catch {
        /* rede fora: o desenho cai na reserva da própria pilha */
      }
      carregadas.add(spec)
    }),
  )
}

/** A string de `ctx.font` de um elemento de texto. */
export function fonteDoElemento(el: ElementoCartaz): string {
  const estilo = `${el.italico ? 'italic ' : ''}${el.negrito ? 'bold ' : ''}`
  return `${estilo}${el.tamanho}px ${fonteCss(el.fonte)}`
}

export const TAMANHO_MIN = 12
export const TAMANHO_MAX = 120
export const ESCALA_MIN = 0.06
export const ESCALA_MAX = 0.7

function novoId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** `existentes` decide onde o novo elemento nasce — ver `proximaPosicaoLivre`. */
export function novoTexto(existentes: ElementoCartaz[] = []): ElementoCartaz {
  const lugar = proximaPosicaoLivre(existentes)
  return {
    id: novoId(),
    tipo: 'texto',
    x: lugar.x,
    y: lugar.y,
    texto: 'Texto novo',
    fonte: 'playfair',
    tamanho: 40,
    negrito: false,
    italico: false,
    cor: null,
    url: null,
    escala: 0.3,
  }
}

export function novaLogo(url: string, existentes: ElementoCartaz[] = []): ElementoCartaz {
  return {
    ...novoTexto(existentes),
    id: novoId(),
    tipo: 'logo',
    texto: '',
    url,
    escala: 0.28,
  }
}

/**
 * Sanitiza o que veio do banco.
 *
 * O campo é jsonb livre: pode ter sido gravado por uma versão anterior, ter
 * campo faltando ou vir com número fora da faixa. Desenhar direto o que vier
 * dali é como o cartaz quebra — daí cada campo cair num padrão conhecido.
 */
export function lerElementos(bruto: unknown): ElementoCartaz[] {
  if (!Array.isArray(bruto)) return []
  const limitar = (v: unknown, min: number, max: number, padrao: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
  }

  return bruto.flatMap((item): ElementoCartaz[] => {
    if (!item || typeof item !== 'object') return []
    const o = item as Record<string, unknown>
    const tipo = o.tipo === 'logo' ? 'logo' : 'texto'
    if (tipo === 'logo' && typeof o.url !== 'string') return []

    return [{
      id: typeof o.id === 'string' && o.id ? o.id : novoId(),
      tipo,
      x: limitar(o.x, 0, 1, 0.5),
      y: limitar(o.y, 0, 1, 0.5),
      texto: typeof o.texto === 'string' ? o.texto : '',
      fonte: FONTES.some((f) => f.id === o.fonte) ? String(o.fonte) : FONTES[0].id,
      tamanho: limitar(o.tamanho, TAMANHO_MIN, TAMANHO_MAX, 40),
      negrito: o.negrito === true,
      italico: o.italico === true,
      cor: typeof o.cor === 'string' && /^#[0-9a-f]{6}$/i.test(o.cor) ? o.cor : null,
      url: typeof o.url === 'string' ? o.url : null,
      escala: limitar(o.escala, ESCALA_MIN, ESCALA_MAX, 0.28),
    }]
  })
}
