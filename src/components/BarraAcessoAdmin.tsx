import { useState } from 'react'
import { Loader2, LogOut, UserCog } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { voltarParaMinhaConta } from '@/lib/acesso-admin'
import { ehEnderecoInfluencers } from '@/lib/influencers'

/* Aparece em todas as páginas enquanto o admin da plataforma está dentro da
   conta de um cliente (painel Admin → Contas → "Entrar"): deixa claro de quem
   é a conta e leva de volta para a do admin com um clique. */
export function BarraAcessoAdmin() {
  const { acessoAdmin, usuario } = useAuth()
  const [voltando, setVoltando] = useState(false)

  // Na área de influencers o login é outro: a barra do painel dos restaurantes não vale lá.
  if (!acessoAdmin || ehEnderecoInfluencers(window.location.pathname)) return null

  const voltar = async () => {
    setVoltando(true)
    try {
      await voltarParaMinhaConta()
    } catch {
      setVoltando(false)
    }
  }

  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900 py-1.5 pl-3 pr-1.5 text-white shadow-lg ring-1 ring-black/10"
    >
      <UserCog className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      <span className="min-w-0 truncate text-[12px] leading-tight">
        Você está na conta de <strong className="font-semibold">{usuario?.nome_restaurante || usuario?.email || 'um cliente'}</strong>
      </span>
      <button
        onClick={voltar}
        disabled={voltando}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-gray-900 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60"
      >
        {voltando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        Voltar para minha conta
      </button>
    </div>
  )
}
