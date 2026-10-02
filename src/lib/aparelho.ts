/**
 * Id DESTE aparelho (navegador), para as notificações serem decididas por
 * aparelho e não pela conta inteira: silenciar no PC não cala o celular.
 *
 * Gerado uma vez e guardado no localStorage. No Android, o app instalado e o
 * Chrome dividem o mesmo armazenamento (e a mesma inscrição de push), então
 * contam como um aparelho só; no iPhone, o app da Tela de Início tem o seu.
 * Vai junto na inscrição (push_subscriptions.aparelho) e nos silêncios
 * (silencios_aparelho.aparelho).
 */

const CHAVE = 'easyfeed:aparelho'
let emMemoria: string | null = null

function novoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

export function idDoAparelho(): string {
  if (emMemoria) return emMemoria
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo && salvo.length >= 8) return (emMemoria = salvo)
    const id = novoId()
    localStorage.setItem(CHAVE, id)
    return (emMemoria = id)
  } catch {
    // Sem armazenamento (aba anônima bloqueada): vale só nesta visita.
    return (emMemoria ??= novoId())
  }
}
