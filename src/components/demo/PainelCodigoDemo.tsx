import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PREFIXO_DEMO } from '@/lib/demo'
import { buscarCodigoDemo, definirTesteDemo, type CodigoDemo } from '@/lib/queries/demo'

const JANELA_S = 30
/** Nos últimos segundos o código ainda vale, mas não dá tempo de digitar com calma. */
const QUASE_TROCANDO_S = 5

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
  const [restante, setRestante] = useState(0)
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
          setRestante(novo.segundosRestantes)
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
    const relogio = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      clearTimeout(proxima)
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo])

  if (!ativo) return null

  const endereco = `${window.location.host}${PREFIXO_DEMO}`
  const quaseTrocando = restante <= QUASE_TROCANDO_S
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
    <div className="rounded-2xl border border-gray-200/75 bg-white p-5 sm:p-6 shadow-subtle" data-painel="codigo-demo">
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 shrink-0 mt-0.5 text-[#1D4ED8]" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Código da demonstração</h3>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
              Conta de vendedor
            </span>
          </div>
          <p className="text-[13px] text-gray-600 mt-1">
            No computador do cliente, abra <b className="font-medium text-gray-800">{endereco}</b> e digite o
            código. O acesso dura 2 horas e fecha sozinho.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              aria-live="polite"
              data-codigo-demo={dados?.codigo ?? ''}
              className={cn(
                'text-4xl font-bold tracking-[0.18em] tabular-nums transition-colors',
                quaseTrocando ? 'text-gray-400' : 'text-gray-900',
              )}
            >
              {dados ? `${dados.codigo.slice(0, 3)} ${dados.codigo.slice(3)}` : '··· ···'}
            </div>
            <div className="flex-1 sm:max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-1000 ease-linear',
                    quaseTrocando ? 'bg-amber-400' : 'bg-[#1D4ED8]',
                  )}
                  style={{ width: `${(Math.min(restante, JANELA_S) / JANELA_S) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-gray-500">
                {falhou
                  ? 'Sem conexão. Tentando de novo…'
                  : quaseTrocando
                    ? 'Trocando — espere o próximo código'
                    : `Muda em ${restante} s`}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
            <Switch
              id="teste-demo"
              checked={teste}
              onCheckedChange={alternarTeste}
              disabled={salvandoTeste || !dados}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="teste-demo" className="cursor-pointer text-[13px] font-medium text-gray-800">
                Próximo acesso: teste de 3 minutos
              </label>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Para testar sozinho: ligue, abra outra aba em {endereco} e digite o código. Desliga sozinho
                depois de usado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
