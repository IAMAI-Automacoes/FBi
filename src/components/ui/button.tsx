/* Button Component primitives - A component that displays a button - from shadcn/ui (exposes Button, buttonVariants) */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * O desenho de botão do site inteiro, tirado da barra de /insights: PÍLULA
 * (cantos totalmente arredondados), em duas versões — cheia em azul com
 * degradê curto, para a ação da tela; vazada em branco com contorno e letra
 * azuis, para tudo que acompanha.
 *
 * As três camadas do preenchimento (luz por dentro da quina de cima, degradê
 * `blue-600 → blue-800`, sombra baixa por fora) somem ao apertar, o que dá a
 * leitura de afundar. Estão escritas aqui e repetidas em
 * `@/lib/estilos-botao` para os componentes que só aceitam `className` — as
 * duas cópias existem porque uma é `cva` e a outra é string solta, e precisam
 * bater na cor.
 */
const PILULA_CHEIA =
  'bg-blue-700 bg-gradient-to-b from-blue-600 to-blue-800 text-white ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(16,24,40,0.20)] ' +
  'hover:from-blue-500 hover:to-blue-700 ' +
  'active:shadow-none active:from-blue-700 active:to-blue-700 ' +
  'disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none'

const PILULA_VAZADA =
  'border border-blue-700 bg-white text-blue-700 ' +
  // O ícone acompanha a letra. Sem isto, cada chamada decidia a cor do seu
  // ícone e sobrava um `text-gray-400` de antes: o botão saía com contorno
  // azul, texto azul e um ícone cinza no meio, que é o "incompleto" que se vê.
  '[&_svg]:text-blue-700 ' +
  'shadow-[0_1px_2px_rgba(16,24,40,0.20)] ' +
  'hover:bg-blue-50 hover:text-blue-700 active:shadow-none ' +
  'disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:[&_svg]:text-gray-400 disabled:shadow-none'

const buttonVariants = cva(
  // `rounded-full` na base: a pílula é a forma de TODO botão do site, inclusive
  // os fantasmas e os de ícone. Antes era `rounded-md`, e o raio de 6px
  // aparecia em qualquer botão que não tivesse recebido classe própria.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** A ação da tela — o "Gerar insights agora" da imagem de referência. */
        default: PILULA_CHEIA,
        /**
         * Destrutivo continua vermelho: a pílula uniformiza a FORMA, não
         * apaga a diferença entre confirmar e apagar.
         */
        destructive:
          'bg-red-700 bg-gradient-to-b from-red-600 to-red-800 text-white ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(16,24,40,0.20)] ' +
          'hover:from-red-500 hover:to-red-700 ' +
          'active:shadow-none active:from-red-700 active:to-red-700 ' +
          'disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none',
        /** O que acompanha a ação — "Categoria" e "Fixados" da referência. */
        outline: PILULA_VAZADA,
        /**
         * A pílula vazada em vermelho: destruir sem ser a ação principal da
         * tela — "Excluir", "Cancelar assinatura", "Desconectar".
         *
         * Cheia, uma fileira delas (a coluna "Ações" da tabela do admin) faria
         * a tela inteira parecer um alerta; o contorno guarda a cor do aviso
         * sem virar o assunto da página.
         */
        destrutivoVazado:
          'border border-red-600 bg-white text-red-600 [&_svg]:text-red-600 ' +
          'shadow-[0_1px_2px_rgba(16,24,40,0.20)] ' +
          'hover:bg-red-50 hover:text-red-700 active:shadow-none ' +
          'disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:[&_svg]:text-gray-400 disabled:shadow-none',
        secondary: PILULA_VAZADA,
        /**
         * Terciário: sem contorno e sem preenchimento em repouso. Fica fora do
         * par cheia/vazada de propósito — um X de fechar ou um "Cancelar" com
         * contorno azul competiria com a ação que está do lado.
         */
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',

        /**
         * As variantes antigas, agora apelidos do mesmo par.
         *
         * Cada uma nasceu com a sua cor — `primario` preto, `etapa` terracota,
         * `ia` violeta, `baixar` azul escuro — e a tela virava um mostruário:
         * quatro botões da mesma família com quatro cores, cada um dizendo por
         * conta própria o quanto era importante. O site passou a ter UM
         * desenho de botão (a pílula de /insights), e o que distingue uma ação
         * da outra é o texto dela e a posição na tela, não um tom de fundo.
         *
         * Continuam existindo como nomes para não reescrever ~50 chamadas, e
         * porque `variant="baixar"` ainda diz o que aquele botão faz.
         */
        primario: PILULA_CHEIA,
        etapa: PILULA_CHEIA,
        ia: PILULA_CHEIA,
        baixar: PILULA_CHEIA,

        /** O par de desistir: sem peso, para não competir com o que decide. */
        neutro: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      },
      // Nenhum tamanho define raio: quem manda na forma é a base
      // (`rounded-full`). O `sm`, o `lg` e o `forma` reimpunham `rounded-md` e
      // desmanchavam a pílula justamente nos botões menores, que são a maioria.
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3.5 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
        /** Altura de formulário: 34px, entre o `sm` e o `default`. */
        forma: 'h-[34px] px-4 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
