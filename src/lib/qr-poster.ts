import QRCode from 'qrcode'
import { easyFeedIcon } from '@/assets/brand'
import { getTema, pintarTextura, type QrTema } from '@/lib/qr-temas'
import { fonteCss, type EstilosDosTextos, fonteDoElemento, garantirFontesCarregadas, type ElementoCartaz } from '@/lib/cartaz-elementos'

export const POSTER_W = 720
export const POSTER_H = 1080

function carregarImg(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
    img.src = src
  })
}

/**
 * Cache do QR (por URL) e da logo.
 *
 * Existe por causa de um piscar, não por micro-otimização. Gerar o QR e
 * decodificar uma imagem custam quadros; sem memória, arrastar no seletor de
 * cor — que redesenha a cada movimento do mouse — refazia os dois a cada
 * desenho, justamente os dois elementos que NÃO mudaram: o QR depende só da
 * URL e a logo do produto é sempre a mesma.
 *
 * Hoje `desenharPoster` espera tudo antes de pintar qualquer coisa, então o
 * cache não é mais o que impede o cartaz meio pronto de aparecer — é o que
 * mantém essa espera perto de zero do segundo desenho em diante.
 */
const cacheQr = new Map<string, Promise<HTMLImageElement>>()
let cacheLogo: Promise<HTMLImageElement> | null = null

function qrDaUrl(url: string): Promise<HTMLImageElement> {
  const emCache = cacheQr.get(url)
  if (emCache) return emCache

  const p = QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 560,
    color: { dark: '#171717ff', light: '#ffffffff' },
  })
    .then((dataUrl: string) => carregarImg(dataUrl))
    .catch(() => carregarImg(''))

  cacheQr.set(url, p)
  return p
}

function logoDoProduto(): Promise<HTMLImageElement> {
  if (!cacheLogo) cacheLogo = carregarImg(easyFeedIcon)
  return cacheLogo
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Quebra o texto na largura disponível e o escreve.
 *
 * O bloco fica centrado no ponto do cartaz, mas as linhas DENTRO dele nascem
 * todas na mesma margem esquerda — ver o porquê logo abaixo, na pintura.
 *
 * Devolve também a MEDIDA do que escreveu, porque a camada de edição da tela
 * precisa desenhar o alvo de clique exatamente onde a letra caiu — e estimar
 * isso por fora, com outra fonte carregada, dava alvo torto.
 *
 * `pintar: false` mede sem escrever: é assim que um texto em edição some do
 * canvas (o campo na tela é que o mostra) sem perder o próprio alvo.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lh: number,
  pintar = true,
): { fim: number; largura: number; altura: number } {
  // Enter digitado pelo dono vale como quebra de linha: ele quebra onde
  // quis, e a quebra automática por largura continua valendo DENTRO de cada
  // pedaço. Sem isso, o "\n" viraria parte de uma palavra e a linha só
  // quebraria onde a régua mandasse — o texto sairia diferente do que se vê
  // no campo.
  const linhas: string[] = []
  for (const paragrafo of text.split('\n')) {
    if (!paragrafo.trim()) {
      // Linha em branco de propósito (dois Enters) é espaçamento.
      linhas.push('')
      continue
    }
    let linha = ''
    for (const p of paragrafo.split(' ')) {
      const teste = linha ? `${linha} ${p}` : p
      if (ctx.measureText(teste).width > maxW && linha) {
        linhas.push(linha)
        linha = p
      } else {
        linha = teste
      }
    }
    if (linha) linhas.push(linha)
  }
  // Mede ANTES de pintar: as linhas nascem todas na mesma margem esquerda, e
  // pra saber onde essa margem cai é preciso conhecer a linha mais larga.
  const largura = linhas.reduce((maior, l) => Math.max(maior, ctx.measureText(l).width), 0)

  // Alinhado à ESQUERDA, não linha a linha centralizada.
  //
  // Centralizando cada linha, dar Enter empurrava as duas metades pra fora e
  // a segunda linha começava num lugar que não era o começo de nada — nunca
  // no ponto onde a primeira tinha começado. Com a margem única, a quebra faz
  // o que se espera de uma quebra: desce e recomeça embaixo do início do
  // texto, que é a própria borda esquerda do quadro de seleção.
  //
  // O bloco continua CENTRADO no ponto do cartaz: o que muda é o alinhamento
  // interno, então um texto de uma linha só fica exatamente onde estava.
  if (pintar) {
    const alinhamentoAnterior = ctx.textAlign
    ctx.textAlign = 'left'
    const margem = cx - largura / 2
    linhas.forEach((l, i) => ctx.fillText(l, margem, y + i * lh))
    ctx.textAlign = alinhamentoAnterior
  }
  return { fim: y + linhas.length * lh, largura, altura: Math.max(1, linhas.length) * lh }
}

/** URL que o QR aponta (página pública do site que conta aberturas). */
export function landingUrl(slug: string): string {
  const base = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
  return `${base}/f/${slug}`
}

/** Baixa um Blob de forma robusta (funciona mesmo após await, fora do gesto do clique). */
export function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png')
  })
}

export interface PosterOpts {
  url: string
  /** O nome grande. Vem de `qr_titulo`, ou do nome do cadastro. */
  nome: string
  /** Palavra pequena acima do nome. `undefined` = "RESTAURANTE"; `''` = nenhuma. */
  rotulo?: string | null
  tagline?: string
  temaId?: string | null
  /** Tipografia que o dono escolheu pros textos fixos, por id (ver
   *  `ID_ROTULO`/`ID_TITULO`/`ID_MENSAGEM`). O que não vier usa o padrão. */
  estilos?: EstilosDosTextos
  /**
   * Nome do garçom dono deste QR. Some do cartaz quando não vier.
   *
   * Existe porque, na hora de IMPRIMIR, os cartazes de todos os garçons são
   * visualmente idênticos — mesmo restaurante, mesmo tema, e o QR (a única
   * coisa que muda) é ilegível a olho nu. Sem este nome, o dono recebe uma
   * pilha de folhas iguais e não sabe qual entregar pra quem.
   */
  garcom?: string | null
  /** Textos e logo que o dono posicionou. Ver `cartaz-elementos.ts`. */
  elementos?: ElementoCartaz[]
  /** Texto em edicao: e medido, mas nao pintado (o campo sobreposto o mostra). */
  editandoId?: string
}

/** Caixa de um elemento no canvas, em pixels do cartaz. Alimenta o editor. */
export interface CaixaElemento {
  id: string
  x: number
  y: number
  w: number
  h: number
  /**
   * Graus que o elemento está virado. A caixa é sempre a do elemento DEITADO;
   * quem gira é o editor, aplicando este ângulo no próprio quadro de seleção.
   */
  rotacao?: number
}

/**
 * Ids dos textos FIXOS do cartaz (rótulo, nome e mensagem ao cliente).
 *
 * Eles não são elementos livres — não se arrastam, e o rótulo e o nome não se
 * excluem —, mas entram na mesma lista de caixas que a tela usa pra montar os
 * alvos de clique. É isso que permite editá-los clicando no próprio cartaz,
 * em vez de só num campo do formulário ao lado.
 *
 * Começam com "__" pra nunca colidirem com o id de um elemento do dono, que
 * vem de `Math.random().toString(36)`.
 */
export const ID_ROTULO = '__rotulo'
export const ID_TITULO = '__titulo'
export const ID_MENSAGEM = '__mensagem'

/** Frase usada quando o dono nunca escreveu a dele. Vazia é escolha ("não
 *  quero mensagem"); ausente é falta de configuração. */
export const MENSAGEM_PADRAO = 'Escaneie e conte como foi sua experiência com a gente.'

/**
 * Imagens de logo do dono, memorizadas por URL.
 *
 * Mesmo motivo do cache do QR: sem ele, cada redesenho recarrega a imagem e o
 * cartaz aparece sem a logo durante o carregamento — o piscar que já custou uma
 * correção. `crossOrigin` é obrigatório: a logo vem do storage do Supabase, e
 * desenhar imagem de outra origem sem ele CONTAMINA o canvas, fazendo o
 * download de PNG/PDF falhar com erro de segurança.
 */
const cacheLogoDono = new Map<string, Promise<HTMLImageElement>>()

function logoDoDono(url: string): Promise<HTMLImageElement> {
  const pronto = cacheLogoDono.get(url)
  if (pronto) return pronto
  const p = carregarImg(url, true)
  cacheLogoDono.set(url, p)
  return p
}

/**
 * As duas camadas do cartaz que NÃO mudam enquanto se edita, pintadas uma vez
 * e copiadas depois.
 *
 * Medido com o cartaz de 720×1080: o fundo mais o brilho do topo custavam
 * 24 ms por desenho, e o cartão branco do QR (sombra de 42 px de desfoque)
 * outros 11 ms — 35 dos ~45 ms de cada quadro. Arrastando um elemento, isso é
 * refeito dezenas de vezes por segundo sem que um pixel dessa parte mude:
 * fundo e brilho dependem só do tema, e cartão, QR e logo do produto só do
 * endereço que o QR aponta.
 *
 * Copiar uma camada pronta custa uma fração disso, e é o que faz o arrasto
 * caber num quadro de 60 fps.
 *
 * Guardamos UMA de cada. A prévia edita um cartaz por vez, então a chave
 * praticamente nunca muda ali; e o download em lote, que troca de QR a cada
 * garçom, refaz a camada — que é o trabalho real de gerar aquele cartaz — sem
 * ir acumulando canvas de 3 MB na memória.
 */
interface CamadaPronta { chave: string; canvas: HTMLCanvasElement }
let camadaDeFundo: CamadaPronta | null = null
let camadaDoQr: CamadaPronta | null = null

function camadaEmCache(
  guardada: CamadaPronta | null,
  chave: string,
  w: number,
  h: number,
  pintar: (c: CanvasRenderingContext2D) => void,
): CamadaPronta {
  if (guardada && guardada.chave === chave && guardada.canvas.width === w && guardada.canvas.height === h) {
    return guardada
  }
  const canvas = guardada?.canvas ?? document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext('2d')
  if (c) {
    c.clearRect(0, 0, w, h)
    pintar(c)
  }
  return { chave, canvas }
}

/** Todas as imagens dos elementos do dono, já decodificadas, por URL. */
async function imagensDosElementos(elementos: ElementoCartaz[]): Promise<Map<string, HTMLImageElement>> {
  const urls = [...new Set(
    elementos.filter((e) => e.tipo === 'logo' && e.url).map((e) => e.url as string),
  )]
  const pares = await Promise.all(urls.map(async (u) => [u, await logoDoDono(u)] as const))
  return new Map(pares)
}

/**
 * Desenha os elementos do dono e devolve onde cada um ficou.
 *
 * SÍNCRONA de propósito, e isso é a correção do arrasto travado. Ela esperava
 * as fontes e cada imagem aqui dentro, depois de o cartaz já estar meio
 * pintado. Arrastando, o estado muda a cada movimento do dedo e vários
 * desenhos ficavam no ar ao mesmo tempo: um limpava o canvas no meio do
 * outro, e o navegador chegava a pintar entre as duas etapas. Dava a imagem
 * repetida atrás da atual, atrasada, e o movimento aos solavancos. Agora tudo
 * o que precisa esperar é esperado ANTES de a pintura começar, e o cartaz
 * inteiro sai num quadro só.
 */
function desenharElementos(
  ctx: CanvasRenderingContext2D,
  elementos: ElementoCartaz[],
  t: QrTema,
  W: number,
  H: number,
  imagens: Map<string, HTMLImageElement>,
  editandoId?: string,
): CaixaElemento[] {
  const caixas: CaixaElemento[] = []

  for (const el of elementos) {
    const cx = el.x * W
    const cy = el.y * H

    if (el.tipo === 'logo') {
      if (!el.url) continue
      const img = imagens.get(el.url)
      if (!img || img.width < 1) continue
      const rec = el.recorte ?? { x: 0, y: 0, w: 1, h: 1 }
      const w = el.escala * W
      // Sem altura própria, a proporção é a do PEDAÇO visível do arquivo — o
      // que mantém a imagem sem deformar depois de um recorte.
      const h = el.escalaY != null
        ? el.escalaY * H
        : ((img.height * rec.h) / (img.width * rec.w)) * w
      // Origem no arquivo: é o recorte que faz puxar o lado pra dentro cortar
      // a imagem em vez de espremê-la.
      const fx = rec.x * img.width
      const fy = rec.y * img.height
      const fw = rec.w * img.width
      const fh = rec.h * img.height

      const giro = ((el.rotacao ?? 0) * Math.PI) / 180
      ctx.save()
      ctx.globalAlpha = el.opacidade ?? 1
      // Gira em torno do CENTRO da imagem: girar na origem do canvas jogaria
      // a figura pra fora do cartaz em vez de virá-la no lugar.
      if (giro) {
        ctx.translate(cx, cy)
        ctx.rotate(giro)
        ctx.drawImage(img, fx, fy, fw, fh, -w / 2, -h / 2, w, h)
      } else {
        ctx.drawImage(img, fx, fy, fw, fh, cx - w / 2, cy - h / 2, w, h)
      }
      ctx.restore()
      // A caixa é a da imagem DEITADA, mais o ângulo — não a caixa alinhada
      // aos eixos que a envolve girada. A envolvente cresce e encolhe a cada
      // grau, então o quadro de seleção desenhado com ela sobrava nos cantos
      // e, pior, mexia debaixo do dedo enquanto se girava: a argola presa
      // nela fugia, o ponteiro corria atrás, e o giro travava e voltava. O
      // editor vira o próprio quadro com este ângulo e a borda cola na figura.
      caixas.push({ id: el.id, x: cx - w / 2, y: cy - h / 2, w, h, rotacao: el.rotacao ?? 0 })
      continue
    }

    const texto = el.texto.trim()
    if (!texto) continue

    ctx.save()
    ctx.font = fonteDoElemento(el)
    // Esquerda, e não centro: ver o porquê em `wrapText`. A caixa toda segue
    // centrada no ponto do elemento; o que muda é onde cada linha começa.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = el.cor ?? t.tinta

    const linhas = texto.split('\n')
    const alturaLinha = el.tamanho * 1.2
    const alturaTotal = alturaLinha * linhas.length
    const ex = el.esticarX ?? 1
    const ey = el.esticarY ?? 1
    let larguraMax = 0
    linhas.forEach((linha) => { larguraMax = Math.max(larguraMax, ctx.measureText(linha).width) })

    // Esticar é do CANVAS, não da fonte: `scale` deforma a letra no eixo
    // pedido (condensada/alargada). Mudar o corpo faria o texto crescer
    // inteiro, que é o que o canto já faz.
    ctx.translate(cx, cy)
    ctx.scale(ex, ey)
    linhas.forEach((linha, i) => {
      // Em edição o texto NÃO é pintado: quem o mostra é o campo sobreposto na
      // prévia. Pintar os dois deixaria o texto dobrado e fora de registro a
      // cada tecla. A caixa continua sendo medida, e é ela que posiciona o campo.
      if (el.id !== editandoId) {
        ctx.fillText(linha, -larguraMax / 2, -alturaTotal / 2 + alturaLinha * (i + 0.5))
      }
    })
    ctx.restore()

    caixas.push({
      id: el.id,
      x: cx - (larguraMax * ex) / 2,
      y: cy - (alturaTotal * ey) / 2,
      w: larguraMax * ex,
      h: alturaTotal * ey,
    })
  }

  return caixas
}

/**
 * Desenha o cartaz retangular (em pé) do QR no canvas.
 * Design limpo para impressão: fundo suave do tema, tipografia forte, QR num
 * cartão branco (sem borda colorida) e um quadradinho com a logo no centro.
 * O QR é gerado localmente (lib `qrcode`), sem depender de API externa.
 */
export async function desenharPoster(canvas: HTMLCanvasElement, opts: PosterOpts): Promise<CaixaElemento[]> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  const W = POSTER_W
  const H = POSTER_H

  // ── Tudo o que precisa esperar, esperado AQUI ──
  //
  // Nada abaixo desta linha tem `await`: da limpeza do canvas até o último
  // elemento, o cartaz é pintado de uma vez só, sem devolver o controle ao
  // navegador no meio. Era essa devolução que deixava o cartaz meio pintado
  // aparecer na tela e, com dois desenhos no ar durante um arrasto, um limpar
  // por cima do outro — a "cópia atrasada" atrás da imagem.
  //
  // O `Promise.all` também é o que faz a primeira abertura ser mais rápida: o
  // QR, a logo do produto, as imagens do dono e as fontes carregam juntos, em
  // vez de um esperar o outro.
  const elementos = opts.elementos ?? []
  const [qr, logo, imagens] = await Promise.all([
    qrDaUrl(opts.url),
    logoDoProduto(),
    imagensDosElementos(elementos),
    // Sem esta espera o canvas escreve na fonte de reserva sem avisar, e o PNG
    // que vai pra gráfica sai com outra tipografia. Ver `cartaz-elementos.ts`.
    garantirFontesCarregadas(elementos),
  ])

  // Mexer em `width` realoca o bitmap; só vale a pena quando o tamanho mudou
  // mesmo (na prática, só no primeiro desenho). Nos outros, limpar basta.
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  } else {
    // `width` zerava o contexto de brinde; `clearRect` não. Como o desenho
    // pressupõe folha limpa, o que ele zerava volta explícito aqui.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.clearRect(0, 0, W, H)
  }
  const t = getTema(opts.temaId)
  const cx = W / 2

  // ── Fundo e brilho do topo (camada guardada — ver `camadaEmCache`) ──
  camadaDeFundo = camadaEmCache(camadaDeFundo, t.id, W, H, (c) => {
    pintarFundo(c, t, W, H)

    // Brilho suave da cor de acento no topo (profundidade, sem poluir)
    const glow = c.createRadialGradient(cx, 40, 20, cx, 40, 520)
    glow.addColorStop(0, hexComAlpha(t.acento, 0.14))
    glow.addColorStop(1, hexComAlpha(t.acento, 0))
    c.fillStyle = glow
    c.fillRect(0, 0, W, 560)
  })
  ctx.drawImage(camadaDeFundo.canvas, 0, 0)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // ── Rótulo acima do nome ──
  //
  // Editável pelo dono (`qr_rotulo`): bar, padaria e cafeteria não se chamam
  // "restaurante". `undefined`/`null` mantém o padrão; string vazia é uma
  // escolha legítima — cartaz sem rótulo nenhum —, e por isso o teste é de
  // nulidade, não de "caiu no falsy".
  // As caixas dos textos FIXOS entram na mesma lista dos elementos livres: é
  // ela que a tela usa pra saber onde está cada coisa, e é assim que dá pra
  // editar o rótulo, o nome e a mensagem clicando neles no próprio cartaz.
  const fixos: CaixaElemento[] = []

  /** Monta `ctx.font` juntando o padrão daquele texto com o que o dono mexeu. */
  const fonteFixa = (id: string, tamanhoPadrao: number, familiaPadrao: string, negritoPadrao: boolean) => {
    const e = opts.estilos?.[id] ?? {}
    const tamanho = e.tamanho ?? tamanhoPadrao
    const familia = e.fonte ? fonteCss(e.fonte) : familiaPadrao
    const negrito = e.negrito ?? negritoPadrao
    const italico = e.italico ? 'italic ' : ''
    return { css: `${italico}${negrito ? 'bold ' : ''}${tamanho}px ${familia}`, tamanho }
  }
  const corFixa = (id: string, padrao: string) => opts.estilos?.[id]?.cor ?? padrao
  /** Quanto o dono esticou aquele texto por cada lado (1 = nada). */
  const esticoDe = (id: string) => ({
    x: opts.estilos?.[id]?.esticarX ?? 1,
    y: opts.estilos?.[id]?.esticarY ?? 1,
  })
  /** Onde o texto fixo está: onde o dono arrastou, ou o lugar padrão dele. */
  const ondeFica = (id: string, xPadrao: number, yPadrao: number) => {
    const e = opts.estilos?.[id]
    return { x: e?.x !== undefined ? e.x * W : xPadrao, y: e?.y !== undefined ? e.y * H : yPadrao }
  }

  const rotulo = (opts.rotulo ?? 'RESTAURANTE').trim().toUpperCase()
  if (rotulo) {
    const f = fonteFixa(ID_ROTULO, 24, 'sans-serif', true)
    const onde = ondeFica(ID_ROTULO, cx, 132)
    const est = esticoDe(ID_ROTULO)
    ctx.fillStyle = corFixa(ID_ROTULO, t.acento)
    ctx.font = f.css
    // Esticar é `scale` no canvas, e por isso o texto é desenhado a partir da
    // origem transladada: com coordenada absoluta, a escala moveria o texto
    // junto em vez de só deformá-lo.
    ctx.save()
    ctx.translate(onde.x, onde.y)
    ctx.scale(est.x, est.y)
    const larguraRotulo = espacado(ctx, rotulo, 0, 0, 6, opts.editandoId !== ID_ROTULO)
    ctx.restore()
    fixos.push({
      id: ID_ROTULO,
      x: onde.x - (larguraRotulo * est.x) / 2,
      y: onde.y - f.tamanho * est.y,
      w: larguraRotulo * est.x,
      h: (f.tamanho + 8) * est.y,
    })
  }

  // ── Nome (fonte adaptativa: nomes longos não invadem o QR) ──
  const titulo = opts.nome.trim()
  const tamNome = titulo.length > 22 ? 38 : titulo.length > 15 ? 46 : 52
  const fTitulo = fonteFixa(ID_TITULO, tamNome, 'Georgia, serif', true)
  ctx.fillStyle = corFixa(ID_TITULO, t.tinta)
  ctx.font = fTitulo.css
  const ondeTitulo = ondeFica(ID_TITULO, cx, rotulo ? 196 : 172)
  const estTitulo = esticoDe(ID_TITULO)
  ctx.save()
  ctx.translate(ondeTitulo.x, ondeTitulo.y)
  ctx.scale(estTitulo.x, estTitulo.y)
  const medidaTitulo = wrapText(ctx, titulo, 0, 0, (W - 110) / estTitulo.x, fTitulo.tamanho + 10, opts.editandoId !== ID_TITULO)
  ctx.restore()
  fixos.push({
    id: ID_TITULO,
    x: ondeTitulo.x - (medidaTitulo.largura * estTitulo.x) / 2,
    y: ondeTitulo.y - fTitulo.tamanho * estTitulo.y,
    w: medidaTitulo.largura * estTitulo.x,
    h: medidaTitulo.altura * estTitulo.y,
  })

  // ── Frase de incentivo ──
  const mensagem = (opts.tagline ?? MENSAGEM_PADRAO).trim()
  if (mensagem) {
    const fMsg = fonteFixa(ID_MENSAGEM, 25, 'sans-serif', false)
    // A mensagem desce a partir do FIM do título já esticado — senão, com o
    // nome alargado, ela subiria por cima dele.
    const fimTitulo = ondeTitulo.y + (medidaTitulo.fim - 0) * estTitulo.y
    const ondeMsg = ondeFica(ID_MENSAGEM, cx, fimTitulo + 44)
    const estMsg = esticoDe(ID_MENSAGEM)
    ctx.fillStyle = corFixa(ID_MENSAGEM, t.suave)
    ctx.font = fMsg.css
    ctx.save()
    ctx.translate(ondeMsg.x, ondeMsg.y)
    ctx.scale(estMsg.x, estMsg.y)
    const medidaMsg = wrapText(ctx, mensagem, 0, 0, (W - 150) / estMsg.x, fMsg.tamanho + 8, opts.editandoId !== ID_MENSAGEM)
    ctx.restore()
    fixos.push({
      id: ID_MENSAGEM,
      x: ondeMsg.x - (medidaMsg.largura * estMsg.x) / 2,
      y: ondeMsg.y - fMsg.tamanho * estMsg.y,
      w: medidaMsg.largura * estMsg.x,
      h: medidaMsg.altura * estMsg.y,
    })
  }

  // ── Cartão branco do QR (sem borda colorida) ──
  // O `y` centra o cartão no espaço que sobra entre a frase de incentivo e o
  // rodapé. Ele subia até 402 quando havia duas linhas de instrução embaixo;
  // sem elas, manter o valor antigo deixaria um vão morto no pé do cartaz.
  const card = { x: 130, y: 440, w: 460, h: 460, r: 40 }

  // Cartão, QR e logo do produto numa camada só, guardada por endereço do QR
  // (o resto aí dentro é sempre igual). A sombra de 42px do cartão era o
  // segundo maior custo de cada desenho; agora ela é pintada uma vez.
  //
  // A camada é transparente fora do cartão, então continua compondo sobre o
  // fundo e sobre os textos exatamente como quando era pintada direto aqui.
  camadaDoQr = camadaEmCache(camadaDoQr, `${opts.url}|${t.acento}`, W, H, (c) => {
    c.save()
    c.shadowColor = 'rgba(23,23,23,0.16)'
    c.shadowBlur = 42
    c.shadowOffsetY = 18
    roundRect(c, card.x, card.y, card.w, card.h, card.r)
    c.fillStyle = '#ffffff'
    c.fill()
    c.restore()

    // ── QR (gerado localmente, correção alta p/ caber a logo no centro) ──
    const qs = 372
    if (qr.width > 1) {
      c.drawImage(qr, card.x + (card.w - qs) / 2, card.y + (card.h - qs) / 2, qs, qs)
    }

    // O selo do Easy Feed NÃO entra nesta camada: ele é pintado no fim, depois
    // dos elementos do dono, pra não haver como cobri-lo. Ver o rodapé.
  })
  ctx.drawImage(camadaDoQr.canvas, 0, 0)

  // ── Nome do garçom, entre o QR e o crédito ──
  //
  // Fica no espaço vazio abaixo do cartão do QR, discreto: quem manda no
  // cartaz continua sendo o restaurante (título) — isto aqui serve pra
  // separar uma pilha de impressões idênticas e saber de quem é cada uma.
  const garcom = opts.garcom?.trim()
  if (garcom) {
    ctx.fillStyle = t.acento
    ctx.font = 'bold 22px sans-serif'
    espacado(ctx, 'GARÇOM', cx, H - 128, 6)
    ctx.fillStyle = t.tinta
    ctx.font = 'bold 34px Georgia, serif'
    ctx.fillText(garcom, cx, H - 86)
  }

  // Os elementos do dono vão POR CIMA de tudo, inclusive do QR: quem posiciona
  // é ele, e travar a sobreposição aqui seria decidir por ele. O editor avisa
  // quando um elemento cobre o QR (ver `QRCodes.tsx`), que é o único caso em
  // que a sobreposição estraga o cartaz de verdade.
  const livres = elementos.length
    ? desenharElementos(ctx, elementos, t, W, H, imagens, opts.editandoId)
    : []

  // ── A MARCA DO PRODUTO, por último ──
  //
  // Depois dos elementos do dono, e essa ordem é a proteção: enquanto o
  // crédito era pintado antes, bastava arrastar um retângulo da cor do fundo
  // por cima dele pra fazer o cartaz sair da gráfica sem marca nenhuma —
  // sem nem parecer que algo foi apagado. Pintado por último, o que estiver
  // embaixo não o alcança.
  //
  // A cor não vem do tema: vem do que EFETIVAMENTE está pintado atrás dele,
  // agora incluindo o que o dono pôs ali. Tema claro com arte escura por baixo
  // apagava o crédito, e ele não pode depender de sorte.
  const leitura = lerFundoAtras(ctx, W * 0.2, H - 62, W * 0.6, 40)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = leitura.tinta
  ctx.globalAlpha = leitura.alpha
  ctx.font = `${leitura.negrito ? 'bold ' : ''}18px sans-serif`
  if (leitura.halo) {
    // Fundo agitado (textura marcada, foto): um halo suave da cor oposta
    // segura a leitura sem precisar engrossar demais a letra.
    ctx.shadowColor = leitura.halo
    ctx.shadowBlur = 6
  }
  espacado(ctx, 'FEITO COM EASY FEED', cx, H - 40, 3)
  ctx.restore()

  // O selo no meio do QR, pelo mesmo motivo. Ele é pequeno e fica no centro do
  // cartão — o lugar mais fácil de cobrir com uma figura sem querer, e o mais
  // fácil de cobrir de propósito.
  const plate = 104
  ctx.save()
  ctx.shadowColor = 'rgba(23,23,23,0.18)'
  ctx.shadowBlur = 12
  roundRect(ctx, cx - plate / 2, card.y + card.h / 2 - plate / 2, plate, plate, 22)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  if (logo && logo.width > 1) {
    // Respiro pequeno de propósito: a logo preenche quase todo o quadrado.
    const box = plate - 6 * 2
    const escalaLogo = Math.min(box / logo.width, box / logo.height)
    const lw = logo.width * escalaLogo
    const lh = logo.height * escalaLogo
    ctx.drawImage(logo, cx - lw / 2, card.y + card.h / 2 - lh / 2, lw, lh)
  } else {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = t.acento
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('Easy Feed', cx, card.y + card.h / 2 + 6)
    ctx.restore()
  }

  return [...fixos, ...livres]
}

/**
 * Pinta o fundo do cartaz: cor sólida do tema, ou o material desenhado na
 * resolução da impressão.
 *
 * É o gêmeo em canvas de `fundoCss` (qr-temas.ts). Os dois chamam o MESMO
 * gerador de textura, e é isso que faz o selo da paleta, a página do cliente e
 * o PNG que vai para a gráfica mostrarem o mesmo material — antes cada um
 * tinha o seu desenho e eles só se pareciam.
 *
 * Aqui a textura é gerada no tamanho cheio do cartaz, e não escalada a partir
 * de um selo: ampliar um tile pequeno para 720×1080 borra o grão exatamente no
 * lugar onde a impressão tem resolução de sobra para mostrá-lo.
 */
function pintarFundo(ctx: CanvasRenderingContext2D, t: QrTema, W: number, H: number): void {
  if (t.textura && t.material) {
    pintarTextura(ctx, t.textura, t.material, W, H)
    return
  }

  const g = ctx.createLinearGradient(0, 0, W * 0.35, H)
  g.addColorStop(0, t.fundo[0])
  g.addColorStop(1, t.fundo[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** Escreve um texto com espaçamento entre letras (canvas não tem letter-spacing nativo confiável). */
/**
 * Como escrever por cima do que já está pintado num pedaço do cartaz.
 *
 * Lê os pixels daquela área e decide três coisas:
 *
 * - **tinta**: clara sobre fundo escuro, escura sobre fundo claro. É a
 *   luminância percebida (fórmula de Rec. 709 — o olho enxerga o verde bem
 *   mais que o azul, então média simples de RGB erraria em fundos coloridos).
 * - **negrito e halo**: só quando o fundo é AGITADO. Fundo liso não precisa
 *   de reforço; textura marcada ou foto, sim — aí parte das letras cai sobre
 *   claro e parte sobre escuro, e nenhuma cor sozinha resolve. O desvio dos
 *   pixels é o que mede essa agitação.
 * - **alpha**: num fundo liso o crédito fica discreto, como sempre foi; num
 *   fundo difícil ele vai a 100% em vez de sumir.
 *
 * Nunca lança: se a leitura falhar (canvas contaminado por imagem de outra
 * origem, por exemplo), devolve o padrão discreto de antes.
 */
export function lerFundoAtras(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
): { tinta: string; halo: string | null; negrito: boolean; alpha: number } {
  const padrao = { tinta: 'rgba(23,23,23,0.85)', halo: null, negrito: false, alpha: 0.85 }
  try {
    const dados = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, largura), Math.max(1, altura)).data
    let soma = 0
    let somaQuadrados = 0
    let amostras = 0
    // De 4 em 4 pixels: a conta é sobre uma faixa de ~17 mil pixels e a
    // precisão extra não muda nenhuma das decisões abaixo.
    for (let i = 0; i < dados.length; i += 16) {
      const lum = (0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2]) / 255
      soma += lum
      somaQuadrados += lum * lum
      amostras++
    }
    if (!amostras) return padrao

    const media = soma / amostras
    const desvio = Math.sqrt(Math.max(0, somaQuadrados / amostras - media * media))
    const fundoClaro = media > 0.55
    const agitado = desvio > 0.12

    return {
      tinta: fundoClaro ? 'rgba(20,20,20,1)' : 'rgba(255,255,255,1)',
      halo: agitado ? (fundoClaro ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : null,
      negrito: agitado,
      alpha: agitado ? 1 : 0.85,
    }
  } catch {
    return padrao
  }
}

/** Escreve com espaço extra entre as letras e devolve a largura total —
 *  `pintar: false` só mede (ver `wrapText`). */
function espacado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  cx: number,
  y: number,
  sp: number,
  pintar = true,
): number {
  const larguras = [...texto].map((ch) => ctx.measureText(ch).width + sp)
  const total = larguras.reduce((a, b) => a + b, 0) - sp
  if (!pintar) return total
  let x = cx - total / 2
  const antes = ctx.textAlign
  ctx.textAlign = 'left'
  for (let i = 0; i < texto.length; i++) {
    ctx.fillText(texto[i], x, y)
    x += larguras[i]
  }
  ctx.textAlign = antes
  return total
}

/** Converte '#rrggbb' + alpha (0..1) em 'rgba(...)'. */
function hexComAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const gg = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${gg},${b},${alpha})`
}
