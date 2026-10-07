import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* A tabela das abas do painel do admin (Contas, Vendedores, Pagamentos,
   Influenciadores…): o mesmo desenho em todas. */

export function CrudTable({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      {/* min-w: no celular a tabela rola dentro do card em vez de espremer/cortar. */}
      <table className="w-full text-sm min-w-[560px]">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('text-left px-4 py-2.5 text-[12px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-300', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}
