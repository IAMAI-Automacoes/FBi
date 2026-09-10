import { useCallback, useState } from 'react'

/**
 * Onde os filtros ficam entre uma visita e outra à mesma página.
 *
 * Um `Map` de módulo, e não `sessionStorage` nem `localStorage`, e isso é a
 * regra inteira: o que vive na memória do JavaScript morre quando a página
 * recarrega. É exatamente o comportamento pedido — sair da tela e voltar
 * mantém o que você escolheu; um F5 devolve tudo ao padrão.
 *
 * `sessionStorage` sobreviveria ao recarregamento, e aí um filtro esquecido de
 * semanas atrás seria a primeira coisa a aparecer, sem nada na tela explicando
 * por que a lista está curta. O recarregamento é o gesto natural de "começar
 * de novo", e o estado em memória respeita isso sozinho.
 */
const memoria = new Map<string, unknown>()

/**
 * `useState` que lembra do valor ao sair e voltar para a página.
 *
 * Trocar de página desmonta o componente e leva o estado junto: era por isso
 * que a Visão Geral voltava para "7 dias" toda vez, e que a lista de feedbacks
 * esquecia a categoria assim que alguém abria uma ação e voltava.
 *
 * A `chave` identifica o filtro entre todas as telas — use algo como
 * `'visao-geral:periodo'`. Chaves iguais em telas diferentes compartilham o
 * valor, o que quase nunca é o desejado.
 *
 * A API é a do `useState`, incluindo a forma de função
 * (`definir(prev => ...)`), então trocar um pelo outro não exige mexer em mais
 * nada na tela.
 */
export function useFiltroPersistente<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() =>
    memoria.has(chave) ? (memoria.get(chave) as T) : inicial,
  )

  const definir = useCallback(
    (novo: T | ((anterior: T) => T)) => {
      setValor((anterior) => {
        const resolvido =
          typeof novo === 'function' ? (novo as (a: T) => T)(anterior) : novo
        memoria.set(chave, resolvido)
        return resolvido
      })
    },
    [chave],
  )

  return [valor, definir] as const
}

/**
 * Esquece um filtro guardado.
 *
 * Serve para quando a tela é aberta por um link que JÁ traz o recorte pronto
 * (`/feedbacks?categoria=...` vindo de Relatórios): ali o que a URL pede tem
 * precedência, e deixar a memória antiga por baixo faria o link abrir uma
 * mistura dos dois.
 */
export function esquecerFiltro(chave: string) {
  memoria.delete(chave)
}
