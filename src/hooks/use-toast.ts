import { toast as sonner } from 'sonner'

/**
 * Adaptador: mantém a assinatura `toast({ title, description, variant })` que
 * os ~26 arquivos do app já usam, mas entrega no sonner — o único sistema de
 * notificação montado (ver `components/ui/sonner.tsx`).
 *
 * Antes existiam DOIS: este hook, com o `<Toaster/>` do shadcn, e o sonner,
 * usado direto em quatro páginas. Dois visuais, dois tempos de tela, e nenhum
 * dos dois sumia sozinho no caso do shadcn. A assinatura ficou porque trocá-la
 * mexeria em 26 arquivos sem mudar nada que o dono veja.
 *
 * `variant` mapeia para o ícone: `destructive` é o vermelho de erro, `info` o
 * azul neutro, e a ausência dele é sucesso — que é o que a esmagadora maioria
 * das chamadas comunica ("Ação criada", "Feedback enviado").
 */

type Variante = 'default' | 'destructive' | 'info'

export interface OpcoesToast {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: Variante
}

function paraTexto(v: React.ReactNode): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
}

export function toast({ title, description, variant }: OpcoesToast) {
  const texto = paraTexto(title) || paraTexto(description)
  const detalhe = paraTexto(title) ? paraTexto(description) || undefined : undefined
  const opcoes = detalhe ? { description: detalhe } : undefined

  const id =
    variant === 'destructive'
      ? sonner.error(texto, opcoes)
      : variant === 'info'
        ? sonner.info(texto, opcoes)
        : sonner.success(texto, opcoes)

  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    /** Mantido por compatibilidade com a API antiga; nada no app usa. */
    update: () => {},
  }
}

export function useToast() {
  return {
    toast,
    dismiss: (id?: string) => sonner.dismiss(id),
    /** A lista de toasts vive dentro do sonner agora — ninguém no app lia isto. */
    toasts: [] as never[],
  }
}
