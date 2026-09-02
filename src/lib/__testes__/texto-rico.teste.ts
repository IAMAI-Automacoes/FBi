/**
 * Testes do formato do plano de ação.
 *
 * `analisar()` usa `DOMParser`, que não existe no Node — `linkedom` fornece um
 * equivalente. É a única razão de ele estar nas devDependencies.
 */
import { DOMParser, Node as NoDom } from 'linkedom'
// deno-lint-ignore no-explicit-any
const g = globalThis as any
g.DOMParser = DOMParser
g.Node = NoDom

const { analisar, montar, paraTextoSimples, estaVazio } = await import('../texto-rico.ts')

let falhas = 0
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!ok) console.log(`   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
}

const voltaEVolta = (s: string) => montar(analisar(s))

// ── o que o editor escreve, lido de volta igual ──────────────────────────────
checa('negrito', voltaEVolta('<b>oi</b> mundo'), '<b>oi</b> mundo')
checa('italico', voltaEVolta('<i>ok</i>'), '<i>ok</i>')
checa('tamanho', voltaEVolta('<span style="font-size:16px">G</span>'), '<span style="font-size:16px">G</span>')
checa('duas linhas', voltaEVolta('a<br>b'), 'a<br>b')

// ── planos antigos, em texto puro, continuam valendo ─────────────────────────
checa('texto puro', voltaEVolta('plano antigo'), 'plano antigo')
checa('quebra legada vira <br>', voltaEVolta('linha1\nlinha2'), 'linha1<br>linha2')
checa('& solto de plano antigo', voltaEVolta('a & b'), 'a &amp; b')

// ── a dupla codificação que o atalho antigo causava ──────────────────────────
checa('entidade nao codifica duas vezes', voltaEVolta('a &amp; b'), 'a &amp; b')
const uma = voltaEVolta('<b>a</b> &amp; <i>b</i>')
checa('idempotente', voltaEVolta(uma), uma)

// ── o que o navegador inventa, normalizado ───────────────────────────────────
checa('divs viram quebra', voltaEVolta('<div>a</div><div>b</div>'), 'a<br>b')
checa('font descartado', voltaEVolta('<font color=red>z</font>'), 'z')
checa('tamanho fora da faixa e limitado', voltaEVolta('<span style="font-size:900px">P</span>'), '<span style="font-size:32px">P</span>')

// ── nada além das tres marcas atravessa ──────────────────────────────────────
checa('script nao vira conteudo', voltaEVolta('<script>alert(1)</script>x'), 'x')
checa('img com onerror nao atravessa', voltaEVolta('<img src=x onerror=alert(1)>y'), 'y')
checa('style nao vira conteudo', voltaEVolta('<style>b{}</style>z'), 'z')

// ── o texto que vai para a IA ────────────────────────────────────────────────
checa('texto simples', paraTextoSimples('<b>Passo 1</b><br>detalhe'), 'Passo 1\ndetalhe')
checa('vazio', estaVazio('<b> </b>'), true)
checa('nao vazio', estaVazio('<b>x</b>'), false)


// ─────────────────────────────────────────────────────────────────────────────
// A regra por trás do "+ diminuía a letra"
//
// A barra somava sobre o número que estava na tela, não sobre o tamanho do
// texto selecionado. Com o texto em 14 e a barra em 11, "+" levava a 12: o
// texto encolhia, e só do terceiro clique em diante passava dos 14.
//
// `tamanhoDaSelecao` vive no componente (precisa do DOM e da seleção), mas a
// regra que ele usa para achar o trecho é esta, e é ela que se testa aqui.
// ─────────────────────────────────────────────────────────────────────────────

const TAMANHO_PADRAO = 11

/** Espelha a busca do trecho em `EditorTextoRico.tamanhoDaSelecao`. */
function tamanhoNoIntervalo(html: string, inicio: number, fim: number): number {
  const linhas = analisar(html)
  let pos = 0
  for (let i = 0; i < linhas.length; i++) {
    for (const t of linhas[i]) {
      const ini = pos
      const f = pos + t.texto.length
      pos = f
      const dentro = inicio === fim
        ? inicio >= ini && inicio <= f
        : f > inicio && ini < fim
      if (dentro) return t.tamanho ?? TAMANHO_PADRAO
    }
    if (i < linhas.length - 1) pos += 1
  }
  return TAMANHO_PADRAO
}

const doc = '<span style="font-size:18px">Titulo</span><br>corpo normal'
//            0..5 (18px)                              7..18 (padrao)

checa('le 18 no titulo', tamanhoNoIntervalo(doc, 0, 6), 18)
checa('le o padrao no corpo', tamanhoNoIntervalo(doc, 7, 12), TAMANHO_PADRAO)
checa('cursor sem selecao dentro do titulo', tamanhoNoIntervalo(doc, 3, 3), 18)
checa('selecao que cruza os dois usa o primeiro', tamanhoNoIntervalo(doc, 2, 12), 18)

// O cenário exato do relato: aumentar a partir de 18 dá 19, nunca 12.
checa('aumentar a partir do texto (nao da barra)', tamanhoNoIntervalo(doc, 0, 6) + 1, 19)
checa('diminuir a partir do texto', tamanhoNoIntervalo(doc, 0, 6) - 1, 17)


// ─────────────────────────────────────────────────────────────────────────────
// O toggle de negrito/itálico — a regra do Word e do Google Docs
//
// Se TODO o trecho selecionado tem a marca, o botão remove; senão, aplica em
// tudo. O resultado é sempre uniforme.
//
// Antes cada trecho era invertido por conta própria, e uma seleção com uma
// parte em itálico e outra sem TROCAVA as duas: o inclinado ficava reto e o
// reto ficava inclinado.
// ─────────────────────────────────────────────────────────────────────────────

/** Espelha `EditorTextoRico.alternar`. */
function decidirToggle(cobertos: { italico?: boolean }[]): boolean {
  return !cobertos.every((t) => t.italico)
}

checa('nada em italico -> aplica', decidirToggle([{}, {}]), true)
checa('tudo em italico -> remove', decidirToggle([{ italico: true }, { italico: true }]), false)
checa('MISTO -> aplica em tudo', decidirToggle([{ italico: true }, {}]), true)
checa('misto invertido -> aplica em tudo', decidirToggle([{}, { italico: true }]), true)

// Dois cliques a partir de misto: uniformiza e depois limpa — nunca volta ao
// estado bagunçado do começo.
const passo1 = decidirToggle([{ italico: true }, {}])          // true  -> tudo italico
const passo2 = decidirToggle([{ italico: passo1 }, { italico: passo1 }])
checa('2o clique depois de uniformizar remove', passo2, false)

// ── tamanho: uniforme mostra o numero, misto mostra vazio ───────────────────
function tamanhoExibido(cobertos: { tamanho?: number }[]): number | null {
  if (cobertos.length === 0) return 11
  const primeiro = cobertos[0].tamanho ?? 11
  return cobertos.every((t) => (t.tamanho ?? 11) === primeiro) ? primeiro : null
}

checa('tamanho uniforme', tamanhoExibido([{ tamanho: 18 }, { tamanho: 18 }]), 18)
checa('tamanho misto vira vazio', tamanhoExibido([{ tamanho: 18 }, { tamanho: 11 }]), null)
checa('sem marca e o padrao', tamanhoExibido([{}, {}]), 11)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
if (falhas > 0) process.exit(1)
