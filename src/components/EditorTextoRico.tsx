import { useCallback, useEffect, useRef, useState } from 'react'
import { Bold, Italic, Minus, Plus } from 'lucide-react'
import {
  INCLINACAO_ITALICO,
  TAMANHO_MAX,
  TAMANHO_MIN,
  TAMANHO_PADRAO,
  analisar,
  limitarTamanho,
  montar,
  type Marcas,
  type Trecho,
} from '@/lib/texto-rico'
import { cn } from '@/lib/utils'

interface EditorTextoRicoProps {
  valor: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Editor do plano de ação: negrito, itálico e tamanho da letra, aplicados ao
 * trecho selecionado.
 *
 * ## Por que não `execCommand`
 *
 * É o caminho curto para negrito e itálico, e o navegador o mantém funcionando
 * — mas ele escreve no DOM o que quiser: `<font>`, `<div>` aninhado, `style`
 * inteiro, e cada navegador de um jeito. Para tamanho da letra é pior ainda:
 * `execCommand('fontSize')` só aceita os sete degraus de `<font size>`, e o
 * pedido aqui é um número que sobe e desce de um em um.
 *
 * Então o editor guarda a verdade em ESTRUTURA (linhas de trechos marcados,
 * ver `lib/texto-rico`) e reescreve o DOM a partir dela. O navegador nunca
 * decide o formato; ele só desenha o que a estrutura diz.
 *
 * ## O cursor
 *
 * Reescrever o `innerHTML` apaga a seleção — o cursor voltaria ao começo a
 * cada tecla. Por isso a reescrita acontece só quando a mudança veio dos
 * BOTÕES, e a posição é remontada por contagem de caracteres (`deslocamento`),
 * que é estável mesmo com a árvore de nós mudando embaixo. Digitar não passa
 * por aqui: o navegador insere o caractere onde já está, e o editor apenas lê
 * o resultado.
 */
export function EditorTextoRico({
  valor,
  onChange,
  placeholder,
  disabled,
  className,
}: EditorTextoRicoProps) {
  const ref = useRef<HTMLDivElement>(null)

  /**
   * Deita os `<i>` recém-escritos.
   *
   * O conteúdo do editor é montado como texto HTML (`montar()`), então não há
   * onde pendurar um `style` de React. E a inclinação precisa ser inline: em
   * folha de estilo o ângulo é descartado no build (ver `INCLINACAO_ITALICO`).
   *
   * Roda depois de cada escrita no `innerHTML`. Não suja o que é salvo: o
   * `analisar()` reconhece o itálico pela TAG, ignora `style` que não seja
   * `font-size`, e o `montar()` devolve um `<i>` limpo.
   */
  const deitarItalicos = (el: HTMLElement) => {
    el.querySelectorAll('i').forEach((i) => {
      i.style.fontStyle = INCLINACAO_ITALICO
    })
  }
  /**
   * O número mostrado na barra.
   *
   * Ele acompanha o TRECHO SELECIONADO, e essa é a correção de um bug que
   * aparecia assim: com o texto em 14 e a barra parada em 11, apertar "+"
   * levava o texto para 12 — ou seja, aumentar DIMINUÍA, e só a partir do
   * terceiro clique é que passava dos 14.
   *
   * A causa era este número viver solto do conteúdo: ele guardava o último
   * valor usado, não o tamanho do que estava selecionado, e o `+` somava
   * sobre o valor errado.
   */
  const [tamanho, setTamanho] = useState(TAMANHO_PADRAO)
  /** HTML que o editor escreveu por último — para não reescrever o que já está lá. */
  const ultimoRef = useRef<string>('')

  // Só escreve no DOM quando o valor mudou POR FORA (abrir outra ação, "Gerar
  // com IA"). Sem esta guarda, cada tecla digitada reescreveria a árvore e
  // levaria o cursor junto.
  useEffect(() => {
    const el = ref.current
    if (!el || valor === ultimoRef.current) return
    el.innerHTML = montar(analisar(valor))
    deitarItalicos(el)
    ultimoRef.current = valor
  }, [valor])

  /** Lê o DOM, normaliza para o formato restrito e avisa o pai. */
  const publicar = useCallback(() => {
    const el = ref.current
    if (!el) return
    const html = montar(analisar(el.innerHTML))
    ultimoRef.current = html
    onChange(html)
  }, [onChange])

  // ── Posição do cursor em número de caracteres ──────────────────────────────
  // O <br> conta como um caractere para que a posição bata com a estrutura,
  // onde cada linha é um item da lista.

  const lerSelecao = (): { inicio: number; fim: number } | null => {
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return null

    const contar = (no: Node, deslocamento: number): number => {
      let total = 0
      const percorrer = (atual: Node): boolean => {
        if (atual === no) {
          total += atual.nodeType === Node.TEXT_NODE ? deslocamento : 0
          return true
        }
        if (atual.nodeType === Node.TEXT_NODE) {
          total += atual.textContent?.length ?? 0
        } else if ((atual as HTMLElement).tagName?.toLowerCase() === 'br') {
          total += 1
        } else {
          for (const filho of Array.from(atual.childNodes)) {
            if (percorrer(filho)) return true
          }
        }
        return false
      }
      for (const filho of Array.from(el.childNodes)) {
        if (percorrer(filho)) break
      }
      return total
    }

    return {
      inicio: contar(range.startContainer, range.startOffset),
      fim: contar(range.endContainer, range.endOffset),
    }
  }

  const restaurarSelecao = (inicio: number, fim: number) => {
    const el = ref.current
    if (!el) return
    const sel = window.getSelection()
    if (!sel) return

    let visto = 0
    let iniNo: Node | null = null
    let iniOff = 0
    let fimNo: Node | null = null
    let fimOff = 0

    const percorrer = (no: Node) => {
      if (fimNo) return
      if (no.nodeType === Node.TEXT_NODE) {
        const len = no.textContent?.length ?? 0
        if (!iniNo && visto + len >= inicio) {
          iniNo = no
          iniOff = inicio - visto
        }
        if (!fimNo && visto + len >= fim) {
          fimNo = no
          fimOff = fim - visto
        }
        visto += len
        return
      }
      if ((no as HTMLElement).tagName?.toLowerCase() === 'br') {
        visto += 1
        return
      }
      Array.from(no.childNodes).forEach(percorrer)
    }
    Array.from(el.childNodes).forEach(percorrer)

    if (!iniNo || !fimNo) return
    const range = document.createRange()
    range.setStart(iniNo, iniOff)
    range.setEnd(fimNo, fimOff)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /**
   * O tamanho do que está selecionado agora.
   *
   * Com vários tamanhos dentro da seleção, vale o do PRIMEIRO trecho: é o que
   * a pessoa vê no começo do que pintou, e um "+" a partir dali é previsível.
   * Devolver a média ou o maior faria o primeiro clique dar um salto que
   * ninguém pediu.
   */
  const tamanhoDaSelecao = (): number => {
    const el = ref.current
    const sel = lerSelecao()
    if (!el || !sel) return TAMANHO_PADRAO

    const linhas = analisar(el.innerHTML)
    let pos = 0
    for (let i = 0; i < linhas.length; i++) {
      for (const t of linhas[i]) {
        const ini = pos
        const fim = pos + t.texto.length
        pos = fim
        // O cursor sem seleção (inicio === fim) fica NA BORDA de um trecho;
        // por isso `>=` no fim, senão ele nunca cai dentro de nada.
        const dentro = sel.inicio === sel.fim
          ? sel.inicio >= ini && sel.inicio <= fim
          : fim > sel.inicio && ini < sel.fim
        if (dentro) return t.tamanho ?? TAMANHO_PADRAO
      }
      if (i < linhas.length - 1) pos += 1 // o <br>
    }
    return TAMANHO_PADRAO
  }

  /**
   * Aplica uma marca ao trecho selecionado.
   *
   * Trabalha sobre a estrutura, não sobre o DOM: parte os trechos exatamente
   * nas bordas da seleção e marca só os pedaços de dentro. É isto que faz
   * "negritar do meio de uma palavra até o meio da outra" funcionar sem
   * produzir tags cruzadas.
   */
  const aplicar = (mudanca: (atual: Marcas) => Marcas) => {
    const el = ref.current
    const sel = lerSelecao()
    if (!el || !sel || sel.inicio === sel.fim) return

    const linhas = analisar(el.innerHTML)
    const novas: Trecho[][] = []
    let pos = 0

    linhas.forEach((linha, iLinha) => {
      const saida: Trecho[] = []
      linha.forEach((t) => {
        const ini = pos
        const fim = pos + t.texto.length
        pos = fim

        // Fora da seleção: passa inteiro.
        if (fim <= sel.inicio || ini >= sel.fim) {
          saida.push(t)
          return
        }
        const corteA = Math.max(sel.inicio - ini, 0)
        const corteB = Math.min(sel.fim - ini, t.texto.length)
        const { texto, ...marcas } = t

        if (corteA > 0) saida.push({ ...marcas, texto: texto.slice(0, corteA) })
        saida.push({ ...mudanca(marcas), texto: texto.slice(corteA, corteB) })
        if (corteB < texto.length) saida.push({ ...marcas, texto: texto.slice(corteB) })
      })
      novas.push(saida)
      if (iLinha < linhas.length - 1) pos += 1 // o <br>
    })

    el.innerHTML = montar(novas)
    deitarItalicos(el)
    restaurarSelecao(sel.inicio, sel.fim)
    publicar()
  }

  const mudarTamanho = (delta: number) => {
    // Parte do tamanho do TEXTO, não do número que está na tela. Os dois
    // andam juntos enquanto a seleção não muda, mas divergem assim que
    // alguém pinta outro trecho — e é aí que "+" fazia a letra encolher.
    const novo = limitarTamanho(tamanhoDaSelecao() + delta)
    setTamanho(novo)
    aplicar((m) => ({ ...m, tamanho: novo === TAMANHO_PADRAO ? undefined : novo }))
  }

  /**
   * Enquanto a pessoa move o cursor ou pinta outro trecho, o número da barra
   * acompanha — clicar num título de 18 mostra 18, e o "+" seguinte leva a 19.
   *
   * `selectionchange` é ouvido no DOCUMENTO porque é lá que ele dispara; não
   * existe o equivalente no elemento. A checagem de `contains` filtra os
   * disparos de fora do editor, que são a maioria (qualquer clique na página
   * emite o evento).
   */
  useEffect(() => {
    if (disabled) return
    const aoMudar = () => {
      const el = ref.current
      const sel = window.getSelection()
      const editando =
        el && sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)
      if (!editando) return
      const atual = tamanhoDaSelecao()
      // Só escreve quando muda de verdade: um `setState` a cada movimento do
      // cursor repintaria a barra dezenas de vezes por segundo à toa.
      setTamanho((anterior) => (anterior === atual ? anterior : atual))
    }
    document.addEventListener('selectionchange', aoMudar)
    return () => document.removeEventListener('selectionchange', aoMudar)
    // `tamanhoDaSelecao` lê o DOM por ref e não depende de estado, então não
    // entra aqui — incluí-la recriaria o ouvinte a cada repintura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  const btn = 'flex h-7 w-7 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-200/70 hover:text-gray-900 disabled:opacity-40'

  return (
    <div className={cn('space-y-2', className)}>
      {!disabled && (
        <div className="flex w-fit items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5">
          <button type="button" onClick={() => mudarTamanho(-1)} className={btn}
            aria-label="Diminuir a letra" disabled={tamanho <= TAMANHO_MIN}>
            <Minus className="h-3.5 w-3.5" />
          </button>

          {/* O número é campo, não rótulo: dá para ir direto ao tamanho que se
              quer em vez de apertar a seta oito vezes. */}
          <input
            type="text"
            inputMode="numeric"
            value={tamanho}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
              if (Number.isFinite(n)) setTamanho(n)
            }}
            onBlur={() => {
              const n = limitarTamanho(tamanho)
              setTamanho(n)
              aplicar((m) => ({ ...m, tamanho: n === TAMANHO_PADRAO ? undefined : n }))
            }}
            aria-label="Tamanho da letra"
            className="h-6 w-9 rounded border border-gray-200 text-center text-xs tabular-nums text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />

          <button type="button" onClick={() => mudarTamanho(1)} className={btn}
            aria-label="Aumentar a letra" disabled={tamanho >= TAMANHO_MAX}>
            <Plus className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-gray-200" />

          <button type="button" onClick={() => aplicar((m) => ({ ...m, negrito: !m.negrito }))}
            className={btn} aria-label="Negrito" title="Negrito">
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => aplicar((m) => ({ ...m, italico: !m.italico }))}
            className={btn} aria-label="Itálico" title="Itálico">
            <Italic className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* `suppressContentEditableWarning`: o React avisa quando o DOM de um nó
          é mexido por fora, que é justamente como este editor funciona.
          `whitespace-pre-wrap` preserva os espaços e as quebras que o autor
          digitou. */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Plano de ação"
        data-placeholder={placeholder}
        onInput={publicar}
        onBlur={publicar}
        // Colar texto de outro lugar traz a formatação dele junto — fontes,
        // cores, tabelas. Só o texto entra; o formato é o daqui.
        onPaste={(e) => {
          e.preventDefault()
          const texto = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, texto)
        }}
        spellCheck={false}
        className={cn(
          'min-h-[120px] w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 outline-none',
          'empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      />
    </div>
  )
}
