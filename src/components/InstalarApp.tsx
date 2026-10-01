import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ehAppInstalado, ehIphone, existePedidoDeInstalar, instalar, podeInstalarAqui } from '@/lib/instalar-app'

/** Passo a passo do iPhone (lá não existe botão de instalar no navegador). */
export function PassoAPassoIphone({ aoFechar, nome }: { aoFechar: () => void; nome: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={aoFechar} role="dialog" aria-modal="true" aria-label={`Instalar ${nome}`}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[16px] font-semibold text-gray-900">Instalar o {nome} no iPhone</p>
          <button type="button" onClick={aoFechar} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <ol className="mt-3 space-y-3 text-[14px] text-gray-700">
          <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100"><Share className="h-4 w-4 text-[#027EB5]" /></span>Toque em <b>Compartilhar</b> na barra do Safari.</li>
          <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100"><SquarePlus className="h-4 w-4 text-gray-700" /></span>Escolha <b>Adicionar à Tela de Início</b>.</li>
          <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[13px] font-bold text-white">3</span>Abra pelo ícone: você já entra logado, e as notificações passam a funcionar.</li>
        </ol>
      </div>
    </div>
  )
}

/**
 * Botão "Instalar app" (cabeçalho da lista do WhatsApp). Some no app já
 * instalado e onde o navegador não deixa instalar.
 */
export function BotaoInstalarApp({ rota, nome, destacar = false }: { rota: string; nome: string; destacar?: boolean }) {
  const { toast } = useToast()
  const [, renovar] = useState(0)
  const [passoIphone, setPassoIphone] = useState(false)
  useEffect(() => {
    const f = () => renovar((n) => n + 1)
    window.addEventListener('easyfeed:pode-instalar', f)
    return () => window.removeEventListener('easyfeed:pode-instalar', f)
  }, [])

  if (ehAppInstalado()) return null
  const iphone = ehIphone()
  if (!iphone && !existePedidoDeInstalar()) return null

  const clicar = async () => {
    if (iphone) { setPassoIphone(true); return }
    const r = await instalar(rota)
    if (r === 'aceito') toast({ title: `${nome} instalado`, description: 'Abra pelo ícone na tela inicial.' })
  }

  return (
    <>
      <button
        type="button"
        onClick={clicar}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
          destacar || podeInstalarAqui(rota) ? 'bg-white text-[#128C7E] hover:bg-white/90' : 'text-white/90 hover:bg-white/10 hover:text-white',
          destacar && 'animate-pulse',
        )}
        title={`Instalar o ${nome} na tela inicial`}
      >
        <Download className="h-4 w-4" />
        <span>Instalar app</span>
      </button>
      {passoIphone && <PassoAPassoIphone nome={nome} aoFechar={() => setPassoIphone(false)} />}
    </>
  )
}
