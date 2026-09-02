import type { jsPDF } from 'jspdf'

/**
 * Gráficos do relatório em PDF, desenhados com as primitivas do jsPDF
 * (retângulo, linha, texto).
 *
 * Sem biblioteca de gráficos: as que geram imagem precisam de um canvas, e o
 * PDF é montado fora da tela. Desenhar direto também mantém tudo como vetor —
 * o arquivo continua nítido em qualquer zoom e pesa alguns kB em vez de
 * carregar PNGs.
 *
 * ## As regras que valem para todos
 *
 * Sem grade de fundo e sem moldura. O que orienta a leitura é o valor escrito
 * na ponta de cada barra — quem lê um relatório quer o número, não estimá-lo
 * contra uma linha pontilhada.
 *
 * A cor carrega significado e nada mais: verde é satisfação alta, vermelho é
 * baixa, cinza é ausência de dado. Nunca uma cor por item só para colorir,
 * porque aí a cor deixa de dizer qualquer coisa.
 */

type Cor = [number, number, number]

export const VERDE: Cor = [16, 185, 129]
export const VERDE_CLARO: Cor = [110, 231, 183]
export const AMBAR: Cor = [245, 158, 11]
export const VERMELHO: Cor = [244, 63, 94]
export const CINZA: Cor = [148, 163, 184]
export const CINZA_CLARO: Cor = [226, 232, 240]
export const TINTA: Cor = [15, 23, 42]
export const TEXTO_FRACO: Cor = [100, 116, 139]

/**
 * A cor de um índice de satisfação.
 *
 * Quatro faixas, não um degradê contínuo: o objetivo é responder "isto está
 * bem ou mal?" de relance, e um degradê obriga a comparar tons entre si para
 * decidir. Os cortes são os mesmos que a tela usa.
 */
export function corSatisfacao(v: number | null | undefined): Cor {
  if (v === null || v === undefined) return CINZA_CLARO
  if (v >= 70) return VERDE
  if (v >= 50) return VERDE_CLARO
  if (v >= 30) return AMBAR
  return VERMELHO
}

interface Item {
  rotulo: string
  valor: number
  /** Segundo número, escrito à direita do rótulo (ex.: quantas avaliações). */
  detalhe?: string
  /** Sobrescreve a cor da barra. Sem isto, vem de `corSatisfacao`. */
  cor?: Cor
  /**
   * Não houve medição — diferente de ter medido e dado zero.
   *
   * Uma categoria com 5 avaliações, todas negativas, marca satisfação 0. Sem
   * esta distinção ela desenhava exatamente igual a uma categoria sem
   * avaliação nenhuma: trilho cinza vazio. E são o oposto uma da outra — a
   * primeira é o pior resultado possível, a segunda é ausência de resultado.
   */
  semDados?: boolean
}

/**
 * Barras horizontais — para rankings (categorias, temas, dias).
 *
 * Horizontal e não vertical porque os rótulos são palavras ("Cardápio/
 * Variedade", "Falta de experiencia dos garcons"): na vertical eles teriam de
 * ser girados ou abreviados, e um rótulo girado só se lê inclinando a cabeça.
 *
 * Devolve o `y` onde o gráfico terminou.
 */
export function barrasHorizontais(
  doc: jsPDF,
  opts: {
    x: number
    y: number
    largura: number
    itens: Item[]
    /** Fim da escala. Sem isto, o maior valor da lista. */
    maximo?: number
    /** Largura reservada ao rótulo, à esquerda das barras. */
    largRotulo?: number
    alturaBarra?: number
    /** Texto na ponta da barra. Sem isto, o próprio valor. */
    sufixo?: string
  },
): number {
  const { x, y, largura, itens } = opts
  const largRotulo = opts.largRotulo ?? 46
  const h = opts.alturaBarra ?? 6.2
  const gap = 2.6
  const maximo = opts.maximo ?? Math.max(...itens.map((i) => i.valor), 1)
  // Espaço à direita para o número não encostar na borda da página.
  const largBarras = largura - largRotulo - 14

  let atual = y
  for (const item of itens) {
    const cor = item.cor ?? corSatisfacao(item.valor)
    // Zero MEDIDO ganha um talo mínimo em vermelho: some da barra mas não da
    // vista, e o olho encontra a linha vermelha percorrendo a coluna. Zero por
    // falta de dado continua sem talo nenhum.
    const minimo = item.semDados ? 0 : 1.8
    const comprimento = Math.max((item.valor / maximo) * largBarras, item.valor > 0 ? 1.5 : minimo)

    doc.setFontSize(8.2)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(TINTA[0], TINTA[1], TINTA[2])
    // O rótulo é cortado no que couber: um nome comprido que quebrasse em duas
    // linhas desalinharia a barra do vizinho e a comparação visual se perde.
    const rotulo = doc.splitTextToSize(item.rotulo, largRotulo - 2)[0]
    doc.text(rotulo, x, atual + h - 1.6)

    // Trilho: mostra o quanto FALTA para o máximo, que é o que dá escala à
    // barra preenchida quando os valores são todos pequenos.
    doc.setFillColor(CINZA_CLARO[0], CINZA_CLARO[1], CINZA_CLARO[2])
    doc.roundedRect(x + largRotulo, atual, largBarras, h, 1, 1, 'F')

    if (comprimento > 0) {
      doc.setFillColor(cor[0], cor[1], cor[2])
      doc.roundedRect(x + largRotulo, atual, comprimento, h, 1, 1, 'F')
    }

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    if (item.semDados) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    } else {
      doc.setTextColor(TINTA[0], TINTA[1], TINTA[2])
    }
    const valorEscrito = item.semDados ? '—' : `${item.valor}${opts.sufixo ?? ''}`
    doc.text(valorEscrito, x + largRotulo + largBarras + 2, atual + h - 1.6)

    if (item.detalhe) {
      doc.setFontSize(7.2)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(TEXTO_FRACO[0], TEXTO_FRACO[1], TEXTO_FRACO[2])
      doc.text(item.detalhe, x + largRotulo - 2, atual + h - 1.6, { align: 'right' })
    }

    atual += h + gap
  }
  return atual
}

/**
 * Linha de evolução da satisfação, com as barras de volume ao fundo.
 *
 * Os dois no mesmo gráfico de propósito: satisfação sem volume engana — um dia
 * com uma avaliação negativa marca 0 e desenha o mesmo tombo que um dia com
 * trinta. As barras cinzas ao fundo mostram de quantas avaliações cada ponto
 * saiu, e o tombo sobre uma barra baixa se lê como o ruído que é.
 *
 * Dias sem avaliação não recebem ponto, e a linha os SALTA em vez de descer
 * até zero: zero avaliações não é satisfação zero.
 */
export function linhaEvolucao(
  doc: jsPDF,
  opts: {
    x: number
    y: number
    largura: number
    altura: number
    pontos: Array<{ rotulo: string; valor: number | null; volume: number }>
  },
): number {
  const { x, y, largura, altura, pontos } = opts
  if (pontos.length === 0) return y

  const base = y + altura
  const passo = largura / Math.max(pontos.length - 1, 1)
  const volumeMax = Math.max(...pontos.map((p) => p.volume), 1)

  // ── Escala à esquerda: só 0, 50 e 100 ────────────────────────────────────
  // Três marcas bastam porque a leitura é "acima ou abaixo da metade"; mais
  // linhas viram grade e competem com os dados.
  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'normal')
  for (const marca of [0, 50, 100]) {
    const alturaMarca = base - (marca / 100) * altura
    doc.setDrawColor(CINZA_CLARO[0], CINZA_CLARO[1], CINZA_CLARO[2])
    doc.setLineWidth(0.2)
    doc.line(x, alturaMarca, x + largura, alturaMarca)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text(String(marca), x - 2, alturaMarca + 1, { align: 'right' })
  }

  // ── Volume ao fundo ──────────────────────────────────────────────────────
  const largBarra = Math.min(passo * 0.55, 3.4)
  doc.setFillColor(236, 240, 245)
  for (const [i, p] of pontos.entries()) {
    if (p.volume <= 0) continue
    const alt = (p.volume / volumeMax) * altura * 0.55
    doc.rect(x + i * passo - largBarra / 2, base - alt, largBarra, alt, 'F')
  }

  // ── A linha ──────────────────────────────────────────────────────────────
  doc.setDrawColor(29, 78, 216)
  doc.setLineWidth(0.7)
  let anterior: { px: number; py: number } | null = null
  for (const [i, p] of pontos.entries()) {
    if (p.valor === null) {
      // Corta o traço: unir por cima de um buraco inventaria uma medida que
      // não existe naquele dia.
      anterior = null
      continue
    }
    const px = x + i * passo
    const py = base - (p.valor / 100) * altura
    if (anterior) doc.line(anterior.px, anterior.py, px, py)
    anterior = { px, py }
  }

  // ── Os pontos, por cima da linha ─────────────────────────────────────────
  for (const [i, p] of pontos.entries()) {
    if (p.valor === null) continue
    const px = x + i * passo
    const py = base - (p.valor / 100) * altura
    const cor = corSatisfacao(p.valor)
    doc.setFillColor(cor[0], cor[1], cor[2])
    doc.circle(px, py, 1.15, 'F')
  }

  // ── Datas: só as pontas e o meio ─────────────────────────────────────────
  // Trinta rótulos numa faixa de 180mm viram uma mancha ilegível.
  doc.setFontSize(6.8)
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
  const marcar = [0, Math.floor(pontos.length / 2), pontos.length - 1]
  for (const i of [...new Set(marcar)]) {
    const p = pontos[i]
    if (!p) continue
    const alinhamento = i === 0 ? 'left' : i === pontos.length - 1 ? 'right' : 'center'
    doc.text(p.rotulo, x + i * passo, base + 4, { align: alinhamento as 'left' | 'center' | 'right' })
  }

  return base + 7
}

/**
 * Barra única dividida em partes — a divisão positivo / neutro / negativo.
 *
 * Uma barra e não uma pizza: comparar comprimentos lado a lado é mais preciso
 * que comparar ângulos, e a barra ainda ocupa uma faixa fina em vez de um
 * quadrado no meio da página.
 */
export function barraEmpilhada(
  doc: jsPDF,
  opts: {
    x: number
    y: number
    largura: number
    altura?: number
    partes: Array<{ rotulo: string; valor: number; cor: Cor }>
  },
): number {
  const { x, y, largura, partes } = opts
  const h = opts.altura ?? 9
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1

  let cursor = x
  for (const parte of partes) {
    const larg = (parte.valor / total) * largura
    if (larg <= 0) continue
    doc.setFillColor(parte.cor[0], parte.cor[1], parte.cor[2])
    doc.rect(cursor, y, larg, h, 'F')

    // O número entra DENTRO da barra quando cabe; fora, ele viraria uma
    // legenda solta que ninguém liga à cor certa.
    const pct = Math.round((parte.valor / total) * 100)
    if (larg > 13) {
      doc.setFontSize(7.6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(`${pct}%`, cursor + larg / 2, y + h - 2.8, { align: 'center' })
    }
    cursor += larg
  }

  // Legenda embaixo, em linha, com o quadradinho da cor colado ao texto.
  let lx = x
  doc.setFontSize(7.6)
  doc.setFont('helvetica', 'normal')
  for (const parte of partes) {
    doc.setFillColor(parte.cor[0], parte.cor[1], parte.cor[2])
    doc.roundedRect(lx, y + h + 3, 2.6, 2.6, 0.6, 0.6, 'F')
    doc.setTextColor(TEXTO_FRACO[0], TEXTO_FRACO[1], TEXTO_FRACO[2])
    const texto = `${parte.rotulo} (${parte.valor})`
    doc.text(texto, lx + 4, y + h + 5.2)
    lx += doc.getTextWidth(texto) + 10
  }

  return y + h + 9
}
