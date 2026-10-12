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
  'pamonharia', 'brasa', 'vila', 'toca', 'esquina', 'fazenda', 'quinta', 'barraca', 'tenda', 'cabana']

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
