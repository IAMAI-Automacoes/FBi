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
 * As fontes oferecidas.
 *
 * Todas são famílias de sistema, com pilha de reserva. É requisito, não
 * preferência: o cartaz é desenhado em canvas e exportado na hora para PNG/PDF,
 * e fonte de web precisaria estar CARREGADA antes do desenho — se não estiver,
 * o canvas cai silenciosamente numa fonte qualquer e o arquivo que vai para a
 * gráfica sai com outra tipografia, sem aviso.
 */
export const FONTES: { id: string; nome: string; css: string }[] = [
  { id: 'classica', nome: 'Clássica', css: 'Georgia, "Times New Roman", serif' },
  { id: 'moderna', nome: 'Moderna', css: '"Helvetica Neue", Arial, sans-serif' },
  { id: 'elegante', nome: 'Elegante', css: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id: 'amigavel', nome: 'Amigável', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: 'legivel', nome: 'Legível', css: 'Verdana, Geneva, sans-serif' },
  { id: 'maquina', nome: 'Máquina', css: '"Courier New", Courier, monospace' },
  { id: 'impacto', nome: 'Impacto', css: 'Impact, "Arial Black", sans-serif' },
]

export function fonteCss(id: string): string {
  return (FONTES.find((f) => f.id === id) ?? FONTES[0]).css
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
    fonte: 'classica',
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
      fonte: FONTES.some((f) => f.id === o.fonte) ? String(o.fonte) : 'classica',
      tamanho: limitar(o.tamanho, TAMANHO_MIN, TAMANHO_MAX, 40),
      negrito: o.negrito === true,
      italico: o.italico === true,
      cor: typeof o.cor === 'string' && /^#[0-9a-f]{6}$/i.test(o.cor) ? o.cor : null,
      url: typeof o.url === 'string' ? o.url : null,
      escala: limitar(o.escala, ESCALA_MIN, ESCALA_MAX, 0.28),
    }]
  })
}
