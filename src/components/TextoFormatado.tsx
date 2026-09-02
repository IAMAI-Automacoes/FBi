import { Fragment } from 'react'
import { cn } from '@/lib/utils'

interface TextoFormatadoProps {
  texto: string
  className?: string
}

/**
 * Mostra o plano de ação com os destaques que o dono marcou no editor:
 * `**assim**` vira negrito e uma linha começada por `## ` vira título.
 *
 * Só esses dois. O editor oferece exatamente esses dois botões, e um
 * renderizador que entende mais do que o editor produz acabaria formatando
 * por acidente um texto que a pessoa escreveu como texto — um asterisco de
 * lista virando itálico, por exemplo.
 *
 * Nada de `dangerouslySetInnerHTML`: o texto vem do que alguém digitou, e
 * transformá-lo em HTML seria injetar marcação de origem externa na página.
 * Aqui o texto é partido e devolvido como elementos React, então `<script>`
 * escrito no plano continua sendo a palavra "<script>" na tela.
 */
export function TextoFormatado({ texto, className }: TextoFormatadoProps) {
  const linhas = (texto ?? '').split('\n')

  return (
    <div className={cn('space-y-1', className)}>
      {linhas.map((linha, i) => {
        const ehTitulo = linha.startsWith('## ')
        const conteudo = ehTitulo ? linha.slice(3) : linha

        // Linha em branco vira espaço entre parágrafos, não um <p> vazio que
        // o navegador colapsaria para altura zero.
        if (!conteudo.trim()) return <div key={i} className="h-2" />

        return (
          <p
            key={i}
            className={cn(
              ehTitulo
                ? 'text-[15px] font-semibold text-gray-900'
                : 'text-sm leading-relaxed text-gray-700',
              // Um título depois de texto precisa de ar; o primeiro, não.
              ehTitulo && i > 0 && 'pt-2',
            )}
          >
            {comNegrito(conteudo)}
          </p>
        )
      })}
    </div>
  )
}

/** Parte a linha nos pares de `**` e devolve os trechos internos em negrito. */
function comNegrito(linha: string) {
  // Índices ímpares do split são o que estava ENTRE os asteriscos. Um `**`
  // solto, sem par, cai num índice par e volta como texto comum — que é o
  // certo: quem digitou dois asteriscos sem fechar não pediu negrito.
  const partes = linha.split(/\*\*(.+?)\*\*/g)
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-gray-900">
        {parte}
      </strong>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  )
}
