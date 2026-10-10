/**
 * Missões de vídeo: regras puras (sem Deno nem banco), testadas em
 * __testes__/videos-missao.teste.ts.
 *
 * O restaurante grava um vídeo falando do EasyFeed para cumprir uma missão; a
 * IA (Gemini) assiste e diz, requisito por requisito, se cumpriu. Aprovado, o
 * banco dá o prêmio do degrau seguinte da escada (gatilho em video_envios).
 * Os limites daqui são os mesmos da tela (src/lib/missoes.ts).
 */

/** 300 MB: o mesmo file_size_limit do bucket videos-clientes. */
export const LIMITE_BYTES = 300 * 1024 * 1024
/** Duração máxima quando a missão não define a dela (custo e tempo de análise). */
export const DURACAO_PADRAO_MAX_S = 180
/** Nenhuma missão aceita mais que isto. */
export const DURACAO_TETO_S = 300
/** Reprovações por missão antes de travar (cada análise custa). */
export const MAX_REPROVADOS = 5
/** Análise que passou disso sem terminar travou: libera um envio novo. */
export const ANALISE_TRAVADA_MS = 15 * 60 * 1000

const POR_EXTENSAO: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
}
export const TIPOS_ACEITOS = [...new Set(Object.values(POR_EXTENSAO))]

export interface Requisito { id: string; texto: string }
export interface Missao {
  id: number
  titulo: string
  descricao: string
  requisitos: Requisito[]
  ativa: boolean
  /** Posição na fila de missões (o restaurante faz uma de cada vez, nesta ordem). */
  ordem?: number | null
  /** Passo a passo para gravar (um por linha). */
  roteiro?: string
  duracao_min_s?: number | null
  duracao_max_s?: number | null
  /** 'AAAA-MM-DD', horário de Brasília, inclusive. */
  disponivel_de?: string | null
  disponivel_ate?: string | null
}
export interface EnvioResumo { id: string; status: string; criado_em: string; atualizado_em?: string | null; aprovado_em?: string | null }
export type MissaoNaFila = Pick<Missao, 'id' | 'ativa' | 'ordem' | 'disponivel_de' | 'disponivel_ate'>
export interface EnvioDaFila extends EnvioResumo { missao_id: number }

export type MotivoRecusa =
  | 'missao_inativa' | 'fora_do_periodo' | 'ja_aprovada' | 'em_analise' | 'limite_tentativas' | 'nao_liberada' | 'limite_ano'
  | 'sem_autorizacao' | 'tipo_invalido' | 'arquivo_vazio' | 'muito_grande' | 'muito_curto' | 'muito_longo'

/** Os requisitos como vieram do jsonb: só os que têm texto, com id único. */
export function lerRequisitos(bruto: unknown): Requisito[] {
  const lista = Array.isArray(bruto) ? bruto : []
  const vistos = new Set<string>()
  const saida: Requisito[] = []
  lista.forEach((r, i) => {
    const texto = String((r as { texto?: unknown })?.texto ?? '').trim()
    if (!texto) return
    let id = String((r as { id?: unknown })?.id ?? '').trim() || `r${i + 1}`
    while (vistos.has(id)) id += '_'
    vistos.add(id)
    saida.push({ id, texto: texto.slice(0, 300) })
  })
  return saida
}

/** O tipo do vídeo: o que o navegador disse ou, se veio vazio/estranho, pela extensão. */
export function mimeDoVideo(mime: unknown, nomeArquivo: unknown): string {
  const m = String(mime ?? '').toLowerCase().trim()
  if (TIPOS_ACEITOS.includes(m)) return m
  const ext = String(nomeArquivo ?? '').toLowerCase().split('.').pop() ?? ''
  return POR_EXTENSAO[ext] ?? ''
}

/** Onde o arquivo fica no bucket: restaurante_<id>/<envio>.<ext> */
export function caminhoDoEnvio(restauranteId: number, envioId: string, mime: string): string {
  const ext = Object.entries(POR_EXTENSAO).find(([, t]) => t === mime)?.[0] ?? 'mp4'
  return `restaurante_${restauranteId}/${envioId}.${ext}`
}

const travada = (e: EnvioResumo, agora: number) =>
  agora - new Date(e.atualizado_em ?? e.criado_em).getTime() > ANALISE_TRAVADA_MS

// ── Datas no horário de Brasília (sem horário de verão desde 2019: -03:00) ──

/** Hoje em Brasília, 'AAAA-MM-DD'. */
export function hojeSP(agora: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agora))
}

/** 1º de janeiro deste ano, meia-noite em Brasília (a escada e o limite recomeçam aí). */
export function inicioDoAnoSP(agora: number): string {
  return `${hojeSP(agora).slice(0, 4)}-01-01T00:00:00-03:00`
}

/** A missão está no período dela hoje? (sem datas = sempre) */
export function noPeriodo(m: Pick<Missao, 'disponivel_de' | 'disponivel_ate'>, hoje: string): boolean {
  return (!m.disponivel_de || hoje >= m.disponivel_de) && (!m.disponivel_ate || hoje <= m.disponivel_ate)
}

/** Quanto o vídeo desta missão pode durar, em segundos. */
export function duracaoDaMissao(m: Pick<Missao, 'duracao_min_s' | 'duracao_max_s'>): { min: number | null; max: number } {
  const max = Math.min(DURACAO_TETO_S, m.duracao_max_s ?? DURACAO_PADRAO_MAX_S)
  return { min: m.duracao_min_s ? Math.min(m.duracao_min_s, max) : null, max }
}

/** Vídeos do restaurante que contam para o limite do ano: aprovados neste ano e os em análise. */
export function contagemDoAno(envios: EnvioResumo[], inicioDoAno: string, agora: number): { aprovados: number; emAnalise: number } {
  const desde = new Date(inicioDoAno).getTime()
  return {
    aprovados: envios.filter((e) => e.status === 'aprovado' && e.aprovado_em && new Date(e.aprovado_em).getTime() >= desde).length,
    emAnalise: envios.filter((e) => e.status === 'analisando' && !travada(e, agora)).length,
  }
}

/**
 * As missões são uma fila: o restaurante só vê e só manda vídeo para a primeira
 * (pela ordem do admin) que ainda não cumpriu. Pula as desativadas, as fora do
 * período e as que esgotaram as tentativas. null = não sobrou nenhuma. A tela
 * usa a mesma regra (proximaMissao em src/lib/missoes.ts).
 */
export function proximaMissao<M extends MissaoNaFila>(missoes: M[], envios: Pick<EnvioDaFila, 'missao_id' | 'status'>[], hoje: string): M | null {
  return missoes
    .filter((m) => m.ativa && noPeriodo(m, hoje))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id - b.id)
    .find((m) => {
      const daMissao = envios.filter((e) => e.missao_id === m.id)
      return !daMissao.some((e) => e.status === 'aprovado') && daMissao.filter((e) => e.status === 'reprovado').length < MAX_REPROVADOS
    }) ?? null
}

/** Pode mandar um vídeo novo para esta missão? */
export function podeEnviar(p: {
  missao: Missao | null
  /** Os envios do restaurante NESTA missão. */
  envios: EnvioResumo[]
  /** A missão da vez do restaurante (proximaMissao); só ela aceita vídeo. */
  proximaId: number | null
  /** Vídeos do restaurante no ano (todas as missões), ver contagemDoAno. */
  ano: { aprovados: number; emAnalise: number }
  /** Vídeos aprovados por ano, por restaurante; null = sem limite. */
  maxPorAno: number | null
  /** Hoje em Brasília, 'AAAA-MM-DD'. */
  hoje: string
  mime: string
  tamanho: number
  duracao: number | null
  autorizou: boolean
  agora: number
}): { ok: true } | { ok: false; motivo: MotivoRecusa } {
  const recusa = (motivo: MotivoRecusa) => ({ ok: false as const, motivo })
  if (!p.missao || !p.missao.ativa) return recusa('missao_inativa')
  if (!noPeriodo(p.missao, p.hoje)) return recusa('fora_do_periodo')
  if (p.envios.some((e) => e.status === 'aprovado')) return recusa('ja_aprovada')
  if (p.envios.some((e) => e.status === 'analisando' && !travada(e, p.agora))) return recusa('em_analise')
  if (p.envios.filter((e) => e.status === 'reprovado').length >= MAX_REPROVADOS) return recusa('limite_tentativas')
  if (p.proximaId !== p.missao.id) return recusa('nao_liberada')
  // Os que estão em análise contam: se todos forem aprovados, não pode passar do limite.
  if (p.maxPorAno != null && p.ano.aprovados + p.ano.emAnalise >= p.maxPorAno) return recusa('limite_ano')
  if (!p.autorizou) return recusa('sem_autorizacao')
  if (!TIPOS_ACEITOS.includes(p.mime)) return recusa('tipo_invalido')
  if (!(p.tamanho > 0)) return recusa('arquivo_vazio')
  if (p.tamanho > LIMITE_BYTES) return recusa('muito_grande')
  const { min, max } = duracaoDaMissao(p.missao)
  if (p.duracao != null && min != null && p.duracao < min) return recusa('muito_curto')
  if (p.duracao != null && p.duracao > max) return recusa('muito_longo')
  return { ok: true }
}

export const MENSAGENS_RECUSA: Record<MotivoRecusa, string> = {
  missao_inativa: 'Esta missão não está mais disponível.',
  fora_do_periodo: 'Esta missão não está disponível agora.',
  ja_aprovada: 'Você já cumpriu esta missão.',
  em_analise: 'Seu vídeo desta missão ainda está sendo analisado. Espere o resultado.',
  limite_tentativas: 'Você chegou ao limite de tentativas desta missão.',
  nao_liberada: 'Esta missão ainda não foi liberada. Cumpra antes a missão da vez.',
  limite_ano: 'Você chegou ao limite de vídeos deste ano. Em janeiro dá para mandar de novo.',
  sem_autorizacao: 'Para mandar o vídeo, é preciso autorizar o uso na divulgação.',
  tipo_invalido: 'Esse arquivo não é um vídeo aceito. Use MP4, MOV ou WEBM.',
  arquivo_vazio: 'O arquivo está vazio.',
  muito_grande: 'O vídeo passa de 300 MB. Grave um mais curto ou em qualidade menor.',
  muito_curto: 'O vídeo é mais curto do que esta missão pede.',
  muito_longo: 'O vídeo passa do tempo máximo desta missão. Grave um mais curto.',
}

// ── A análise ────────────────────────────────────────────────────────────────

/** Os passos do roteiro (um por linha, sem a numeração que o admin digitou). */
export function passosDoRoteiro(roteiro: unknown): string[] {
  return String(roteiro ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*(\d+[.)-]|[-•*])\s*/, '').trim()).filter(Boolean)
}

export function montarPromptAnalise(missao: Missao): string {
  const lista = missao.requisitos.map((r, i) => `${i + 1}. ${r.texto}`).join('\n')
  const passos = passosDoRoteiro(missao.roteiro)
  const roteiro = passos.length
    ? `\n\nROTEIRO SUGERIDO (o restaurante recebeu este passo a passo para gravar; use para entender o vídeo, mas quem decide são os REQUISITOS):\n${passos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nDiga em "roteiro_seguido" (true ou false) se o vídeo seguiu o roteiro no geral e, em "comentario_roteiro", uma frase curta para o restaurante sobre isso.`
    : ''
  return `Você confere um vídeo que o dono ou alguém da equipe de um restaurante gravou falando do EasyFeed, para cumprir uma missão e ganhar um prêmio.

O EasyFeed é um sistema para restaurantes: os clientes mandam a opinião pelo WhatsApp (pelo QR Code na mesa), o restaurante vê tudo organizado num painel, recebe ideias do que melhorar e avisa o cliente quando muda alguma coisa.

MISSÃO: ${missao.titulo}
${missao.descricao}

REQUISITOS (o vídeo precisa cumprir TODOS):
${lista}

Assista o vídeo inteiro e ouça o áudio. Para cada requisito, pelo número, diga se o vídeo cumpre (true ou false) e explique em UMA frase curta, em português, falando com o restaurante (ex.: "Você falou o nome EasyFeed logo no começo."). Seja justo e rigoroso: só marque true se der para ver ou ouvir com clareza. Na dúvida, false.

Confira também se o conteúdo é adequado: é um vídeo de verdade, gravado pelo restaurante, falando do EasyFeed de forma honesta; não é tela preta, vídeo de outra empresa ou baixado da internet, e não tem palavrão, ofensa ou conteúdo impróprio. Se não for adequado, "conteudo_adequado": false e explique em "problema_conteudo" (uma frase); se for, "problema_conteudo": "".

"resumo": uma ou duas frases sobre o que aparece no vídeo, para a equipe do EasyFeed.${roteiro}`
}

/** O formato da resposta da IA (responseSchema do Gemini). */
export const SCHEMA_ANALISE = {
  type: 'OBJECT',
  properties: {
    requisitos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numero: { type: 'INTEGER' },
          cumpriu: { type: 'BOOLEAN' },
          motivo: { type: 'STRING' },
        },
        required: ['numero', 'cumpriu', 'motivo'],
      },
    },
    conteudo_adequado: { type: 'BOOLEAN' },
    problema_conteudo: { type: 'STRING' },
    resumo: { type: 'STRING' },
    // Só quando a missão tem roteiro (informativo: não decide).
    roteiro_seguido: { type: 'BOOLEAN' },
    comentario_roteiro: { type: 'STRING' },
  },
  required: ['requisitos', 'conteudo_adequado', 'problema_conteudo', 'resumo'],
}

export interface RequisitoAvaliado extends Requisito { cumpriu: boolean; motivo: string }
export interface Analise {
  requisitos: RequisitoAvaliado[]
  conteudo_adequado: boolean
  problema_conteudo: string
  resumo: string
  /** Se o vídeo seguiu o roteiro (só informativo; quem decide são os requisitos). */
  roteiro?: { seguido: boolean; comentario: string }
}
export interface Veredito {
  status: 'aprovado' | 'reprovado' | 'erro'
  analise: Analise | null
  motivo: string
}

const frase = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * O veredito a partir do que a IA respondeu: aprova só se TODOS os requisitos
 * foram cumpridos e o conteúdo é adequado. Resposta fora do formato, ou que
 * deixou algum requisito sem resposta, vira erro (o admin roda de novo).
 */
export function decidirResultado(missao: Missao, bruto: unknown): Veredito {
  let r: any = bruto
  if (typeof r === 'string') {
    try { r = JSON.parse(r) } catch {
      const achado = r.match(/\{[\s\S]*\}/)
      try { r = achado ? JSON.parse(achado[0]) : null } catch { r = null }
    }
  }
  const erro = (motivo: string): Veredito => ({ status: 'erro', analise: null, motivo })
  if (!r || typeof r !== 'object' || !Array.isArray(r.requisitos) || typeof r.conteudo_adequado !== 'boolean') {
    return erro('A análise automática não terminou. A equipe do EasyFeed vai olhar o seu vídeo.')
  }
  const porNumero = new Map<number, { cumpriu: unknown; motivo: unknown }>()
  for (const item of r.requisitos) {
    const n = Number(item?.numero)
    if (Number.isInteger(n) && !porNumero.has(n)) porNumero.set(n, item)
  }
  const requisitos: RequisitoAvaliado[] = []
  for (const [i, req] of missao.requisitos.entries()) {
    const resposta = porNumero.get(i + 1)
    if (!resposta || typeof resposta.cumpriu !== 'boolean') {
      return erro('A análise automática não terminou. A equipe do EasyFeed vai olhar o seu vídeo.')
    }
    requisitos.push({ ...req, cumpriu: resposta.cumpriu, motivo: frase(resposta.motivo) })
  }
  const analise: Analise = {
    requisitos,
    conteudo_adequado: r.conteudo_adequado,
    problema_conteudo: frase(r.problema_conteudo),
    resumo: frase(r.resumo, 600),
  }
  if (passosDoRoteiro(missao.roteiro).length && typeof r.roteiro_seguido === 'boolean') {
    analise.roteiro = { seguido: r.roteiro_seguido, comentario: frase(r.comentario_roteiro) }
  }
  if (!analise.conteudo_adequado) {
    return { status: 'reprovado', analise, motivo: `O vídeo não foi aceito: ${analise.problema_conteudo || 'o conteúdo não está de acordo com a missão.'}` }
  }
  const faltou = requisitos.filter((x) => !x.cumpriu)
  if (faltou.length) {
    return { status: 'reprovado', analise, motivo: `Quase lá! Faltou: ${faltou.map((x) => x.texto.replace(/[.!]+$/, '')).join('; ')}.` }
  }
  return { status: 'aprovado', analise, motivo: 'Missão cumprida! Seu vídeo atende todos os requisitos.' }
}

// ── Envio em blocos (o vídeo nunca fica inteiro na memória da função) ────────

/**
 * Lê o stream e devolve blocos de exatamente `tamanho` bytes (o último pode ser
 * menor). A Files API do Gemini quer os blocos do upload em múltiplos de 8 MB.
 */
export async function* emBlocos(stream: ReadableStream<Uint8Array>, tamanho: number): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const leitor = stream.getReader()
  let bloco = new Uint8Array(tamanho)
  let usado = 0
  try {
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      let pos = 0
      while (pos < value.length) {
        const cabe = Math.min(tamanho - usado, value.length - pos)
        bloco.set(value.subarray(pos, pos + cabe), usado)
        usado += cabe
        pos += cabe
        if (usado === tamanho) {
          yield bloco
          bloco = new Uint8Array(tamanho)
          usado = 0
        }
      }
    }
    if (usado > 0) yield bloco.subarray(0, usado)
  } finally {
    leitor.releaseLock()
  }
}
