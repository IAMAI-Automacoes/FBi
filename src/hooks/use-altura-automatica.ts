import { useLayoutEffect, useRef } from 'react'

/** Sobe pelos ancestrais até achar quem realmente rola. */
function containerRolavel(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) {
    const overflow = getComputedStyle(p).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) {
      return p
    }
    p = p.parentElement
  }
  return null
}

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
 *
 * ## A rolagem que acompanha
 *
 * Quando o campo cresce uma linha, o container rolável ganha os mesmos pixels
 * no `scrollTop`. O efeito é que a janela "sobe uma linha" junto: o que está
 * embaixo — o rodapé com Salvar e Cancelar — não se mexe, e a linha que está
 * sendo digitada continua no mesmo ponto da tela.
 *
 * Sem isso, cada linha nova empurra o conteúdo para baixo e o rodapé some da
 * área visível; a pessoa precisa parar de escrever e rolar para achar o botão
 * de salvar.
 *
 * Só ao CRESCER (`delta > 0`). Ao apagar texto, deixar o `scrollTop` cair
 * sozinho é o comportamento natural do navegador, e forçá-lo faria a tela
 * pular para cima a cada backspace.
 */
export function useAlturaAutomatica<T extends HTMLTextAreaElement>(valor: string) {
  const ref = useRef<T>(null)
  const alturaAnterior = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    el.style.height = 'auto'
    const nova = el.scrollHeight
    el.style.height = `${nova}px`

    const anterior = alturaAnterior.current
    alturaAnterior.current = nova

    // `null` é a primeira medição (montagem): aí não houve crescimento nenhum,
    // e compensar a altura inteira jogaria a rolagem para o fim do formulário.
    if (anterior === null || nova <= anterior) return

    containerRolavel(el)?.scrollBy({ top: nova - anterior })
  }, [valor])

  return ref
}
