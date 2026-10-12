import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { subpaginaAberta } from '@/lib/subpaginas'

/* O menu de subpáginas que fica no cabeçalho (Equipe, Descontos). A primeira
   subpágina é a raiz da área ("/equipe", "/descontos"). */

export interface Subpagina { nome: string; href: string; icone: LucideIcon }

export function SubNav({ rotulo, subpaginas }: { rotulo: string; subpaginas: readonly Subpagina[] }) {
  const { pathname } = useLocation()
  const aberta = subpaginaAberta(subpaginas.map((s) => s.href), pathname)

  return (
    <nav aria-label={rotulo} className="sem-barra -mx-1 overflow-x-auto px-1">
      <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
        {subpaginas.map(({ nome, href, icone: Icone }) => {
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
