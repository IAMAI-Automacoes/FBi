/**
 * Feedback da equipe: regras puras (sem Deno nem banco), testadas em
 * __testes__/equipe.teste.ts.
 *
 * O restaurante cadastra os funcionários; o sistema pede feedback pelo
 * WhatsApp, de um número só do EasyFeed (o dono não lê essa conversa), e
 * analisa o que eles respondem. Para o restaurante a resposta é anônima.
 *
 * É o mesmo desenho do feedback dos clientes (workflow "Feedback Restaurante"
 * do n8n): junta as mensagens seguidas, a IA separa em pontos com categoria e
 * sentimento, e quem responde é uma atendente com mensagens prontas. Muda o
 * número, as categorias e o cuidado com a identidade.
 */

export const CATEGORIAS_EQUIPE = [
  'Liderança e gestão',
  'Salário e benefícios',
  'Escala e horários',
  'Carga de trabalho',
  'Clima e colegas',
  'Estrutura e equipamentos',
  'Treinamento e crescimento',
  'Reconhecimento',
  'Comunicação',
  'Segurança e saúde',
  'Clientes',
  'Outros',
] as const
export type CategoriaEquipe = (typeof CATEGORIAS_EQUIPE)[number]
export type SentimentoPonto = 'Positivo' | 'Negativo' | 'Neutro' | 'Sugestão'

/** Quem fala com a equipe. Não é a Helena: ela é o atendimento do restaurante. */
export const ATENDENTE = 'Lia'
export const PERGUNTA_PADRAO = 'Como está sendo trabalhar aí? Tem alguma coisa que poderia melhorar?'
export const PERGUNTA_MIN = 10
export const PERGUNTA_MAX = 400
/** Espera a pessoa parar de escrever antes de analisar (junta as mensagens seguidas). */
export const ESPERA_BUFFER_S = 45
/** Resposta até aqui depois do convite conta para aquele envio; depois é espontânea. */
export const JANELA_RESPOSTA_DIAS = 30
/** Análise que falhou tantas vezes: guarda a resposta sem os pontos, para não perder. */
export const MAX_TENTATIVAS_ANALISE = 3
/** Convite "enviando" ou mensagem "processando" há mais que isto travou. */
export const TRAVADO_MS = 10 * 60 * 1000
/** Com menos gente que isto no envio, dá para adivinhar quem falou. */
export const MINIMO_ANONIMO = 4

export const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Mesma chave de src/lib/telefone.ts e de public.telefone_chave: o mesmo celular com e sem o 9. */
export function chaveWhatsapp(n: unknown): string {
  const d = String(n ?? '').replace(/\D/g, '')
  return /^55\d{2}9\d{8}$/.test(d) ? d.slice(0, 4) + d.slice(5) : d
}

/**
 * Os jeitos de o mesmo celular estar gravado (com e sem o 9), para buscar por
 * `telefone in (...)` sem depender de função no filtro.
 */
export function variantesDoNumero(n: unknown): string[] {
  const chave = chaveWhatsapp(n)
  if (!chave) return []
  return /^55\d{10}$/.test(chave) ? [chave, chave.slice(0, 4) + '9' + chave.slice(4)] : [chave]
}

/** Meia-noite de hoje em Brasília (-03:00, sem horário de verão desde 2019). */
export function inicioDoDiaSP(agora: number): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agora))
  return `${dia}T00:00:00-03:00`
}

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
  'Oi{nome}! Aqui é a {atendente}, do EasyFeed.\nEstou ouvindo a equipe {doRestaurante}.',
  'Olá{nome}, tudo bem? Sou a {atendente}, do EasyFeed.\nO pessoal {doRestaurante} quer saber como a equipe está.',
  'Oi{nome}! Eu sou a {atendente}, do EasyFeed.\nVim ouvir quem trabalha na equipe {doRestaurante}.',
]
export const FRASE_ANONIMO = 'Pode responder por aqui, em texto ou áudio.\nÉ anônimo: o restaurante vê o que a equipe falou, mas não vê seu nome nem seu número.'
export const FRASE_PARAR = 'Se não quiser receber essas mensagens, é só responder PARAR.'

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
  return [aberturaDoConvite(p.nome, p.restaurante, qual), p.pergunta.trim(), FRASE_ANONIMO, FRASE_PARAR].join('\n\n')
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

/** "digitando…" das respostas: de 3 a 12 s, conforme o tamanho (como a Helena). */
export function digitandoRespostaMs(texto: string, sorteio: () => number = Math.random): number {
  return Math.round(Math.min(12_000, Math.max(3_000, texto.length * (40 + sorteio() * 30))))
}

// ── O que chega ──────────────────────────────────────────────────────────────

export interface EventoEntrada { token: string; messageId: string; telefone: string; tipo: 'texto' | 'audio'; texto: string }

/**
 * Lê o evento da uazapi (o mesmo corte do nó "Lê a mensagem" do n8n): só
 * mensagem nova de TEXTO ou ÁUDIO, em conversa individual, que não é do
 * próprio número. null = não entra.
 */
export function lerEvento(body: unknown): EventoEntrada | null {
  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any
  const m = b.message ?? {}
  if (b.EventType !== 'messages') return null
  if (m.isGroup === true || m.fromMe === true) return null
  if (typeof m.edited === 'string' && m.edited.trim() !== '') return null
  const token = String(b.token ?? '').trim()
  const messageId = String(m.messageid ?? '').trim()
  if (!token || !messageId) return null
  // Conversa no formato novo (…@lid): o telefone real vem em sender_pn.
  const jid = [m.chatid, m.sender_pn].map((v) => String(v ?? '')).find((v) => v.endsWith('@s.whatsapp.net'))
  if (!jid) return null
  const telefone = jid.split('@')[0].replace(/\D/g, '')
  if (telefone.length < 10 || telefone.length > 15) return null
  if (m.messageType === 'AudioMessage') return { token, messageId, telefone, tipo: 'audio', texto: '' }
  if (m.messageType === 'Conversation' || m.messageType === 'ExtendedTextMessage') {
    const texto = (typeof m.text === 'string' ? m.text : '').trim()
    return texto ? { token, messageId, telefone, tipo: 'texto', texto: texto.slice(0, 4000) } : null
  }
  return null
}

// Mais rígido que o do cliente (lá uma IA confere depois): aqui "queria parar
// de trabalhar domingo", "não quero mais receber salário atrasado" e "não me
// mandem mais para a noite" são feedback, não pedido. Só vale a palavra
// sozinha numa linha ou um pedido claro de não receber mais MENSAGEM.
const PADROES_PARAR = [
  /^\s*(stop|sair|cancelar|descadastrar|parar|pare|para)\s*[.!]*\s*$/m,
  /\bpara(m)? de (me )?(mandar|enviar) (mensage|essas|isso)/,
  /\bnao (quero|queria|desejo) (mais )?receber (mais )?(essas? |suas? |as |nenhuma )?(mensage|contato)/,
  /\bnao (quero|queria|desejo) mais receber( isso)?\s*[.!]*\s*$/m,
  /\bnao (me )?(mande|mandem|envie|enviem) mais (mensage|isso|nada)/,
  /\bnao (me )?(mande|mandem|envie|enviem) mais\s*[.!]*\s*$/m,
  /\b(descadastr|desinscrev)/,
  /\bsair da lista\b/,
  /\b(me )?(tira|tirem|remove|removam|retira) (o meu numero|meu numero|da lista)/,
]
export const ehPedidoDeParar = (texto: unknown) => PADROES_PARAR.some((p) => p.test(semAcento(texto)))
/** A mensagem é SÓ o pedido (não tem feedback junto)? */
export const ehSoPedidoDeParar = (texto: unknown) => ehPedidoDeParar(texto) && semAcento(texto).split(/\s+/).length <= 8

export interface FuncionarioDoNumero { id: number; restaurante_id: number; ativo: boolean; criado_em: string }
export interface ConviteDoNumero { id: number; envio_id: number; restaurante_id: number; funcionario_id: number | null; enviado_em: string | null }
export interface Destino { restauranteId: number; envioId: number | null; conviteId: number | null; funcionarioId: number | null }

/**
 * De qual restaurante (e de qual envio) é a resposta deste número: do convite
 * mais recente que ele recebeu nos últimos 30 dias; sem convite, é resposta
 * espontânea do restaurante onde ele está cadastrado. null = número desconhecido.
 */
export function destinoDaResposta(funcionarios: FuncionarioDoNumero[], convites: ConviteDoNumero[], agora: number): Destino | null {
  const desde = agora - JANELA_RESPOSTA_DIAS * 86_400_000
  const convite = convites
    .filter((c) => c.enviado_em && new Date(c.enviado_em).getTime() >= desde)
    .sort((a, b) => String(b.enviado_em).localeCompare(String(a.enviado_em)))[0]
  if (convite) {
    return { restauranteId: convite.restaurante_id, envioId: convite.envio_id, conviteId: convite.id, funcionarioId: convite.funcionario_id }
  }
  const f = [...funcionarios].sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.criado_em.localeCompare(a.criado_em))[0]
  return f ? { restauranteId: f.restaurante_id, envioId: null, conviteId: null, funcionarioId: f.id } : null
}

// ── A análise ────────────────────────────────────────────────────────────────

export const PROMPT_ANALISE = `Você lê o que um FUNCIONÁRIO de um restaurante escreveu, de forma anônima, sobre como é trabalhar lá. O restaurante quer ouvir a equipe para melhorar e perder menos gente.

Restaurante: {restaurante}
Pergunta que ele recebeu: "{pergunta}"

## Mensagens do funcionário (na ordem)
{mensagens}

## O que fazer
1. Decida o "tipo":
   - "feedback": ele contou algo sobre o trabalho (elogio, crítica, comentário ou sugestão).
   - "pergunta": ele só perguntou algo para este canal (quem é você, se é anônimo mesmo, como funciona).
   - "nada": só cumprimento, "obrigado", "ok", emoji, ou assunto que não é o trabalho.
2. Se for feedback, separe em PONTOS, um por assunto. Para cada ponto:
   - "trecho": as palavras dele sobre aquele assunto, copiadas da mensagem.
   - "resumo": uma frase curta, neutra, em terceira pessoa ("A equipe…", "Um funcionário relata…"), SEM nome de pessoa, cargo, turno, data ou detalhe que mostre quem escreveu.
   - "categoria": exatamente uma destas: {categorias}.
   - "sentimento": "Positivo", "Negativo", "Neutro" ou "Sugestão". Elogio e crítica na mesma frase viram dois pontos.
3. "sensivel": true se ele relata assédio, discriminação, ameaça, agressão, risco à segurança ou à saúde, ou algo ilegal. Senão false.
4. "pergunta_sobre" (só quando o tipo é "pergunta"): "anonimato", "quem_e" ou "outro". Nos outros casos, "".

Não invente ponto que ele não escreveu. Reclamação vaga ("tá difícil") é um ponto Negativo na categoria "Outros".
Chame registrar_analise.`

export const SCHEMA_ANALISE = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['feedback', 'pergunta', 'nada'] },
    pontos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trecho: { type: 'string' },
          resumo: { type: 'string' },
          categoria: { type: 'string', enum: [...CATEGORIAS_EQUIPE] },
          sentimento: { type: 'string', enum: ['Positivo', 'Negativo', 'Neutro', 'Sugestão'] },
        },
        required: ['trecho', 'resumo', 'categoria', 'sentimento'],
      },
    },
    sensivel: { type: 'boolean' },
    pergunta_sobre: { type: 'string', enum: ['anonimato', 'quem_e', 'outro', ''] },
  },
  required: ['tipo', 'pontos', 'sensivel'],
}

/** "[1] oi\n[2] o salário atrasa" (uma mensagem só vai sem número). */
export function numerarMensagens(textos: string[]): string {
  const t = textos.map((x) => x.trim()).filter(Boolean)
  return t.length === 1 ? t[0] : t.map((x, i) => `[${i + 1}] ${x}`).join('\n')
}

export interface PontoEquipe { texto_original: string; resumo: string; categoria: CategoriaEquipe; sentimento: SentimentoPonto }
export interface AnaliseEquipe {
  tipo: 'feedback' | 'pergunta' | 'nada'
  pontos: PontoEquipe[]
  sensivel: boolean
  perguntaSobre: 'anonimato' | 'quem_e' | 'outro' | null
}

function sentimentoDoPonto(valor: unknown): SentimentoPonto | null {
  const v = semAcento(valor)
  if (v.includes('negativ')) return 'Negativo'
  if (v.includes('sugest')) return 'Sugestão'
  if (v.includes('positiv')) return 'Positivo'
  if (v.includes('neutr')) return 'Neutro'
  return null
}
const semNumero = (s: unknown) => String(s ?? '').replace(/^\s*\[\d+\]\s*/, '').replace(/\s+/g, ' ').trim()

/**
 * A resposta da IA como objeto: aceita JSON em texto (com texto em volta) e o
 * objeto embrulhado numa lista de um item só, que alguns modelos devolvem.
 */
// deno-lint-ignore no-explicit-any
function comoObjeto(bruto: unknown): any {
  // deno-lint-ignore no-explicit-any
  let r: any = bruto
  if (typeof r === 'string') {
    try { r = JSON.parse(r) } catch {
      const achado = r.match(/\{[\s\S]*\}/)
      try { r = achado ? JSON.parse(achado[0]) : null } catch { r = null }
    }
  }
  if (Array.isArray(r) && r.length === 1) r = r[0]
  return r && typeof r === 'object' && !Array.isArray(r) ? r : null
}

/** Confere o que a IA devolveu. null = fora do formato (tenta de novo). */
export function lerAnalise(bruto: unknown): AnaliseEquipe | null {
  const r = comoObjeto(bruto)
  if (!r) return null
  const pontos: PontoEquipe[] = []
  for (const p of Array.isArray(r.pontos) ? r.pontos : []) {
    if (!p || typeof p !== 'object') continue
    const sentimento = sentimentoDoPonto(p.sentimento)
    if (!sentimento) continue
    const trecho = semNumero(p.trecho)
    const resumo = semNumero(p.resumo)
    if (!trecho && !resumo) continue
    pontos.push({
      texto_original: (trecho || resumo).slice(0, 1000),
      resumo: (resumo || trecho).slice(0, 200),
      categoria: CATEGORIAS_EQUIPE.find((c) => semAcento(c) === semAcento(p.categoria)) ?? 'Outros',
      sentimento,
    })
  }
  const tipoBruto = semAcento(r.tipo)
  // Ponto válido manda: é feedback mesmo que a IA tenha dito outra coisa.
  const tipo = pontos.length ? 'feedback' : tipoBruto === 'pergunta' ? 'pergunta' : tipoBruto === 'feedback' || tipoBruto === 'nada' ? 'nada' : null
  if (!tipo) return null
  const sobre = semAcento(r.pergunta_sobre)
  return {
    tipo,
    pontos,
    sensivel: tipo === 'feedback' && r.sensivel === true,
    perguntaSobre: tipo === 'pergunta' ? (sobre === 'anonimato' ? 'anonimato' : sobre === 'quem_e' ? 'quem_e' : 'outro') : null,
  }
}

/** Sentimento da mensagem inteira, na mesma ordem dos clientes: os dois > negativo > positivo > sugestão > neutro. */
export function sentimentoGeral(pontos: { sentimento: string }[]): string | null {
  if (!pontos.length) return null
  const tem = (s: string) => pontos.some((p) => p.sentimento === s)
  if (tem('Positivo') && tem('Negativo')) return 'Positivo e Negativo'
  if (tem('Negativo')) return 'Negativo'
  if (tem('Positivo')) return 'Positivo'
  if (tem('Sugestão')) return 'Sugestão'
  return 'Neutro'
}

// ── O que a atendente responde (mensagens prontas, sorteadas) ────────────────

const APRESENTACAO = [`Oi! Aqui é a ${ATENDENTE}, do EasyFeed.`, `Oi, tudo bem? Sou a ${ATENDENTE}, do EasyFeed.`, `Olá! Eu sou a ${ATENDENTE}, do EasyFeed.`]
const AGRADECE: Record<string, string[]> = {
  positivo: [
    'Que bom saber disso!\nObrigada por contar. Já anotei aqui, sem o seu nome.',
    'Obrigada por compartilhar!\nFica registrado, de forma anônima.',
    'Bom demais ler isso, obrigada!\nEstá anotado, sem identificar você.',
  ],
  negativo: [
    'Obrigada por confiar e contar.\nIsso é importante e já está anotado, sem o seu nome.',
    'Sinto muito por isso.\nObrigada por falar: fica registrado de forma anônima para o restaurante olhar.',
    'Entendi, obrigada pela sinceridade.\nEstá anotado, sem identificar você.',
  ],
  misto: [
    'Obrigada por contar o que vai bem e o que incomoda.\nEstá tudo anotado, sem o seu nome.',
    'Valeu pela sinceridade!\nAnotei o que é bom e o que precisa melhorar, de forma anônima.',
    'Obrigada por contar tudo.\nFica registrado, sem identificar você.',
  ],
  sugestao: [
    'Boa ideia, obrigada!\nJá anotei aqui, sem o seu nome.',
    'Obrigada pela sugestão!\nFica registrada, de forma anônima.',
    'Gostei da ideia.\nEstá anotada, sem identificar você.',
  ],
  neutro: [
    'Obrigada por responder!\nEstá anotado, de forma anônima.',
    'Valeu por contar!\nJá anotei aqui, sem o seu nome.',
    'Obrigada!\nFica registrado, sem identificar você.',
  ],
}
const PODE_MANDAR_MAIS = 'Se lembrar de mais alguma coisa, pode mandar por aqui quando quiser.'
const AGRADECE_SENSIVEL = 'Obrigada por confiar em contar isso.\nÉ um assunto sério e fica registrado de forma anônima.\n\nSe precisar de ajuda agora, o Ligue 180 e o Disque 100 atendem de graça, 24 horas.'
const RESPONDE_PERGUNTA = {
  anonimato: 'É anônimo, sim.\nO restaurante vê o que a equipe falou, mas não vê o nome nem o número de ninguém.',
  quem_e: `Sou a ${ATENDENTE}, do EasyFeed.\nO restaurante usa o EasyFeed para ouvir a equipe, e eu recebo as respostas por aqui.`,
  outro: 'Por aqui eu só recebo o que você quiser contar sobre o trabalho.\nPara outros assuntos, fale direto com o restaurante.',
}
export const CONFIRMA_PARAR = 'Pronto, não vou mais te mandar mensagem.'

const chaveDoSentimento = (s: string | null) => {
  const v = semAcento(s)
  if (v.includes('positivo') && v.includes('negativo')) return 'misto'
  if (v.includes('negativo')) return 'negativo'
  if (v.includes('positivo')) return 'positivo'
  if (v.includes('sugest')) return 'sugestao'
  return 'neutro'
}

/**
 * O texto da resposta, ou null quando não se responde (cumprimento sozinho,
 * "ok"…). `apresentar`: ela diz quem é só na primeira mensagem do dia para a
 * pessoa (o convite já conta como apresentação).
 */
export function respostaPronta(p: { analise: AnaliseEquipe; apresentar: boolean; sorteio?: () => number }): string | null {
  const sortear = (lista: string[]) => lista[Math.floor((p.sorteio ?? Math.random)() * lista.length) % lista.length]
  let corpo: string
  if (p.analise.tipo === 'nada') return null
  if (p.analise.tipo === 'pergunta') corpo = RESPONDE_PERGUNTA[p.analise.perguntaSobre ?? 'outro']
  else if (p.analise.sensivel) corpo = AGRADECE_SENSIVEL
  else corpo = `${sortear(AGRADECE[chaveDoSentimento(sentimentoGeral(p.analise.pontos))])}\n\n${PODE_MANDAR_MAIS}`
  // "Sou a Lia" depois de "Aqui é a Lia" ficaria repetido.
  if (p.apresentar && !(p.analise.tipo === 'pergunta' && p.analise.perguntaSobre === 'quem_e')) return `${sortear(APRESENTACAO)}\n${corpo}`
  return corpo
}

// ── O resumo do envio ────────────────────────────────────────────────────────

export const PROMPT_RESUMO = `Você resume, para o dono de um restaurante, o que a EQUIPE dele respondeu de forma anônima sobre como é trabalhar lá. O objetivo é ele saber o que fazer para a equipe ficar melhor e não ir embora.

Restaurante: {restaurante}
Pergunta feita à equipe: "{pergunta}"
Respostas recebidas: {total}

## Pontos (categoria | sentimento | o que foi dito)
{pontos}

## O que escrever
- "clima": uma ou duas frases sobre como a equipe está, no geral.
- "vai_bem": até 4 frases curtas com o que a equipe elogia.
- "incomoda": até 5 frases curtas com o que mais incomoda, do mais citado ou mais grave para o menos.
- "sugestoes": até 4 ideias que a própria equipe deu.
- "por_onde_comecar": UMA providência concreta para o dono fazer primeiro, e o porquê em poucas palavras.

Regras: use só o que está nos pontos; não invente. Não cite nome, cargo, turno nem nada que mostre quem falou. Se pouca gente respondeu, diga isso no "clima" e não generalize. Lista sem nada para dizer fica vazia.
Chame registrar_resumo.`

export const SCHEMA_RESUMO = {
  type: 'object',
  properties: {
    clima: { type: 'string' },
    vai_bem: { type: 'array', items: { type: 'string' } },
    incomoda: { type: 'array', items: { type: 'string' } },
    sugestoes: { type: 'array', items: { type: 'string' } },
    por_onde_comecar: { type: 'string' },
  },
  required: ['clima', 'vai_bem', 'incomoda', 'sugestoes', 'por_onde_comecar'],
}

export interface ResumoEquipe { clima: string; vai_bem: string[]; incomoda: string[]; sugestoes: string[]; por_onde_comecar: string }

export const pontosParaResumo = (pontos: { categoria: string; sentimento: string; resumo: string; texto_original: string }[]) =>
  pontos.map((p) => `- ${p.categoria} | ${p.sentimento} | ${(p.resumo || p.texto_original).replace(/\s+/g, ' ').trim()}`).join('\n')

export function lerResumo(bruto: unknown): ResumoEquipe | null {
  const r = comoObjeto(bruto)
  if (!r) return null
  const frase = (v: unknown, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => frase(x, 240)).filter(Boolean).slice(0, max)
  const resumo = {
    clima: frase(r.clima),
    vai_bem: lista(r.vai_bem, 4),
    incomoda: lista(r.incomoda, 5),
    sugestoes: lista(r.sugestoes, 4),
    por_onde_comecar: frase(r.por_onde_comecar),
  }
  return resumo.clima ? resumo : null
}
