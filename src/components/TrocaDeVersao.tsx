import { useState } from 'react'
import { toast } from 'sonner'
import { AREAS, DEFINICOES, inicioDa, type Area } from '@/lib/areas'
import { definirAreaDaConta } from '@/lib/queries/areas'
import { cn } from '@/lib/utils'

/**
 * Só para o admin da plataforma: a conta dele usa as DUAS versões no mesmo
 * número, e este botão troca a que está na tela. Nada muda de lugar no banco
 * (feedback de cliente continua de cliente, de funcionário continua da equipe);
 * muda o que a conta vê: menu, páginas, palavras e as conversas do WhatsApp.
 *
 * Fica no menu do cliente e no do Painel Admin (que também segue a versão).
 * `destino`: para onde a página recarrega já na versão nova.
 */
export function TrocaDeVersao({ restauranteId, area, destino = inicioDa, className }: {
  restauranteId: number
  area: Area
  destino?: (nova: Area) => string
  className?: string
}) {
  const [trocando, setTrocando] = useState<Area | null>(null)
  const trocar = async (nova: Area) => {
    if (nova === area || trocando) return
    setTrocando(nova)
    try {
      await definirAreaDaConta(restauranteId, nova)
      // Recarrega: o app inteiro relê a conta já na outra versão.
      window.location.assign(destino(nova))
    } catch {
      toast.error('Não foi possível trocar de versão.')
      setTrocando(null)
    }
  }
  return (
    <div role="group" aria-label="Versão do EasyFeed na tela" className={cn('mb-2 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 group-data-[collapsible=icon]:hidden', className)}>
      {AREAS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => trocar(a)}
          disabled={!!trocando}
          aria-pressed={area === a}
          title={area === a ? `Você está na versão ${DEFINICOES[a].nome}` : `Trocar para a versão ${DEFINICOES[a].nome}`}
          className={cn(
            'h-7 rounded-md text-[12px] font-semibold transition-colors',
            area === a ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-500 hover:text-gray-900',
            trocando === a && 'opacity-60',
          )}
        >
          {trocando === a ? 'Trocando…' : DEFINICOES[a].nome}
        </button>
      ))}
    </div>
  )
}
