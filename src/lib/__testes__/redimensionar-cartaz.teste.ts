import { redimensionar, type EstadoInicial } from '../redimensionar-cartaz.ts'
import { ESCALA_MAX, TAMANHO_MAX } from '../cartaz-elementos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

const base: EstadoInicial = {
  w: 200, h: 100,
  tamanho: 40,
  esticarX: 1, esticarY: 1,
  escala: 0.3, escalaY: null,
  recorte: { x: 0, y: 0, w: 1, h: 1 },
}

// ---------------------------------------------------------------------------
// Canto: proporcional
// ---------------------------------------------------------------------------
{
  const cresceu = redimensionar('texto', 'se', base, 100, 50)
  ok('texto: canto puxado pra fora aumenta o corpo', (cresceu.tamanho ?? 0) > base.tamanho, JSON.stringify(cresceu))
  ok('texto: canto NÃO estica (não deforma a letra)',
    cresceu.esticarX === undefined && cresceu.esticarY === undefined, JSON.stringify(cresceu))

  const encolheu = redimensionar('texto', 'no', base, -100, -50)
  ok('texto: canto puxado pra dentro diminui', (encolheu.tamanho ?? 99) < base.tamanho, JSON.stringify(encolheu))

  const img = redimensionar('imagem', 'se', base, 100, 50)
  ok('imagem: canto aumenta a escala', (img.escala ?? 0) > base.escala, JSON.stringify(img))
  ok('imagem: canto não recorta', img.recorte === undefined, JSON.stringify(img))
}

// ---------------------------------------------------------------------------
// Lado, texto: estica só naquele eixo
// ---------------------------------------------------------------------------
{
  const largo = redimensionar('texto', 'l', base, 100, 0)
  ok('texto: lado direito estica na horizontal', (largo.esticarX ?? 0) > 1, JSON.stringify(largo))
  ok('texto: lado direito não mexe na vertical', largo.esticarY === undefined, JSON.stringify(largo))
  ok('texto: lado não muda o corpo da fonte', largo.tamanho === undefined, JSON.stringify(largo))

  const alto = redimensionar('texto', 's', base, 0, 50)
  ok('texto: lado de baixo estica na vertical', (alto.esticarY ?? 0) > 1, JSON.stringify(alto))

  const estreito = redimensionar('texto', 'l', base, -100, 0)
  ok('texto: puxar pra dentro condensa', (estreito.esticarX ?? 9) < 1, JSON.stringify(estreito))
  ok('texto nunca some (limite mínimo)', (estreito.esticarX ?? 0) >= 0.2, JSON.stringify(estreito))
}

// ---------------------------------------------------------------------------
// Lado, imagem: cresce esticando, encolhe CORTANDO
// ---------------------------------------------------------------------------
{
  const cresceu = redimensionar('imagem', 'l', base, 100, 0)
  ok('imagem: lado puxado pra fora aumenta a largura', (cresceu.escala ?? 0) > base.escala, JSON.stringify(cresceu))
  ok('imagem: crescer NÃO corta', cresceu.recorte?.w === 1 && cresceu.recorte?.x === 0, JSON.stringify(cresceu.recorte))

  const cortou = redimensionar('imagem', 'l', base, -100, 0)
  ok('imagem: lado puxado pra dentro corta', (cortou.recorte?.w ?? 1) < 1, JSON.stringify(cortou.recorte))
  ok('imagem: cortando pela direita, a origem fica onde estava',
    cortou.recorte?.x === 0, JSON.stringify(cortou.recorte))

  const cortouEsquerda = redimensionar('imagem', 'o', base, -100, 0)
  ok('imagem: cortando pela esquerda, a origem anda junto',
    (cortouEsquerda.recorte?.x ?? 0) > 0, JSON.stringify(cortouEsquerda.recorte))
  ok('imagem: o corte pela esquerda tira o começo do arquivo',
    Math.abs((cortouEsquerda.recorte!.x + cortouEsquerda.recorte!.w) - 1) < 0.001,
    JSON.stringify(cortouEsquerda.recorte))

  const cortouTopo = redimensionar('imagem', 'n', base, 0, -50)
  ok('imagem: corte vertical mexe na altura, não na largura',
    (cortouTopo.recorte?.h ?? 1) < 1 && cortouTopo.recorte?.w === 1, JSON.stringify(cortouTopo.recorte))

  // Sem isto o corte "comeria" a imagem até desaparecer.
  const cortouDemais = redimensionar('imagem', 'l', base, -100000, 0)
  ok('o corte tem limite mínimo', (cortouDemais.recorte?.w ?? 0) >= 0.05, JSON.stringify(cortouDemais.recorte))
}

// ---------------------------------------------------------------------------
// Sem movimento, nada muda de valor
// ---------------------------------------------------------------------------
{
  const parado = redimensionar('texto', 'l', base, 0, 0)
  ok('sem arrastar, o esticar continua 1', parado.esticarX === 1, JSON.stringify(parado))
  const paradoImg = redimensionar('imagem', 'se', base, 0, 0)
  ok('sem arrastar, a escala continua a mesma', paradoImg.escala === base.escala, JSON.stringify(paradoImg))
  ok('sem arrastar, os fatores são 1 (a figura não anda)',
    parado.fatorW === 1 && parado.fatorH === 1 && paradoImg.fatorW === 1 && paradoImg.fatorH === 1,
    JSON.stringify([parado, paradoImg]))
}

// ---------------------------------------------------------------------------
// Os fatores: é com eles que a tela segura o lado oposto
// ---------------------------------------------------------------------------
{
  // Puxar UM lado só pode mexer NAQUELE eixo. Se o outro fator saísse de 1, a
  // tela empurraria a figura num sentido que ninguém pediu.
  const largo = redimensionar('imagem', 'l', base, 100, 0)
  ok('lado direito: só o fator horizontal muda', largo.fatorH === 1 && largo.fatorW > 1, JSON.stringify(largo))
  const alto = redimensionar('imagem', 's', base, 0, 50)
  ok('lado de baixo: só o fator vertical muda', alto.fatorW === 1 && alto.fatorH > 1, JSON.stringify(alto))

  const txtLargo = redimensionar('texto', 'l', base, 100, 0)
  ok('texto, lado direito: só o fator horizontal muda',
    txtLargo.fatorH === 1 && txtLargo.fatorW > 1, JSON.stringify(txtLargo))

  // O fator tem que bater com o tamanho que de fato saiu, senão a borda
  // ancorada anda um pouco a cada movimento e o elemento escorrega.
  ok('imagem: o fator bate com a escala que saiu',
    Math.abs(largo.fatorW - (largo.escala! / base.escala)) < 1e-9, JSON.stringify(largo))
  ok('texto: o fator bate com o esticar que saiu',
    Math.abs(txtLargo.fatorW - (txtLargo.esticarX! / base.esticarX)) < 1e-9, JSON.stringify(txtLargo))

  const canto = redimensionar('texto', 'se', base, 100, 50)
  ok('canto: os dois fatores andam juntos (proporcional)',
    Math.abs(canto.fatorW - canto.fatorH) < 1e-9, JSON.stringify(canto))
  ok('canto: o fator bate com o corpo arredondado que saiu',
    Math.abs(canto.fatorW - (canto.tamanho! / base.tamanho)) < 1e-9, JSON.stringify(canto))

  // Encolher tem que dar fator < 1 nos dois casos — inclusive quando o
  // encolher da imagem acontece por CORTE.
  const cortou = redimensionar('imagem', 'l', base, -100, 0)
  ok('cortando, o fator fica abaixo de 1', cortou.fatorW < 1 && cortou.fatorH === 1, JSON.stringify(cortou))
}

// ---------------------------------------------------------------------------
// No teto, a figura tem que PARAR — inclusive de andar
// ---------------------------------------------------------------------------
{
  // Fator calculado por fora (com o pedido cru) continuaria empurrando o
  // elemento pro lado depois que ele já parou de crescer.
  const teto = redimensionar('imagem', 'l', base, 100000, 0)
  ok('estourando o teto, a escala trava', teto.escala === ESCALA_MAX, JSON.stringify(teto))
  ok('estourando o teto, o fator para junto',
    Math.abs(teto.fatorW - ESCALA_MAX / base.escala) < 1e-9, String(teto.fatorW))

  const tetoTexto = redimensionar('texto', 'se', base, 100000, 0)
  ok('estourando o teto, o corpo da fonte trava', tetoTexto.tamanho === TAMANHO_MAX, JSON.stringify(tetoTexto))
  ok('estourando o teto, o fator do texto para junto',
    Math.abs(tetoTexto.fatorW - TAMANHO_MAX / base.tamanho) < 1e-9, String(tetoTexto.fatorW))
}

// ---------------------------------------------------------------------------
// A borda oposta fica PARADA — a conta que a tela faz com os fatores
// ---------------------------------------------------------------------------
{
  // Reproduz o que `QRCodes.tsx` faz: o ponto de origem anda junto com o
  // crescimento, de modo que a borda que ninguém pegou não sai do lugar.
  const bordas = (ancora: string, m: { fatorW: number; fatorH: number }, fracX = 0.5, fracY = 0.5) => {
    const dw = base.w * (m.fatorW - 1)
    const dh = base.h * (m.fatorH - 1)
    const desX = ancora === 'l' || ancora.includes('e') ? fracX * dw : ancora.includes('o') ? -(1 - fracX) * dw : 0
    const desY = ancora.includes('s') ? fracY * dh : ancora.includes('n') ? -(1 - fracY) * dh : 0
    // Origem em 0,0; caixa inicial vai de -fracX*w a (1-fracX)*w.
    const wNovo = base.w * m.fatorW
    const hNovo = base.h * m.fatorH
    return {
      esq: desX - fracX * wNovo,
      dir: desX + (1 - fracX) * wNovo,
      topo: desY - fracY * hNovo,
      base: desY + (1 - fracY) * hNovo,
    }
  }
  /** Onde as bordas estavam ANTES de puxar — depende de onde fica a origem. */
  const antes = (fracX = 0.5, fracY = 0.5) => ({
    esq: -fracX * base.w,
    dir: (1 - fracX) * base.w,
    topo: -fracY * base.h,
    base: (1 - fracY) * base.h,
  })
  const { esq: esq0, dir: dir0, topo: topo0, base: base0 } = antes()

  const puxouDireita = bordas('l', redimensionar('imagem', 'l', base, 100, 0))
  ok('puxando a direita, a ESQUERDA não sai do lugar',
    Math.abs(puxouDireita.esq - esq0) < 1e-9, JSON.stringify(puxouDireita))
  ok('puxando a direita, a direita de fato anda',
    puxouDireita.dir > dir0 + 1, JSON.stringify(puxouDireita))

  const puxouEsquerda = bordas('o', redimensionar('imagem', 'o', base, 100, 0))
  ok('puxando a esquerda, a DIREITA não sai do lugar',
    Math.abs(puxouEsquerda.dir - dir0) < 1e-9, JSON.stringify(puxouEsquerda))

  const puxouBaixo = bordas('s', redimensionar('imagem', 's', base, 0, 50))
  ok('puxando embaixo, o TOPO não sai do lugar',
    Math.abs(puxouBaixo.topo - topo0) < 1e-9, JSON.stringify(puxouBaixo))

  const puxouCima = bordas('n', redimensionar('imagem', 'n', base, 0, 50))
  ok('puxando em cima, a BASE não sai do lugar',
    Math.abs(puxouCima.base - base0) < 1e-9, JSON.stringify(puxouCima))

  const cantoSE = bordas('se', redimensionar('imagem', 'se', base, 100, 50))
  ok('canto sudeste: o canto noroeste fica parado',
    Math.abs(cantoSE.esq - esq0) < 1e-9 && Math.abs(cantoSE.topo - topo0) < 1e-9, JSON.stringify(cantoSE))

  // Encolher também ancora: cortando pela direita, a esquerda fica.
  const encolheu = bordas('l', redimensionar('imagem', 'l', base, -60, 0))
  ok('encolhendo pela direita, a esquerda continua parada',
    Math.abs(encolheu.esq - esq0) < 1e-9, JSON.stringify(encolheu))

  // Texto fixo: o ponto guardado é a linha de base, quase no pé da caixa.
  // A mesma conta tem que valer com a fração medida, não com 0,5 chutado.
  const textoFixo = bordas('s', redimensionar('texto', 's', base, 0, 50), 0.5, 0.83)
  ok('texto fixo (origem na base): o topo continua parado',
    Math.abs(textoFixo.topo - antes(0.5, 0.83).topo) < 1e-9, JSON.stringify(textoFixo))
  ok('texto fixo: o pé é que desce', textoFixo.base > antes(0.5, 0.83).base, JSON.stringify(textoFixo))
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
