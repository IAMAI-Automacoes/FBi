import { useCallback, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export interface PedidoConfirmacao {
  /** A pergunta. Curta, e sempre uma pergunta. */
  titulo: string
  /** Uma linha com a consequência. Opcional. */
  descricao?: string
  /** Texto do botão que confirma. Um verbo, não "OK". */
  confirmar?: string
  /** Pinta o botão de vermelho — para o que não tem volta. */
  destrutivo?: boolean
}

/**
 * Confirmação imperativa: `if (await confirmar({...})) { ... }`.
 *
 * Existe para substituir o `confirm()` do navegador, que estava em quatro
 * lugares do app. Aquele diálogo é desenhado pelo sistema operacional: fonte
 * do sistema, botões em inglês em algumas máquinas, `\n\n` no meio do texto
 * para separar parágrafos, e nenhuma diferença visual entre apagar uma conta e
 * confirmar um download. Também trava a aba inteira enquanto está aberto.
 *
 * A forma imperativa (em vez de um `<AlertDialog>` com estado próprio em cada
 * página) foi escolhida porque o código que chamava `confirm()` já era
 * `if (!confirm(...)) return` no meio de um handler — trocar por promessa
 * mantém essa linha no lugar, sem espalhar `useState` de "qual item está
 * pendente de confirmação" por cada tela.
 *
 * Uso:
 * ```tsx
 * const { confirmar, dialogo } = useConfirmacao()
 * // ...
 * if (!(await confirmar({ titulo: 'Excluir?', destrutivo: true }))) return
 * // e no JSX, uma vez:
 * {dialogo}
 * ```
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const responder = useRef<((ok: boolean) => void) | null>(null)

  const confirmar = useCallback((p: PedidoConfirmacao) => {
    return new Promise<boolean>((resolve) => {
      responder.current = resolve
      setPedido(p)
    })
  }, [])

  const fechar = (ok: boolean) => {
    responder.current?.(ok)
    responder.current = null
    setPedido(null)
  }

  const dialogo = (
    <AlertDialog
      open={!!pedido}
      // Fechar pelo Esc ou pelo clique fora é uma recusa, não um sim.
      onOpenChange={(aberto) => { if (!aberto) fechar(false) }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.descricao ? (
            <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>
          ) : (
            // O Radix exige a descrição para o leitor de tela mesmo quando não
            // há o que acrescentar visualmente.
            <AlertDialogDescription className="sr-only">
              Confirme para continuar.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => fechar(true)}
            className={cn(pedido?.destrutivo && 'bg-red-600 text-white hover:bg-red-700')}
          >
            {pedido?.confirmar ?? 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirmar, dialogo }
}
