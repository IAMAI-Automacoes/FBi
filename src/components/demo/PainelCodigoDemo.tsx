import { useEffect, useRef, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PREFIXO_DEMO } from '@/lib/demo'
import { buscarCodigoDemo, definirTesteDemo, type CodigoDemo } from '@/lib/queries/demo'

const JANELA_MS = 30_000
/** Nos últimos segundos o código ainda vale, mas não dá tempo de digitar com calma. */
const QUASE_TROCANDO_MS = 5_000
// Fatia de pizza: um traço com a largura do diâmetro de um círculo de raio 8
// cobre o disco inteiro; o `dashoffset` recolhe a fatia até sumir.
const RAIO = 8
const CIRCUNFERENCIA = 2 * Math.PI * RAIO

/** O tempo até o código trocar. Desenhado a cada quadro direto no SVG, sem re-render. */
function ContagemCircular({ fim, quaseTrocando }: { fim: number; quaseTrocando: boolean }) {
  const fatia = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let quadro = 0
    const desenhar = () => {
      const fracao = Math.min(1, Math.max(0, (fim - Date.now()) / JANELA_MS))
      fatia.current?.setAttribute('stroke-dashoffset', String(CIRCUNFERENCIA * (1 - fracao)))
      quadro = requestAnimationFrame(desenhar)
    }
    desenhar()
    return () => cancelAnimationFrame(quadro)
  }, [fim])

  return (
    <svg viewBox="0 0 32 32" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden>
      <circle cx="16" cy="16" r="16" className={cn('transition-colors', quaseTrocando ? 'fill-amber-50' : 'fill-blue-50')} />
      <circle
        ref={fatia}
        cx="16"
        cy="16"
        r={RAIO}
        fill="none"
        strokeWidth={RAIO * 2}
        strokeDasharray={CIRCUNFERENCIA}
        className={cn('transition-colors', quaseTrocando ? 'stroke-amber-400' : 'stroke-[#1D4ED8]')}
      />
    </svg>
  )
}

/**
 * O "autenticador" do vendedor, no perfil: o código de 6 dígitos que abre a
 * demonstração em outro computador.
 *
 * O código é calculado no banco e só ele chega aqui — a semente nunca sai de
 * lá. Busca de novo a cada virada de 30 s e quando a aba volta a ficar visível
 * (tablet que acordou com o relógio da página parado).
 */
export function PainelCodigoDemo() {
  const { ehVendedor, sessaoDemo } = useAuth()
  const { toast } = useToast()
  const [dados, setDados] = useState<CodigoDemo | null>(null)
  const [fim, setFim] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())
  const [falhou, setFalhou] = useState(false)
  const [salvandoTeste, setSalvandoTeste] = useState(false)
  const ativo = ehVendedor && !sessaoDemo

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    let proxima: ReturnType<typeof setTimeout> | undefined

    const buscar = async () => {
      clearTimeout(proxima)
      try {
        const novo = await buscarCodigoDemo()
        if (!vivo) return
        setDados(novo)
        setFalhou(false)
        if (novo) {
          setFim(Date.now() + novo.segundosRestantes * 1000)
          proxima = setTimeout(buscar, novo.segundosRestantes * 1000 + 300)
        }
      } catch {
        if (!vivo) return
        setFalhou(true)
        proxima = setTimeout(buscar, 5000)
      }
    }

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') buscar()
    }

    buscar()
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      clearTimeout(proxima)
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo])

  if (!ativo) return null

  const quaseTrocando = dados !== null && fim - agora <= QUASE_TROCANDO_MS
  const teste = dados?.proximoAcessoTeste ?? false

  const alternarTeste = async (ligado: boolean) => {
    setSalvandoTeste(true)
    try {
      await definirTesteDemo(ligado)
      setDados((d) => (d ? { ...d, proximoAcessoTeste: ligado } : d))
    } catch (e) {
      toast({
        title: 'Não foi possível mudar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSalvandoTeste(false)
    }
  }

  return (
    <section
      data-painel="codigo-demo"
      className="overflow-hidden rounded-2xl border border-gray-200/75 bg-white shadow-subtle"
    >
      <div className="flex items-center justify-between gap-6 px-6 pb-6 pt-5 sm:px-10">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Código da demonstração</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {falhou ? (
              'Sem conexão. Tentando de novo…'
            ) : (
              <>
                Digite em <span className="font-medium text-gray-700">{window.location.host}{PREFIXO_DEMO}</span>
              </>
            )}
          </p>
          <p
            aria-live="polite"
            data-codigo-demo={dados?.codigo ?? ''}
            className={cn(
              'mt-4 text-[44px] font-semibold leading-none tracking-[0.14em] tabular-nums transition-colors',
              quaseTrocando ? 'text-gray-400' : 'text-gray-900',
            )}
          >
            {dados ? `${dados.codigo.slice(0, 3)} ${dados.codigo.slice(3)}` : '––– –––'}
          </p>
        </div>
        {dados && <ContagemCircular fim={fim} quaseTrocando={quaseTrocando} />}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/70 px-6 py-3 sm:px-10">
        <label htmlFor="teste-demo" className="cursor-pointer text-[13px] text-gray-600">
          Próximo acesso dura 3 minutos (para testar)
        </label>
        <Switch
          id="teste-demo"
          checked={teste}
          onCheckedChange={alternarTeste}
          disabled={salvandoTeste || !dados}
        />
      </div>
    </section>
  )
}
