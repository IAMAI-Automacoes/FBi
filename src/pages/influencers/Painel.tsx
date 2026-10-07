import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Lightbulb, LogOut, MessageSquare, MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { easyFeedLogoInterna } from '@/assets/brand'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { KpiCards } from '@/components/dashboard/KpiCards'
import { DivisaoAvaliacoes } from '@/components/dashboard/DivisaoAvaliacoes'
import { TrendChart } from '@/components/dashboard/TrendChart'
import { TemasFeedbackLista } from '@/components/dashboard/TemasFeedback'
import { FeedbackOriginalCard } from '@/components/FeedbackOriginalCard'
import { getIniciais } from '@/lib/iniciais'
import {
  categoriasDoGrafico, ideiasDePauta, kpisDoPainel, periodoDoPainel, SENTIMENTO_DO_TIPO, serieDoGrafico, temasParaLista,
  type DadosPainel, type Pauta, type TipoPonto,
} from '@/lib/painel-influencers'
import { useInfluencer } from './contexto'
import { buscarPainel, marcarAcesso } from './dados'

/* O painel do EasyFeed Influencers: a mesma tela da Visão Geral dos
   restaurantes (mesmo topo, mesmos números, mesmo gráfico, mesma lista de
   temas e mesmos cartões de feedback), com os dados anônimos de todos os
   restaurantes e as ideias de pauta. */

const PERIODOS = [
  { dias: 7, rotulo: '7d' },
  { dias: 30, rotulo: '30d' },
  { dias: 90, rotulo: '90d' },
] as const
const CHAVE_PERIODO = 'easyfeed:influencers:periodo'

function lerPeriodo(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_PERIODO))
    return PERIODOS.some((p) => p.dias === v) ? v : 30
  } catch {
    return 30
  }
}

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  const copiar = async (chave: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(chave)
      setTimeout(() => setCopiado((c) => (c === chave ? null : c)), 2000)
    } catch { /* sem permissão de copiar */ }
  }
  return { copiado, copiar }
}

/** "Ideias de pauta": no mesmo cartão das outras seções da Visão Geral. */
function IdeiasDePauta({ pautas }: { pautas: Pauta[] }) {
  const { copiado, copiar } = useCopiar()
  return (
    <Card className="shadow-subtle">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1D4ED8]">
          <Lightbulb className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">Ideias de pauta</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Tiradas dos feedbacks deste período, cada uma com o número que sustenta a ideia.</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {pautas.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Lightbulb className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Sem dados suficientes para sugerir pautas neste período</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {pautas.map((p) => (
              <div key={p.titulo} className="flex items-start gap-4 p-5 transition-colors hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-foreground">{p.titulo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.porque}</p>
                </div>
                <button
                  onClick={() => copiar(p.titulo, `${p.titulo}\n${p.porque}`)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {copiado === p.titulo ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado === p.titulo ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ABAS_FRASES: { tipo: TipoPonto; rotulo: string }[] = [
  { tipo: 'reclamacao', rotulo: 'Negativos' },
  { tipo: 'elogio', rotulo: 'Positivos' },
  { tipo: 'sugestao', rotulo: 'Sugestões' },
]

/** "Como os clientes falam": os resumos curtos nos mesmos cartões de "Últimos Feedbacks". */
const FRASES_VISIVEIS = 5

function ComoOsClientesFalam({ frases }: { frases: DadosPainel['frases'] }) {
  const [aba, setAba] = useState<TipoPonto>('reclamacao')
  const [todas, setTodas] = useState(false)
  const doTipo = frases.filter((f) => f.tipo === aba)
  const lista = todas ? doTipo : doTipo.slice(0, FRASES_VISIVEIS)
  return (
    <Card className="shadow-subtle">
      <CardHeader className="space-y-3 border-b border-border p-5">
        <div>
          <CardTitle className="text-base font-semibold">Como os clientes falam</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Resumos curtos dos feedbacks, sem identificar o restaurante nem o cliente.</p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg bg-muted/60 p-0.5 text-xs">
          {ABAS_FRASES.map((a) => (
            <button
              key={a.tipo}
              onClick={() => { setAba(a.tipo); setTodas(false) }}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition-colors',
                aba === a.tipo ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <MessageSquare className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Nenhum feedback deste tipo no período</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {lista.map((f) => (
              <div key={f.texto} className="p-5 transition-colors hover:bg-muted/30">
                <FeedbackOriginalCard texto={f.texto} sentimento={SENTIMENTO_DO_TIPO[f.tipo]} categorias={[f.categoria]} quando="" />
              </div>
            ))}
            {doTipo.length > FRASES_VISIVEIS && (
              <button
                onClick={() => setTodas((v) => !v)}
                className="flex items-center justify-center gap-1 px-5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {todas ? <><ChevronUp className="h-3.5 w-3.5" /> Mostrar menos</> : <><ChevronDown className="h-3.5 w-3.5" /> Mostrar mais {doTipo.length - FRASES_VISIVEIS}</>}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Painel() {
  const { perfil, sessao, sair } = useInfluencer()
  const [dias, setDiasEstado] = useState(lerPeriodo)
  const [culinaria, setCulinaria] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
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

  const kpis = useMemo(() => (dados ? kpisDoPainel(dados) : null), [dados])
  const pautas = useMemo(() => (dados ? ideiasDePauta(dados) : []), [dados])
  const nunca = !!kpis && kpis.totalFeedbacks === 0 && !kpis.hasPrevData
  const periodoVazio = !!kpis && kpis.totalFeedbacks === 0 && kpis.hasPrevData
  const nome = perfil?.nome || 'Parceiro'

  return (
    <div className="min-h-screen bg-background">
      {/* O mesmo topo do painel dos restaurantes (TopHeader). */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-white shadow-sm">
        <div className="relative flex h-16 w-full items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">Influencers</h1>
          </div>
          <img
            src={easyFeedLogoInterna}
            alt="Easy Feed"
            className="absolute left-1/2 top-1/2 hidden h-[52px] w-auto -translate-x-1/2 -translate-y-1/2 sm:block"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer border border-border ring-primary/20 ring-offset-2 transition-opacity hover:opacity-80 hover:ring-2">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getIniciais(perfil?.nome ?? sessao?.user.email ?? '', 2)}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mt-1.5 w-[260px] overflow-hidden rounded-xl border-border p-0 shadow-lg" align="end" sideOffset={8}>
              <div className="bg-secondary/20 p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border shadow-sm">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getIniciais(perfil?.nome ?? sessao?.user.email ?? '', 2)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-0.5 overflow-hidden">
                    <p className="truncate text-sm font-semibold leading-none text-foreground">{nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{perfil?.arroba ? `@${perfil.arroba}` : sessao?.user.email}</p>
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator className="m-0" />
              <div className="bg-secondary/5 p-1.5">
                <DropdownMenuItem
                  className="cursor-pointer rounded-md px-3 py-2 text-[13px] font-medium text-red-600 transition-colors focus:bg-red-50/80 focus:text-red-700"
                  onSelect={() => sair()}
                >
                  <LogOut className="mr-2.5 h-[15px] w-[15px]" />
                  <span>Sair da conta</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* O mesmo espaçamento e a mesma largura da Visão Geral. */}
      <main className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">Oi, {nome.split(' ')[0]}!</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Os feedbacks anônimos dos restaurantes que usam o EasyFeed.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(dados?.culinarias.length ?? 0) > 0 && (
                <select
                  value={culinaria ?? ''}
                  onChange={(e) => setCulinaria(e.target.value || null)}
                  aria-label="Tipo de restaurante"
                  className="h-11 rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Todos os restaurantes</option>
                  {dados!.culinarias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <ToggleGroup
                type="single"
                value={String(dias)}
                onValueChange={(v) => v && setDias(Number(v))}
                className="rounded-xl bg-muted p-1.5"
              >
                {PERIODOS.map((p) => (
                  <ToggleGroupItem key={p.dias} value={String(p.dias)} className="h-11 px-5 text-sm data-[state=on]:bg-white data-[state=on]:shadow-sm">
                    {p.rotulo}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          {erro ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <h2 className="mb-2 text-2xl font-bold text-gray-900">Não foi possível carregar os dados</h2>
              <p className="mb-8 max-w-md text-gray-500">Confira a internet e tente de novo.</p>
              <button onClick={() => setTentativa((n) => n + 1)} className="h-10 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white">Tentar de novo</button>
            </div>
          ) : carregando && !dados ? (
            <>
              <div className="flex items-center gap-10">
                <Skeleton className="h-14 w-32" />
                <Skeleton className="h-14 w-32" />
              </div>
              <Skeleton className="h-[350px] w-full" />
              <Skeleton className="h-[400px] w-full" />
            </>
          ) : nunca ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50">
                <MessagesSquare className="h-10 w-10 text-[#1D4ED8]" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-gray-900">Ainda não há feedbacks para mostrar</h2>
              <p className="max-w-md text-gray-500">Os dados aparecem aqui conforme os restaurantes recebem feedbacks dos clientes.</p>
            </div>
          ) : dados && kpis ? (
            <div className={cn('flex flex-col gap-6 transition-opacity', carregando && 'opacity-60')}>
              {periodoVazio && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Nenhum feedback neste período. Escolha um período maior.
                </div>
              )}
              <KpiCards data={kpis} period={periodoDoPainel(dias)} />
              <DivisaoAvaliacoes kpis={kpis} />
              <IdeiasDePauta pautas={pautas} />
              <TrendChart data={serieDoGrafico(dados)} categories={categoriasDoGrafico(dados)} />
              <TemasFeedbackLista temas={temasParaLista(dados)} carregado />
              <ComoOsClientesFalam frases={dados.frases} />
              <p className="text-center text-xs text-muted-foreground">
                Dados anônimos e agrupados dos restaurantes que usam o EasyFeed. Não mostramos nome de restaurante, de cliente nem telefone.
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
