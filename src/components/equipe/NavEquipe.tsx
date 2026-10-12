import { Link, useLocation } from 'react-router-dom'
import { Lightbulb, MessageSquare, Users, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* As subpáginas da Equipe, no cabeçalho. Feedbacks, Insights e Ações são as
   MESMAS telas dos clientes, mostrando só o que os funcionários falaram. */

const SUBPAGINAS: { nome: string; href: string; icone: LucideIcon }[] = [
  { nome: 'Funcionários', href: '/equipe', icone: Users },
  { nome: 'Feedbacks', href: '/equipe/feedbacks', icone: MessageSquare },
  { nome: 'Insights', href: '/equipe/insights', icone: Lightbulb },
  { nome: 'Ações', href: '/equipe/acoes', icone: Zap },
]

/** A subpágina aberta: "/equipe/acoes/arquivadas" ainda é Ações. */
export function subpaginaDaEquipe(caminho: string): string {
  const achada = SUBPAGINAS.filter((s) => s.href !== '/equipe').find((s) => caminho === s.href || caminho.startsWith(`${s.href}/`))
  return achada?.href ?? '/equipe'
}

export function NavEquipe() {
  const { pathname } = useLocation()
  const aberta = subpaginaDaEquipe(pathname)

  return (
    <nav aria-label="Páginas da equipe" className="sem-barra -mx-1 overflow-x-auto px-1">
      <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
        {SUBPAGINAS.map(({ nome, href, icone: Icone }) => {
          const ativa = aberta === href
          return (
            <Link
              key={href}
              to={href}
              aria-current={ativa ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40',
                ativa ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <Icone className="h-3.5 w-3.5" />
              {nome}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
