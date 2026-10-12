import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* Peças pequenas da página Equipe, usadas em mais de uma aba. */

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

export function Rotulo({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-xs font-semibold uppercase tracking-wide text-gray-500', className)}>{children}</p>
}
