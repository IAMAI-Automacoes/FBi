import type { ReactNode } from 'react'
import { usePlatformAdmin } from '@/hooks/use-platform-admin'
import { SemAcesso } from '@/components/SemAcesso'
import { Skeleton } from '@/components/ui/skeleton'

/* Página que, por enquanto, só o admin da plataforma abre (ex.: Google, antes
   do Google liberar a API). Esconder do menu não basta: quem digitasse o
   endereço entraria. */
export function SoAdminPlataforma({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = usePlatformAdmin()

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!isAdmin) return <SemAcesso />

  return <>{children}</>
}
