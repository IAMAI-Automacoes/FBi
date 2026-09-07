import { redimensionar, type EstadoInicial } from '../redimensionar-cartaz.ts'

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
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
