/**
 * Testes das regras da tela de Equipe (src/lib/equipe.ts).
 *   node --experimental-strip-types src/lib/__testes__/equipe.teste.ts
 */
import {
  chaveDoSentimento, climaDosPontos, contasDoEnvio, formatarDia, fraseDeRespostas, lerListaColada, podeReceber, situacaoDoFuncionario,
  temasDosPontos, type ConviteAnonimo,
} from '../equipe.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

// Funcionários
ok('situação: recebe, parou (PARAR) e inativo', situacaoDoFuncionario({ ativo: true, opt_out_em: null }) === 'recebe'
  && situacaoDoFuncionario({ ativo: true, opt_out_em: '2026-10-01T00:00:00Z' }) === 'parou' && situacaoDoFuncionario({ ativo: false, opt_out_em: null }) === 'inativo')
ok('só quem está ativo e não pediu para parar entra no envio', podeReceber({ ativo: true, opt_out_em: null }) && !podeReceber({ ativo: false, opt_out_em: null }) && !podeReceber({ ativo: true, opt_out_em: 'x' }))

// Lista colada
let l = lerListaColada('Ana Paula, 11 98765-4321\nBruno Souza; (21) 99999-0000; cozinha\nCarla - +55 31 98888-7777 - caixa')
ok('colar: nome e número com vírgula, ponto e vírgula ou traço', l.map((x) => `${x.nome}|${x.telefone}|${x.funcao}`).join(' / ')
  === 'Ana Paula|5511987654321| / Bruno Souza|5521999990000|cozinha / Carla|5531988887777|caixa' && l.every((x) => x.problema === null), l)
l = lerListaColada('Davi\t11987650004\tGarçom\n\n  \nElisa 1198765-0005')
ok('colar: de planilha (tabulação) e só com espaço; linha vazia é pulada', l.length === 2 && l[0].nome === 'Davi' && l[0].telefone === '5511987650004' && l[0].funcao === 'Garçom'
  && l[1].nome === 'Elisa' && l[1].telefone === '5511987650005', l)
l = lerListaColada('Fábio\nGabi, 98765-4321\n, 11 98765-0007\nHugo, 11 98765-0008\nHugo de novo, 1187650008\nIara, 11 98765-0001', ['5511987650001'])
ok('colar: diz o que há de errado em cada linha', l.map((x) => String(x.problema)).join('|')
  === 'Sem número|Número incompleto (confira o DDD)|Sem nome|null|Repetido na lista|Já cadastrado', l.map((x) => x.problema))
ok('colar: o mesmo celular com e sem o 9 é repetido', lerListaColada('A, 11 98765-0008\nB, 11 8765-0008')[1].problema === 'Repetido na lista')
ok('colar: nome com número no meio usa o telefone do fim', lerListaColada('João 2 (noite), 11 98765-0009')[0].nome === 'João 2 (noite)')

// Contas do envio
const conv = (status: ConviteAnonimo['status'], respondeu = false): ConviteAnonimo => ({ envio_id: 1, status, respondeu })
let c = contasDoEnvio([conv('enviado', true), conv('enviado', true), conv('enviado'), conv('falhou'), conv('na_fila'), conv('enviando'), conv('cancelado')])
ok('contas: cancelado não conta; taxa é sobre quem recebeu', c.total === 6 && c.enviados === 3 && c.responderam === 2 && c.falharam === 1 && c.naFila === 2 && Math.round(c.taxa * 100) === 67, c)
ok('frase das respostas', fraseDeRespostas(c) === '2 de 3 responderam (67%)' && fraseDeRespostas(contasDoEnvio([conv('enviado', true)])) === '1 de 1 respondeu (100%)')
ok('frase sem ninguém ter recebido ainda', fraseDeRespostas(contasDoEnvio([conv('na_fila')])) === 'Ainda saindo' && fraseDeRespostas(contasDoEnvio([conv('falhou')])) === 'Ninguém recebeu')
c = contasDoEnvio([])
ok('contas de envio vazio não divide por zero', c.taxa === 0 && c.total === 0)

// Clima e temas
const p = (categoria: string, sentimento: string) => ({ categoria, sentimento })
ok('sentimento do ponto, com ou sem acento', chaveDoSentimento('Sugestão') === 'sugestao' && chaveDoSentimento('negativo') === 'negativo' && chaveDoSentimento('Positivo') === 'positivo' && chaveDoSentimento(null) === 'neutro')
const pontos = [p('Escala e horários', 'Negativo'), p('Escala e horários', 'Sugestão'), p('Clima e colegas', 'Positivo'), p('Salário e benefícios', 'Negativo'), p('Clima e colegas', 'Negativo'), p('Outros', 'Neutro')]
const clima = climaDosPontos(pontos)
ok('clima: quantos pontos de cada sentimento', clima.total === 6 && clima.negativo === 3 && clima.positivo === 1 && clima.sugestao === 1 && clima.neutro === 1)
const temas = temasDosPontos(pontos)
ok('temas: do mais citado para o menos; no empate, o que tem mais crítica', temas.map((t) => `${t.categoria}:${t.total}`).join() === 'Clima e colegas:2,Escala e horários:2,Salário e benefícios:1,Outros:1'
  && temas[0].negativo === 1 && temas[0].positivo === 1, temas.map((t) => `${t.categoria}:${t.total}`))
ok('dia legível', formatarDia('2026-10-12') === '12/10/2026')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nequipe (tela): tudo certo')
process.exit(falhas ? 1 : 0)
