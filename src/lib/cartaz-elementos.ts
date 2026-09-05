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

/** Centro do cartaz: onde todo elemento novo nasce. */
export const POSICAO_INICIAL = { x: 0.5, y: 0.5 }

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
export const FONTES: { id: string; nome: string; familia: string; css: string }[] = [
  { id: 'playfair', nome: 'Playfair Display', familia: 'Playfair Display', css: '"Playfair Display", Georgia, serif' },
  { id: 'cormorant', nome: 'Cormorant Garamond', familia: 'Cormorant Garamond', css: '"Cormorant Garamond", Garamond, serif' },
  { id: 'lora', nome: 'Lora', familia: 'Lora', css: 'Lora, Georgia, serif' },
  { id: 'montserrat', nome: 'Montserrat', familia: 'Montserrat', css: 'Montserrat, "Helvetica Neue", sans-serif' },
  { id: 'poppins', nome: 'Poppins', familia: 'Poppins', css: 'Poppins, "Segoe UI", sans-serif' },
  { id: 'oswald', nome: 'Oswald', familia: 'Oswald', css: 'Oswald, "Arial Narrow", sans-serif' },
  { id: 'bebas', nome: 'Bebas Neue', familia: 'Bebas Neue', css: '"Bebas Neue", Impact, sans-serif' },
  { id: 'anton', nome: 'Anton', familia: 'Anton', css: 'Anton, Impact, sans-serif' },
  { id: 'dancing', nome: 'Dancing Script', familia: 'Dancing Script', css: '"Dancing Script", cursive' },
  { id: 'pacifico', nome: 'Pacifico', familia: 'Pacifico', css: 'Pacifico, cursive' },
]

export function fonteCss(id: string): string {
  return (FONTES.find((f) => f.id === id) ?? FONTES[0]).css
}

const CSS_FONTES =
  'https://fonts.googleapis.com/css2' +
  '?family=Playfair+Display:ital,wght@0,400;0,700;1,400' +
  '&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400' +
  '&family=Lora:ital,wght@0,400;0,700;1,400' +
  '&family=Montserrat:ital,wght@0,400;0,700;1,400' +
  '&family=Poppins:ital,wght@0,400;0,700;1,400' +
  '&family=Oswald:wght@400;700' +
  '&family=Bebas+Neue' +
  '&family=Anton' +
  '&family=Dancing+Script:wght@400;700' +
  '&family=Pacifico' +
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

export function novoTexto(): ElementoCartaz {
  return {
    id: novoId(),
    tipo: 'texto',
    x: POSICAO_INICIAL.x,
    y: POSICAO_INICIAL.y,
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

export function novaLogo(url: string): ElementoCartaz {
  return {
    ...novoTexto(),
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
