import { lazy, type ComponentType } from 'react'

/* Página carregada sob demanda (`React.lazy`) que se recupera sozinha.

   O arquivo de uma página pode falhar ao carregar: depois de um deploy (a aba
   aberta pede um arquivo antigo, que não existe mais) ou no desenvolvimento,
   quando o arquivo muda com a página aberta. Sem isto, a tela inteira trava.
   Aqui, na primeira falha a página recarrega uma vez; se falhar de novo logo em
   seguida, o erro segue (sem laço de recargas). */

const CHAVE = 'pagina_recarregada_em'
/** Uma recarga por minuto, no máximo. */
const JANELA_MS = 60_000

function recarregouHaPouco(): boolean {
  try {
    const em = Number(sessionStorage.getItem(CHAVE) ?? 0)
    return Date.now() - em < JANELA_MS
  } catch {
    return true // sem storage: não arrisca laço
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo tipo genérico do React.lazy
export function paginaSobDemanda<T extends ComponentType<any>>(importar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await importar()
    } catch (e) {
      if (recarregouHaPouco()) throw e
      try {
        sessionStorage.setItem(CHAVE, String(Date.now()))
      } catch {
        throw e
      }
      window.location.reload()
      // Nunca resolve: a página está recarregando.
      return new Promise<{ default: T }>(() => {})
    }
  })
}
