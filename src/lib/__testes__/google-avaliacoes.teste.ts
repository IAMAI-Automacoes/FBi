/**
 * Testes da página Google: filtro de data, total de cada filtro e limite da resposta.
 *   node --experimental-strip-types src/lib/__testes__/google-avaliacoes.teste.ts
 */
import { intervaloDoPeriodo, LIMITE_RESPOSTA_BYTES, restanteDaResposta, respostaPublicavel, totalDoFiltro } from '../google-avaliacoes.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

ok('resposta: o limite é em bytes (acento conta 2)', restanteDaResposta('é') === LIMITE_RESPOSTA_BYTES - 2 && restanteDaResposta('  oi  ') === LIMITE_RESPOSTA_BYTES - 2)
ok('resposta publicável: tem texto e cabe', respostaPublicavel('Obrigado!') && !respostaPublicavel('   ') && !respostaPublicavel('a'.repeat(LIMITE_RESPOSTA_BYTES + 1)))

// Filtro de data: igual a /feedbacks.
{
  const agora = new Date(2026, 9, 16, 15, 30) // 16/10/2026 15:30
  const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}` : null)
  const sete = intervaloDoPeriodo('7d', undefined, agora)
  ok('últimos 7 dias: do início do dia de 7 dias atrás, sem fim', iso(sete.de) === '2026-10-9 0:0' && sete.ate === null, [iso(sete.de), sete.ate])
  ok('30 e 90 dias', iso(intervaloDoPeriodo('30d', undefined, agora).de) === '2026-9-16 0:0' && iso(intervaloDoPeriodo('90d', undefined, agora).de) === '2026-7-18 0:0')
  const tudo = intervaloDoPeriodo('all', undefined, agora)
  ok('todo o período: sem corte', tudo.de === null && tudo.ate === null)
  const intervalo = intervaloDoPeriodo('7d', { from: new Date(2026, 8, 1, 18), to: new Date(2026, 8, 30, 9) }, agora)
  ok('intervalo do calendário: do início do 1º dia ao fim do último (e vence o atalho)', iso(intervalo.de) === '2026-9-1 0:0' && iso(intervalo.ate) === '2026-10-1 0:0', [iso(intervalo.de), iso(intervalo.ate)])
  const umDia = intervaloDoPeriodo('all', { from: new Date(2026, 9, 5, 12) }, agora)
  ok('um dia só: o dia inteiro', iso(umDia.de) === '2026-10-5 0:0' && iso(umDia.ate) === '2026-10-6 0:0')
}
{
  const n = { estrelas: [3, 0, 2, 9, 69], quantidade: 83, media: 4.7, respondidas: 39, semResposta: 44, negativas: 5, comComentario: 36, ultimaEm: null }
  ok('total de cada filtro no período', totalDoFiltro(n, 'todas') === 83 && totalDoFiltro(n, 'sem_resposta') === 44 && totalDoFiltro(n, 'negativas') === 5
    && totalDoFiltro(n, 'com_comentario') === 36 && totalDoFiltro(n, 5) === 69 && totalDoFiltro(n, 2) === 0)
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
