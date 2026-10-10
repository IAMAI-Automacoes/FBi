/**
 * Testes das regras da tela de Missões de vídeo (src/lib/missoes.ts).
 *   node --experimental-strip-types src/lib/__testes__/missoes.teste.ts
 */
import {
  aprovadosNoAno, duracaoDaMissao, escadaDePremios, estadoDoPeriodo, formatarDuracao, formatarTamanho, hojeSP, idDoRequisito,
  inicioDoAnoSP, lerRequisitos, LIMITE_BYTES, mimeDoArquivo, missaoDisponivel, noPeriodo, podeMandar,
  problemaDoArquivo, proximaMissao, rotuloDuracao, rotuloPeriodo, situacaoDaMissao, type EnvioVideo, type Missao, type PremioVideo,
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
const lim = duracaoDaMissao({ duracao_min_s: 30, duracao_max_s: 60 })
ok('missão de 30 s a 1 min: curto demais', problemaDoArquivo({ ...arq, duracao: 20 }, lim)!.includes('pelo menos 30 s'))
ok('missão de 30 s a 1 min: longo demais', problemaDoArquivo({ ...arq, duracao: 75 }, lim)!.includes('máximo desta missão é 1 min'))
ok('missão de 30 s a 1 min: 45 s passa', problemaDoArquivo({ ...arq, duracao: 45 }, lim) === null)
ok('duração: sem nada é até 3 min; máximo nunca passa de 5 min', duracaoDaMissao({ duracao_min_s: null, duracao_max_s: null }).max === 180 && duracaoDaMissao({ duracao_min_s: null, duracao_max_s: 999 }).max === 300)
ok('rótulo da duração', rotuloDuracao({ duracao_min_s: 30, duracao_max_s: 120 }) === 'De 30 s a 2 min' && rotuloDuracao({ duracao_min_s: null, duracao_max_s: null }) === 'Até 3 min')

// Período e datas de Brasília
ok('hoje em Brasília (23h de 31/12 ainda é 31/12)', hojeSP(Date.parse('2027-01-01T02:00:00Z')) === '2026-12-31')
ok('o ano começa à meia-noite de Brasília', inicioDoAnoSP(Date.parse('2026-10-10T12:00:00Z')) === '2026-01-01T00:00:00-03:00')
const m = (over: Partial<Missao> = {}): Missao => ({ id: 1, titulo: 'X', descricao: '', requisitos: [], ordem: 1, ativa: true, duracao_min_s: null, duracao_max_s: null, disponivel_de: null, disponivel_ate: null, ...over })
ok('período inclusive nas duas pontas', noPeriodo(m({ disponivel_de: '2026-10-01', disponivel_ate: '2026-10-31' }), '2026-10-31') && !noPeriodo(m({ disponivel_ate: '2026-10-31' }), '2026-11-01'))
ok('disponível: ativa e no período', missaoDisponivel(m(), '2026-10-10') && !missaoDisponivel(m({ ativa: false }), '2026-10-10') && !missaoDisponivel(m({ disponivel_de: '2026-11-01' }), '2026-10-10'))
ok('rótulo do período', rotuloPeriodo(m({ disponivel_ate: '2026-10-31' })) === 'Até 31/10' && rotuloPeriodo(m({ disponivel_de: '2026-11-01', disponivel_ate: '2026-11-30' })) === 'De 01/11 a 30/11'
  && rotuloPeriodo(m({ disponivel_de: '2026-11-01' })) === 'A partir de 01/11' && rotuloPeriodo(m()) === null)
ok('estado do período para o admin', estadoDoPeriodo(m(), '2026-10-10') === 'sempre' && estadoDoPeriodo(m({ disponivel_de: '2026-11-01' }), '2026-10-10') === 'agendada'
  && estadoDoPeriodo(m({ disponivel_ate: '2026-10-09' }), '2026-10-10') === 'encerrada' && estadoDoPeriodo(m({ disponivel_ate: '2026-10-10' }), '2026-10-10') === 'no_ar')
ok('tamanho e duração legíveis', formatarTamanho(5.25 * 1024 * 1024) === '5,3 MB' && formatarTamanho(2048) === '2 KB' && formatarDuracao(45) === '45 s' && formatarDuracao(120) === '2 min')

const envio = (id: string, missao: number, status: EnvioVideo['status'], dia: number): EnvioVideo => ({
  id, restaurante_id: 11, missao_id: missao, caminho: `restaurante_11/${id}.mp4`, nome_arquivo: 'v.mp4', tamanho_bytes: 1, duracao_segundos: 40,
  status, analise: null, motivo: null, analisado_em: null, revisado_por: null, criado_em: `2026-10-${String(dia).padStart(2, '0')}T10:00:00Z`,
  aprovado_em: status === 'aprovado' ? `2026-10-${String(dia).padStart(2, '0')}T11:00:00Z` : null,
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
const fila = [m({ id: 7, ordem: 3 }), m({ id: 5, ordem: 1 }), m({ id: 6, ordem: 2 }), m({ id: 4, ordem: 0, ativa: false })]
const prox = (envios: EnvioVideo[], missoes = fila) => proximaMissao(missoes, envios, '2026-10-10')?.id ?? null
ok('fila: sem envios, a primeira pela ordem (desativada não entra)', prox([]) === 5)
ok('fila: cumpriu a 1ª, aparece só a 2ª', prox([envio('a', 5, 'aprovado', 1)]) === 6)
ok('fila: em análise, reprovada ou em revisão continua a da vez', prox([envio('a', 5, 'analisando', 1)]) === 5 && prox([envio('a', 5, 'reprovado', 1), envio('b', 5, 'erro', 2)]) === 5)
ok('fila: sem tentativas pula para a próxima', prox([1, 2, 3, 4, 5].map((d) => envio(`r${d}`, 5, 'reprovado', d))) === 6)
ok('fila: cumpriu todas, nenhuma', prox([envio('a', 5, 'aprovado', 1), envio('b', 6, 'aprovado', 2), envio('c', 7, 'aprovado', 3)]) === null)
ok('fila: fora do período é pulada', prox([], [m({ id: 5, ordem: 1, disponivel_de: '2026-11-01' }), m({ id: 6, ordem: 2 })]) === 6)
ok('aprovados no ano: só os aprovados deste ano', aprovadosNoAno([envio('a', 1, 'aprovado', 1), envio('b', 2, 'reprovado', 2), { ...envio('c', 3, 'aprovado', 3), aprovado_em: '2025-12-31T12:00:00Z' }], '2026-01-01T00:00:00-03:00') === 1)

const recompensas = [{ ordem: 2, descricao: '20%' }, { ordem: 1, descricao: '10%' }, { ordem: 3, descricao: '1 mês grátis' }]
const premio = (ordem: number, status: PremioVideo['status'], descricao = `p${ordem}`, ano = 2026): PremioVideo => ({
  id: `p${ordem}-${ano}`, restaurante_id: 11, recompensa_ordem: ordem, ano, descricao, envio_id: `e${ordem}`, status, aplicado_em: null, criado_em: '2026-10-01T00:00:00Z',
})
let esc = escadaDePremios(recompensas, [], 0, 2026)
ok('nenhuma missão: a 1ª é a próxima, as outras depois (em ordem)', esc.map((d) => `${d.ordem}:${d.estado}:${d.faltam}`).join() === '1:proximo:1,2:futuro:2,3:futuro:3')
esc = escadaDePremios(recompensas, [premio(1, 'aplicado', '10% (texto da época)'), premio(2, 'pendente')], 2, 2026)
ok('ganhos: aplicado e pendente com o texto da época; o 3º é o próximo', esc.map((d) => `${d.ordem}:${d.estado}`).join() === '1:aplicado,2:pendente,3:proximo' && esc[0].descricao === '10% (texto da época)')
esc = escadaDePremios(recompensas, [premio(1, 'cancelado')], 0, 2026)
ok('prêmio cancelado não conta como ganho', esc[0].estado === 'proximo')
esc = escadaDePremios(recompensas, [premio(1, 'aplicado', 'do ano passado', 2025), premio(2, 'aplicado', 'do ano passado', 2025)], 0, 2026)
ok('a escada recomeça no ano novo: prêmios de 2025 não contam em 2026', esc.map((d) => d.estado).join() === 'proximo,futuro,futuro')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nmissões (tela): tudo certo')
process.exit(falhas ? 1 : 0)
