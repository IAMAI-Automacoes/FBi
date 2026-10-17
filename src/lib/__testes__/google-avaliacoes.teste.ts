/**
 * Testes da lista de avaliações do Google (filtros, contagens, limite da resposta).
 *   node --experimental-strip-types src/lib/__testes__/google-avaliacoes.teste.ts
 */
import {
  contarFiltros, ehNegativa, filtrarAvaliacoes, LIMITE_RESPOSTA_BYTES, restanteDaResposta, respostaPublicavel, taxaDeResposta,
} from '../google-avaliacoes.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const lista = [
  { id: 'a', nota: 5, comentario: 'Ótimo!', resposta: 'Obrigado!' },
  { id: 'b', nota: 5, comentario: null, resposta: null },
  { id: 'c', nota: 1, comentario: 'Demorou muito.', resposta: null },
  { id: 'd', nota: 3, comentario: null, resposta: 'Sentimos muito.' },
  { id: 'e', nota: 4, comentario: 'Bom.', resposta: null },
]
const ids = (l: Array<{ id: string }>) => l.map((a) => a.id).join()

ok('todas: a lista inteira, na mesma ordem', ids(filtrarAvaliacoes(lista, 'todas')) === 'a,b,c,d,e')
ok('sem resposta: só as que ainda não foram respondidas', ids(filtrarAvaliacoes(lista, 'sem_resposta')) === 'b,c,e')
ok('negativas: de 1 a 3 estrelas', ids(filtrarAvaliacoes(lista, 'negativas')) === 'c,d' && ehNegativa({ nota: 3 }) && !ehNegativa({ nota: 4 }))
ok('com comentário: só as que têm texto', ids(filtrarAvaliacoes(lista, 'com_comentario')) === 'a,c,e')
ok('por estrela: só aquela nota', ids(filtrarAvaliacoes(lista, 5)) === 'a,b' && filtrarAvaliacoes(lista, 2).length === 0)
ok('contagem de cada filtro', JSON.stringify(contarFiltros(lista)) === JSON.stringify({ todas: 5, sem_resposta: 3, negativas: 2, com_comentario: 3 }))
ok('taxa de resposta: respondidas / total', taxaDeResposta(lista) === 0.4 && taxaDeResposta([]) === null)
ok('resposta: o limite é em bytes (acento conta 2)', restanteDaResposta('é') === LIMITE_RESPOSTA_BYTES - 2 && restanteDaResposta('  oi  ') === LIMITE_RESPOSTA_BYTES - 2)
ok('resposta publicável: tem texto e cabe', respostaPublicavel('Obrigado!') && !respostaPublicavel('   ') && !respostaPublicavel('a'.repeat(LIMITE_RESPOSTA_BYTES + 1)))

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
if (falhas > 0) process.exit(1)
