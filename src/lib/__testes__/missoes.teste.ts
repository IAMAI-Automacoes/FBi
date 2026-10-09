/**
 * Testes das regras da tela de Missões de vídeo (src/lib/missoes.ts).
 *   node --experimental-strip-types src/lib/__testes__/missoes.teste.ts
 */
import {
  escadaDePremios, formatarDuracao, formatarTamanho, idDoRequisito, lerRequisitos, LIMITE_BYTES, mimeDoArquivo,
  podeMandar, problemaDoArquivo, situacaoDaMissao, type EnvioVideo, type PremioVideo,
} from '../missoes.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

ok('requisitos: só os com texto', lerRequisitos([{ id: 'a', texto: 'X' }, { texto: ' ' }, { texto: 'Y' }]).map((r) => r.id).join() === 'a,r3')
ok('id do requisito sai do texto, sem acento', idDoRequisito('Fala o nome "EasyFeed" em voz alta') === 'fala_o_nome_easyfeed_em_voz_al')
ok('id do requisito não repete', idDoRequisito('Rosto', ['rosto']) === 'rosto_2' && idDoRequisito('!!!') === 'requisito')

ok('tipo: MOV do iPhone sem tipo vira quicktime', mimeDoArquivo('IMG_0001.MOV', '') === 'video/quicktime')
ok('tipo: imagem não é vídeo', mimeDoArquivo('foto.jpg', 'image/jpeg') === '')
const arq = { nome: 'v.mp4', tipo: 'video/mp4', tamanho: 50 * 1024 * 1024, duracao: 45 }
ok('arquivo bom: sem problema', problemaDoArquivo(arq) === null)
ok('arquivo que não é vídeo', problemaDoArquivo({ ...arq, nome: 'a.pdf', tipo: 'application/pdf' })!.includes('não é um vídeo'))
ok('passou de 300 MB: diz o tamanho', problemaDoArquivo({ ...arq, tamanho: LIMITE_BYTES + 5 * 1024 * 1024 })!.includes('305 MB'))
ok('passou de 3 min: diz a duração', problemaDoArquivo({ ...arq, duracao: 200 })!.includes('3 min 20 s'))
ok('duração desconhecida não trava', problemaDoArquivo({ ...arq, duracao: null }) === null)
ok('tamanho e duração legíveis', formatarTamanho(5.25 * 1024 * 1024) === '5,3 MB' && formatarTamanho(2048) === '2 KB' && formatarDuracao(45) === '45 s' && formatarDuracao(120) === '2 min')

const envio = (id: string, missao: number, status: EnvioVideo['status'], dia: number): EnvioVideo => ({
  id, restaurante_id: 11, missao_id: missao, caminho: `restaurante_11/${id}.mp4`, nome_arquivo: 'v.mp4', tamanho_bytes: 1, duracao_segundos: 40,
  status, analise: null, motivo: null, analisado_em: null, revisado_por: null, criado_em: `2026-10-${String(dia).padStart(2, '0')}T10:00:00Z`,
})
ok('missão sem envio: não enviada', situacaoDaMissao(1, []).situacao === 'nao_enviada')
ok('envio ainda subindo não conta', situacaoDaMissao(1, [envio('a', 1, 'enviando', 1)]).situacao === 'nao_enviada')
ok('último envio em análise', situacaoDaMissao(1, [envio('a', 1, 'reprovado', 1), envio('b', 1, 'analisando', 2)]).situacao === 'analisando')
ok('aprovada vale mesmo com reprovações depois', situacaoDaMissao(1, [envio('a', 1, 'aprovado', 1), envio('b', 1, 'reprovado', 2)]).situacao === 'aprovada')
const rep = situacaoDaMissao(1, [envio('a', 1, 'reprovado', 1), envio('b', 1, 'reprovado', 2)])
ok('reprovada: mostra o último e as tentativas que sobram', rep.situacao === 'reprovada' && rep.ultimo?.id === 'b' && rep.tentativasRestantes === 3)
ok('5 reprovações: sem tentativas', situacaoDaMissao(1, [1, 2, 3, 4, 5].map((d) => envio(`r${d}`, 1, 'reprovado', d))).situacao === 'sem_tentativas')
ok('erro da análise: em revisão (pode mandar outro)', situacaoDaMissao(1, [envio('a', 1, 'erro', 1)]).situacao === 'em_revisao' && podeMandar('em_revisao'))
ok('outra missão não interfere', situacaoDaMissao(2, [envio('a', 1, 'aprovado', 1)]).situacao === 'nao_enviada')
ok('não pode mandar em análise, aprovada ou sem tentativas', !podeMandar('analisando') && !podeMandar('aprovada') && !podeMandar('sem_tentativas'))

const recompensas = [{ ordem: 2, descricao: '20%' }, { ordem: 1, descricao: '10%' }, { ordem: 3, descricao: '1 mês grátis' }]
const premio = (ordem: number, status: PremioVideo['status'], descricao = `p${ordem}`): PremioVideo => ({
  id: `p${ordem}`, restaurante_id: 11, recompensa_ordem: ordem, descricao, envio_id: `e${ordem}`, status, aplicado_em: null, criado_em: '2026-10-01T00:00:00Z',
})
let esc = escadaDePremios(recompensas, [], 0)
ok('nenhuma missão: a 1ª é a próxima, as outras depois (em ordem)', esc.map((d) => `${d.ordem}:${d.estado}:${d.faltam}`).join() === '1:proximo:1,2:futuro:2,3:futuro:3')
esc = escadaDePremios(recompensas, [premio(1, 'aplicado', '10% (texto da época)'), premio(2, 'pendente')], 2)
ok('ganhos: aplicado e pendente com o texto da época; o 3º é o próximo', esc.map((d) => `${d.ordem}:${d.estado}`).join() === '1:aplicado,2:pendente,3:proximo' && esc[0].descricao === '10% (texto da época)')
esc = escadaDePremios(recompensas, [premio(1, 'cancelado')], 0)
ok('prêmio cancelado não conta como ganho', esc[0].estado === 'proximo')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nmissões (tela): tudo certo')
process.exit(falhas ? 1 : 0)
