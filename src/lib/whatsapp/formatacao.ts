/**
 * Regras da tela WhatsApp que não dependem de React nem do Supabase — e por
 * isso são testadas (src/lib/__testes__/whatsapp.teste.ts).
 *
 * Os valores vêm de mensagens_whatsapp, que guarda o que a uazapi manda de
 * verdade (ver SIMULACAO-WHATSAPP.txt, item 3).
 */

export type TipoMensagem =
  | 'text' | 'image' | 'video' | 'gif' | 'audio' | 'document'
  | 'sticker' | 'reaction' | 'location' | 'contact' | 'outro'

/** Uma linha de mensagens_whatsapp, como a tela lê (sem o payload inteiro). */
export interface MensagemWa {
  id: number
  message_id: string
  chat_id: string
  telefone: string | null
  nome_exibicao: string | null
  de_mim: boolean
  por_api: boolean
  grupo: boolean
  tipo: TipoMensagem | string
  texto: string | null
  transcricao: string | null
  reacao: string | null
  responde_message_id: string | null
  midia_caminho: string | null
  midia_mime: string | null
  midia_nome: string | null
  status: string | null
  editada_em: string | null
  enviada_em: string
  /** Nome de quem mandou, em grupo (payload->message->>senderName). */
  remetente: string | null
}

/** Uma linha da RPC conversas_whatsapp. */
export interface ConversaWa {
  chat_id: string
  nome_exibicao: string | null
  telefone: string | null
  grupo: boolean
  ultima_message_id: string
  ultima_tipo: string
  ultima_texto: string | null
  ultima_de_mim: boolean
  ultima_por_api: boolean
  ultima_status: string | null
  ultima_midia_nome: string | null
  ultima_reacao: string | null
  ultima_remetente: string | null
  ultima_enviada_em: string
  nao_lidas: number
}

export const TIPOS_COM_MIDIA = ['image', 'video', 'gif', 'audio', 'document', 'sticker']

// ── Textos curtos ──────────────────────────────────────────────────────────

/**
 * Prévia de uma mensagem (lista de conversas, citação, notificação). A edge
 * function enviar-push tem uma cópia desta regra (`previaWhatsapp`) — mudou
 * aqui, muda lá.
 */
export function previaMensagem(m: {
  tipo: string
  texto: string | null
  midia_nome?: string | null
  reacao?: string | null
  status?: string | null
  de_mim?: boolean
}): string {
  if (m.status === 'DELETED') return m.de_mim ? 'Você apagou esta mensagem' : 'Mensagem apagada'
  const t = (m.texto ?? '').trim()
  switch (m.tipo) {
    case 'text': return t || 'Mensagem'
    case 'image': return t ? `📷 ${t}` : '📷 Foto'
    case 'video': return t ? `🎥 ${t}` : '🎥 Vídeo'
    case 'gif': return 'GIF'
    case 'audio': return '🎤 Áudio'
    case 'document': return `📄 ${m.midia_nome || t || 'Documento'}`
    case 'sticker': return 'Figurinha'
    case 'reaction':
      return m.reacao
        ? `${m.de_mim ? 'Você reagiu' : 'Reagiu'} ${m.reacao}`
        : `${m.de_mim ? 'Você removeu' : 'Removeu'} uma reação`
    case 'location': return '📍 Localização'
    case 'contact': return '👤 Contato'
    default: return t || 'Mensagem não suportada'
  }
}

/** Nome da conversa: o do contato/grupo, ou o telefone formatado. */
export function nomeConversa(c: { nome_exibicao: string | null; telefone: string | null; chat_id: string }): string {
  if (c.nome_exibicao?.trim()) return c.nome_exibicao.trim()
  if (c.telefone) return formatarTelefone(c.telefone)
  return c.chat_id.split('@')[0]
}

/** 5511932903005 → +55 11 93290-3005. Fora do Brasil: +dígitos. */
export function formatarTelefone(valor: string | null | undefined): string {
  const d = (valor ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const n = d.slice(4)
    return `+55 ${ddd} ${n.slice(0, -4)}-${n.slice(-4)}`
  }
  return `+${d}`
}

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** Cores dos nomes em grupo — as mesmas famílias do WhatsApp, fixas por pessoa. */
const CORES_REMETENTE = ['#E5486B', '#1F7AEC', '#02A698', '#D9811E', '#7F66FF', '#C4532D', '#0E9A3E', '#B35BB0', '#3B8FB0', '#A3772E']
export function corRemetente(chave: string | null | undefined): string {
  const s = chave ?? ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CORES_REMETENTE[h % CORES_REMETENTE.length]
}

/** Fundo do avatar com iniciais (mesma ideia, tons mais escuros). */
export function corAvatar(chave: string | null | undefined): string {
  return corRemetente(`avatar:${chave ?? ''}`)
}

/** 12 → "0:12"; 75 → "1:15"; 3725 → "1:02:05". */
export function duracao(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '0:00'
  const s = Math.floor(segundos)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// ── Datas (sempre relativas ao "agora" passado, para dar para testar) ────────

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function diasEntre(a: Date, b: Date): number {
  return Math.round((inicioDoDia(b) - inicioDoDia(a)) / 86_400_000)
}
const dd = (n: number) => String(n).padStart(2, '0')

export function horaCurta(iso: string): string {
  const d = new Date(iso)
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`
}

export function mesmoDia(a: string, b: string): boolean {
  return inicioDoDia(new Date(a)) === inicioDoDia(new Date(b))
}

/** Horário na lista de conversas: "14:05", "Ontem", "segunda-feira", "12/09/2026". */
export function horarioLista(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso)
  const dias = diasEntre(d, agora)
  if (dias <= 0) return horaCurta(iso)
  if (dias === 1) return 'Ontem'
  if (dias < 7) return DIAS_SEMANA[d.getDay()]
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Separador de dia dentro da conversa: "Hoje", "Ontem", "segunda-feira", "12/09/2026". */
export function rotuloDia(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso)
  const dias = diasEntre(d, agora)
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  if (dias < 7) return DIAS_SEMANA[d.getDay()].replace(/^./, (c) => c.toUpperCase())
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`
}

// ── Texto ──────────────────────────────────────────────────────────────────

const EMOJI_RE = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|⃣)+$/u

/** Só emoji (1 a 3): o WhatsApp mostra grande e sem balão. */
export function soEmoji(texto: string | null | undefined): number {
  const t = (texto ?? '').trim()
  if (!t || /\s/.test(t)) return 0
  if (/[0-9#*]/.test(t.replace(/[0-9#*]️?⃣/gu, ''))) return 0
  const seg = new Intl.Segmenter('pt', { granularity: 'grapheme' })
  const graf = Array.from(seg.segment(t), (s) => s.segment)
  if (graf.length === 0 || graf.length > 3) return 0
  return graf.every((g) => EMOJI_RE.test(g) && /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g)) ? graf.length : 0
}

export type Trecho =
  | { t: 'texto'; v: string }
  | { t: 'negrito' | 'italico' | 'riscado' | 'mono'; v: string }
  | { t: 'bloco'; v: string }
  | { t: 'link'; v: string; href: string }

const INLINE_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s]+|www\.[^\s]+)/g
const MARCAS: Record<string, 'negrito' | 'italico' | 'riscado' | 'mono'> = { '*': 'negrito', _: 'italico', '~': 'riscado', '`': 'mono' }

/**
 * Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~, `mono`,
 * ```bloco``` e links. Como no WhatsApp: a marca só vale encostada no texto
 * (`* x *` não é negrito) e não colada numa palavra (`2*3*4` não é negrito).
 */
export function trechosFormatados(texto: string): Trecho[] {
  const out: Trecho[] = []
  const blocos = texto.split(/```([\s\S]+?)```/)
  blocos.forEach((parte, i) => {
    if (i % 2 === 1) { out.push({ t: 'bloco', v: parte }); return }
    let ultimo = 0
    for (const m of parte.matchAll(INLINE_RE)) {
      const bruto = m[0]
      const ini = m.index ?? 0
      const antes = parte[ini - 1] ?? ''
      const depois = parte[ini + bruto.length] ?? ''
      let trecho: Trecho | null = null
      if (/^(https?:\/\/|www\.)/i.test(bruto)) {
        const sobra = bruto.match(/[.,;:!?)\]}'"]+$/)?.[0] ?? ''
        const url = sobra ? bruto.slice(0, -sobra.length) : bruto
        if (ini > ultimo) out.push({ t: 'texto', v: parte.slice(ultimo, ini) })
        out.push({ t: 'link', v: url, href: /^www\./i.test(url) ? `https://${url}` : url })
        ultimo = ini + url.length
        continue
      }
      const marca = bruto[0]
      const miolo = bruto.slice(1, -1)
      const encostado = !/^\s/.test(miolo) && !/\s$/.test(miolo)
      const bordaLivre = !/[\p{L}\p{N}]/u.test(antes) && !/[\p{L}\p{N}]/u.test(depois)
      if (encostado && bordaLivre) trecho = { t: MARCAS[marca], v: miolo }
      if (!trecho) continue
      if (ini > ultimo) out.push({ t: 'texto', v: parte.slice(ultimo, ini) })
      out.push(trecho)
      ultimo = ini + bruto.length
    }
    if (ultimo < parte.length) out.push({ t: 'texto', v: parte.slice(ultimo) })
  })
  // Junta textos vizinhos (o laço acima pode quebrar em vários).
  return out.reduce<Trecho[]>((acc, tr) => {
    const ant = acc[acc.length - 1]
    if (tr.t === 'texto' && ant?.t === 'texto') ant.v += tr.v
    else if (tr.t !== 'texto' || tr.v) acc.push({ ...tr })
    return acc
  }, [])
}

/** Links de um texto (aba "Mídia, links e docs"). */
export function linksDoTexto(texto: string | null | undefined): string[] {
  return trechosFormatados(texto ?? '')
    .filter((t): t is Extract<Trecho, { t: 'link' }> => t.t === 'link')
    .map((t) => t.href)
}

// ── Reações ────────────────────────────────────────────────────────────────

export interface ReacaoVisivel { emoji: string; de_mim: boolean; nome: string | null }

/**
 * Reações penduradas em cada mensagem. Cada reação é uma linha
 * (tipo = 'reaction'); vale a MAIS RECENTE por mensagem e por quem reagiu, e
 * a mais recente sem emoji quer dizer que a reação foi tirada.
 */
export function agregarReacoes(linhas: Array<Pick<MensagemWa,
  'tipo' | 'responde_message_id' | 'reacao' | 'de_mim' | 'enviada_em' | 'remetente' | 'telefone'>>): Map<string, ReacaoVisivel[]> {
  const ultima = new Map<string, { emoji: string | null; de_mim: boolean; nome: string | null; em: string }>()
  for (const l of linhas) {
    if (l.tipo !== 'reaction' || !l.responde_message_id) continue
    // Em grupo cada pessoa reage separado; a chave inclui quem reagiu.
    const quem = l.de_mim ? 'eu' : (l.remetente ?? l.telefone ?? 'contato')
    const chave = `${l.responde_message_id}|${quem}`
    const ant = ultima.get(chave)
    if (!ant || ant.em <= l.enviada_em) {
      ultima.set(chave, { emoji: l.reacao, de_mim: l.de_mim, nome: l.de_mim ? null : l.remetente, em: l.enviada_em })
    }
  }
  const mapa = new Map<string, ReacaoVisivel[]>()
  for (const [chave, r] of ultima) {
    if (!r.emoji) continue
    const alvo = chave.split('|')[0]
    const lista = mapa.get(alvo) ?? []
    lista.push({ emoji: r.emoji, de_mim: r.de_mim, nome: r.nome })
    mapa.set(alvo, lista)
  }
  return mapa
}

// ── Botão "Enviar mensagem" (abre o WhatsApp PESSOAL do dono) ───────────────

export type Aparelho = 'android' | 'iphone' | 'pc'

export function detectarAparelho(userAgent: string): Aparelho {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iphone'
  return 'pc'
}

export function textoApresentacao(nomeCliente: string | null, nomeRestaurante: string | null): string {
  const primeiro = (nomeCliente ?? '').trim().split(/\s+/)[0]
  const saudacao = primeiro && !/^\+?\d/.test(primeiro) ? `Oi, ${primeiro}!` : 'Oi!'
  const rest = nomeRestaurante?.trim() ? ` Aqui é do ${nomeRestaurante.trim()}.` : ''
  return `${saudacao}${rest} Vi sua mensagem e queria conversar com você.`
}

/**
 * Link que abre a conversa com o cliente no WhatsApp do DONO (nunca no número
 * de feedbacks — SIMULACAO-WHATSAPP.txt, item 9). O link só escolhe PARA QUEM;
 * de qual conta sai depende do app aberto. No Android dá para escolher o app:
 * abre o que NÃO é o do restaurante (que costuma estar no mesmo celular).
 */
export function linkEnviarMensagem(p: {
  telefoneCliente: string
  texto: string
  aparelho: Aparelho
  /** O número do RESTAURANTE é WhatsApp Business? null = não se sabe. */
  restauranteBusiness: boolean | null
}): string {
  const tel = p.telefoneCliente.replace(/\D/g, '')
  const txt = encodeURIComponent(p.texto)
  const waMe = `https://wa.me/${tel}?text=${txt}`
  if (p.aparelho !== 'android' || p.restauranteBusiness === null) return waMe
  const pacote = p.restauranteBusiness ? 'com.whatsapp' : 'com.whatsapp.w4b'
  return `intent://send/?phone=${tel}&text=${txt}#Intent;scheme=whatsapp;package=${pacote};S.browser_fallback_url=${encodeURIComponent(waMe)};end`
}
