/**
 * Testes do segundo sistema: cliente x equipe no mesmo motor.
 * Cobre _shared/publico.ts, prompts-equipe.ts e as contas que mudam para a
 * equipe (gravidade, quantas pessoas, quem conta como pessoa).
 *   node --experimental-strip-types supabase/functions/_shared/__testes__/publico.teste.ts
 */
import { readFileSync } from 'node:fs'
import {
  categoriaDaEquipe, CATEGORIAS_EQUIPE, colunaDaUltimaAnalise, publicoDe, publicoDoPedido, PUBLICOS,
} from '../publico.ts'
import { chaveDoPrompt, promptPara, PROMPTS_EQUIPE } from '../prompts-equipe.ts'
import { avaliarGravidade, gravidadeMaxima } from '../gravidade.ts'
import { assuntoElegivelEquipe, pessoasNecessariasEquipe, pessoasNecessariasPorNota } from '../avaliacao.ts'
import { agruparEmAssuntos, type PontoBruto } from '../assuntos.ts'
import { mensagemDoAlertaDaEquipe } from '../equipe.ts'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: unknown) {
  console.log(`${cond ? 'PASS' : 'FALHOU'}  ${nome}`)
  if (!cond) {
    falhas++
    if (detalhe !== undefined) console.log('   ', JSON.stringify(detalhe))
  }
}

ok('só "equipe" é equipe; todo o resto (inclusive vazio) é cliente', publicoDe('equipe') === 'equipe' && publicoDe(' Equipe ') === 'equipe'
  && publicoDe('cliente') === 'cliente' && publicoDe(null) === 'cliente' && publicoDe(undefined) === 'cliente' && publicoDe('admin') === 'cliente')
ok('os dois públicos, cliente primeiro', PUBLICOS.join() === 'cliente,equipe')
ok('público do pedido: o corpo manda; sem corpo vale o cabeçalho', publicoDoPedido({ publico: 'equipe' }) === 'equipe'
  && publicoDoPedido({}, 'equipe') === 'equipe' && publicoDoPedido({ publico: 'cliente' }, 'equipe') === 'cliente' && publicoDoPedido(null) === 'cliente')
ok('categoria da equipe: grafia certa, sem acento ou caixa; fora da lista vira Outros', categoriaDaEquipe('salario e beneficios') === 'Salário e benefícios'
  && categoriaDaEquipe('ESCALA E HORÁRIOS') === 'Escala e horários' && categoriaDaEquipe('Comida') === 'Outros' && categoriaDaEquipe(null) === 'Outros')
ok('12 categorias, com Outros no fim', CATEGORIAS_EQUIPE.length === 12 && CATEGORIAS_EQUIPE[11] === 'Outros')
ok('cada público tem o seu marco da última análise', colunaDaUltimaAnalise('cliente') === 'ultima_analise_insights' && colunaDaUltimaAnalise('equipe') === 'ultima_analise_insights_equipe')

// ── O treinamento próprio da equipe ─────────────────────────────────────────
const raiz = new URL('../../', import.meta.url)
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8').replace(/\r\n/g, '\n')
const campos = (texto: string) => [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join()

// Cada prompt do motor: de que arquivo vem e como a constante se chama.
const MOTOR: [chave: string, arquivo: string][] = [
  ['ef_classificar_feedback', 'classificar-feedback/index.ts'],
  ['ef_vincular_feedback', 'vincular-feedback/index.ts'],
  ['ef_absorver_insight', 'vincular-feedback/index.ts'],
  ['ef_avaliar_assunto', 'gerar-insights/index.ts'],
  ['ef_gerar_insights', 'gerar-insights/index.ts'],
  ['ef_verificar_insight', 'gerar-insights/index.ts'],
  ['ef_religar_condicional', 'gerar-insights/index.ts'],
  ['ef_sugerir_acoes', 'sugerir-acoes/index.ts'],
  ['ef_verificar_acao', 'sugerir-acoes/index.ts'],
  ['ef_categorizar_acao', 'categorizar-acao/index.ts'],
  ['ef_vincular_acao', 'categorizar-acao/index.ts'],
  ['ef_plano_acao', 'gerar-plano-acao/index.ts'],
  ['ef_triagem_urgencia', '_shared/alerta-urgente.ts'],
]
ok('a equipe tem um prompt irmão para cada prompt do motor, e nenhum sobrando', Object.keys(PROMPTS_EQUIPE).sort().join() === MOTOR.map((m) => m[0]).sort().join(),
  Object.keys(PROMPTS_EQUIPE).sort())

for (const [chave, arquivo] of MOTOR) {
  const codigo = ler(arquivo)
  // promptPara(prompts, 'chave', CONSTANTE, { … }, publico)
  const uso = codigo.match(new RegExp(`promptPara\\([\\w.]+, '${chave}', (\\w+),`))
  const constante = uso?.[1] ?? ''
  const doCliente = codigo.match(new RegExp('const ' + constante + ' =\\s*`([\\s\\S]*?)`\\n'))?.[1] ?? ''
  ok(`${chave}: o código monta pelo público (promptPara)`, !!uso && doCliente.length > 200, { constante, tamanho: doCliente.length })
  ok(`${chave}: o prompt da equipe tem os MESMOS campos {…} do de cliente`, campos(PROMPTS_EQUIPE[chave]) === campos(doCliente) && campos(doCliente).length > 0,
    { equipe: campos(PROMPTS_EQUIPE[chave]), cliente: campos(doCliente) })
}

const todosDaEquipe = Object.values(PROMPTS_EQUIPE)
ok('todo prompt da equipe diz que quem escreve é funcionário (ou a equipe)', todosDaEquipe.every((p) => /funcion[aá]rio|equipe/i.test(p)))
ok('nenhum prompt da equipe traz regra de cliente (comida, garçom, vigilância sanitária, avisar o cliente)',
  todosDaEquipe.every((p) => !/comida fria|cabelo na comida|garcom|garçom|vigil[aâ]ncia sanit[aá]ria|cliente (ser|receber) avisado|clientes relataram/i.test(p)),
  Object.entries(PROMPTS_EQUIPE).filter(([, p]) => /comida fria|cabelo na comida|garcom|garçom|vigil[aâ]ncia sanit[aá]ria/i.test(p)).map(([k]) => k))
ok('quem ESCREVE texto para o dono é proibido de mostrar quem falou', ['ef_absorver_insight', 'ef_gerar_insights']
  .every((k) => /SIGILO: nunca escreva nome/.test(PROMPTS_EQUIPE[k])) && /SEM\s+nome, apelido, cargo ou turno/.test(PROMPTS_EQUIPE.ef_triagem_urgencia))
ok('insight, ação e plano nunca propõem descobrir ou conversar com quem reclamou', ['ef_gerar_insights', 'ef_sugerir_acoes', 'ef_plano_acao']
  .every((k) => /conversar com\s+quem reclamou/.test(PROMPTS_EQUIPE[k])) && /descobrir ou expoe quem deu o feedback/.test(PROMPTS_EQUIPE.ef_verificar_acao)
  && /mostre QUEM deu\s+o feedback/.test(PROMPTS_EQUIPE.ef_verificar_insight))
ok('assédio e ameaça: proteger quem relatou antes de qualquer coisa', ['ef_gerar_insights', 'ef_sugerir_acoes', 'ef_plano_acao']
  .every((k) => /proteger\s+quem relatou/.test(PROMPTS_EQUIPE[k])))
const rubrica = PROMPTS_EQUIPE.ef_avaliar_assunto
ok('escala de importância da equipe: 10 é risco a uma pessoa; 7 a 9 é salário atrasado, humilhação, sinal de saída', /- 10: risco a uma pessoa/.test(rubrica)
  && /Assedio moral ou sexual/.test(rubrica) && /salario nao pago/.test(rubrica) && /- 7 a 9:[\s\S]*Salario atrasado[\s\S]*humilhacao[\s\S]*pedir\s+demissao/.test(rubrica)
  && /- 4 a 6:[\s\S]*Escala avisada em cima da hora/.test(rubrica) && /cada pessoa pesa/.test(rubrica))
ok('plano de ação da equipe: a regra de referência é a do trabalho (CLT, convenção, normas)', /CLT/.test(PROMPTS_EQUIPE.ef_plano_acao) && /hora extra/.test(PROMPTS_EQUIPE.ef_plano_acao))
ok('categorizar ação da equipe: 12 categorias', /entre as 12 disponiveis/.test(PROMPTS_EQUIPE.ef_categorizar_acao))

const padraoCliente = 'Cliente: {texto} em {categoria}.'
ok('promptPara, cliente: o prompt de sempre, com os campos preenchidos', promptPara({}, 'ef_vincular_feedback', padraoCliente, { texto: 'a pizza', categoria: 'Comida' }, 'cliente') === 'Cliente: a pizza em Comida.')
const daEquipe = promptPara({}, 'ef_vincular_feedback', padraoCliente, { texto: 'O salario atrasa', categoria: 'Salário e benefícios', sentimento: 'Negativo', acoes: '(nenhuma)', insights: '(nenhum)' }, 'equipe')
ok('promptPara, equipe: usa o irmão da equipe e preenche os mesmos campos', daEquipe.startsWith('Voce decide se um feedback novo de um FUNCIONARIO') && daEquipe.includes('"O salario atrasa"')
  && daEquipe.includes('Categoria: Salário e benefícios | Sentimento: Negativo') && !/\{\w+\}/.test(daEquipe))
ok('promptPara: o admin edita cada público na sua chave', chaveDoPrompt('ef_gerar_insights', 'equipe') === 'ef_gerar_insights_equipe' && chaveDoPrompt('ef_gerar_insights', 'cliente') === 'ef_gerar_insights'
  && promptPara({ ef_vincular_feedback_equipe: 'Editado: {texto}' }, 'ef_vincular_feedback', padraoCliente, { texto: 'x' }, 'equipe') === 'Editado: x'
  && promptPara({ ef_vincular_feedback_equipe: 'Editado: {texto}' }, 'ef_vincular_feedback', padraoCliente, { texto: 'x', categoria: 'c' }, 'cliente') === 'Cliente: x em c.'
  && promptPara({ ef_vincular_feedback: 'Do cliente: {texto}' }, 'ef_vincular_feedback', padraoCliente, { texto: 'x', categoria: 'c', sentimento: 's', acoes: 'a', insights: 'i' }, 'equipe').startsWith('Voce decide'))
let erro = ''
try { promptPara({}, 'ef_que_nao_existe', 'x', {}, 'equipe') } catch (e) { erro = String((e as Error).message) }
ok('promptPara: prompt sem irmão da equipe é erro alto, nunca o de cliente em silêncio', /Falta o prompt da equipe/.test(erro))

// ── Gravidade: cada público tem a sua lista do que é grave ──────────────────
const G = (t: string, s = 'Negativo', p: 'cliente' | 'equipe' = 'equipe') => avaliarGravidade(t, s, p).G
ok('equipe, 4: assédio, agressão, ameaça, discriminação, acidente, salário não pago', ['O gerente me assediou', 'ele me ameaçou de demissão', 'sofri racismo do chefe',
  'me queimei na fritadeira ontem', 'não recebi o salário esse mês', 'trabalho sem registro', 'tem cheiro de gás na cozinha'].every((t) => G(t) === 4),
  ['O gerente me assediou', 'ele me ameaçou de demissão', 'sofri racismo do chefe', 'me queimei na fritadeira ontem', 'não recebi o salário esse mês', 'trabalho sem registro', 'tem cheiro de gás na cozinha'].map((t) => `${G(t)} ${t}`))
ok('equipe, 3: salário atrasado, hora extra, grito e humilhação, dobra, sinal de saída', ['O salário atrasa todo mês', 'não pagam hora extra', 'o gerente grita com a gente',
  'ele me humilha na frente de todos', 'to dobrando todo fim de semana', 'vou pedir demissão', 'não aguento mais esse lugar'].every((t) => G(t) === 3),
  ['O salário atrasa todo mês', 'não pagam hora extra', 'o gerente grita com a gente', 'ele me humilha na frente de todos', 'to dobrando todo fim de semana', 'vou pedir demissão', 'não aguento mais esse lugar'].map((t) => `${G(t)} ${t}`))
ok('equipe, 2: escala em cima da hora, equipamento quebrado, fofoca; queixa fora da lista também é 2', G('a escala sai em cima da hora') === 2 && G('o forno vive quebrado') === 2
  && G('tem muita fofoca') === 2 && G('o sistema do ponto trava') === 2)
ok('equipe: sugestão é 1 e elogio é 0', G('podiam ter uma sala de descanso', 'Sugestão') === 1 && G('a equipe é unida e gosto de trabalhar aqui', 'Positivo') === 0)
ok('equipe: negar não conta ("nunca fui ameaçado")', G('nunca fui ameaçado aqui, o clima é bom', 'Positivo') === 0)
ok('o que é grave para o cliente não é para a equipe, e vice-versa', G('achei cabelo na comida', 'Negativo', 'cliente') === 4 && G('achei cabelo na comida', 'Negativo', 'equipe') === 2
  && G('o salário atrasa todo mês', 'Negativo', 'cliente') === 2 && avaliarGravidade('achei cabelo na comida', 'Negativo').G === 4)
ok('gravidade máxima de um conjunto, por público', gravidadeMaxima([{ texto: 'a escala sai em cima da hora', sentimento: 'Negativo' }, { texto: 'ele me ameaçou', sentimento: 'Negativo' }], 'equipe') === 4
  && gravidadeMaxima([{ texto: 'ele me ameaçou', sentimento: 'Negativo' }]) === 2)

// ── Quantos funcionários para virar insight (proporcional à equipe) ─────────
const tabela = [[10, 8, 1], [7.5, 30, 1], [5, 5, 2], [5, 10, 2], [5, 15, 3], [5, 20, 4], [5, 30, 5], [5, 100, 5], [0, 10, 2], [5, 1, 1], [5, 0, 2], [7.4, 10, 2]]
ok('limiar da equipe: grave 1; resto 20% dos ativos, mínimo 2, teto 5', tabela.every(([nota, ativos, esperado]) => pessoasNecessariasEquipe(nota, ativos) === esperado),
  tabela.map(([nota, ativos, esperado]) => `${nota}/${ativos}: ${pessoasNecessariasEquipe(nota, ativos)} (esperado ${esperado})`))
ok('limiar da equipe nunca pede mais gente do que o dos clientes para um problema comum', [2, 5, 10, 50, 200].every((a) => pessoasNecessariasEquipe(5, a) <= 5) && pessoasNecessariasPorNota(5) === 3)
ok('elegível na equipe', assuntoElegivelEquipe(5, 2, 10) && !assuntoElegivelEquipe(5, 1, 10) && assuntoElegivelEquipe(8, 1, 10) && !assuntoElegivelEquipe(5, 2, 15))

const ponto = (id: number, texto: string, origem: string, pessoa?: string, tema = 't1'): PontoBruto => ({
  id, texto_original: texto, resumo: null, categoria: 'Escala e horários', sentimento: 'Negativo', origem_id: origem, tema_id: tema, created_at: '2026-10-10T12:00:00Z', pessoa,
})
const AGORA = new Date('2026-10-12T12:00:00Z')
let [a] = agruparEmAssuntos([ponto(1, 'a escala sai em cima da hora', 'o1', 'f7'), ponto(2, 'de novo a escala em cima da hora', 'o2', 'f7'), ponto(3, 'escala na véspera', 'o3', 'f7')],
  { agora: AGORA, publico: 'equipe', funcionariosAtivos: 10 })
ok('equipe: a mesma pessoa falando três vezes conta UMA, e um problema comum não vira insight', a.pessoas === 1 && a.pessoasNecessarias === 2 && a.elegivel === false, a)
;[a] = agruparEmAssuntos([ponto(1, 'a escala sai em cima da hora', 'o1', 'f7'), ponto(2, 'escala na véspera', 'o2', 'f9')], { agora: AGORA, publico: 'equipe', funcionariosAtivos: 10 })
ok('equipe: dois funcionários diferentes sobre o mesmo problema comum: vira insight', a.pessoas === 2 && a.elegivel === true)
;[a] = agruparEmAssuntos([ponto(1, 'o gerente me ameaçou', 'o1', 'f7')], { agora: AGORA, publico: 'equipe', funcionariosAtivos: 30 })
ok('equipe: relato grave de UMA pessoa já vira insight, em equipe de qualquer tamanho', a.gravidade === 4 && a.pessoasNecessarias === 1 && a.elegivel === true)
;[a] = agruparEmAssuntos([ponto(1, 'a comida veio fria', 'o1'), ponto(2, 'comida fria de novo', 'o2')], { agora: AGORA })
ok('cliente: nada muda (conta por mensagem, 3 pessoas para um problema comum)', a.pessoas === 2 && a.pessoasNecessarias === 3 && a.elegivel === false)

// ── O que o código de cada função precisa garantir ──────────────────────────
// As funções de IA usam a chave de serviço (passam por cima da RLS): cada busca
// nas tabelas do motor precisa do filtro de público escrito no código.
const funcoes = ['classificar-feedback', 'vincular-feedback', 'gerar-insights', 'sugerir-acoes', 'categorizar-acao', 'gerar-plano-acao']
for (const f of funcoes) {
  const codigo = ler(`${f}/index.ts`)
  ok(`${f}: usa o público`, codigo.includes("from '../_shared/publico.ts'") && codigo.includes("from '../_shared/prompts-equipe.ts'"))
  // Toda busca por restaurante em insights, ações, temas e feedbacks livres leva o público junto.
  // (Busca por `id` não precisa: a linha achada já diz de que público é.)
  const semFiltro: string[] = []
  for (const m of codigo.matchAll(/\.from\('(insights|acoes_operacionais|feedback_temas|feedbacks_livres)'\)/g)) {
    const consulta = codigo.slice(m.index, m.index + 600).split(/\n\s*\n|\n\s*(?:const|let|if|return|await) /)[0]
    if (!consulta.includes(".eq('restaurante_id'") || consulta.includes(".eq('id',")) continue
    if (!consulta.includes("'publico'")) semFiltro.push(`${m[1]}: ${consulta.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  ok(`${f}: nenhuma busca por restaurante sem o filtro de público`, semFiltro.length === 0, semFiltro)
  // Nenhum prompt montado direto: todos escolhem o treinamento pelo público.
  const diretos = (codigo.match(/\bmontarPrompt\(/g) ?? []).length
  const pelosPublicos = (codigo.match(/\bpromptPara\(/g) ?? []).length
  ok(`${f}: todo prompt escolhe o treinamento pelo público (${pelosPublicos} por promptPara, ${diretos} direto)`, pelosPublicos > 0 && diretos === 0)
}

const vincular = ler('vincular-feedback/index.ts')
ok('vincular-feedback: o alerta urgente roda para os dois públicos, sabendo qual é', /talvezAlertarDono\(db, fb, texto, publico\)/.test(vincular)
  && /p_publico: publico/.test(vincular) && /force: false, publico/.test(vincular))
const alerta = ler('_shared/alerta-urgente.ts')
ok('alerta da equipe: léxico da equipe ou relato marcado sensível; triagem com o prompt da equipe', /avaliarGravidade\(texto, fb\.sentimento, publico\)/.test(alerta)
  && /from\('equipe_autorias'\)[\s\S]{0,120}select\('sensivel'\)/.test(alerta) && /promptPara\(prompts, 'ef_triagem_urgencia', PROMPT,/.test(alerta))
const caminhoDaEquipe = alerta.slice(alerta.indexOf("if (publico === 'equipe') {\n      const resumoEquipe"), alerta.indexOf("const resumo = triagem.resumo || 'Feedback grave recebido.'"))
ok('alerta da equipe: sai direto pela uazapi e NÃO passa pelo n8n dos clientes (que leva o telefone)', /avisarDonoSobreAEquipe\(/.test(caminhoDaEquipe) && /return \{ urgente: true/.test(caminhoDaEquipe)
  && !/dispararWebhook|telefone_cliente/.test(caminhoDaEquipe) && /forcarInsights\(fb\.restaurante_id, 'equipe'\)/.test(caminhoDaEquipe))
const aviso = alerta.slice(alerta.indexOf('async function avisarDonoSobreAEquipe'), alerta.indexOf('async function confirmarComIa'))
ok('alerta da equipe: vai para o número do dono, pela instância do restaurante, e não lê telefone de ninguém mais', /whatsapp_dono/.test(aviso) && /enviarTexto\(base, token, \{ numero: dono,/.test(aviso)
  && !/telefone_cliente|equipe_funcionarios|funcionario_id/.test(aviso))
const msg = mensagemDoAlertaDaEquipe('Um funcionário relata ameaça do gerente.', 'O  gerente\nme ameaçou ontem')
ok('alerta da equipe: a mensagem leva o resumo e o relato, sem nome nem telefone', msg.startsWith('Alerta da equipe: Um funcionário relata ameaça do gerente.') && msg.includes('"O gerente me ameaçou ontem"')
  && /só aparece no painel se a pessoa deixar/.test(msg) && !/Cliente:|55\d{10}/.test(msg))
ok('alerta da equipe: relato enorme é cortado; sem resumo, ainda avisa', mensagemDoAlertaDaEquipe('', 'x'.repeat(3000)).length < 1200 && /Alerta da equipe: chegou um relato grave\./.test(mensagemDoAlertaDaEquipe('', 'x')))

const insights = ler('gerar-insights/index.ts')
ok('gerar-insights: a rodada, o marco e o insight novo são do público pedido', /p_publico: publico/.test(insights) && insights.includes('[colunaDaUltimaAnalise(publico)]')
  && /restaurante_id: restauranteId,\s*publico,\s*prioridade/.test(insights) && /Disponivel so para o admin/.test(insights))
ok('gerar-insights, equipe: config própria, 90 dias de validade, pessoa = funcionário e limiar proporcional', /configGeral\.equipe/.test(insights) && /publico === 'equipe' \? 90 : 14/.test(insights)
  && /p\.pessoa = /.test(insights) && /agruparEmAssuntos\(livres as PontoBruto\[\], \{ reincidentes, publico, funcionariosAtivos \}\)/.test(insights)
  && /pessoasNecessariasEquipe\(av\.nota, funcionariosAtivos\)/.test(insights) && /assuntoElegivelEquipe\(av\.nota, assunto\.pessoas, funcionariosAtivos\)/.test(insights))
const listaParaPrompt = insights.slice(insights.indexOf('function listarPontosParaPrompt'), insights.indexOf('function listarPontosParaPrompt') + 900)
const assuntosTs = ler('_shared/assuntos.ts')
const pontoDoAssunto = assuntosTs.slice(assuntosTs.indexOf('export interface PontoDoAssunto'), assuntosTs.indexOf('export interface Assunto'))
ok('gerar-insights: quem falou serve só para contar, nunca entra no texto dos pontos', listaParaPrompt.length > 200 && !/pessoa/.test(listaParaPrompt)
  && pontoDoAssunto.length > 50 && !/pessoa/.test(pontoDoAssunto))
const banner = ler('atualizar-banner/index.ts')
ok('banner da Visão Geral: só feedback de cliente', (banner.match(/\.eq\('publico', 'cliente'\)/g) ?? []).length === 2)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncliente x equipe: tudo certo')
process.exit(falhas ? 1 : 0)
