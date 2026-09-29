import { useEffect, useState } from 'react'
import { buscarPrecos } from '@/lib/queries/stripe'
import { montarPlano, type Ciclo, type PlanoCiclo } from '@/components/vendas/ciclos-plano'

/* Preços atuais do Stripe, prontos para a tela.

   Uma busca por montagem; o `get-prices` já cacheia (5 min no servidor e no
   navegador via Cache-Control), então repetir a chamada entre páginas custa
   quase nada. Enquanto carrega, `planos` é vazio e as telas mostram esqueleto
   — nunca um valor fixo, que poderia estar errado. */

export interface EstadoPrecos {
  planos: PlanoCiclo[]
  carregando: boolean
  erro: string | null
  porCiclo: (c: Ciclo) => PlanoCiclo | undefined
  recarregar: () => void
}

export function usePrecos(): EstadoPrecos {
  const [planos, setPlanos] = useState<PlanoCiclo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    buscarPrecos()
      .then((r) => {
        if (!vivo) return
        setPlanos(r.precos.map(montarPlano))
      })
      .catch((e: Error) => {
        if (!vivo) return
        setErro(e.message || 'Não foi possível carregar os preços.')
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  return {
    planos,
    carregando,
    erro,
    porCiclo: (c) => planos.find((p) => p.id === c),
    recarregar: () => setTentativa((t) => t + 1),
  }
}
