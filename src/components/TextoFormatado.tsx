import { Fragment, type CSSProperties } from 'react'
import {
  ESTILO_PALAVRA_ITALICA,
  TAMANHO_PADRAO,
  analisar,
  emPalavras,
} from '@/lib/texto-rico'
import { cn } from '@/lib/utils'

interface TextoFormatadoProps {
  texto: string
  className?: string
}

/**
 * Mostra o plano de ação com o negrito, o itálico e os tamanhos que o dono
 * marcou no editor.
 *
 * Nada de `dangerouslySetInnerHTML`, mesmo o conteúdo vindo do próprio
 * restaurante: parte dele é escrita pela IA, e o plano é o campo mais longo e
 * mais livre do sistema. Aqui o HTML é lido por `analisar()` — que só conhece
 * negrito, itálico e tamanho — e devolvido como elementos React. Qualquer
 * outra coisa que estivesse no meio simplesmente não atravessa.
 */
export function TextoFormatado({ texto, className }: TextoFormatadoProps) {
  const linhas = analisar(texto ?? '')

  return (
    <div className={cn('space-y-1', className)}>
      {linhas.map((trechos, i) => {
        const vazia = trechos.every((t) => !t.texto.trim())

        // Linha em branco é espaço entre parágrafos, não um <p> vazio que o
        // navegador colapsaria para altura zero.
        if (vazia) return <div key={i} className="h-2" />

        return (
          <p
            key={i}
            // Mesmo tamanho base do editor, saindo da mesma constante.
            style={{ fontSize: `${TAMANHO_PADRAO}px` }}
            className="leading-relaxed text-gray-700"
          >
            {trechos.map((t, j) => {
              // `fontSize` inline é a única forma: o tamanho é um número
              // escolhido no editor, não um degrau de uma escala fixa, então
              // não existe classe do Tailwind que o cubra.
              const estilo: CSSProperties = {}
              if (t.tamanho) estilo.fontSize = `${t.tamanho}px`
              if (t.italico) estilo.fontStyle = 'italic'

              // Em itálico cada PALAVRA vai na sua própria caixa inclinada —
              // ver `ANGULO_ITALICO`. Inclinar o trecho inteiro desalinharia o
              // começo de cada linha.
              const conteudo = t.italico
                ? emPalavras(t.texto).map((parte, k) =>
                    /^\s+$/.test(parte) ? (
                      <Fragment key={k}>{parte}</Fragment>
                    ) : (
                      <span key={k} style={ESTILO_PALAVRA_ITALICA}>
                        {parte}
                      </span>
                    ),
                  )
                : t.texto

              return (
                <span
                  key={j}
                  style={estilo}
                  className={cn(t.negrito && 'font-semibold text-gray-900')}
                >
                  {conteudo}
                </span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}
