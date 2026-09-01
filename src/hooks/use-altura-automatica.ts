import { useLayoutEffect, useRef } from 'react'

/**
 * Faz um `<textarea>` crescer junto com o texto, em vez de ganhar barra de
 * rolagem interna.
 *
 * Um campo que rola esconde o que a pessoa acabou de escrever: para reler o
 * plano inteiro ela rola dentro de uma caixa de 120px enquanto a página também
 * rola — dois eixos de rolagem no mesmo gesto. Crescendo, o texto fica todo
 * visível e a rolagem acontece só uma vez, no painel.
 *
 * `useLayoutEffect` (e não `useEffect`) porque a medida tem que acontecer antes
 * de o navegador pintar — com `useEffect` a caixa aparece no tamanho errado por
 * um quadro e pisca a cada tecla.
 *
 * O `height = 'auto'` antes de ler `scrollHeight` não é redundante: sem ele o
 * campo só sabe crescer. `scrollHeight` nunca é menor que a altura atual, então
 * apagar texto deixaria a caixa grande para sempre.
 */
export function useAlturaAutomatica<T extends HTMLTextAreaElement>(valor: string) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [valor])

  return ref
}
