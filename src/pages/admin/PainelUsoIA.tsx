import { useEffect, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  buscarUsoPorRestaurante, buscarUsoPorAgente, definirLimiteCredito,
} from '@/lib/queries/uso-ia'
import { DollarSign, Loader2, Bot, Store } from 'lucide-react'

type PorRestaurante = Awaited<ReturnType<typeof buscarUsoPorRestaurante>>
type PorAgente = Awaited<ReturnType<typeof buscarUsoPorAgente>>

const dinheiro = (v: number) => `US$ ${v.toFixed(4)}`

/**
 * Consumo de IA por restaurante e por agente.
 *
 * Antes o custo só existia agregado no painel do OpenRouter, sem como atribuir
 * gasto a um cliente nem detectar abuso.
 */
export function PainelUsoIA() {
  const { toast } = useToast()
  const [restaurantes, setRestaurantes] = useState<PorRestaurante>([])
  const [agentes, setAgentes] = useState<PorAgente>([])
  const [carregando, setCarregando] = useState(true)
  const [dias, setDias] = useState(30)
  const [limites, setLimites] = useState<Record<number, string>>({})
  const [salvando, setSalvando] = useState<number | null>(null)

  const carregar = async (janela: number) => {
    setCarregando(true)
    try {
      const [r, a] = await Promise.all([
        buscarUsoPorRestaurante(janela),
        buscarUsoPorAgente(janela),
      ])
      setRestaurantes(r)
      setAgentes(a)
    } catch (e: any) {
      toast({ title: 'Erro ao carregar o uso', description: e.message, variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar(dias) }, [dias])

  const salvarLimite = async (id: number) => {
    const valor = Number(limites[id])
    if (!Number.isFinite(valor) || valor < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' })
      return
    }
    setSalvando(id)
    try {
      await definirLimiteCredito(id, valor)
      toast({ title: 'Limite atualizado', description: `Novo teto: US$ ${valor.toFixed(2)} por ciclo.` })
    } catch (e: any) {
      toast({ title: 'Não consegui salvar', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(null)
    }
  }

  const total = restaurantes.reduce((s, r) => s + r.gasto, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" /> Uso de IA
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Custo real cobrado pelo OpenRouter, registrado a cada chamada. Cada restaurante tem um
          teto por ciclo mensal; ao atingi-lo, o chat para de responder até a renovação.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`text-[12.5px] rounded-lg px-3 py-1.5 border transition-colors ${
              dias === d
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {d} dias
          </button>
        ))}
        <span className="ml-auto text-[13px] text-gray-500">
          Total: <b className="text-gray-900 font-mono">{dinheiro(total)}</b>
        </span>
      </div>

      {carregando ? (
        <p className="text-sm text-gray-400 py-8 text-center">Carregando…</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" /> Por restaurante
            </p>
            <div className="rounded-xl border border-gray-200 bg-white divide-y">
              {restaurantes.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">
                  Nenhuma chamada de IA registrada neste período.
                </p>
              ) : restaurantes.map((r) => (
                <div key={String(r.restaurante_id)} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-gray-900 truncate">{r.nome}</p>
                      <p className="text-[12px] text-gray-500">{r.chamadas} chamadas</p>
                    </div>
                    <span className="text-[13px] font-mono font-semibold text-gray-900 shrink-0">
                      {dinheiro(r.gasto)}
                    </span>
                  </div>
                  {r.restaurante_id != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] text-gray-500 shrink-0">Teto por ciclo (US$)</span>
                      <Input
                        type="number" min={0} step={0.5} className="h-7 w-24 text-xs"
                        placeholder="3.00"
                        value={limites[r.restaurante_id] ?? ''}
                        onChange={(e) =>
                          setLimites({ ...limites, [r.restaurante_id as number]: e.target.value })
                        }
                      />
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => salvarLimite(r.restaurante_id as number)}
                        disabled={salvando === r.restaurante_id || !limites[r.restaurante_id as number]}
                      >
                        {salvando === r.restaurante_id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : 'Salvar'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" /> Por agente
            </p>
            <div className="rounded-xl border border-gray-200 bg-white divide-y">
              {agentes.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">Sem dados no período.</p>
              ) : agentes.map((a) => (
                <div key={a.agente} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-gray-900 font-mono truncate">{a.agente}</p>
                    <p className="text-[12px] text-gray-500">{a.chamadas} chamadas</p>
                  </div>
                  <span className="text-[13px] font-mono text-gray-700 shrink-0">{dinheiro(a.gasto)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
