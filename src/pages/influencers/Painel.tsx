import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Check, Copy, Flame, LogOut, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { estiloCategoria } from '@/lib/categorias-feedback'
import {
  ideiasDePauta, pct, rotuloBonito, variacao,
  type CategoriaPainel, type DadosPainel, type Pauta, type TemaPainel, type TipoPonto,
} from '@/lib/painel-influencers'
import { useInfluencer } from './contexto'
import { buscarPainel, marcarAcesso } from './dados'
import { MarcaInfluencers } from './ui'

const PERIODOS = [7, 30, 90] as const
const CHAVE_PERIODO = 'easyfeed:influencers:periodo'

const COR: Record<TipoPonto, { texto: string; barra: string; fundo: string; hex: string }> = {
  reclamacao: { texto: 'text-red-600', barra: 'bg-red-500', fundo: 'bg-red-50', hex: '#DC2626' },
  elogio: { texto: 'text-emerald-600', barra: 'bg-emerald-500', fundo: 'bg-emerald-50', hex: '#059669' },
  sugestao: { texto: 'text-sky-600', barra: 'bg-sky-500', fundo: 'bg-sky-50', hex: '#0284C7' },
  neutro: { texto: 'text-slate-500', barra: 'bg-slate-300', fundo: 'bg-slate-100', hex: '#94A3B8' },
}

const graficoConfig = {
  reclamacoes: { label: 'Reclamações', color: COR.reclamacao.hex },
  elogios: { label: 'Elogios', color: COR.elogio.hex },
  sugestoes: { label: 'Sugestões', color: COR.sugestao.hex },
} satisfies ChartConfig

function lerPeriodo(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_PERIODO))
    return (PERIODOS as readonly number[]).includes(v) ? v : 30
  } catch {
    return 30
  }
}

const numero = (n: number) => n.toLocaleString('pt-BR')

// ── Peças ─────────────────────────────────────────────────────────────────────

function Cartao({ titulo, subtitulo, children, className, acao }: { titulo: string; subtitulo?: string; children: React.ReactNode; className?: string; acao?: React.ReactNode }) {
  return (
    <section className={cn('rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80 sm:p-6', className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-slate-900">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Seta de tendência. `bomQuandoSobe`: subir elogio é bom (verde); subir reclamação, não (vermelho). */
function Tendencia({ atual, anterior, bomQuandoSobe }: { atual: number; anterior: number; bomQuandoSobe: boolean }) {
  const v = variacao(atual, anterior)
  if (v === null) {
    return atual > 0 ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">novo</span> : null
  }
  if (v === 0) return <span className="text-[11px] font-medium text-slate-400">=</span>
  const sobe = v > 0
  const bom = sobe === bomQuandoSobe
  const Icone = sobe ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', bom ? 'text-emerald-600' : 'text-red-600')}>
      <Icone className="h-3.5 w-3.5" />
      {Math.abs(v)}%
    </span>
  )
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: React.ReactNode; tom?: TipoPonto }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/80 sm:p-5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
        {tom && <span className={cn('h-2 w-2 rounded-full', COR[tom].barra)} />}
        {rotulo}
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">{valor}</div>
      {detalhe && <div className="mt-2 text-[12px] text-slate-500">{detalhe}</div>}
    </div>
  )
}

function ListaTemas({ titulo, subtitulo, tipo, temas }: { titulo: string; subtitulo: string; tipo: TipoPonto; temas: TemaPainel[] }) {
  const max = Math.max(1, ...temas.map((t) => t.mencoes))
  return (
    <Cartao titulo={titulo} subtitulo={subtitulo}>
      {temas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">Nada neste período.</p>
      ) : (
        <ol className="flex flex-col gap-3.5">
          {temas.map((t, i) => (
            <li key={t.rotulo} className="flex gap-3">
              <span className="w-4 shrink-0 pt-px text-right text-[12px] font-semibold text-slate-300 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-slate-800">{rotuloBonito(t.rotulo)}</span>
                  <Tendencia atual={t.mencoes} anterior={t.mencoes_anterior} bomQuandoSobe={tipo !== 'reclamacao'} />
                  <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{t.mencoes}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn('h-full rounded-full', COR[tipo].barra)} style={{ width: `${Math.max(6, (t.mencoes / max) * 100)}%` }} />
                </div>
                {t.comum && <p className="mt-1 text-[11px] text-slate-400">Aparece em mais de um restaurante</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  )
}

function PorAssunto({ categorias }: { categorias: CategoriaPainel[] }) {
  const max = Math.max(1, ...categorias.map((c) => c.total))
  return (
    <Cartao titulo="Por assunto" subtitulo="Sobre o que os clientes falam, e em que tom.">
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {(['reclamacao', 'elogio', 'sugestao'] as TipoPonto[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', COR[t].barra)} />
            {t === 'reclamacao' ? 'Reclamações' : t === 'elogio' ? 'Elogios' : 'Sugestões'}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {categorias.slice(0, 10).map((c) => {
          const estilo = estiloCategoria(c.nome)
          const largura = (n: number) => `${(n / max) * 100}%`
          return (
            <li key={c.nome} className="flex items-center gap-3">
              <estilo.icon className={cn('h-4 w-4 shrink-0', estilo.corTexto)} />
              <span className="w-[120px] shrink-0 truncate text-[13px] font-medium text-slate-700 sm:w-[150px]">{c.nome}</span>
              <div className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={COR.reclamacao.barra} style={{ width: largura(c.reclamacoes) }} />
                <div className={COR.elogio.barra} style={{ width: largura(c.elogios) }} />
                <div className={COR.sugestao.barra} style={{ width: largura(c.sugestoes) }} />
                <div className={COR.neutro.barra} style={{ width: largura(c.neutros) }} />
              </div>
              <span className="w-8 shrink-0 text-right text-[13px] font-semibold text-slate-900 tabular-nums">{c.total}</span>
            </li>
          )
        })}
      </ul>
    </Cartao>
  )
}

function EmAlta({ temas }: { temas: TemaPainel[] }) {
  return (
    <Cartao titulo="Em alta" subtitulo="O que mais cresceu contra o período anterior.">
      {temas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">Nada cresceu de forma clara neste período.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {temas.map((t) => (
            <li key={`${t.tipo}-${t.rotulo}`} className={cn('flex items-center gap-3 rounded-xl px-3.5 py-3', COR[t.tipo].fundo)}>
              <Flame className={cn('h-4 w-4 shrink-0', COR[t.tipo].texto)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-slate-800">{rotuloBonito(t.rotulo)}</span>
                <span className="block text-[11px] text-slate-500">
                  {t.tipo === 'reclamacao' ? 'Reclamação' : t.tipo === 'elogio' ? 'Elogio' : t.tipo === 'sugestao' ? 'Sugestão' : 'Comentário'}
                  {' · '}de {t.mencoes_anterior} para {t.mencoes} menções
                </span>
              </span>
              <span className={cn('text-[13px] font-bold tabular-nums', COR[t.tipo].texto)}>+{t.mencoes - t.mencoes_anterior}</span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function rotuloData(inicio: string, intervalo: 'dia' | 'semana'): string {
  const [, m, d] = inicio.split('-')
  return intervalo === 'semana' ? `sem. ${d}/${m}` : `${d}/${m}`
}

function DicaGrafico({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-[12px] shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {graficoConfig[p.dataKey as keyof typeof graficoConfig]?.label}: <span className="font-semibold tabular-nums text-slate-900">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function Evolucao({ evolucao }: { evolucao: DadosPainel['evolucao'] }) {
  const dados = evolucao.pontos.map((p) => ({ ...p, rotulo: rotuloData(p.inicio, evolucao.intervalo) }))
  return (
    <Cartao titulo="Evolução" subtitulo={evolucao.intervalo === 'dia' ? 'Comentários por dia.' : 'Comentários por semana.'}>
      <ChartContainer config={graficoConfig} className="h-[230px] w-full">
        <AreaChart data={dados} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            {Object.entries(graficoConfig).map(([chave, c]) => (
              <linearGradient key={chave} id={`grad-${chave}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={c.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="#EEF2F7" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fontSize: 11, fill: '#94A3B8' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: '#94A3B8' }} />
          <ChartTooltip cursor={{ stroke: '#CBD5E1' }} content={<DicaGrafico />} />
          {Object.entries(graficoConfig).map(([chave, c]) => (
            <Area key={chave} type="monotone" dataKey={chave} stroke={c.color} strokeWidth={2} fill={`url(#grad-${chave})`} dot={false} activeDot={{ r: 4 }} />
          ))}
        </AreaChart>
      </ChartContainer>
    </Cartao>
  )
}

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  const copiar = async (chave: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(chave)
      setTimeout(() => setCopiado((c) => (c === chave ? null : c)), 2000)
    } catch { /* sem permissão de copiar: nada a fazer */ }
  }
  return { copiado, copiar }
}

function Pautas({ pautas }: { pautas: Pauta[] }) {
  const { copiado, copiar } = useCopiar()
  if (pautas.length === 0) return null
  return (
    <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="relative mb-4 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <h2 className="text-[15px] font-semibold">Ideias de pauta</h2>
        <span className="basis-full text-[13px] text-slate-400 sm:basis-auto">tiradas dos dados deste período</span>
      </div>
      <ul className="relative grid gap-3 md:grid-cols-2">
        {pautas.map((p) => (
          <li key={p.titulo} className="flex flex-col gap-3 rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10">
            <p className="text-[15px] font-semibold leading-snug text-balance">{p.titulo}</p>
            <p className="text-[13px] leading-relaxed text-slate-300">{p.porque}</p>
            <button
              onClick={() => copiar(p.titulo, `${p.titulo}\n${p.porque}`)}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {copiado === p.titulo ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado === p.titulo ? 'Copiado' : 'Copiar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Frases({ frases }: { frases: DadosPainel['frases'] }) {
  const tipos = (['reclamacao', 'elogio', 'sugestao'] as TipoPonto[]).filter((t) => frases.some((f) => f.tipo === t))
  const [aba, setAba] = useState<TipoPonto>(tipos[0] ?? 'reclamacao')
  const { copiado, copiar } = useCopiar()
  const atual = tipos.includes(aba) ? aba : tipos[0]
  const lista = frases.filter((f) => f.tipo === atual)
  return (
    <Cartao
      titulo="Como os clientes falam"
      subtitulo="Resumos curtos dos comentários, sem identificar ninguém."
      acao={tipos.length > 1 ? (
        <div className="flex rounded-full bg-slate-100 p-0.5">
          {tipos.map((t) => (
            <button
              key={t}
              onClick={() => setAba(t)}
              className={cn('rounded-full px-3 py-1 text-[12px] font-medium transition-colors', atual === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
            >
              {t === 'reclamacao' ? 'Reclamações' : t === 'elogio' ? 'Elogios' : 'Sugestões'}
            </button>
          ))}
        </div>
      ) : undefined}
    >
      {lista.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">Nada neste período.</p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((f) => (
            <li key={f.texto}>
              <button
                onClick={() => copiar(f.texto, f.texto)}
                title="Copiar"
                className="group flex h-full w-full flex-col gap-2 rounded-xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-200/70 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <span className="text-[14px] leading-snug text-slate-800">“{f.texto}”</span>
                <span className="mt-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className={cn('h-1.5 w-1.5 rounded-full', COR[f.tipo].barra)} />
                  {f.categoria}
                  <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">{copiado === f.texto ? 'Copiado' : 'Copiar'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function SeletorPeriodo({ dias, onDias }: { dias: number; onDias: (d: number) => void }) {
  return (
    <div className="flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Período">
      {PERIODOS.map((p) => (
        <button
          key={p}
          onClick={() => onDias(p)}
          aria-pressed={dias === p}
          className={cn('rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors', dias === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
        >
          {p} dias
        </button>
      ))}
    </div>
  )
}

function Carregando() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[220px] rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[300px] rounded-2xl" />)}
      </div>
    </div>
  )
}

// ── A página ──────────────────────────────────────────────────────────────────

export default function Painel() {
  const { perfil, sessao, sair } = useInfluencer()
  const [dias, setDiasEstado] = useState(lerPeriodo)
  const [culinaria, setCulinaria] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosPainel | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  const setDias = (d: number) => {
    setDiasEstado(d)
    try { localStorage.setItem(CHAVE_PERIODO, String(d)) } catch { /* sem armazenamento */ }
  }

  useEffect(() => { marcarAcesso().catch(() => {}) }, [])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    buscarPainel(dias, culinaria)
      .then((d) => { if (vivo) { setDados(d); setErro(false) } })
      .catch(() => { if (vivo) setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [dias, culinaria, tentativa])

  const pautas = useMemo(() => (dados ? ideiasDePauta(dados) : []), [dados])
  const primeiroNome = (perfil?.nome ?? '').split(' ')[0]
  const t = dados?.totais
  const assuntoTop = dados?.categorias[0]
  const temas = (tipo: TipoPonto) => (dados?.temas ?? []).filter((x) => x.tipo === tipo)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <MarcaInfluencers altura={26} />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block"><SeletorPeriodo dias={dias} onDias={setDias} /></div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                aria-label="Sua conta"
              >
                {(primeiroNome[0] ?? sessao?.user.email?.[0] ?? '?').toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-[13px] font-semibold text-slate-900">{perfil?.nome ?? 'Parceiro'}</span>
                  <span className="block truncate text-[12px] text-slate-500">{perfil?.arroba ? `@${perfil.arroba}` : sessao?.user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => sair()} className="gap-2 text-[13px]">
                  <LogOut className="h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-blue-600">
              Últimos {dias} dias{dados?.culinaria ? ` · ${dados.culinaria}` : ''}
            </p>
            <h1 className="fonte-marca mt-1 text-[34px] leading-tight text-slate-900">Oi{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-slate-600 text-pretty">
              {!t ? 'Carregando o que os clientes andam falando…'
                : t.pontos === 0 ? 'Ainda não há comentários neste período. Experimente um período maior.'
                : <>Analisamos <strong className="font-semibold text-slate-900">{numero(t.pontos)}</strong> comentários de clientes de restaurante.{assuntoTop && <> O assunto mais falado foi <strong className="font-semibold text-slate-900">{assuntoTop.nome}</strong>, e {pct(t.reclamacoes, t.pontos)}% dos comentários foram reclamações.</>}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="sm:hidden"><SeletorPeriodo dias={dias} onDias={setDias} /></div>
            {(dados?.culinarias.length ?? 0) > 0 && (
              <select
                value={culinaria ?? ''}
                onChange={(e) => setCulinaria(e.target.value || null)}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                aria-label="Tipo de restaurante"
              >
                <option value="">Todos os restaurantes</option>
                {dados!.culinarias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>

        {erro ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
            <p className="text-[15px] font-semibold text-slate-900">Não foi possível carregar os dados</p>
            <p className="text-[13px] text-slate-500">Confira a internet e tente de novo.</p>
            <button onClick={() => setTentativa((n) => n + 1)} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white">
              <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
            </button>
          </div>
        ) : carregando && !dados ? (
          <Carregando />
        ) : dados && t ? (
          <div className={cn('flex flex-col gap-5 transition-opacity', carregando && 'opacity-60')}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                rotulo="Comentários analisados"
                valor={numero(t.pontos)}
                detalhe={<span className="inline-flex items-center gap-1.5">contra {numero(t.pontos_anterior)} antes <Tendencia atual={t.pontos} anterior={t.pontos_anterior} bomQuandoSobe /></span>}
              />
              <Kpi rotulo="Reclamações" tom="reclamacao" valor={`${pct(t.reclamacoes, t.pontos)}%`} detalhe={`${numero(t.reclamacoes)} comentários`} />
              <Kpi rotulo="Elogios" tom="elogio" valor={`${pct(t.elogios, t.pontos)}%`} detalhe={`${numero(t.elogios)} comentários`} />
              <Kpi rotulo="Sugestões" tom="sugestao" valor={numero(t.sugestoes)} detalhe="ideias dos próprios clientes" />
            </div>

            <Pautas pautas={pautas} />

            <div className="grid gap-5 lg:grid-cols-3">
              <ListaTemas titulo="O que mais incomoda" subtitulo="As reclamações mais citadas." tipo="reclamacao" temas={temas('reclamacao')} />
              <ListaTemas titulo="O que mais encanta" subtitulo="Os elogios mais citados." tipo="elogio" temas={temas('elogio')} />
              <ListaTemas titulo="O que os clientes pedem" subtitulo="As sugestões mais citadas." tipo="sugestao" temas={temas('sugestao')} />
            </div>

            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3"><PorAssunto categorias={dados.categorias} /></div>
              <div className="lg:col-span-2"><EmAlta temas={dados.em_alta.filter((x) => x.tipo !== 'neutro')} /></div>
            </div>

            <Evolucao evolucao={dados.evolucao} />
            <Frases frases={dados.frases} />
          </div>
        ) : null}

        <p className="pt-2 text-center text-[12px] leading-relaxed text-slate-400">
          Dados anônimos e agrupados dos restaurantes que usam o EasyFeed. Não mostramos nome de restaurante, de cliente nem telefone.
        </p>
      </main>
    </div>
  )
}
