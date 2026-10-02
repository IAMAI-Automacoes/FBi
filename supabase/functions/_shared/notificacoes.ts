// Textos das notificações (Web Push) — puros, para a enviar-push e os testes.
// Quem mostra é o service worker (public/sw.js): cada push traz UMA linha
// (`linha`) e ele junta as linhas da mesma conversa numa notificação só.

/** Corta textos longos (a notificação mostra poucas linhas). */
export function resumo(t: string | null | undefined, fallback: string): string {
  const s = (t ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return fallback
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

type TipoAnexo = 'foto' | 'video' | 'audio' | 'pdf' | 'arquivo'

function tipoDoArquivo(caminho: string): TipoAnexo {
  const ext = (caminho.split('?')[0].split('.').pop() ?? '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(ext)) return 'foto'
  if (['mp4', 'mov', 'webm', '3gp', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'ogg', 'opus', 'm4a', 'wav', 'aac'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  return 'arquivo'
}

const ROTULO: Record<TipoAnexo, string> = {
  foto: '📷 Foto',
  video: '🎥 Vídeo',
  audio: '🎤 Áudio',
  pdf: '📄 PDF',
  arquivo: '📎 Arquivo',
}

/** "📷 Foto", "📄 PDF", "📷 3 fotos", "📎 2 arquivos" — ou null sem anexo. */
export function rotuloAnexos(arquivos: unknown): string | null {
  const lista = Array.isArray(arquivos) ? arquivos.filter((a): a is string => typeof a === 'string' && a.length > 0) : []
  if (lista.length === 0) return null
  const tipos = lista.map(tipoDoArquivo)
  if (lista.length === 1) return ROTULO[tipos[0]]
  if (tipos.every((t) => t === 'foto')) return `📷 ${lista.length} fotos`
  return `📎 ${lista.length} arquivos`
}

/**
 * Linha de uma mensagem do suporte: o texto; com anexo, o ícone do anexo na
 * frente ("📷 Segue o print"); só anexo, o rótulo ("📷 Foto").
 */
export function linhaSuporte(texto: string | null | undefined, arquivos: unknown, fallback: string): string {
  const anexo = rotuloAnexos(arquivos)
  const t = resumo(texto, '')
  if (t && anexo) return resumo(`${anexo.split(' ')[0]} ${t}`, fallback)
  return t || anexo || fallback
}

/** Prévia por tipo — mesma regra de `previaMensagem` em src/lib/whatsapp/formatacao.ts. */
export function previaWhatsapp(m: {
  tipo: string; texto: string | null; midia_nome: string | null; reacao: string | null
}): string {
  const t = (m.texto ?? '').trim()
  switch (m.tipo) {
    case 'text': return t || 'Mensagem'
    case 'image': return t ? `📷 ${t}` : '📷 Foto'
    case 'video': return t ? `🎥 ${t}` : '🎥 Vídeo'
    case 'gif': return 'GIF'
    case 'audio': return '🎤 Áudio'
    case 'document': return `📄 ${m.midia_nome || t || 'Documento'}`
    case 'sticker': return 'Figurinha'
    case 'reaction': return `Reagiu ${m.reacao ?? ''} à sua mensagem`.replace('  ', ' ')
    case 'location': return '📍 Localização'
    case 'contact': return '👤 Contato'
    default: return t || 'Mensagem'
  }
}

/** Linha da notificação do WhatsApp: em grupo, "Quem mandou: texto". */
export function linhaWhatsapp(m: {
  tipo: string; texto: string | null; midia_nome: string | null; reacao: string | null; grupo: boolean; remetente: string | null
}): string {
  const corpo = resumo(previaWhatsapp(m), 'Nova mensagem')
  return m.grupo ? `${(m.remetente ?? '').trim() || 'Alguém'}: ${corpo}` : corpo
}

/** Foto de perfil que dá para usar (link http(s) do WhatsApp). */
export function fotoValida(url: string | null | undefined): string | null {
  const u = (url ?? '').trim()
  return /^https:\/\//i.test(u) ? u : null
}
