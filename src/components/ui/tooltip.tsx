/* Tooltip Component primitives - A component that displays a tooltip (a component that displays a tooltip) - from shadcn/ui (exposes TooltipProvider, Tooltip, TooltipTrigger, TooltipContent) */
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * Tooltip escuro e compacto, não o `bg-popover` claro com borda do shadcn.
 *
 * Um retângulo branco com borda e sombra é a mesma forma dos cards da página:
 * flutuando ao lado do cursor, ele lia como um card de conteúdo que apareceu
 * do nada, e não como a legenda do que está debaixo do mouse. Escuro e menor
 * (`text-xs`, padding curto) é a convenção que separa as duas coisas — e o
 * contraste invertido diz "isto é do sistema, não da página".
 *
 * `max-w-xs` porque uma legenda que precisa de mais que isso não é legenda.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 max-w-xs overflow-hidden rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]',
      className,
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
