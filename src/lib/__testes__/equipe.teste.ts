/**
 * Testes das regras da tela de Equipe (src/lib/equipe.ts).
 *   node --experimental-strip-types src/lib/__testes__/equipe.teste.ts
 */
import {
  AVISO_MAX, AVISO_MIN, avisoDoDiaDoMes, contasDoEnvio, DIA_COMECO_DO_MES, DIA_ESPECIFICO_SUGERIDO, diaDoMesDe, DIAS_ESPECIFICOS, formatarAteQuando, fraseDeRespostas,
  fraseDoPrazo, FREQUENCIAS, lerListaColada, MENSAL, PERGUNTA_MAX, PERGUNTA_MIN,
  NOME_DA_REGRA_MAX, pessoasDaRegra, podeReceber, quantasRecebem, resumoDaFrequencia, resumoDasPessoas, resumoDosPedidos, ROTULO_FREQUENCIA, situacaoDoFuncionario,
  tituloDaRegra, type ConviteAnonimo,
} from '../equipe.ts'
import * as servidor from '../../../supabase/functions/_shared/equipe.ts'
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

// A tela e a função equipe usam os mesmos limites
ok('pergunta, aviso e frequências: os mesmos números da função equipe', PERGUNTA_MIN === servidor.PERGUNTA_MIN && PERGUNTA_MAX === servidor.PERGUNTA_MAX
  && AVISO_MIN === servidor.AVISO_MIN && AVISO_MAX === servidor.AVISO_MAX && FREQUENCIAS.join() === servidor.FREQUENCIAS_AUTOMATICAS.join())
ok('frequência por extenso', ROTULO_FREQUENCIA[7] === 'Toda semana' && ROTULO_FREQUENCIA[14] === 'A cada 15 dias' && ROTULO_FREQUENCIA[30] === 'Todo mês')

// Pedido mensal: o dia do mês
ok('mensal: a mesma frequência e a mesma regra de dia da função equipe', MENSAL === servidor.MENSAL
  && [1, 2, 15, 31].every((d) => diaDoMesDe(d) === servidor.diaDoMesValido(d)) && [0, 32, 1.5, 'x', null, undefined].every((d) => servidor.diaDoMesValido(d) === null && diaDoMesDe(d) === DIA_COMECO_DO_MES))
ok('dias de "Em um dia específico": do 2 ao 31, todos aceitos pela função, e o sugerido está entre eles', DIAS_ESPECIFICOS.length === 30 && DIAS_ESPECIFICOS[0] === 2 && DIAS_ESPECIFICOS[29] === 31
  && DIAS_ESPECIFICOS.every((d) => servidor.diaDoMesValido(d) === d) && DIAS_ESPECIFICOS.includes(DIA_ESPECIFICO_SUGERIDO) && !DIAS_ESPECIFICOS.includes(DIA_COMECO_DO_MES))
ok('resumo da frequência: o mensal diz o dia', resumoDaFrequencia(7, 20) === 'Toda semana' && resumoDaFrequencia(14) === 'A cada 15 dias'
  && resumoDaFrequencia(30) === 'Todo mês, no começo do mês' && resumoDaFrequencia(30, 1) === 'Todo mês, no começo do mês' && resumoDaFrequencia(30, 15) === 'Todo mês, no dia 15' && resumoDaFrequencia(30, null) === 'Todo mês, no começo do mês')
ok('aviso do dia que não existe em todo mês: só do 29 em diante', avisoDoDiaDoMes(28) === null && avisoDoDiaDoMes(1) === null
  && avisoDoDiaDoMes(29)!.includes('dia 29') && avisoDoDiaDoMes(31)!.includes('último dia do mês'))

// Visão Geral da equipe: os números dos pedidos de feedback
const envio = (id: number, tipo: 'pedido' | 'aviso', criado_em: string, status = 'concluido') => ({ id, tipo, status: status as 'concluido', criado_em })
const cv = (envio_id: number, respondeu: boolean, status: ConviteAnonimo['status'] = 'enviado'): ConviteAnonimo => ({ envio_id, status, respondeu })
let rp = resumoDosPedidos(
  [envio(1, 'pedido', '2026-10-01T12:00:00Z'), envio(2, 'pedido', '2026-10-10T12:00:00Z'), envio(3, 'aviso', '2026-10-11T12:00:00Z'), envio(4, 'pedido', '2026-10-12T12:00:00Z', 'cancelado')],
  [cv(1, true), cv(1, false), cv(2, true), cv(2, true), cv(2, false), cv(2, false, 'falhou'), cv(3, false), cv(3, false), cv(4, true)],
)
ok('resumo dos pedidos: o último é o pedido mais recente (aviso e cancelado não contam)', rp.pedidos === 2 && rp.ultimo?.criado_em === '2026-10-10T12:00:00Z'
  && rp.ultimo.contas.enviados === 3 && rp.ultimo.contas.responderam === 2 && Math.round(rp.ultimo.contas.taxa * 100) === 67, rp)
ok('resumo dos pedidos: a taxa geral soma só os pedidos', rp.geral.enviados === 5 && rp.geral.responderam === 3 && rp.geral.falharam === 1)
rp = resumoDosPedidos([envio(3, 'aviso', '2026-10-11T12:00:00Z')], [cv(3, false)])
ok('resumo dos pedidos: só aviso (ou nada) é "nenhum pedido ainda"', rp.pedidos === 0 && rp.ultimo === null && rp.geral.enviados === 0 && resumoDosPedidos([], []).ultimo === null)

// Até quando a pessoa pode escolher ficar anônima (hora de Brasília)
ok('prazo da escolha: dia e hora de Brasília', formatarAteQuando('2026-10-13T18:05:00Z') === '13/10 às 15:05', formatarAteQuando('2026-10-13T18:05:00Z'))
ok('prazo da escolha: vira o dia em Brasília, não em UTC', formatarAteQuando('2026-10-14T02:30:00Z') === '13/10 às 23:30', formatarAteQuando('2026-10-14T02:30:00Z'))
ok('prazo da escolha: data inválida não quebra', formatarAteQuando('') === '' && formatarAteQuando('ontem') === '')

ok('prazo por extenso: horas, 1 hora e dias inteiros', fraseDoPrazo(24) === '24 horas' && fraseDoPrazo(1) === '1 hora' && fraseDoPrazo(48) === '2 dias' && fraseDoPrazo(72) === '3 dias' && fraseDoPrazo(36) === '36 horas')
ok('prazo por extenso: sem valor, vale o padrão de 24 horas', fraseDoPrazo(undefined) === '24 horas' && fraseDoPrazo(null) === '24 horas' && fraseDoPrazo(0) === '24 horas' && fraseDoPrazo(NaN) === '24 horas')

// De que público é a página (é isso que separa os dados no banco)
ok('rota da equipe: /equipe e tudo que fica dentro', ['/equipe', '/equipe/', '/equipe/feedbacks', '/equipe/insights', '/equipe/acoes', '/equipe/acoes/arquivadas', '/equipe/funcionarios'].every(ehRotaDaEquipe))
ok('rota da equipe: as páginas dos clientes não são', ['/', '/feedbacks', '/insights', '/acoes', '/acoes/arquivadas', '/whatsapp', '/admin', '/garcons'].every((c) => !ehRotaDaEquipe(c)))
ok('rota da equipe: nome parecido não engana', !ehRotaDaEquipe('/equipes') && !ehRotaDaEquipe('/minha-equipe') && !ehRotaDaEquipe('/equipefeedbacks'))
ok('rota da equipe: funciona com o site numa subpasta', ehRotaDaEquipe('/app/equipe/feedbacks') && !ehRotaDaEquipe('/app/feedbacks'))
ok('link entre as páginas acompanha o público', caminhoDoPublico('equipe', '/acoes') === '/equipe/acoes' && caminhoDoPublico('cliente', '/acoes') === '/acoes'
  && caminhoDoPublico('equipe', '/feedbacks') === '/equipe/feedbacks')
ok('o público só vai nas chamadas ao banco', levaOPublico('https://x.supabase.co/rest/v1/insights?select=*')
  && !levaOPublico('https://x.supabase.co/functions/v1/gerar-insights') && !levaOPublico('https://x.supabase.co/auth/v1/token') && !levaOPublico('https://x.supabase.co/storage/v1/object/a'))
ok('as cinco tabelas do motor têm público (e as duas de ligação acompanham)', ['feedbacks_originais', 'feedbacks_restaurante', 'feedback_temas', 'insights', 'acoes_operacionais', 'insight_feedback', 'feedback_acao']
  .every((x) => TABELAS_COM_PUBLICO.has(x)) && !TABELAS_COM_PUBLICO.has('equipe_funcionarios') && !TABELAS_COM_PUBLICO.has('mensagens_whatsapp'))

// Regras de pedido automático
const GENTE = [
  { id: 1, nome: 'Ana Paula Souza', ativo: true, opt_out_em: null },
  { id: 2, nome: 'Bruno', ativo: true, opt_out_em: null },
  { id: 3, nome: 'Caio Lima', ativo: false, opt_out_em: null },
  { id: 4, nome: 'Duda', ativo: true, opt_out_em: '2026-10-01T00:00:00Z' },
  { id: 5, nome: 'Edu', ativo: true, opt_out_em: null },
]
ok('título da regra: o nome dado ou a frequência', tituloDaRegra({ nome: '  Cozinha,   toda semana ', cada_dias: 7, dia_do_mes: 1 }) === 'Cozinha, toda semana'
  && tituloDaRegra({ nome: '', cada_dias: 30, dia_do_mes: 15 }) === 'Todo mês, no dia 15' && tituloDaRegra({ nome: ' ', cada_dias: 14, dia_do_mes: 1 }) === 'A cada 15 dias')
ok('nome da regra: até 60 letras, igual ao banco e à função', NOME_DA_REGRA_MAX === 60)
ok('pessoas da regra: só quem ainda está no cadastro, na ordem do cadastro', pessoasDaRegra([5, 1, 99], GENTE).map((f) => f.id).join() === '1,5')
ok('resumo das pessoas: um, dois, três e "mais N", só com nome e sobrenome', resumoDasPessoas([1], GENTE) === 'Ana Paula'
  && resumoDasPessoas([1, 2], GENTE) === 'Ana Paula e Bruno' && resumoDasPessoas([1, 2, 3], GENTE) === 'Ana Paula, Bruno e Caio Lima'
  && resumoDasPessoas([1, 2, 3, 4, 5], GENTE) === 'Ana Paula, Bruno e mais 3')
ok('resumo das pessoas: todas removidas do cadastro', resumoDasPessoas([98, 99], GENTE).startsWith('Ninguém') && resumoDasPessoas([], GENTE).startsWith('Ninguém'))
ok('quantas recebem hoje: tira desativado e quem pediu PARAR', quantasRecebem([1, 2, 3, 4, 5], GENTE) === 3 && quantasRecebem([3, 4], GENTE) === 0 && quantasRecebem([], GENTE) === 0)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nequipe (tela): tudo certo')
process.exit(falhas ? 1 : 0)
