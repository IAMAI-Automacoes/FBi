/**
 * Feedback da equipe: as regras do PEDIDO de feedback (sem Deno nem banco),
 * testadas em __testes__/equipe.teste.ts.
 *
 * O restaurante cadastra os funcionários e pede feedback pelo MESMO WhatsApp
 * que usa com os clientes. Quem manda o pedido é a função `equipe` (uma
 * mensagem por minuto, para não ter cara de disparo). O que o funcionário
 * responde entra pelo n8n ("Feedback Restaurante", ramo da equipe:
 * docs/n8n/README.md), é gravado pela função do banco
 * `equipe_registrar_feedback` e segue pelo mesmo motor dos clientes (temas,
 * insights e ações), separado pela coluna `publico` (_shared/publico.ts).
 *
 * Quem falou: depois do feedback a pessoa recebe um botão perguntando se quer
 * ficar anônima. Sem resposta no prazo, o nome aparece (migration
 * 20261014000000).
 */

export { CATEGORIAS_EQUIPE, type CategoriaEquipe } from './publico.ts'

/** Quem fala com a equipe: a mesma Helena que responde os clientes (é o número do restaurante). */
export const ATENDENTE = 'Helena'
export const PERGUNTA_PADRAO = 'Como está sendo trabalhar aqui? Tem alguma coisa que poderia melhorar?'
export const PERGUNTA_MIN = 10
export const PERGUNTA_MAX = 400
/** Convite "enviando" há mais que isto travou. */
export const TRAVADO_MS = 10 * 60 * 1000

export const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ── O convite ────────────────────────────────────────────────────────────────

/** "maria silva" → "Maria". */
export function primeiroNome(nome: unknown): string {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? ''
  if (!p || /\d/.test(p)) return ''
  return p.length > 1 && p === p.toLowerCase() ? p[0].toUpperCase() + p.slice(1) : p
}

// "do Camelo", mas "da Pizzaria Bella" (a mesma lista do "Monta a resposta" do n8n).
const FEMININOS = ['pizzaria', 'cantina', 'churrascaria', 'padaria', 'lanchonete', 'casa', 'hamburgueria',
  'sorveteria', 'cafeteria', 'confeitaria', 'trattoria', 'osteria', 'esfiharia', 'pastelaria', 'tapiocaria',
  'creperia', 'doceria', 'adega', 'choperia', 'chopperia', 'cervejaria', 'peixaria', 'petiscaria', 'galeteria',
  'marmitaria', 'cozinha', 'tasca', 'taberna', 'bodega', 'panificadora', 'sanduicheria', 'temakeria',
  'pamonharia', 'brasa', 'vila', 'toca', 'esquina', 'fazenda', 'quinta', 'barraca', 'tenda', 'cabana',
  // Versão RH: a conta pode ser de qualquer empresa.
  'empresa', 'loja', 'clinica', 'farmacia', 'drogaria', 'escola', 'creche', 'faculdade', 'universidade', 'academia',
  'oficina', 'imobiliaria', 'construtora', 'incorporadora', 'transportadora', 'distribuidora', 'agencia', 'industria',
  'fabrica', 'metalurgica', 'grafica', 'editora', 'produtora', 'consultoria', 'corretora', 'seguradora', 'otica',
  'livraria', 'papelaria', 'barbearia', 'boutique', 'pousada', 'lavanderia', 'floricultura', 'mercearia',
  'cooperativa', 'associacao', 'fundacao', 'autoescola', 'startup']

/** Nome que entra na mensagem quando a conta RH ainda não tem nome: "da empresa". */
export const NOME_GENERICO_DA_EMPRESA = 'empresa'

/** Como o prompt chama o negócio da conta: restaurante (versão Restaurante) ou empresa (versão RH). */
export function negocioDaArea(area: unknown): { negocio: string; umNegocio: string; Negocio: string; oNegocio: string } {
  return String(area ?? '') === 'rh'
    ? { negocio: 'empresa', umNegocio: 'uma empresa', Negocio: 'Empresa', oNegocio: 'a empresa' }
    : { negocio: 'restaurante', umNegocio: 'um restaurante', Negocio: 'Restaurante', oNegocio: 'o restaurante' }
}

export function doRestaurante(nome: unknown): string {
  const r = String(nome ?? '').replace(/\s+/g, ' ').trim()
  if (!r) return 'do restaurante'
  return (FEMININOS.includes(semAcento(r.split(' ')[0])) ? 'da ' : 'do ') + r
}

// Três jeitos de começar, sorteados: mensagem idêntica para todo mundo tem cara de disparo.
const ABERTURAS = [
  'Oi{nome}! Aqui é a {atendente}, {doRestaurante}.\nQueria ouvir quem trabalha aqui com a gente.',
  'Olá{nome}, tudo bem? Aqui é a {atendente}, {doRestaurante}.\nA gente quer saber como está sendo trabalhar aqui.',
  'Oi{nome}! Sou a {atendente}, {doRestaurante}.\nEstou ouvindo a equipe pra saber o que pode melhorar por aqui.',
]
// Não promete anonimato de saída: a pessoa escolhe depois, no botão.
export const FRASE_COMO_RESPONDER = 'Pode responder por aqui mesmo, em texto ou áudio.\nDepois eu pergunto se você quer que sua resposta fique anônima.'
export const FRASE_PARAR = 'Se não quiser receber essas mensagens, é só responder PARAR.'

/**
 * Quantas horas a pessoa tem para responder a pergunta do anonimato, a partir
 * do valor de EQUIPE_PRAZO_IDENTIDADE_HORAS (integracao_config). O mesmo corte
 * do banco (`equipe_prazo_identidade`): 24 por padrão, de 1 a 720.
 */
export const PRAZO_IDENTIDADE_PADRAO_H = 24
export function prazoIdentidadeHoras(valor: unknown): number {
  const texto = String(valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return PRAZO_IDENTIDADE_PADRAO_H
  return Math.min(Math.max(Number(texto), 1), 720)
}

export function aberturaDoConvite(nome: unknown, restaurante: unknown, qual = 0): string {
  const n = primeiroNome(nome)
  return ABERTURAS[Math.abs(Math.trunc(qual)) % ABERTURAS.length]
    .replace('{nome}', n ? `, ${n}` : '')
    .replace('{atendente}', ATENDENTE)
    .replace('{doRestaurante}', doRestaurante(restaurante))
}

/** A pergunta do envio, limpa; null = não serve (curta ou longa demais). */
export function validarPergunta(p: unknown): string | null {
  const t = String(p ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return t.length >= PERGUNTA_MIN && t.length <= PERGUNTA_MAX ? t : null
}

/** A mensagem inteira do convite. */
export function montarConvite(p: { nome: unknown; restaurante: unknown; pergunta: string; sorteio?: () => number }): string {
  const qual = Math.floor((p.sorteio ?? Math.random)() * ABERTURAS.length)
  return [aberturaDoConvite(p.nome, p.restaurante, qual), p.pergunta.trim(), FRASE_COMO_RESPONDER, FRASE_PARAR].join('\n\n')
}

// ── Ritmo do envio (para não ter cara de disparo em massa) ───────────────────

/** Convites só saem de segunda a sábado, das 9h às 20h de Brasília. */
export function janelaDeEnvio(agora: number): boolean {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(agora))
  const dia = partes.find((x) => x.type === 'weekday')?.value ?? ''
  const hora = Number(partes.find((x) => x.type === 'hour')?.value ?? -1)
  return dia !== 'Sun' && hora >= 9 && hora < 20
}

/** Entre um convite e o próximo: de 40 a 90 s (a rotina roda de minuto em minuto). */
export const intervaloEntreConvitesMs = (sorteio: () => number = Math.random) => 40_000 + Math.round(sorteio() * 50_000)

/** "digitando…" do convite: o tempo de escrever aquele texto, de 8 a 25 s (como o Status Ações). */
export function digitandoConviteMs(texto: string, sorteio: () => number = Math.random): number {
  return Math.round(Math.min(25_000, Math.max(8_000, texto.length * (45 + sorteio() * 30) + 2_000 + sorteio() * 3_000)))
}

/**
 * O alerta urgente da equipe: o texto que o DONO recebe no WhatsApp quando chega
 * um relato grave. Leva o relato, e nunca o nome nem o telefone de quem falou
 * (a pessoa ainda pode pedir anonimato).
 */
export function mensagemDoAlertaDaEquipe(resumo: string, relato: string): string {
  const limpo = String(relato || '').replace(/\s+/g, ' ').trim()
  const trecho = limpo.length > 900 ? limpo.slice(0, 900).trimEnd() + '…' : limpo
  return [
    `Alerta da equipe: ${String(resumo || '').trim() || 'chegou um relato grave.'}`,
    '',
    'Um funcionário relatou:',
    `"${trecho}"`,
    '',
    'Quem falou só aparece no painel se a pessoa deixar. Veja em Equipe > Feedbacks.',
  ].join('\n')
}

// ── Aviso para a equipe toda (ação concluída) ────────────────────────────────
// Quando a gestão conclui uma ação que nasceu do que a equipe falou, o dono pode
// contar para todos. O texto passa por ele antes de sair (a IA só rascunha), e
// nunca diz quem falou.

export const AVISO_MIN = 20
export const AVISO_MAX = 600

const ABERTURAS_AVISO = [
  'Oi{nome}! Aqui é a {atendente}, {doRestaurante}.\nPassando pra contar uma novidade.',
  'Olá{nome}, tudo bem? Aqui é a {atendente}, {doRestaurante}.\nTenho uma novidade sobre o que a equipe comentou.',
  'Oi{nome}! Sou a {atendente}, {doRestaurante}.\nVim contar o que mudou por aqui.',
]
export const FRASE_RESPONDER_AVISO = 'Se quiser comentar, é só responder por aqui.'

export function aberturaDoAviso(nome: unknown, restaurante: unknown, qual = 0): string {
  const n = primeiroNome(nome)
  return ABERTURAS_AVISO[Math.abs(Math.trunc(qual)) % ABERTURAS_AVISO.length]
    .replace('{nome}', n ? `, ${n}` : '')
    .replace('{atendente}', ATENDENTE)
    .replace('{doRestaurante}', doRestaurante(restaurante))
}

/** O texto do aviso, limpo; null = não serve (curto ou longo demais). */
export function validarAviso(t: unknown): string | null {
  const limpo = String(t ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return limpo.length >= AVISO_MIN && limpo.length <= AVISO_MAX ? limpo : null
}

/** O rascunho quando a IA não escreveu (desligada, sem crédito ou fora do ar). */
export function rascunhoPadraoDoAviso(titulo: unknown): string {
  const t = String(titulo ?? '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')
  return t
    ? `Vocês comentaram e a gestão cuidou disso:\n${t}.`
    : 'A gestão concluiu uma ação que nasceu do que vocês comentaram.'
}

/** A mensagem inteira do aviso, para uma pessoa. */
export function montarAviso(p: { nome: unknown; restaurante: unknown; texto: string; sorteio?: () => number }): string {
  const qual = Math.floor((p.sorteio ?? Math.random)() * ABERTURAS_AVISO.length)
  return [aberturaDoAviso(p.nome, p.restaurante, qual), p.texto.trim(), FRASE_RESPONDER_AVISO, FRASE_PARAR].join('\n\n')
}

/** O prompt do rascunho (agente `aviso_equipe`, chave `ef_equipe_aviso`). */
export const PROMPT_AVISO = `Voce escreve uma mensagem curta de WhatsApp para a EQUIPE de {um_negocio}, contando que a gestao concluiu uma acao que nasceu do que a propria equipe comentou.

{Negocio}: {restaurante}
Categoria: {categoria}
A acao concluida: {titulo}
O que foi feito: {plano}

Regras:
- De 2 a 4 linhas curtas, do jeito que uma pessoa escreve no WhatsApp. Sem saudacao e sem despedida: elas ja vem prontas antes e depois do seu texto.
- Diga, de forma geral, o que a equipe tinha comentado ("voces comentaram que...") e o que mudou na pratica.
- NUNCA diga nem insinue quem comentou. Nada de nome, cargo, turno ou setor de quem falou.
- Nao prometa o que o plano nao diz. Nao invente data, valor nem numero.
- Sem emoji, sem negrito, sem lista. Nada de "prezados", "colaboradores", "feedback" ou "alinhamento".
- Se a acao tratar de assedio, ameaca, discriminacao, agressao ou de uma pessoa especifica, NAO conte o caso: escreva so que a gestao esta cuidando do assunto com seriedade, sem detalhes.

Chame registrar_aviso com o texto.`

export const SCHEMA_AVISO = {
  type: 'object',
  properties: { texto: { type: 'string', description: 'De 2 a 4 linhas curtas, sem saudacao nem despedida.' } },
  required: ['texto'],
}

// ── Pedido automático ────────────────────────────────────────────────────────
// O sistema pede feedback sozinho, de tempos em tempos (toda semana, a cada 15
// dias ou todo mês), sempre de manhã e nunca no domingo. O mensal é pelo
// calendário: no começo do mês (dia 1) ou no dia que o dono escolher.

export const FREQUENCIAS_AUTOMATICAS = [7, 14, 30] as const
export const frequenciaValida = (v: unknown): v is (typeof FREQUENCIAS_AUTOMATICAS)[number] =>
  (FREQUENCIAS_AUTOMATICAS as readonly number[]).includes(Number(v))

const DIA_MS = 86_400_000
/** Brasília é UTC-3 o ano todo (sem horário de verão desde 2019). */
const BRASILIA_MS = 3 * 3_600_000
/** A hora em que o pedido automático entra na fila: 10h de Brasília. */
const HORA_DO_AUTOMATICO = 10

/** 10h de Brasília do dia em que `instante` cai lá; domingo vira segunda. */
function manhaUtil(instante: number): number {
  const local = new Date(instante - BRASILIA_MS)
  let dia = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  if (new Date(dia).getUTCDay() === 0) dia += DIA_MS
  return dia + HORA_DO_AUTOMATICO * 3_600_000 + BRASILIA_MS
}

/** A próxima manhã útil DEPOIS de hoje (liga hoje, o primeiro pedido sai amanhã). */
export function proximaManha(agora: number): number {
  return manhaUtil(agora + DIA_MS)
}

/** A frequência que anda pelo calendário (dia do mês) em vez de contar dias. */
export const MENSAL = 30

/** O dia do mês do pedido mensal, de 1 a 31; null = não serve. */
export function diaDoMesValido(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

/**
 * Pedido mensal: a próxima vez que cai o dia `dia`, DEPOIS de hoje (pelo
 * calendário de Brasília), às 10h. Em mês mais curto vale o último dia dele
 * (dia 31 em fevereiro sai no dia 28 ou 29), e domingo vira segunda.
 */
export function proximoDiaDoMes(agora: number, dia: number): number {
  const d = diaDoMesValido(dia) ?? 1
  const local = new Date(agora - BRASILIA_MS)
  const ano = local.getUTCFullYear()
  const mes = local.getUTCMonth()
  // O Date resolve sozinho o mês 12 como janeiro do ano seguinte.
  const noMes = (m: number) => Math.min(d, new Date(Date.UTC(ano, m + 1, 0)).getUTCDate())
  const esteMes = noMes(mes)
  const [m, diaAlvo] = esteMes > local.getUTCDate() ? [mes, esteMes] : [mes + 1, noMes(mes + 1)]
  // Meio-dia de Brasília do dia alvo: a manhã útil dele (ou a segunda seguinte).
  return manhaUtil(Date.UTC(ano, m, diaAlvo) + BRASILIA_MS + 12 * 3_600_000)
}

/**
 * Quando sai o próximo pedido depois de `base`. Semanal e quinzenal contam os
 * dias; o mensal vai para o dia do mês escolhido (1 quando não foi dito).
 */
export function proximoPedido(base: number, cadaDias: number, diaDoMes?: number | null): number {
  if (Math.trunc(cadaDias) === MENSAL) return proximoDiaDoMes(base, diaDoMes ?? 1)
  return manhaUtil(base + Math.max(1, Math.trunc(cadaDias)) * DIA_MS)
}

/**
 * Ao ligar (ou mudar a frequência ou o dia). Semanal e quinzenal respeitam o
 * último pedido que já saiu, para não mandar dois em seguida. O mensal segue o
 * calendário: é o dia que o dono escolheu, tenha ele pedido à mão ou não. Em
 * nenhum caso cai hoje.
 */
export function primeiroPedidoAutomatico(agora: number, cadaDias: number, ultimoPedidoEm: number | null, diaDoMes?: number | null): number {
  if (Math.trunc(cadaDias) === MENSAL) return proximoDiaDoMes(agora, diaDoMes ?? 1)
  const pelaFrequencia = ultimoPedidoEm ? proximoPedido(ultimoPedidoEm, cadaDias) : 0
  return Math.max(proximaManha(agora), pelaFrequencia)
}
