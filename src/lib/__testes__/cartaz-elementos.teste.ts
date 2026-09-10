import {
  FONTES,
  GRUPOS_DE_FONTE,
  fonteCss,
  LUGARES_LIVRES,
  proximaPosicaoLivre,
  novoTexto,
  novaLogo,
  lerElementos,
} from '../cartaz-elementos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra && !cond ? ' -> ' + extra : ''}`)
  if (!cond) falhas++
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
{
  ok('são 50 fontes', FONTES.length === 50, String(FONTES.length))

  const ids = FONTES.map((f) => f.id)
  ok('nenhum id repetido', new Set(ids).size === ids.length)
  const familias = FONTES.map((f) => f.familia)
  ok('nenhuma família repetida', new Set(familias).size === familias.length)

  ok('toda fonte tem pilha de reserva', FONTES.every((f) => f.css.includes(',')),
    FONTES.filter((f) => !f.css.includes(',')).map((f) => f.id).join(','))
  ok('família com espaço vem entre aspas na pilha',
    FONTES.every((f) => !f.familia.includes(' ') || f.css.startsWith('"')),
    FONTES.filter((f) => f.familia.includes(' ') && !f.css.startsWith('"')).map((f) => f.id).join(','))
  ok('todo grupo declarado existe na lista de grupos',
    FONTES.every((f) => GRUPOS_DE_FONTE.includes(f.grupo)))
  ok('todo grupo tem pelo menos uma fonte',
    GRUPOS_DE_FONTE.every((g) => FONTES.some((f) => f.grupo === g)))

  ok('id desconhecido cai na primeira fonte', fonteCss('nao-existe') === FONTES[0].css)
  ok('as 10 fontes antigas continuam existindo (cartaz salvo não muda de tipografia)',
    ['playfair', 'cormorant', 'lora', 'montserrat', 'poppins', 'oswald', 'bebas', 'anton', 'dancing', 'pacifico']
      .every((id) => FONTES.some((f) => f.id === id)))
}

// ---------------------------------------------------------------------------
// Onde um elemento novo nasce
// ---------------------------------------------------------------------------
{
  const centroDoQr = { x: 0.5, y: 0.62 }

  ok('cartaz vazio: nasce no primeiro lugar da lista',
    JSON.stringify(proximaPosicaoLivre([])) === JSON.stringify(LUGARES_LIVRES[0]))

  ok('nenhum lugar cai em cima do QR',
    LUGARES_LIVRES.every((l) => Math.hypot(l.x - centroDoQr.x, l.y - centroDoQr.y) > 0.2),
    JSON.stringify(LUGARES_LIVRES.filter((l) => Math.hypot(l.x - centroDoQr.x, l.y - centroDoQr.y) <= 0.2)))

  ok('todo lugar está dentro do cartaz',
    LUGARES_LIVRES.every((l) => l.x > 0.02 && l.x < 0.98 && l.y > 0.02 && l.y < 0.98))

  const primeiro = proximaPosicaoLivre([])
  const segundo = proximaPosicaoLivre([primeiro])
  ok('segundo elemento não nasce em cima do primeiro',
    Math.hypot(segundo.x - primeiro.x, segundo.y - primeiro.y) > 0.07,
    JSON.stringify({ primeiro, segundo }))

  // Enche todos os lugares e confere que ninguém se sobrepõe.
  const postos: { x: number; y: number }[] = []
  for (let i = 0; i < LUGARES_LIVRES.length; i++) postos.push(proximaPosicaoLivre(postos))
  const colidiu = postos.some((a, i) => postos.some((b, j) => i !== j && Math.hypot(a.x - b.x, a.y - b.y) < 0.07))
  ok('enchendo todos os lugares, nenhum se sobrepõe', !colidiu, JSON.stringify(postos))

  // Passando do número de lugares, ainda tem que sair algo visível e diferente.
  const extra1 = proximaPosicaoLivre(postos)
  const extra2 = proximaPosicaoLivre([...postos, extra1])
  ok('além dos lugares, continua dentro do cartaz',
    extra1.y > 0 && extra1.y <= 0.95 && extra2.y > 0 && extra2.y <= 0.95, JSON.stringify({ extra1, extra2 }))
  ok('elementos extras não nascem exatamente no mesmo ponto',
    extra1.y !== extra2.y || extra1.x !== extra2.x, JSON.stringify({ extra1, extra2 }))
}

// ---------------------------------------------------------------------------
// Criação de elementos
// ---------------------------------------------------------------------------
{
  const t1 = novoTexto([])
  const t2 = novoTexto([t1])
  ok('dois textos seguidos nascem separados', t1.x !== t2.x || t1.y !== t2.y, JSON.stringify([t1, t2]))
  ok('texto novo usa uma fonte que existe', FONTES.some((f) => f.id === t1.fonte))

  const logo = novaLogo('https://exemplo/logo.png', [t1, t2])
  ok('logo nasce longe dos textos já postos',
    [t1, t2].every((t) => Math.hypot(t.x - logo.x, t.y - logo.y) > 0.07), JSON.stringify(logo))
  ok('logo guarda a url', logo.url === 'https://exemplo/logo.png' && logo.tipo === 'logo')

  // O que vem do banco continua sendo sanitizado.
  const lidos = lerElementos([{ tipo: 'texto', texto: 'oi', x: 5, y: -2, fonte: 'inventada' }])
  ok('posição fora da faixa é limitada', lidos[0].x === 1 && lidos[0].y === 0, JSON.stringify(lidos[0]))
  ok('fonte inexistente cai na primeira', lidos[0].fonte === FONTES[0].id)
}

if (falhas > 0) {
  console.error(`\n${falhas} FALHA(S)`)
  process.exit(1)
}
console.log('\nTODOS OS TESTES PASSARAM')
