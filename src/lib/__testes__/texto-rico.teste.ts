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

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
if (falhas > 0) process.exit(1)
