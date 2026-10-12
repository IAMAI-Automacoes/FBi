import { Clapperboard, Gift } from 'lucide-react'
import { SubNav, type Subpagina } from '@/components/SubNav'
import { ROTA_DESCONTOS, ROTA_INDICACOES } from '@/lib/descontos'

/* As subpáginas de Descontos, no cabeçalho. O histórico dos vídeos
   (/descontos/historico) é da subpágina Vídeos. */

export const SUBPAGINAS_DE_DESCONTOS: Subpagina[] = [
  { nome: 'Vídeos', href: ROTA_DESCONTOS, icone: Clapperboard },
  { nome: 'Indicações', href: ROTA_INDICACOES, icone: Gift },
]

export function NavDescontos() {
  return <SubNav rotulo="Páginas de descontos" subpaginas={SUBPAGINAS_DE_DESCONTOS} />
}
