import type { ReactNode } from 'react'
import { RotaPermitida } from '@/components/RotaPermitida'
import { SoAdminPlataforma } from '@/components/SoAdminPlataforma'

/**
 * Toda página de /equipe passa por aqui.
 *
 * Só o admin da plataforma abre, por enquanto. Para liberar aos donos: tire o
 * `SoAdminPlataforma` daqui e o `soAdmin` do menu (AppSidebar), o SO_ADMIN da
 * função `equipe`, e mude `equipe_liberada()` no banco.
 *
 * Feedbacks, Insights e Ações são as mesmas páginas dos clientes. O que as faz
 * se comportarem como páginas da equipe (dados, textos, categorias, links) é o
 * endereço /equipe: ver `lib/publico-rota.ts` e `lib/publico.tsx`.
 */
export function AreaEquipe({ children }: { children: ReactNode }) {
  return (
    <RotaPermitida modulo="visao_geral">
      <SoAdminPlataforma>{children}</SoAdminPlataforma>
    </RotaPermitida>
  )
}
