import { useEffect, useRef } from 'react'
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
  // No celular as abas não cabem e a fileira rola de lado: a aberta vem
  // para a vista (senão "Ações", a última, ficava fora da tela).
  const ativaRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    ativaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [aberta])

  return (
    <nav aria-label={rotulo} className="sem-barra -mx-1 overflow-x-auto px-1">
      <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
        {subpaginas.map(({ nome, href, icone: Icone }) => {
          const ativa = aberta === href
          return (
            <Link
              key={href}
              ref={ativa ? ativaRef : undefined}
              to={href}
              aria-current={ativa ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] sm:py-1.5 font-medium transition-colors',
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
