/**
 * O formato do plano de ação.
 *
 * O plano precisa de negrito, itálico e tamanho de letra por trecho, o que
 * texto puro não carrega. Mas ele também é lido pela IA (em `categorizar-acao`,
 * ao procurar os feedbacks que a ação resolve, e em `gerar-plano-acao`, ao
 * desenvolver o que já estava escrito), e continua aparecendo em telas que
 * mostram texto simples.
 *
 * A saída é HTML — mas um HTML de três tags, definido aqui e em lugar nenhum
 * mais. Nada de aceitar o que o navegador produzir: um `contentEditable` cospe
 * `<div>`, `<font>`, `style` inteiro e o que vier colado de outro aplicativo.
 * O que sai daqui é sempre o resultado de `serializar()`, que percorre os nós
 * e escreve só o que reconhece.
 *
 * Planos antigos são texto puro, e continuam válidos: sem tag nenhuma, o
 * conteúdo é o próprio texto.
 */

/** As únicas marcas que existem no plano. */
export interface Marcas {
  negrito?: boolean
  italico?: boolean
  /** Tamanho em px. Ausente = o tamanho normal do parágrafo. */
  tamanho?: number
}

/** Um pedaço de texto com as marcas que valem nele. */
export interface Trecho extends Marcas {
  texto: string
}

/**
 * Como o itálico é desenhado.
 *
 * `font-style: italic` sozinho, no Inter, é sutil demais: num parágrafo
 * inteiro marcado, quem lê não percebe que ele está diferente do de cima.
 *
 * `font-style: oblique <ângulo>` NÃO resolve — o Chrome ignora o ângulo por
 * completo. Medido: 22° e 40° saem pixel a pixel idênticos ao itálico normal,
 * tanto com a face itálica carregada (ele usa a face e descarta o ângulo)
 * quanto sem ela (ele sintetiza sempre no mesmo ângulo fixo).
 *
 * O que funciona é `skewX`, que inclina de verdade. Somado aos ~10° da face
 * itálica real, os -12° daqui dão cerca de 22° — o trecho se reconhece sem
 * precisar comparar com a linha vizinha.
 *
 * ## O preço
 *
 * `skewX` exige `inline-block`, e isso muda como o trecho quebra: ele quebra
 * internamente (por isso o `maxWidth`), mas não começa no meio de uma linha
 * cheia — um itálico longo no meio de um parágrafo pula inteiro para a linha
 * seguinte, deixando um vão. Aceitável porque o uso real é marcar uma frase
 * ou um parágrafo inteiro, que é onde o destaque tem sentido.
 *
 * A inclinação também desloca as linhas de um bloco alto (o topo vai para a
 * direita, a base para a esquerda). Com a origem no centro, metade vai para
 * cada lado, e em três ou quatro linhas o efeito é discreto.
 */
export const ESTILO_ITALICO = {
  fontStyle: 'italic',
  display: 'inline-block',
  transform: 'skewX(-12deg)',
  transformOrigin: 'center',
  maxWidth: '100%',
} as const

export const TAMANHO_PADRAO = 11
export const TAMANHO_MIN = 8
export const TAMANHO_MAX = 32

/** Prende o tamanho na faixa; um `font-size` fora dela quebra o layout. */
export function limitarTamanho(n: number): number {
  if (!Number.isFinite(n)) return TAMANHO_PADRAO
  return Math.min(Math.max(Math.round(n), TAMANHO_MIN), TAMANHO_MAX)
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

function escapar(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESCAPES[c])
}

/**
 * Lê o HTML e devolve linhas de trechos.
 *
 * Usa `DOMParser` em vez de expressão regular: HTML aninhado (`<b>` dentro de
 * `<span>`) não é linguagem regular, e uma regex acerta os casos simples e
 * erra silenciosamente o resto. O documento criado pelo DOMParser é inerte —
 * `<script>` e `<img onerror>` ali dentro não executam, e de todo modo só as
 * três marcas conhecidas atravessam para o outro lado.
 */
export function analisar(html: string): Trecho[][] {
  const bruto = html ?? ''
  // SEMPRE pelo DOMParser, mesmo parecendo texto puro. Havia um atalho aqui
  // ("sem tag conhecida, trata como texto") e ele codificava duas vezes: um
  // plano com "a & b" sai do editor como "a &amp; b", e na abertura seguinte
  // o atalho escapava o & de novo — a pessoa via `a &amp; b` na tela.
  //
  // O parser resolve os dois casos com a mesma regra: entidade vira o
  // caractere, e um & solto de plano antigo continua sendo &, porque o HTML5
  // é tolerante com isso.
  // A raiz é localizada por id, e não por `doc.body`. Onde o conteúdo cai
  // depois do parse é decisão de cada implementação — o navegador monta
  // html>head+body e põe tudo no body; outras (a usada nos testes) promovem o
  // primeiro elemento a raiz do documento e deixam `body` vazio. Uma âncora
  // explícita não depende dessa escolha.
  const doc = new DOMParser().parseFromString(
    `<div id="ef-raiz">${bruto}</div>`,
    'text/html',
  )
  const raiz = doc.querySelector('#ef-raiz')
  const linhas: Trecho[][] = [[]]
  if (!raiz) return [[{ texto: bruto }]]

  const visitar = (no: Node, herdado: Marcas) => {
    if (no.nodeType === Node.TEXT_NODE) {
      // Planos antigos guardam as quebras como \n dentro do próprio texto; os
      // novos usam <br>. Aqui os dois viram a mesma coisa — uma linha nova na
      // estrutura —, senão o texto antigo sairia como um parágrafo só.
      const partes = (no.textContent ?? '').split('\n')
      partes.forEach((parte, i) => {
        if (i > 0) linhas.push([])
        if (parte) linhas[linhas.length - 1].push({ ...herdado, texto: parte })
      })
      return
    }
    if (no.nodeType !== Node.ELEMENT_NODE) return

    const el = no as HTMLElement
    const tag = el.tagName.toLowerCase()

    // O conteúdo de <script>/<style> é CÓDIGO, e o parser o entrega como nó
    // de texto. Sem esta parada, um <script>alert(1)</script> colado no plano
    // apareceria na tela como a linha "alert(1)" — o script não roda (nada
    // aqui vira HTML de volta), mas o lixo apareceria como se fosse conteúdo.
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return

    if (tag === 'br') {
      linhas.push([])
      return
    }
    // `div` e `p` são o que o navegador inventa ao apertar Enter: viram quebra
    // de linha, sem virar marca nenhuma.
    const ehBloco = tag === 'div' || tag === 'p'
    if (ehBloco && linhas[linhas.length - 1].length > 0) linhas.push([])

    const marcas: Marcas = { ...herdado }
    if (tag === 'b' || tag === 'strong') marcas.negrito = true
    if (tag === 'i' || tag === 'em') marcas.italico = true

    const px = /font-size:\s*([\d.]+)px/i.exec(el.getAttribute('style') ?? '')
    if (px) marcas.tamanho = limitarTamanho(parseFloat(px[1]))

    el.childNodes.forEach((filho) => visitar(filho, marcas))
  }

  raiz.childNodes.forEach((no) => visitar(no, {}))
  return linhas
}

/** Monta o HTML restrito a partir das linhas de trechos. */
export function montar(linhas: Trecho[][]): string {
  return linhas
    .map((trechos) =>
      trechos
        .filter((t) => t.texto)
        .map((t) => {
          let html = escapar(t.texto)
          if (t.negrito) html = `<b>${html}</b>`
          if (t.italico) html = `<i>${html}</i>`
          if (t.tamanho) html = `<span style="font-size:${t.tamanho}px">${html}</span>`
          return html
        })
        .join(''),
    )
    .join('<br>')
}

/**
 * O plano sem marca nenhuma.
 *
 * É o que vai para a IA (marcação no prompt é ruído que ela tenta interpretar)
 * e para qualquer lugar que mostre o plano como uma linha só.
 */
export function paraTextoSimples(html: string): string {
  return analisar(html)
    .map((linha) => linha.map((t) => t.texto).join(''))
    .join('\n')
}

/** O conteúdo é só espaço em branco? */
export function estaVazio(html: string): boolean {
  return !paraTextoSimples(html).trim()
}
