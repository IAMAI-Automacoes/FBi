/**
 * Testes das regras da tela de Equipe (src/lib/equipe.ts).
 *   node --experimental-strip-types src/lib/__testes__/equipe.teste.ts
 */
import {
  contasDoEnvio, formatarAteQuando, fraseDeRespostas, fraseDoPrazo, lerListaColada, podeReceber, situacaoDoFuncionario, type ConviteAnonimo,
} from '../equipe.ts'
import { caminhoDoPublico, ehRotaDaEquipe, levaOPublico, TABELAS_COM_PUBLICO } from '../publico-rota.ts'

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

// Até quando a pessoa pode escolher ficar anônima (hora de Brasília)
ok('prazo da escolha: dia e hora de Brasília', formatarAteQuando('2026-10-13T18:05:00Z') === '13/10 às 15:05', formatarAteQuando('2026-10-13T18:05:00Z'))
ok('prazo da escolha: vira o dia em Brasília, não em UTC', formatarAteQuando('2026-10-14T02:30:00Z') === '13/10 às 23:30', formatarAteQuando('2026-10-14T02:30:00Z'))
ok('prazo da escolha: data inválida não quebra', formatarAteQuando('') === '' && formatarAteQuando('ontem') === '')

ok('prazo por extenso: horas, 1 hora e dias inteiros', fraseDoPrazo(24) === '24 horas' && fraseDoPrazo(1) === '1 hora' && fraseDoPrazo(48) === '2 dias' && fraseDoPrazo(72) === '3 dias' && fraseDoPrazo(36) === '36 horas')
ok('prazo por extenso: sem valor, vale o padrão de 24 horas', fraseDoPrazo(undefined) === '24 horas' && fraseDoPrazo(null) === '24 horas' && fraseDoPrazo(0) === '24 horas' && fraseDoPrazo(NaN) === '24 horas')

// De que público é a página (é isso que separa os dados no banco)
ok('rota da equipe: /equipe e tudo que fica dentro', ['/equipe', '/equipe/', '/equipe/feedbacks', '/equipe/insights', '/equipe/acoes', '/equipe/acoes/arquivadas'].every(ehRotaDaEquipe))
ok('rota da equipe: as páginas dos clientes não são', ['/', '/feedbacks', '/insights', '/acoes', '/acoes/arquivadas', '/whatsapp', '/admin', '/garcons'].every((c) => !ehRotaDaEquipe(c)))
ok('rota da equipe: nome parecido não engana', !ehRotaDaEquipe('/equipes') && !ehRotaDaEquipe('/minha-equipe') && !ehRotaDaEquipe('/equipefeedbacks'))
ok('rota da equipe: funciona com o site numa subpasta', ehRotaDaEquipe('/app/equipe/feedbacks') && !ehRotaDaEquipe('/app/feedbacks'))
ok('link entre as páginas acompanha o público', caminhoDoPublico('equipe', '/acoes') === '/equipe/acoes' && caminhoDoPublico('cliente', '/acoes') === '/acoes'
  && caminhoDoPublico('equipe', '/feedbacks') === '/equipe/feedbacks')
ok('o público só vai nas chamadas ao banco', levaOPublico('https://x.supabase.co/rest/v1/insights?select=*')
  && !levaOPublico('https://x.supabase.co/functions/v1/gerar-insights') && !levaOPublico('https://x.supabase.co/auth/v1/token') && !levaOPublico('https://x.supabase.co/storage/v1/object/a'))
ok('as cinco tabelas do motor têm público (e as duas de ligação acompanham)', ['feedbacks_originais', 'feedbacks_restaurante', 'feedback_temas', 'insights', 'acoes_operacionais', 'insight_feedback', 'feedback_acao']
  .every((x) => TABELAS_COM_PUBLICO.has(x)) && !TABELAS_COM_PUBLICO.has('equipe_funcionarios') && !TABELAS_COM_PUBLICO.has('mensagens_whatsapp'))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nequipe (tela): tudo certo')
process.exit(falhas ? 1 : 0)
