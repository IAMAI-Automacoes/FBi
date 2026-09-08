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
  /**
   * Quanto a caixa ficou maior em cada eixo (1 = do mesmo tamanho).
   *
   * É o que permite à tela manter o lado OPOSTO parado. Como o elemento é
   * posicionado pelo miolo, mudar só o tamanho o faz crescer pros dois lados
   * ao mesmo tempo — puxando a borda direita, a esquerda vinha junto e a
   * figura parecia se recentralizar sozinha. Sabendo o quanto cresceu, a tela
   * anda com o ponto de origem na mesma medida e a borda que ninguém pegou
   * fica onde estava.
   *
   * Sai daqui, e não de uma conta na tela, porque já vem depois dos limites:
   * quando a escala bate no teto o elemento para de crescer, e um fator
   * calculado por fora continuaria empurrando a figura pro lado.
   */
  fatorW: number
  fatorH: number
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
    const pedido = Math.max(0.2, 1 + (Math.abs(dx) > Math.abs(dy) ? dx / Math.max(1, inicio.w) : dy / Math.max(1, inicio.h)))
    if (tipo === 'texto') {
      const tamanho = Math.round(limitar(inicio.tamanho * pedido, TAMANHO_MIN, TAMANHO_MAX))
      const f = tamanho / inicio.tamanho
      return { tamanho, fatorW: f, fatorH: f }
    }
    const escala = limitar(inicio.escala * pedido, ESCALA_MIN, ESCALA_MAX)
    // O fator vem da escala JÁ limitada, e a altura é multiplicada por ele —
    // não pelo pedido cru. Com o pedido, a imagem que bateu no teto de
    // largura continuava esticando na altura e a proporção se perdia.
    const f = escala / inicio.escala
    return {
      escala,
      escalaY: inicio.escalaY != null ? Math.max(0.02, inicio.escalaY * f) : null,
      fatorW: f,
      fatorH: f,
    }
  }

  const horizontal = ancora === 'l' || ancora === 'o'
  const delta = horizontal ? dx : dy
  const medida = Math.max(1, horizontal ? inicio.w : inicio.h)
  const pedido = Math.max(0.1, 1 + delta / medida)

  if (tipo === 'texto') {
    // Estica só naquele eixo: é o que faz letra condensada/alargada. Mudar o
    // corpo aqui faria o texto crescer inteiro, que é o papel do canto.
    const base = horizontal ? inicio.esticarX : inicio.esticarY
    const novo = limitar(base * pedido, 0.2, 5)
    const f = novo / base
    return horizontal
      ? { esticarX: novo, fatorW: f, fatorH: 1 }
      : { esticarY: novo, fatorW: 1, fatorH: f }
  }

  // Imagem: crescer estica naquele sentido; encolher CORTA o pedaço que saiu.
  const rec = { ...inicio.recorte }
  const alturaAtual = inicio.escalaY ?? inicio.h / 1080

  if (horizontal) {
    const escala = limitar(inicio.escala * pedido, ESCALA_MIN, ESCALA_MAX)
    const f = escala / inicio.escala
    if (f < 1) {
      const nova = Math.max(0.05, inicio.recorte.w * f)
      // Puxando pela esquerda, quem sai é o começo da imagem — por isso a
      // origem anda junto; pela direita, ela fica onde está.
      if (ancora === 'o') rec.x = limitar(inicio.recorte.x + (inicio.recorte.w - nova), 0, 0.95)
      rec.w = nova
    }
    return { recorte: rec, escala, escalaY: alturaAtual, fatorW: f, fatorH: 1 }
  }

  const novaAltura = Math.max(0.02, alturaAtual * pedido)
  const f = novaAltura / alturaAtual
  if (f < 1) {
    const nova = Math.max(0.05, inicio.recorte.h * f)
    if (ancora === 'n') rec.y = limitar(inicio.recorte.y + (inicio.recorte.h - nova), 0, 0.95)
    rec.h = nova
  }
  return { recorte: rec, escala: inicio.escala, escalaY: novaAltura, fatorW: 1, fatorH: f }
}
