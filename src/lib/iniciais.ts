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
 *  ler o nome inteiro. Exportada porque listas curtas (ex.: equipe de
 *  garçons) preferem indexar por posição em vez de por hash — com poucos
 *  itens e só 8 cores, o hash colide com frequência incômoda. */
export const CORES_AVATAR = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-cyan-600', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-teal-600', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
]

export function corAvatar(texto?: string | null): { bg: string; text: string } {
  const nome = (texto || '').trim()
  if (!nome) return CORES_AVATAR[0]
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  return CORES_AVATAR[hash % CORES_AVATAR.length]
}
