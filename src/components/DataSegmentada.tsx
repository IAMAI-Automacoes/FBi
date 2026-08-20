import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface DataSegmentadaProps {
  value: Date | undefined
  onChange: (data: Date | undefined) => void
  /** Data mais recente aceita (ex.: hoje) — datas depois disso são ignoradas. */
  maxDate?: Date
  className?: string
}

/**
 * Campo de data em 3 pedaços (dia/mês/ano), tipo o input nativo de data mas
 * com backspace de verdade: clicar num pedaço seleciona o conteúdo dele
 * (digitar já sobrescreve); ao completar um pedaço, o foco pula pro próximo
 * sozinho; backspace num pedaço vazio volta pro anterior (e já seleciona ele,
 * pra poder digitar por cima).
 */
export function DataSegmentada({ value, onChange, maxDate, className }: DataSegmentadaProps) {
  const [dia, setDia] = useState('')
  const [mes, setMes] = useState('')
  const [ano, setAno] = useState('')

  const refDia = useRef<HTMLInputElement>(null)
  const refMes = useRef<HTMLInputElement>(null)
  const refAno = useRef<HTMLInputElement>(null)

  // Sincroniza quando `value` muda por fora (ex.: clique no calendário).
  useEffect(() => {
    setDia(value ? String(value.getDate()).padStart(2, '0') : '')
    setMes(value ? String(value.getMonth() + 1).padStart(2, '0') : '')
    setAno(value ? String(value.getFullYear()) : '')
  }, [value])

  const tentarCommit = (d: string, m: string, a: string) => {
    if (d.length !== 2 || m.length !== 2 || a.length !== 4) return
    const data = new Date(Number(a), Number(m) - 1, Number(d))
    const valida = !isNaN(data.getTime()) && data.getDate() === Number(d) && data.getMonth() === Number(m) - 1
    if (!valida) return
    if (maxDate && data > maxDate) return
    onChange(data)
  }

  const soNumeros = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max)

  const mudarDia = (v: string) => {
    v = soNumeros(v, 2)
    setDia(v)
    tentarCommit(v, mes, ano)
    if (v.length === 2) { refMes.current?.focus(); refMes.current?.select() }
  }
  const mudarMes = (v: string) => {
    v = soNumeros(v, 2)
    setMes(v)
    tentarCommit(dia, v, ano)
    if (v.length === 2) { refAno.current?.focus(); refAno.current?.select() }
  }
  const mudarAno = (v: string) => {
    v = soNumeros(v, 4)
    setAno(v)
    tentarCommit(dia, mes, v)
  }

  /** Backspace num pedaço já vazio volta pro anterior, com o conteúdo selecionado. */
  const voltarSeVazio = (atual: string, refAnterior: React.RefObject<HTMLInputElement> | null) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && atual === '' && refAnterior?.current) {
        e.preventDefault()
        refAnterior.current.focus()
        refAnterior.current.select()
      }
    }

  const segmentoClasses = 'text-center bg-transparent outline-none tabular-nums'

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md border border-input bg-white px-2.5 h-8 text-xs focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      {/*
        O valor mostrado quando vazio é o texto "DD"/"MM"/"AAAA" de verdade (não
        um placeholder do input) — assim o .select() no focus realmente
        seleciona essas letras, em vez de só piscar um cursor no meio delas.
        Digitar por cima substitui a seleção inteira, igual já acontecia com
        números preenchidos.
      */}
      <input
        ref={refDia}
        value={dia || 'DD'}
        onChange={(e) => mudarDia(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={voltarSeVazio(dia, null)}
        inputMode="numeric"
        className={cn(segmentoClasses, 'w-6')}
      />
      <span className="text-gray-500 font-semibold">/</span>
      <input
        ref={refMes}
        value={mes || 'MM'}
        onChange={(e) => mudarMes(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={voltarSeVazio(mes, refDia)}
        inputMode="numeric"
        className={cn(segmentoClasses, 'w-6')}
      />
      <span className="text-gray-500 font-semibold">/</span>
      <input
        ref={refAno}
        value={ano || 'AAAA'}
        onChange={(e) => mudarAno(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={voltarSeVazio(ano, refMes)}
        inputMode="numeric"
        className={cn(segmentoClasses, 'w-11')}
      />
    </div>
  )
}
