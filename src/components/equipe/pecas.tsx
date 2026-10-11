import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { estiloCategoriaEquipe } from '@/lib/categorias-equipe'
import { coresSentimento, rotuloSentimento } from '@/lib/sentimento'
import type { Clima } from '@/lib/equipe'

/* Peças pequenas da página Equipe, usadas em mais de uma aba. */

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

export function Rotulo({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-xs font-semibold uppercase tracking-wide text-gray-500', className)}>{children}</p>
}

/** O selo do sentimento, com as mesmas cores do feedback dos clientes. */
export function SeloSentimento({ valor }: { valor: string | null }) {
  if (!valor) return <span className="inline-flex shrink-0 items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">Sem análise</span>
  return (
    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', coresSentimento(valor).badge)}>
      {rotuloSentimento(valor)}
    </span>
  )
}

export function SeloCategoria({ categoria, className }: { categoria: string; className?: string }) {
  const e = estiloCategoriaEquipe(categoria)
  const Icone = e.icon
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', className)}
      style={{ color: e.cor, backgroundColor: e.fundo, borderColor: e.borda }}
    >
      <Icone className="h-3 w-3" /> {categoria}
    </span>
  )
}

const PARTES: { chave: keyof Omit<Clima, 'total'>; rotulo: string; cor: string }[] = [
  { chave: 'positivo', rotulo: 'Positivo', cor: 'bg-emerald-500' },
  { chave: 'negativo', rotulo: 'Negativo', cor: 'bg-rose-500' },
  { chave: 'sugestao', rotulo: 'Sugestão', cor: 'bg-sky-500' },
  { chave: 'neutro', rotulo: 'Neutro', cor: 'bg-slate-400' },
]

/** A barra dividida por sentimento. `legenda`: mostra os números embaixo. */
export function BarraClima({ clima, legenda = false, className }: { clima: Clima; legenda?: boolean; className?: string }) {
  if (!clima.total) return <div className={cn('h-2 rounded-full bg-gray-100', className)} />
  return (
    <div className={className}>
      <div className="flex h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={PARTES.map((p) => `${clima[p.chave]} ${p.rotulo.toLowerCase()}`).join(', ')}>
        {PARTES.filter((p) => clima[p.chave] > 0).map((p) => (
          <div key={p.chave} className={p.cor} style={{ width: `${(clima[p.chave] / clima.total) * 100}%` }} />
        ))}
      </div>
      {legenda && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {PARTES.map((p) => (
            <span key={p.chave} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', p.cor)} /> {p.rotulo} <span className="font-semibold tabular-nums text-gray-900">{clima[p.chave]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
