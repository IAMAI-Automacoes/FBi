import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/auth/AuthLayout'

export { authInputStyle, authInputFocus, authInputBlur } from '@/components/auth/AuthLayout'

/** Logo do EasyFeed + o selo da área. */
export function MarcaInfluencers({ altura = 34, claro = false }: { altura?: number; claro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('inline-flex items-center rounded-lg', claro && 'bg-white px-2 py-1')}>
        <BrandMark size={altura} />
      </span>
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]',
          claro ? 'bg-white/10 text-blue-100 ring-1 ring-white/20' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
        )}
      >
        Influencers
      </span>
    </div>
  )
}

export function BotaoPrincipal({ carregando, children, className, ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return (
    <button
      {...resto}
      disabled={resto.disabled || carregando}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-[14px] font-semibold text-white',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_rgba(37,99,235,0.22)] transition-all',
        'hover:-translate-y-px hover:from-blue-500 hover:to-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200',
        'disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function BotaoTexto({ children, className, ...resto }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...resto}
      className={cn('text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50', className)}
    >
      {children}
    </button>
  )
}

export function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
    </div>
  )
}

/* Exemplo do que tem lá dentro, no painel da esquerda da entrada. Ilustração
   fixa (não são dados de verdade). */
const AMOSTRA = [
  { rotulo: 'Comida fria', tipo: 'Reclamação', cor: 'bg-red-500', alta: '+38%' },
  { rotulo: 'Garçom atencioso', tipo: 'Elogio', cor: 'bg-emerald-500', alta: null },
  { rotulo: 'Demora no atendimento', tipo: 'Reclamação', cor: 'bg-red-500', alta: '+12%' },
  { rotulo: 'Opção vegana no cardápio', tipo: 'Sugestão', cor: 'bg-sky-500', alta: null },
]

function PainelDeApresentacao() {
  return (
    <div className="relative hidden w-[46%] max-w-[620px] flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-600/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative">
        <MarcaInfluencers claro />
      </div>

      <div className="relative">
        <h2 className="fonte-marca max-w-md text-[40px] leading-[1.08] text-balance">
          O que os clientes de restaurante estão falando
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
          Temas, números e frases dos comentários reais, sem nome de restaurante nem de cliente, para os seus vídeos sobre restaurantes.
        </p>

        <div className="mt-10 space-y-2.5">
          {AMOSTRA.map((a) => (
            <div key={a.rotulo} className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', a.cor)} />
              <span className="flex-1 text-[14px] font-medium">{a.rotulo}</span>
              <span className="text-[11px] uppercase tracking-wider text-slate-400">{a.tipo}</span>
              {a.alta && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                  <TrendingUp className="h-3 w-3" />
                  {a.alta}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="relative text-[12px] text-slate-500">Exemplo ilustrativo. Os dados de verdade ficam do lado de dentro.</p>
    </div>
  )
}

/** Entrada, criar senha e boas-vindas: o mesmo quadro. */
export function LayoutEntrada({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <PainelDeApresentacao />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <MarcaInfluencers />
        </div>
        <div className="w-full max-w-[420px] rounded-3xl bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.05)] sm:p-9">
          {children}
        </div>
      </div>
    </div>
  )
}

export function TituloEntrada({ titulo, subtitulo }: { titulo: string; subtitulo?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[23px] font-bold tracking-tight text-slate-900 text-balance">{titulo}</h1>
      {subtitulo && <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{subtitulo}</p>}
    </div>
  )
}

export function Aviso({ tom = 'erro', children }: { tom?: 'erro' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={tom === 'erro' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed',
        tom === 'erro' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
      )}
    >
      {children}
    </p>
  )
}
