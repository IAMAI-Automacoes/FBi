import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Peças da aba Resultados usadas pela lista e pelo detalhe. */

/** Hoje em Brasília (yyyy-MM-dd), o mesmo dia das linhas de `metricas_diarias`. */
export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export const numero = (n: number) => n.toLocaleString('pt-BR')

export function Ganho({ valor, className }: { valor: number | null; className?: string }) {
  if (valor === null) return <span className={cn('text-gray-400', className)}>—</span>
  return (
    <span
      className={cn(
        'font-semibold tabular-nums',
        valor > 0 ? 'text-emerald-600' : valor < 0 ? 'text-rose-600' : 'text-gray-500',
        className,
      )}
    >
      {valor > 0 ? '+' : ''}
      {valor} pts
    </span>
  )
}

export function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[12px] font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11.5px] text-gray-500">{detalhe}</p>}
    </div>
  )
}

/** Uma frase pronta com o botão de copiar. */
export function FraseCopiavel({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      /* sem permissão de área de transferência: o texto continua selecionável */
    }
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <p className="flex-1 select-text text-[13px] leading-relaxed text-gray-800">{texto}</p>
      <button
        onClick={copiar}
        title="Copiar"
        className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11.5px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
