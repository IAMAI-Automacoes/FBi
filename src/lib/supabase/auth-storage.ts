// Storage adaptável para a sessão do Supabase, controlado pelo "Lembrar-me".
//
// - "Lembrar-me" MARCADO  → sessão em localStorage (persiste após fechar o navegador)
// - "Lembrar-me" DESMARCADO → sessão em sessionStorage (some ao fechar o navegador)
//
// A flag fica em localStorage e é definida no login (setRememberMe) ANTES de o
// Supabase persistir a sessão, garantindo que ela vá para o storage correto.

const REMEMBER_KEY = 'fib.remember-me'

export function setRememberMe(remember: boolean) {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, 'true')
  } else {
    localStorage.removeItem(REMEMBER_KEY)
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
  return ehAppInstalado() || localStorage.getItem(REMEMBER_KEY) === 'true'
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
