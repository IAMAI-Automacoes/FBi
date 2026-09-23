import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PREFIXO_DEMO } from '@/lib/demo'
import { buscarCodigoDemo, type CodigoDemo } from '@/lib/queries/demo'

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
 * demonstração em outro computador. Clicar no código copia.
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
  const [copiado, setCopiado] = useState(false)
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

  useEffect(() => {
    if (!copiado) return
    const id = setTimeout(() => setCopiado(false), 1800)
    return () => clearTimeout(id)
  }, [copiado])

  if (!ativo) return null

  const quaseTrocando = dados !== null && fim - agora <= QUASE_TROCANDO_MS

  const copiar = async () => {
    if (!dados) return
    try {
      await navigator.clipboard.writeText(dados.codigo)
      setCopiado(true)
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione o código e copie à mão.',
        variant: 'destructive',
      })
    }
  }

  return (
    <section
      data-painel="codigo-demo"
      className="flex items-center justify-between gap-6 rounded-2xl border border-gray-200/75 bg-white px-6 py-5 shadow-subtle sm:px-10"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">Código da demonstração</h3>
        <p className={cn('mt-0.5 flex items-center gap-1 text-[13px]', copiado ? 'text-emerald-600' : 'text-gray-500')}>
          {copiado ? (
            <>
              <Check className="h-3.5 w-3.5" /> Código copiado
            </>
          ) : falhou ? (
            'Sem conexão. Tentando de novo…'
          ) : (
            <>
              Digite em <span className="font-medium text-gray-700">{window.location.host}{PREFIXO_DEMO}</span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={copiar}
          disabled={!dados}
          title="Clique para copiar"
          aria-label={dados ? `Copiar o código ${dados.codigo}` : 'Carregando o código'}
          data-codigo-demo={dados?.codigo ?? ''}
          className="group -mx-2 mt-3 flex items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 disabled:cursor-default"
        >
          <span
            aria-live="polite"
            className={cn(
              'text-[44px] font-semibold leading-none tracking-[0.14em] tabular-nums transition-colors',
              quaseTrocando ? 'text-gray-400' : 'text-gray-900',
            )}
          >
            {dados ? `${dados.codigo.slice(0, 3)} ${dados.codigo.slice(3)}` : '––– –––'}
          </span>
          {dados && (
            <Copy className="h-4 w-4 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          )}
        </button>
      </div>
      {dados && <ContagemCircular fim={fim} quaseTrocando={quaseTrocando} />}
    </section>
  )
}
