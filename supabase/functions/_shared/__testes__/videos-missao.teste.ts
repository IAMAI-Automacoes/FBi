/**
 * Testes das missões de vídeo: regras (_shared/videos-missao.ts) e a função
 * videos-missao (handler), com banco, Storage e IA de mentira.
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/videos-missao.teste.ts
 */
import {
  caminhoDoEnvio, contagemDoAno, decidirResultado, duracaoDaMissao, emBlocos, hojeSP, inicioDoAnoSP, lerRequisitos,
  LIMITE_BYTES, MAX_REPROVADOS, mimeDoVideo, montarPromptAnalise, noPeriodo, podeEnviar, proximaMissao,
  type EnvioResumo, type Missao,
} from '../videos-missao.ts'
import { tratarVideos, type DepsVideos, type EnvioCompleto } from '../../videos-missao/handler.ts'
import { perguntarSobreVideo } from '../gemini.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

const AGORA = Date.parse('2026-10-10T15:00:00Z')
const MISSAO: Missao = {
  id: 1,
  titulo: 'Depoimento sobre o EasyFeed',
  descricao: 'Conte como o EasyFeed ajuda.',
  ativa: true,
  requisitos: [
    { id: 'nome', texto: 'Fala o nome "EasyFeed" em voz alta' },
    { id: 'rosto', texto: 'Quem fala aparece no vídeo' },
    { id: 'duracao', texto: 'O vídeo tem pelo menos 30 segundos.' },
  ],
}
const envioR = (status: string, minutosAtras = 1): EnvioResumo => ({
  id: `e-${status}-${minutosAtras}`, status, criado_em: new Date(AGORA - minutosAtras * 60_000).toISOString(),
})

// ── Regras ───────────────────────────────────────────────────────────────────
const reqs = lerRequisitos([{ id: 'a', texto: ' Fala o nome ' }, { texto: '' }, { id: 'a', texto: 'Outro' }, { texto: 'Sem id' }, 'lixo'])
ok('requisitos: tira vazios e lixo, id único, texto aparado', reqs.length === 3 && reqs[0].texto === 'Fala o nome' && reqs[1].id === 'a_' && reqs[2].id === 'r4', reqs)
ok('requisitos: jsonb que não é lista vira []', lerRequisitos({ x: 1 }).length === 0 && lerRequisitos(null).length === 0)

ok('tipo: o do navegador vale se for de vídeo aceito', mimeDoVideo('video/quicktime', 'a.mov') === 'video/quicktime')
ok('tipo: vazio vai pela extensão (MOV do iPhone)', mimeDoVideo('', 'IMG_0001.MOV') === 'video/quicktime')
ok('tipo: imagem não passa', mimeDoVideo('image/png', 'foto.png') === '')
ok('caminho: pasta do restaurante e extensão do tipo', caminhoDoEnvio(11, 'abc', 'video/quicktime') === 'restaurante_11/abc.mov' && caminhoDoEnvio(11, 'abc', 'video/mp4') === 'restaurante_11/abc.mp4')

const base = {
  missao: MISSAO as Missao, envios: [] as EnvioResumo[], proximaId: 1 as number | null, ano: { aprovados: 0, emAnalise: 0 }, maxPorAno: 4 as number | null,
  hoje: '2026-10-10', mime: 'video/mp4', tamanho: 10_000_000, duracao: 45 as number | null, autorizou: true, agora: AGORA,
}
const motivo = (over: Partial<typeof base>) => { const r = podeEnviar({ ...base, ...over }); return r.ok ? 'ok' : r.motivo }
ok('pode enviar: tudo certo', motivo({}) === 'ok')
ok('missão desativada', motivo({ missao: { ...MISSAO, ativa: false } }) === 'missao_inativa' && motivo({ missao: null }) === 'missao_inativa')
ok('só a missão da vez aceita vídeo', motivo({ proximaId: 2 }) === 'nao_liberada' && motivo({ proximaId: null }) === 'nao_liberada')
ok('missão já cumprida diz isso (não "não liberada")', motivo({ envios: [envioR('aprovado')], proximaId: 2 }) === 'ja_aprovada')
ok('missão já cumprida', motivo({ envios: [envioR('reprovado'), envioR('aprovado')] }) === 'ja_aprovada')
ok('vídeo ainda em análise', motivo({ envios: [envioR('analisando', 3)] }) === 'em_analise')
ok('análise travada (mais de 15 min) libera', motivo({ envios: [envioR('analisando', 20)] }) === 'ok')
ok(`limite de ${MAX_REPROVADOS} reprovações`, motivo({ envios: Array.from({ length: MAX_REPROVADOS }, (_, i) => envioR('reprovado', i + 1)) }) === 'limite_tentativas'
  && motivo({ envios: Array.from({ length: MAX_REPROVADOS - 1 }, (_, i) => envioR('reprovado', i + 1)) }) === 'ok')
ok('erro do sistema não conta como tentativa', motivo({ envios: Array.from({ length: 9 }, (_, i) => envioR('erro', i + 1)) }) === 'ok')
ok('sem autorizar o uso', motivo({ autorizou: false }) === 'sem_autorizacao')
ok('não é vídeo', motivo({ mime: '' }) === 'tipo_invalido')
ok('arquivo vazio', motivo({ tamanho: 0 }) === 'arquivo_vazio')
ok('passa de 300 MB', motivo({ tamanho: LIMITE_BYTES + 1 }) === 'muito_grande' && motivo({ tamanho: LIMITE_BYTES }) === 'ok')
ok('passa de 3 minutos (sem duração definida na missão)', motivo({ duracao: 181 }) === 'muito_longo' && motivo({ duracao: null }) === 'ok')

// Ferramentas do admin: período, duração por missão, limite do ano
ok('fora do período da missão', motivo({ missao: { ...MISSAO, disponivel_ate: '2026-10-09' } }) === 'fora_do_periodo'
  && motivo({ missao: { ...MISSAO, disponivel_de: '2026-10-11' } }) === 'fora_do_periodo')
ok('no período (inclusive o último dia)', motivo({ missao: { ...MISSAO, disponivel_de: '2026-10-01', disponivel_ate: '2026-10-10' } }) === 'ok')
const curta = { ...MISSAO, duracao_min_s: 30, duracao_max_s: 60 }
ok('mais curto que o mínimo da missão', motivo({ missao: curta, duracao: 20 }) === 'muito_curto')
ok('mais longo que o máximo da missão', motivo({ missao: curta, duracao: 61 }) === 'muito_longo' && motivo({ missao: curta, duracao: 60 }) === 'ok')
ok('duração desconhecida não trava nem com mínimo', motivo({ missao: curta, duracao: null }) === 'ok')
ok('limite do ano: aprovados + em análise', motivo({ ano: { aprovados: 3, emAnalise: 1 } }) === 'limite_ano' && motivo({ ano: { aprovados: 3, emAnalise: 0 } }) === 'ok')
ok('sem limite no ano (vazio)', motivo({ ano: { aprovados: 40, emAnalise: 3 }, maxPorAno: null }) === 'ok')
ok('missão já cumprida vem antes do limite do ano', motivo({ envios: [envioR('aprovado')], ano: { aprovados: 9, emAnalise: 0 } }) === 'ja_aprovada')
ok('duração: máximo da missão nunca passa de 5 min; mínimo maior que o máximo é cortado',
  JSON.stringify(duracaoDaMissao({ duracao_min_s: null, duracao_max_s: 900 })) === '{"min":null,"max":300}'
  && JSON.stringify(duracaoDaMissao({ duracao_min_s: 400, duracao_max_s: 120 })) === '{"min":120,"max":120}'
  && duracaoDaMissao({}).max === 180)
ok('período: sem datas é sempre', noPeriodo({}, '2026-01-01') && !noPeriodo({ disponivel_ate: '2025-12-31' }, '2026-01-01'))
ok('hoje em Brasília (23h de 31/12 em Brasília ainda é 31/12)', hojeSP(Date.parse('2027-01-01T02:00:00Z')) === '2026-12-31' && hojeSP(Date.parse('2027-01-01T03:00:00Z')) === '2027-01-01')
ok('o ano recomeça em 1º de janeiro, meia-noite de Brasília', inicioDoAnoSP(AGORA) === '2026-01-01T00:00:00-03:00')
const doAno = contagemDoAno([
  { id: 'a', status: 'aprovado', criado_em: '2026-03-01T00:00:00Z', aprovado_em: '2026-03-02T00:00:00Z' },
  { id: 'b', status: 'aprovado', criado_em: '2025-12-30T00:00:00Z', aprovado_em: '2025-12-31T23:00:00-03:00' },
  { id: 'c', status: 'analisando', criado_em: new Date(AGORA - 60_000).toISOString() },
  { id: 'd', status: 'analisando', criado_em: new Date(AGORA - 40 * 60_000).toISOString() },
  { id: 'e', status: 'reprovado', criado_em: '2026-05-01T00:00:00Z' },
], inicioDoAnoSP(AGORA), AGORA)
ok('conta do ano: só aprovados deste ano e análises que não travaram', doAno.aprovados === 1 && doAno.emAnalise === 1, doAno)

// A fila de missões
const fila = [
  { id: 7, ativa: true, ordem: 3 },
  { id: 5, ativa: true, ordem: 1 },
  { id: 6, ativa: true, ordem: 2 },
  { id: 4, ativa: false, ordem: 0 },
]
const da = (missao_id: number, status: string) => ({ missao_id, status })
const prox = (envios: { missao_id: number; status: string }[], missoes = fila, hoje = '2026-10-10') => proximaMissao(missoes, envios, hoje)?.id ?? null
ok('fila: sem envios, a primeira pela ordem (desativada não entra)', prox([]) === 5)
ok('fila: cumpriu a 1ª, vem a 2ª', prox([da(5, 'aprovado')]) === 6)
ok('fila: em análise ou reprovada continua sendo a da vez', prox([da(5, 'analisando')]) === 5 && prox([da(5, 'reprovado'), da(5, 'erro')]) === 5)
ok(`fila: ${MAX_REPROVADOS} reprovações pula para a próxima`, prox(Array.from({ length: MAX_REPROVADOS }, () => da(5, 'reprovado'))) === 6)
ok('fila: cumpriu todas, null', prox([da(5, 'aprovado'), da(6, 'aprovado'), da(7, 'aprovado')]) === null)
ok('fila: fora do período é pulada', prox([], [{ id: 5, ativa: true, ordem: 1, disponivel_de: '2026-11-01' }, { id: 6, ativa: true, ordem: 2 }]) === 6)
ok('fila: mesma ordem desempata pelo id', prox([], [{ id: 9, ativa: true, ordem: 1 }, { id: 8, ativa: true, ordem: 1 }]) === 8)

const prompt = montarPromptAnalise(MISSAO)
ok('prompt: a missão e os requisitos numerados', prompt.includes('MISSÃO: Depoimento sobre o EasyFeed') && prompt.includes('1. Fala o nome "EasyFeed" em voz alta') && prompt.includes('3. O vídeo tem pelo menos 30 segundos.'))
ok('prompt: pede rigor e confere o conteúdo', prompt.includes('Na dúvida, false') && prompt.includes('conteudo_adequado'))
ok('prompt: o restaurante grava do jeito dele, só os requisitos contam', prompt.includes('liberdade para gravar do jeito que quiser') && prompt.includes('confira só se cada requisito foi cumprido') && !/roteiro/i.test(prompt))
ok('prompt: sem descrição não deixa linha solta', !montarPromptAnalise({ ...MISSAO, descricao: '  ' }).includes('EasyFeed\n\n\nREQUISITOS'))

const resposta = (cumpriu: boolean[], extra: Record<string, unknown> = {}) => ({
  requisitos: cumpriu.map((c, i) => ({ numero: i + 1, cumpriu: c, motivo: c ? 'Cumpriu.' : 'Não deu para ver.' })),
  conteudo_adequado: true, problema_conteudo: '', resumo: 'Dono fala do sistema na cozinha.', ...extra,
})
let v = decidirResultado(MISSAO, resposta([true, true, true]))
ok('tudo cumprido: aprovado', v.status === 'aprovado' && v.analise?.requisitos.every((r) => r.cumpriu) && v.motivo.startsWith('Missão cumprida'))
v = decidirResultado(MISSAO, JSON.stringify(resposta([true, false, false])))
ok('faltou requisito: reprovado, dizendo o que faltou', v.status === 'reprovado' && v.motivo === 'Quase lá! Faltou: Quem fala aparece no vídeo; O vídeo tem pelo menos 30 segundos.', v.motivo)
ok('cada requisito com o motivo da IA', v.analise?.requisitos[1].motivo === 'Não deu para ver.' && v.analise?.requisitos[1].id === 'rosto')
v = decidirResultado(MISSAO, resposta([true, true, true], { conteudo_adequado: false, problema_conteudo: 'É um vídeo de outra empresa.' }))
ok('conteúdo inadequado: reprovado mesmo cumprindo tudo', v.status === 'reprovado' && v.motivo === 'O vídeo não foi aceito: É um vídeo de outra empresa.')
ok('JSON com texto em volta ainda é lido', decidirResultado(MISSAO, 'Aqui: ' + JSON.stringify(resposta([true, true, true])) + ' fim').status === 'aprovado')
ok('resposta fora do formato: erro', decidirResultado(MISSAO, 'não sei').status === 'erro' && decidirResultado(MISSAO, { requisitos: [] }).status === 'erro')
ok('IA pulou um requisito: erro (não aprova nem reprova no chute)', decidirResultado(MISSAO, resposta([true, true])).status === 'erro')
ok('campo a mais na resposta da IA não entra na análise', !('roteiro' in (decidirResultado(MISSAO, resposta([true, true, true], { roteiro_seguido: true })).analise ?? {})))

// Blocos do upload
const streamDe = (pedacos: number[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const n of pedacos) c.enqueue(new Uint8Array(n).fill(7)); c.close() },
})
const tamanhos = async (pedacos: number[], bloco: number) => { const t: number[] = []; for await (const b of emBlocos(streamDe(pedacos), bloco)) t.push(b.length); return t }
ok('blocos: junta pedaços pequenos em blocos do tamanho certo', JSON.stringify(await tamanhos([3, 3, 3, 3], 5)) === '[5,5,2]')
ok('blocos: quebra pedaço grande', JSON.stringify(await tamanhos([12], 5)) === '[5,5,2]')
ok('blocos: tamanho exato não deixa bloco vazio no fim', JSON.stringify(await tamanhos([4, 6], 5)) === '[5,5]')
ok('blocos: stream vazio não manda nada', JSON.stringify(await tamanhos([], 5)) === '[]')

// ── A função (handler) ───────────────────────────────────────────────────────
function cenario(over: { quem?: { restauranteId: number | null; email: string; ehAdmin: boolean } | null; envios?: EnvioCompleto[]; arquivos?: Record<string, number>; ia?: () => Promise<unknown>; maxPorAno?: number | null; doAno?: EnvioCompleto[] } = {}) {
  const feito: string[] = []
  const envios = new Map<string, EnvioCompleto>((over.envios ?? []).map((e) => [e.id, { ...e }]))
  const arquivos: Record<string, number> = { ...(over.arquivos ?? {}) }
  const segundoPlano: Promise<unknown>[] = []
  const deps: DepsVideos = {
    quemPede: async () => ('quem' in over ? over.quem! : { restauranteId: 11, email: 'Raver@Exemplo.com', ehAdmin: true }),
    missao: async (id) => (id === 1 ? MISSAO : id === 2 ? { ...MISSAO, id: 2, ativa: false } : id === 3 ? { ...MISSAO, id: 3, duracao_min_s: 60 } : null),
    // A fila: 1, depois 3 (a 2 está desativada e nem vem).
    missoes: async () => [{ id: 3, ativa: true, ordem: 2 }, { id: 1, ativa: true, ordem: 1 }],
    maxPorAno: async () => ('maxPorAno' in over ? over.maxPorAno! : 4),
    enviosDoRestaurante: async (rid) => [...envios.values(), ...(over.doAno ?? [])].filter((e) => e.restaurante_id === rid),
    descartarAbandonados: async (rid, mid) => {
      for (const e of [...envios.values()]) if (e.restaurante_id === rid && e.missao_id === mid && e.status === 'enviando') { envios.delete(e.id); feito.push(`descartou:${e.id}`) }
    },
    criarEnvio: async (l) => { envios.set(String(l.id), { ...(l as unknown as EnvioCompleto), criado_em: new Date(AGORA).toISOString(), atualizado_em: null }); feito.push(`criou:${l.caminho}`) },
    envio: async (id) => envios.get(id) ?? null,
    arquivo: async (c) => (c in arquivos ? { tamanho: arquivos[c] } : null),
    atualizarEnvio: async (id, campos) => {
      const e = envios.get(id)!
      if (campos.status === 'aprovado' && [...envios.values()].some((x) => x.id !== id && x.restaurante_id === e.restaurante_id && x.missao_id === e.missao_id && x.status === 'aprovado')) {
        throw Object.assign(new Error('duplicate'), { code: '23505' })
      }
      Object.assign(e, campos)
      feito.push(`atualizou:${id}:${campos.status}`)
    },
    assistir: over.ia ?? (async () => resposta([true, true, true])),
    emSegundoPlano: (p) => { segundoPlano.push(p) },
    novoId: () => 'novo-1',
    agora: () => AGORA,
  }
  return { deps, feito, envios, arquivos, terminar: () => Promise.all(segundoPlano) }
}
const envioC = (id: string, status: string, over: Partial<EnvioCompleto> = {}): EnvioCompleto => ({
  id, restaurante_id: 11, missao_id: 1, caminho: `restaurante_11/${id}.mp4`, nome_arquivo: 'v.mp4', tamanho_bytes: 1000, mime: 'video/mp4',
  status, criado_em: new Date(AGORA - 60_000).toISOString(), atualizado_em: null, ...over,
})
const pedido = { acao: 'criar_envio', missao_id: 1, nome_arquivo: 'IMG_0001.MOV', tamanho_bytes: 52_428_800, duracao_segundos: 41.234, mime: '', autorizou_uso: true }

let c = cenario({ quem: null })
let r = await tratarVideos(pedido, c.deps)
ok('sem login: 401', r.status === 401)
c = cenario({ quem: { restauranteId: 11, email: 'dono@x.com', ehAdmin: false } })
r = await tratarVideos(pedido, c.deps)
ok('por enquanto só o admin da plataforma (SO_ADMIN)', r.status === 403 && r.corpo.motivo === 'so_admin')

c = cenario({ envios: [envioC('velho', 'enviando')] })
r = await tratarVideos(pedido, c.deps)
ok('criar envio: devolve onde subir (pasta do restaurante, .mov)', r.status === 200 && r.corpo.envio_id === 'novo-1' && r.corpo.caminho === 'restaurante_11/novo-1.mov' && r.corpo.mime === 'video/quicktime', r)
ok('criar envio: descarta o envio que não terminou de subir', c.feito.includes('descartou:velho') && !c.envios.has('velho'))
ok('criar envio: grava status enviando com o que a tela mandou', c.envios.get('novo-1')?.status === 'enviando' && c.envios.get('novo-1')?.tamanho_bytes === 52_428_800 && (c.envios.get('novo-1') as any).duracao_segundos === 41.23)
r = await tratarVideos({ ...pedido, autorizou_uso: 'sim' }, cenario().deps)
ok('sem autorizar o uso (tem que ser true): recusa com a mensagem', r.status === 409 && r.corpo.motivo === 'sem_autorizacao' && String(r.corpo.error).includes('autorizar'))
r = await tratarVideos({ ...pedido, missao_id: 2 }, cenario().deps)
ok('missão desativada: recusa', r.status === 409 && r.corpo.motivo === 'missao_inativa')
r = await tratarVideos({ ...pedido, missao_id: 'x' }, cenario().deps)
ok('missão inválida: 400', r.status === 400)
r = await tratarVideos(pedido, cenario({ envios: [envioC('ok', 'aprovado')] }).deps)
ok('missão já cumprida: recusa', r.corpo.motivo === 'ja_aprovada')
r = await tratarVideos(pedido, cenario({ quem: { restauranteId: null, email: 'admin@x.com', ehAdmin: true } }).deps)
ok('login sem restaurante: recusa', r.status === 403 && r.corpo.motivo === 'sem_restaurante')
// Aprovados em missões que já saíram da fila (11 a 14).
const aprovadosEsteAno = [1, 2, 3, 4].map((i) => ({ ...envioC(`a${i}`, 'aprovado', { missao_id: 10 + i, criado_em: '2026-02-01T00:00:00Z' }), aprovado_em: '2026-02-02T00:00:00Z' }))
r = await tratarVideos(pedido, cenario({ doAno: aprovadosEsteAno }).deps)
ok('limite do ano (4 aprovados): recusa com a mensagem', r.status === 409 && r.corpo.motivo === 'limite_ano' && String(r.corpo.error).includes('janeiro'))
r = await tratarVideos(pedido, cenario({ doAno: aprovadosEsteAno, maxPorAno: null }).deps)
ok('sem limite configurado: deixa', r.status === 200)
r = await tratarVideos({ ...pedido, missao_id: 3 }, cenario().deps)
ok('missão que ainda não é a da vez: recusa', r.status === 409 && r.corpo.motivo === 'nao_liberada' && String(r.corpo.error).includes('missão da vez'))
r = await tratarVideos({ ...pedido, missao_id: 3 }, cenario({ envios: [envioC('ok', 'aprovado')] }).deps)
ok('cumpriu a 1ª: a 3ª vira a da vez (aqui, curta demais: 41 s de 60)', r.status === 409 && r.corpo.motivo === 'muito_curto')
r = await tratarVideos({ ...pedido, missao_id: 3, duracao_segundos: 75 }, cenario({ envios: [envioC('ok', 'aprovado')] }).deps)
ok('cumpriu a 1ª: manda para a da vez', r.status === 200)

// Analisar
c = cenario({ envios: [envioC('e1', 'enviando')], arquivos: { 'restaurante_11/e1.mp4': 777 } })
r = await tratarVideos({ acao: 'analisar', envio_id: 'e1' }, c.deps)
ok('analisar: responde 202 e marca analisando com o tamanho real', r.status === 202 && c.feito.includes('atualizou:e1:analisando') && c.envios.get('e1')!.tamanho_bytes === 777)
await c.terminar()
ok('analisar: a IA aprovou → aprovado, com a análise e o motivo', c.envios.get('e1')!.status === 'aprovado' && (c.envios.get('e1') as any).analise.requisitos.length === 3 && String((c.envios.get('e1') as any).motivo).startsWith('Missão cumprida'))
r = await tratarVideos({ acao: 'analisar', envio_id: 'e1' }, c.deps)
ok('analisar de novo o mesmo envio: recusa', r.status === 409 && r.corpo.motivo === 'ja_enviado')
c = cenario({ envios: [envioC('e2', 'enviando')] })
r = await tratarVideos({ acao: 'analisar', envio_id: 'e2' }, c.deps)
ok('arquivo não chegou: recusa e continua enviando', r.status === 409 && r.corpo.motivo === 'sem_arquivo' && c.envios.get('e2')!.status === 'enviando')
c = cenario({ envios: [envioC('e3', 'enviando', { restaurante_id: 99 })], arquivos: { 'restaurante_11/e3.mp4': 1 } })
r = await tratarVideos({ acao: 'analisar', envio_id: 'e3' }, c.deps)
ok('envio de outro restaurante: não encontrado', r.status === 404)
c = cenario({ envios: [envioC('e4', 'enviando')], arquivos: { 'restaurante_11/e4.mp4': 10 }, ia: async () => { throw new Error('GEMINI_API_KEY não configurada') } })
await tratarVideos({ acao: 'analisar', envio_id: 'e4' }, c.deps)
await c.terminar()
ok('IA falhou (sem chave): erro, motivo amigável e o técnico guardado para o admin', c.envios.get('e4')!.status === 'erro'
  && String((c.envios.get('e4') as any).motivo).includes('equipe do EasyFeed') && (c.envios.get('e4') as any).analise.erro.includes('GEMINI_API_KEY'))
c = cenario({ envios: [envioC('e5', 'enviando')], arquivos: { 'restaurante_11/e5.mp4': 10 }, ia: async () => resposta([true, false, true]) })
await tratarVideos({ acao: 'analisar', envio_id: 'e5' }, c.deps)
await c.terminar()
ok('IA reprovou → reprovado com o que faltou', c.envios.get('e5')!.status === 'reprovado' && String((c.envios.get('e5') as any).motivo).includes('Quem fala aparece no vídeo'))

// Admin
c = cenario({ envios: [envioC('e6', 'reprovado')] })
r = await tratarVideos({ acao: 'admin_decidir', envio_id: 'e6', aprovado: true }, c.deps)
ok('admin aprova por cima da IA: registra quem e quando', r.status === 200 && c.envios.get('e6')!.status === 'aprovado'
  && (c.envios.get('e6') as any).revisado_por === 'raver@exemplo.com' && String((c.envios.get('e6') as any).motivo).includes('equipe do EasyFeed'))
r = await tratarVideos({ acao: 'admin_decidir', envio_id: 'e6', aprovado: false, motivo: '  Não aparece o QR Code. ' }, c.deps)
ok('admin reprova com o motivo dele', c.envios.get('e6')!.status === 'reprovado' && (c.envios.get('e6') as any).motivo === 'Não aparece o QR Code.')
c = cenario({ envios: [envioC('a1', 'aprovado'), envioC('a2', 'reprovado')] })
r = await tratarVideos({ acao: 'admin_decidir', envio_id: 'a2', aprovado: true }, c.deps)
ok('aprovar uma segunda vez a mesma missão: recusa (uma por restaurante)', r.status === 409 && r.corpo.motivo === 'ja_aprovada')
c = cenario({ envios: [envioC('e7', 'enviando')] })
r = await tratarVideos({ acao: 'admin_decidir', envio_id: 'e7', aprovado: true }, c.deps)
ok('decidir sem o vídeo ter chegado: recusa', r.corpo.motivo === 'sem_arquivo')
c = cenario({ quem: { restauranteId: 11, email: 'dono@x.com', ehAdmin: false }, envios: [envioC('e8', 'reprovado')] })
r = await tratarVideos({ acao: 'admin_decidir', envio_id: 'e8', aprovado: true }, c.deps)
ok('quem não é admin não decide', r.status === 403)
c = cenario({ envios: [envioC('e9', 'erro', { restaurante_id: 30, caminho: 'restaurante_30/e9.mp4' })], arquivos: { 'restaurante_30/e9.mp4': 50 } })
r = await tratarVideos({ acao: 'admin_analisar_de_novo', envio_id: 'e9' }, c.deps)
await c.terminar()
ok('admin roda a análise de novo (vídeo de outro restaurante)', r.status === 202 && c.envios.get('e9')!.status === 'aprovado')
c = cenario({ envios: [envioC('e10', 'analisando', { atualizado_em: new Date(AGORA - 60_000).toISOString() })], arquivos: { 'restaurante_11/e10.mp4': 5 } })
r = await tratarVideos({ acao: 'admin_analisar_de_novo', envio_id: 'e10' }, c.deps)
ok('não roda de novo o que ainda está analisando', r.status === 409 && r.corpo.motivo === 'ja_analisando')
c = cenario({ envios: [envioC('e11', 'analisando', { atualizado_em: new Date(AGORA - 30 * 60_000).toISOString() })], arquivos: { 'restaurante_11/e11.mp4': 5 } })
r = await tratarVideos({ acao: 'admin_analisar_de_novo', envio_id: 'e11' }, c.deps)
ok('análise travada (30 min) pode rodar de novo', r.status === 202)
r = await tratarVideos({ acao: 'qualquer' }, cenario().deps)
ok('ação desconhecida: 400', r.status === 400)

// ── Gemini ocupado: tenta de novo e passa para o modelo reserva ──────────────
const fetchOriginal = globalThis.fetch
const chamadas: string[] = []
const respostaIA = (status: number) => new Response(status === 200
  ? JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })
  : JSON.stringify({ error: { code: status, message: 'ocupado' } }), { status })
const comFetch = async (roteiro: number[], fn: () => Promise<unknown>) => {
  chamadas.length = 0
  const fila = [...roteiro]
  globalThis.fetch = (async (url: string) => {
    chamadas.push(String(url).split('/models/')[1]?.split(':')[0] ?? '')
    return respostaIA(fila.shift() ?? 503)
  }) as unknown as typeof fetch
  try { return await fn() } catch (e) { return e } finally { globalThis.fetch = fetchOriginal }
}
const semEspera = async () => {}
const cfgG = { chave: 'k', modelo: 'gemini-flash-latest' }
const arqG = { name: 'files/x', uri: 'u', mimeType: 'video/mp4' }
let rG = await comFetch([503, 503, 200], () => perguntarSobreVideo(cfgG, arqG, 'p', {}, semEspera))
ok('Gemini ocupado duas vezes: tenta de novo e responde', rG === '{"ok":true}' && chamadas.join() === 'gemini-flash-latest,gemini-flash-latest,gemini-flash-latest', chamadas)
rG = await comFetch([503, 503, 503, 200], () => perguntarSobreVideo(cfgG, arqG, 'p', {}, semEspera))
ok('continua ocupado: passa para o modelo reserva', rG === '{"ok":true}' && chamadas.at(-1) === 'gemini-flash-lite-latest', chamadas)
rG = await comFetch([400], () => perguntarSobreVideo(cfgG, arqG, 'p', {}, semEspera))
ok('erro de verdade (400): não repete', rG instanceof Error && chamadas.length === 1 && (rG as { codigo?: string }).codigo === 'resposta')
rG = await comFetch([], () => perguntarSobreVideo(cfgG, arqG, 'p', {}, semEspera))
ok('ocupado o tempo todo: desiste com erro claro', rG instanceof Error && String((rG as Error).message).includes('ocupado') && chamadas.length === 6, chamadas)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nmissões de vídeo: tudo certo')
process.exit(falhas ? 1 : 0)
