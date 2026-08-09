// Storage adaptável para a sessão do Supabase.
//
// O PADRÃO é PERSISTIR (localStorage) — o objetivo é logar o mínimo de vezes
// possível. A sessão só vira temporária (sessionStorage, some ao fechar o
// navegador) quando a pessoa DESMARCA "Lembrar-me" — útil em computador
// compartilhado. Junto do autoRefreshToken do Supabase, isso mantém o login
// vivo por muito tempo sem pedir senha de novo.
//
// A flag fica em localStorage e é definida no login (setRememberMe) ANTES de o
// Supabase persistir a sessão, garantindo que ela vá para o storage correto.

const REMEMBER_KEY = 'fib.remember-me'
const OPT_OUT = 'off'

export function setRememberMe(remember: boolean) {
  if (remember) {
    // Volta ao padrão (persistir): remove qualquer opt-out.
    localStorage.removeItem(REMEMBER_KEY)
  } else {
    // Opt-out explícito → sessão só nesta aba/sessão do navegador.
    localStorage.setItem(REMEMBER_KEY, OPT_OUT)
  }
}

// App instalado na tela inicial (PWA em modo standalone). Aí o usuário espera
// continuar logado ao reabrir o ícone, como num app nativo (WhatsApp) — então
// forçamos a sessão pro localStorage independente do "Lembrar-me". No navegador
// comum, o "Lembrar-me" continua mandando.
function ehAppInstalado(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      // iOS Safari expõe isso em vez do display-mode
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function shouldPersist(): boolean {
  // Persiste sempre no app instalado; no navegador, persiste por padrão e só
  // NÃO persiste se a pessoa optou por sair (desmarcou "Lembrar-me").
  if (ehAppInstalado()) return true
  return localStorage.getItem(REMEMBER_KEY) !== OPT_OUT
}

// Adapter compatível com a interface de storage do supabase-js.
export const rememberMeStorage = {
  getItem: (key: string): string | null => {
    // Lê de onde a sessão estiver salva (localStorage tem prioridade).
    return localStorage.getItem(key) ?? sessionStorage.getItem(key)
  },
  setItem: (key: string, value: string): void => {
    if (shouldPersist()) {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}
