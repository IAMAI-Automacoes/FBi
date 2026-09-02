/* Button Component primitives - A component that displays a button - from shadcn/ui (exposes Button, buttonVariants) */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-transparent shadow-sm text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',

        /**
         * Botão de confirmar de formulário — "Salvar", "Criar ação".
         *
         * O `default` é um retângulo de cor chapada: fundo sólido, raio de
         * 6px, nada mais. Chapado, ele não parece um botão, parece uma
         * etiqueta colorida — não há nada na forma que diga que aquilo
         * afunda quando é apertado.
         *
         * O que dá volume sem cair em relevo antigo são três camadas finas,
         * na ordem em que a luz cairia: uma linha clara no alto de dentro
         * (`inset 0 1px 0` em branco a 12%), que lê como a quina do botão
         * pegando luz; um degradê curto de gray-800 para gray-950, que faz a
         * superfície não ser plana; e uma sombra baixa e apertada por fora,
         * que o descola do fundo branco sem borrão.
         *
         * Ao apertar, as três somem de uma vez (`active:`) — é a mesma
         * quina, agora sem luz, o que dá a leitura de afundar.
         *
         * Preto e não o azul da marca: azul é a cor de tudo que é clicável no
         * app, então em um rodapé de dois botões ele não distinguia o que
         * decide do que desiste.
         */
        primario:
          'bg-gray-900 bg-gradient-to-b from-gray-800 to-gray-950 text-white ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.20)] ' +
          'hover:from-gray-700 hover:to-gray-900 ' +
          'active:shadow-none active:from-gray-900 active:to-gray-900 ' +
          'disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none',

        /** O par do `primario`: desistir não se oferece com peso. */
        neutro: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        /** Altura de formulário: 34px, entre o `sm` e o `default`. */
        forma: 'h-[34px] rounded-[6px] px-3.5 text-[13px]',
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
