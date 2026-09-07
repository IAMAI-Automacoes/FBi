/**
 * O que puxar uma alça faz com o elemento.
 *
 * Fica separado da tela porque é a parte que dá pra errar em silêncio: são
 * regras diferentes por canto/lado e por texto/imagem, e um sinal trocado só
 * aparece quando alguém arrasta pra esquerda e a figura cresce.
 */
import { ESCALA_MAX, ESCALA_MIN, TAMANHO_MAX, TAMANHO_MIN } from './cartaz-elementos.ts'

export type Ancora = 'no' | 'ne' | 'so' | 'se' | 'n' | 's' | 'l' | 'o'

export interface EstadoInicial {
  /** Caixa do elemento no cartaz, em pixels do cartaz. */
  w: number
  h: number
  tamanho: number
  esticarX: number
  esticarY: number
  escala: number
  escalaY: number | null
  recorte: { x: number; y: number; w: number; h: number }
}

export interface Mudanca {
  tamanho?: number
  esticarX?: number
  esticarY?: number
  escala?: number
  escalaY?: number | null
  recorte?: { x: number; y: number; w: number; h: number }
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * `dx`/`dy` já vêm em pixels do CARTAZ e com o sinal corrigido pelo lado
 * pego: positivo sempre significa "crescer". Quem faz essa correção é a tela,
 * que sabe qual alça o dedo está segurando.
 */
export function redimensionar(
  tipo: 'texto' | 'imagem',
  ancora: Ancora,
  inicio: EstadoInicial,
  dx: number,
  dy: number,
): Mudanca {
  const canto = ancora.length === 2

  if (canto) {
    // Proporcional. O eixo que mais andou manda: usar os dois faria a
    // diagonal brigar consigo mesma e travar em movimentos tortos.
    const fator = Math.max(0.2, 1 + (Math.abs(dx) > Math.abs(dy) ? dx / Math.max(1, inicio.w) : dy / Math.max(1, inicio.h)))
    if (tipo === 'texto') {
      return { tamanho: Math.round(limitar(inicio.tamanho * fator, TAMANHO_MIN, TAMANHO_MAX)) }
    }
    return {
      escala: limitar(inicio.escala * fator, ESCALA_MIN, ESCALA_MAX),
      escalaY: inicio.escalaY != null ? Math.max(0.02, inicio.escalaY * fator) : null,
    }
  }

  const horizontal = ancora === 'l' || ancora === 'o'
  const delta = horizontal ? dx : dy
  const medida = Math.max(1, horizontal ? inicio.w : inicio.h)

  if (tipo === 'texto') {
    // Estica só naquele eixo: é o que faz letra condensada/alargada. Mudar o
    // corpo aqui faria o texto crescer inteiro, que é o papel do canto.
    const base = horizontal ? inicio.esticarX : inicio.esticarY
    const novo = limitar(base * (1 + delta / medida), 0.2, 5)
    return horizontal ? { esticarX: novo } : { esticarY: novo }
  }

  // Imagem: crescer estica naquele sentido; encolher CORTA o pedaço que saiu.
  const proporcao = Math.max(0.1, 1 + delta / medida)
  const rec = { ...inicio.recorte }
  if (delta < 0) {
    if (horizontal) {
      const nova = Math.max(0.05, inicio.recorte.w * proporcao)
      // Puxando pela esquerda, quem sai é o começo da imagem — por isso a
      // origem anda junto; pela direita, ela fica onde está.
      if (ancora === 'o') rec.x = limitar(inicio.recorte.x + (inicio.recorte.w - nova), 0, 0.95)
      rec.w = nova
    } else {
      const nova = Math.max(0.05, inicio.recorte.h * proporcao)
      if (ancora === 'n') rec.y = limitar(inicio.recorte.y + (inicio.recorte.h - nova), 0, 0.95)
      rec.h = nova
    }
  }

  const alturaAtual = inicio.escalaY ?? inicio.h / 1080
  return {
    recorte: rec,
    escala: horizontal ? limitar(inicio.escala * proporcao, ESCALA_MIN, ESCALA_MAX) : inicio.escala,
    escalaY: horizontal ? alturaAtual : Math.max(0.02, alturaAtual * proporcao),
  }
}
