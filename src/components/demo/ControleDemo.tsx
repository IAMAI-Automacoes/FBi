import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { avisoAntesMs, MODO_DEMO, PREFIXO_DEMO } from '@/lib/demo'
import { demoEstaEncerrando, encerrarDemo } from '@/lib/queries/demo'
import { cn } from '@/lib/utils'

/** De quanto em quanto tempo a demonstração reconfere o banco. */
const RECONFERIR_MS = 60_000

/**
 * Fecha a demonstração na hora e avisa antes. Montado uma vez no App; sem
 * demonstração não faz nada.
 */
export function ControleDemo() {
  const { sessaoDemo, recarregarAcesso } = useAuth()
  const { toast } = useToast()
  const avisou = useRef(false)
  const tinhaDemo = useRef(false)

  const expiraMs = sessaoDemo?.expiraEm.getTime() ?? null
  const duracao = sessaoDemo?.duracaoMinutos ?? null

  useEffect(() => {
    if (expiraMs === null || duracao === null) return
    const aviso = avisoAntesMs(duracao)

    // Confere o relógio de verdade a cada segundo, em vez de um timer longo até
    // o fim: com o computador suspenso, o timer longo atrasa.
    const conferir = () => {
      const falta = expiraMs - Date.now()
      if (falta <= 0) {
        encerrarDemo()
        return
      }
      if (falta <= aviso && !avisou.current) {
        avisou.current = true
        const minutos = Math.max(1, Math.round(falta / 60_000))
        toast({
          title: `A demonstração termina em ${minutos} min`,
          description: 'Depois disso o acesso fecha sozinho neste computador.',
        })
      }
    }

    conferir()
    const id = setInterval(conferir, 1000)
    return () => clearInterval(id)
  }, [expiraMs, duracao, toast])

  // O banco é quem manda: hora de fim alterada lá, marca de vendedor tirada ou
  // sessão já encerrada chegam na aba aberta sem precisar recarregar a página.
  useEffect(() => {
    if (expiraMs === null) return
    const id = setInterval(() => {
      recarregarAcesso()
    }, RECONFERIR_MS)
    return () => clearInterval(id)
  }, [expiraMs, recarregarAcesso])

  // A demonstração deixou de existir com a aba aberta (ex.: marca de vendedor
  // tirada): mostra a tela de fim, não a do código.
  useEffect(() => {
    if (sessaoDemo) {
      tinhaDemo.current = true
    } else if (tinhaDemo.current && MODO_DEMO) {
      encerrarDemo()
    }
  }, [sessaoDemo])

  // Se o servidor derrubar a sessão antes (a renovação do login falha), a aba
  // fecha junto em vez de ficar numa tela quebrada.
  useEffect(() => {
    if (expiraMs === null) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && !demoEstaEncerrando()) window.location.replace(`${PREFIXO_DEMO}/encerrada`)
    })
    return () => subscription.unsubscribe()
  }, [expiraMs])

  return null
}

function formatarFalta(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundos = total % 60
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, '0')}min`
  if (minutos >= 5) return `${minutos} min`
  return `${minutos}:${String(segundos).padStart(2, '0')}`
}

/** O tempo que falta, no cabeçalho. Fica âmbar quando entra na hora do aviso. */
export function PilulaDemo() {
  const { sessaoDemo } = useAuth()
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (!sessaoDemo) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sessaoDemo])

  if (!sessaoDemo) return null

  const falta = sessaoDemo.expiraEm.getTime() - agora
  const acabando = falta <= avisoAntesMs(sessaoDemo.duracaoMinutos)
  const horario = sessaoDemo.expiraEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      title={`Acesso de demonstração. Fecha sozinho às ${horario}.`}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tabular-nums',
        acabando ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-[#1D4ED8]',
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Demonstração ·</span>
      <span>{formatarFalta(falta)}</span>
    </div>
  )
}
