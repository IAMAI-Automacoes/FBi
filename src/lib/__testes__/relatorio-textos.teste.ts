/**
 * Testes das palavras do relatório por público e da participação da equipe
 * (src/lib/relatorio-textos.ts).
 *   node --experimental-strip-types src/lib/__testes__/relatorio-textos.teste.ts
 */
import {
  contar, detalheDeQuemFalou, divisaoDaIdentidade, fraseDoTemaCritico, fraseDosPedidos, lerParticipacao, linhasDaParticipacao,
  PARTICIPACAO_VAZIA, semNada, taxaDeResposta, textosDoRelatorio, valorDeQuemFalou, type ParticipacaoDaEquipe,
} from '../relatorio-textos.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// ── As palavras ──────────────────────────────────────────────────────────────
const cli = textosDoRelatorio('cliente')
const eq = textosDoRelatorio('equipe')
ok('sem dizer o público, é o relatório dos clientes', textosDoRelatorio() === cli)
ok('cliente: as palavras que o relatório sempre teve', cli.recebidas === 'Avaliações recebidas' && cli.pessoas === 'Clientes que avaliaram'
  && cli.comoSeDividem === 'Como as avaliações se dividem' && cli.maisComentam === 'O que os clientes mais comentam'
  && cli.tituloDoDocumento === 'Relatório de Satisfação dos Clientes' && cli.arquivo === 'relatorio')
ok('equipe: funcionário dá feedback, não avalia', eq.recebidas === 'Feedbacks recebidos' && eq.pessoas === 'Funcionários que falaram'
  && eq.maisComentam === 'O que a equipe mais comenta' && eq.arquivo === 'relatorio-equipe')
const chaves = Object.keys(cli) as (keyof typeof cli)[]
ok('os dois públicos têm todos os textos', chaves.length === Object.keys(eq).length && chaves.every((k) => cli[k].trim().length > 0 && eq[k].trim().length > 0))
ok('nenhum texto da equipe fala de cliente, avaliação ou QR Code', chaves.filter((k) => /cliente|avalia|qr code/i.test(eq[k])).length === 0, chaves.filter((k) => /cliente|avalia|qr code/i.test(eq[k])))
ok('nenhum texto do cliente fala de funcionário ou equipe', chaves.filter((k) => /funcion|equipe/i.test(cli[k])).length === 0)
ok('contar: singular e plural de cada público', contar(1, cli) === '1 avaliação' && contar(3, cli) === '3 avaliações' && contar(0, cli) === '0 avaliações'
  && contar(1, eq) === '1 feedback' && contar(2, eq) === '2 feedbacks')
ok('frase do tema crítico concorda com o público', fraseDoTemaCritico(80, 'cliente') === '80% das avaliações relacionadas a este tema foram negativas.'
  && fraseDoTemaCritico(80, 'equipe') === '80% dos feedbacks sobre este tema foram negativos.')
ok('dia sem nada no gráfico', semNada(cli) === 'Sem avaliações' && semNada(eq) === 'Sem feedbacks')

// ── A participação ───────────────────────────────────────────────────────────
const P: ParticipacaoDaEquipe = { ativos: 12, minimo: 5, falaram: 7, mais_de_uma_vez: 2, feedbacks: 11, identificados: 6, anonimos: 4, aguardando: 1, pedidos: 2, receberam: 20, responderam: 9 }
const PEQUENA: ParticipacaoDaEquipe = { ...P, ativos: 3, falaram: null, mais_de_uma_vez: null }

ok('lê o que vem do banco, com número onde precisa', JSON.stringify(lerParticipacao({ ...P, falaram: '7', pedidos: 2.9 })) === JSON.stringify(P))
ok('equipe pequena: "quantos falaram" continua vazio (não vira zero)', lerParticipacao(PEQUENA).falaram === null && lerParticipacao(PEQUENA).mais_de_uma_vez === null)
ok('lixo vira a participação vazia', JSON.stringify(lerParticipacao(null)) === JSON.stringify(PARTICIPACAO_VAZIA) && JSON.stringify(lerParticipacao('x')) === JSON.stringify(PARTICIPACAO_VAZIA)
  && lerParticipacao({ ativos: -3, pedidos: 'abc' }).ativos === 0 && lerParticipacao({ pedidos: 'abc' }).pedidos === 0)

ok('cartão: o número de quem falou', valorDeQuemFalou(P) === '7' && detalheDeQuemFalou(P) === 'de 12 funcionários ativos (58%)')
ok('cartão: um funcionário só, no singular', detalheDeQuemFalou({ ...P, ativos: 1, falaram: 1 }) === 'de 1 funcionário ativo (100%)')
ok('cartão: equipe pequena mostra traço e explica', valorDeQuemFalou(PEQUENA) === '—' && detalheDeQuemFalou(PEQUENA).includes('5 funcionários ou mais') && !/\d+%/.test(detalheDeQuemFalou(PEQUENA)))
ok('cartão: nunca passa de 100% (quem falou e depois foi desativado)', detalheDeQuemFalou({ ...P, ativos: 5, falaram: 7 }).endsWith('(100%)'))
ok('cartão: sem ninguém ativo não divide por zero', detalheDeQuemFalou({ ...P, ativos: 0, falaram: 0 }) === 'nenhum funcionário ativo cadastrado')

ok('pedidos: taxa de resposta', taxaDeResposta(P) === 45 && fraseDosPedidos(P) === '2 pedidos de feedback: 9 de 20 responderam (45%).')
ok('pedidos: um só, no singular', fraseDosPedidos({ ...P, pedidos: 1, receberam: 4, responderam: 1 }) === '1 pedido de feedback: 1 de 4 respondeu (25%).')
ok('pedidos: nenhum no período', taxaDeResposta({ ...P, pedidos: 0, receberam: 0, responderam: 0 }) === null && fraseDosPedidos({ ...P, pedidos: 0, receberam: 0, responderam: 0 }) === 'Nenhum pedido de feedback neste período.')
ok('pedidos: saiu mas ninguém recebeu', taxaDeResposta({ ...P, receberam: 0, responderam: 0 }) === null && fraseDosPedidos({ ...P, receberam: 0, responderam: 0 }).includes('nenhum chegou a ser entregue'))

const div = divisaoDaIdentidade(P)
ok('identidade: as três partes, na ordem, com a porcentagem', div.map((d) => `${d.chave}:${d.n}:${d.percentual}`).join() === 'identificados:6:55,anonimos:4:36,aguardando:1:9')
ok('identidade: parte zerada some', divisaoDaIdentidade({ ...P, aguardando: 0, anonimos: 0 }).map((d) => d.chave).join() === 'identificados')
ok('identidade: sem feedback, sem barra', divisaoDaIdentidade({ ...P, identificados: 0, anonimos: 0, aguardando: 0 }).length === 0)

const linhas = linhasDaParticipacao(P)
ok('PDF: as linhas da participação', linhas.length === 4 && linhas[0] === 'Funcionários que falaram: 7 de 12 ativos' && linhas[3] === 'Como quiseram aparecer: 6 com o nome, 4 anônimos, 1 aguardando a escolha')
const linhasPequena = linhasDaParticipacao(PEQUENA)
ok('PDF: equipe pequena não diz quantos falaram e explica', linhasPequena.length === 3 && linhasPequena[0].includes('Funcionários ativos: 3') && linhasPequena[0].includes('anonimato')
  && !linhasPequena.some((l) => l.startsWith('Funcionários que falaram')))
ok('nenhuma linha da participação tem nome de pessoa: só contagens', [...linhas, ...linhasPequena].every((l) => /\d/.test(l) || l.startsWith('Nenhum')))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nrelatório por público: tudo certo')
process.exit(falhas ? 1 : 0)
