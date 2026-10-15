import { useEffect, useState } from 'react'
import { buscarPrecos } from '@/lib/queries/cobranca'
import { montarPlano, type Ciclo, type PlanoCiclo } from '@/components/vendas/ciclos-plano'

/* Preços atuais (tabela `planos_precos`), prontos para a tela.

   Uma busca por montagem. Enquanto carrega, `planos` é vazio e as telas
   mostram esqueleto — nunca um valor fixo, que poderia estar errado. */

export interface EstadoPrecos {
  planos: PlanoCiclo[]
  carregando: boolean
  erro: string | null
  porCiclo: (c: Ciclo) => PlanoCiclo | undefined
  recarregar: () => void
}

export function usePrecos(area: 'restaurante' | 'rh' = 'restaurante'): EstadoPrecos {
  const [planos, setPlanos] = useState<PlanoCiclo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    buscarPrecos(area)
      .then((precos) => {
        if (!vivo) return
        setPlanos(precos.map(montarPlano))
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
  }, [tentativa, area])

  return {
    planos,
    carregando,
    erro,
    porCiclo: (c) => planos.find((p) => p.id === c),
    recarregar: () => setTentativa((t) => t + 1),
  }
}
