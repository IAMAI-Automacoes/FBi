/**
 * Extrai as iniciais de um texto (nome de usuário, restaurante, mascote).
 * Pega a primeira letra de cada palavra, limitado por `max`.
 * Ex.: getIniciais('João Silva', 2) => 'JS'; getIniciais('Restaurante da Vila', 2) => 'RV'.
 */
export function getIniciais(texto?: string | null, max = 2): string {
  if (!texto) return '?'
  const palavras = texto
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Ignora conectores comuns ("da", "de", "do", "e") ao montar iniciais
    .filter((p) => !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()))

  if (palavras.length === 0) return '?'

  const iniciais = palavras
    .slice(0, max)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')

  return iniciais || '?'
}

/** Paleta pra avatar por iniciais — cada pessoa cai sempre na mesma cor
 *  (hash do nome), pra diferenciar responsáveis num relance sem precisar
 *  ler o nome inteiro. */
const CORES_AVATAR = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
]

export function corAvatar(texto?: string | null): { bg: string; text: string } {
  const nome = (texto || '').trim()
  if (!nome) return CORES_AVATAR[0]
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  return CORES_AVATAR[hash % CORES_AVATAR.length]
}
