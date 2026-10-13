import type { ReactNode } from 'react'
import { RotaPermitida } from '@/components/RotaPermitida'
import { SoAdminPlataforma } from '@/components/SoAdminPlataforma'
import { useArea } from '@/lib/area'

/**
 * Toda página de /equipe passa por aqui.
 *
 * Conta RH: estas páginas SÃO o produto dela, então abre.
 * Conta de restaurante: só o admin da plataforma, por enquanto. Para liberar aos
 * donos de restaurante: tire o `SoAdminPlataforma` daqui e o `soAdmin` do menu
 * (AppSidebar), e mude `equipe_liberada()` no banco e `podeUsarAEquipe` na
 * função `equipe`.
 *
 * Feedbacks, Insights e Ações são as mesmas páginas dos clientes. O que as faz
 * se comportarem como páginas da equipe (dados, textos, categorias, links) é o
 * endereço /equipe: ver `lib/publico-rota.ts` e `lib/publico.tsx`.
 */
export function AreaEquipe({ children }: { children: ReactNode }) {
  const { ehRh } = useArea()
  return (
    <RotaPermitida modulo="visao_geral">
      {ehRh ? children : <SoAdminPlataforma>{children}</SoAdminPlataforma>}
    </RotaPermitida>
  )
}
