import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import {
  ArrowLeftRight, ArrowUp, ArrowDown, Minus, Loader2, Users, Smile, ThumbsUp,
  ThumbsDown, MessageSquare, Save, Trash2, CalendarRange, Sparkles, TrendingUp, TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { useUserProfile } from '@/hooks/use-user-profile'
import {
  compararPeriodos, gerarPreset, salvarComparativo, listarComparativosSalvos, excluirComparativo,
  PRESET_LABEL, type PresetComparativo, type PeriodoIntervalo, type ResultadoComparativo,
  type MetricaComparada, type Direcao, type CategoriaComparada, type ComparativoSalvo,
} from '@/lib/queries/comparativo'
import { toast } from 'sonner'

const PRESETS: PresetComparativo[] = ['7d', '30d', 'mes', 'ano']

function fmt(d: Date | string): string {
  return format(typeof d === 'string' ? new Date(d) : d, "d 'de' MMM", { locale: ptBR })
}

/** Última data realmente incluída no intervalo (fim é exclusivo). */
function fmtFimInclusivo(fimExclusivo: Date | string): string {
  const d = new Date(typeof fimExclusivo === 'string' ? fimExclusivo : fimExclusivo)
  d.setDate(d.getDate() - 1)
  return fmt(d)
}

function DirecaoPill({ direcao, invertido }: { direcao: Direcao; invertido?: boolean }) {
  const cfg: Record<Direcao, { texto: string; cor: string; Icon: typeof ArrowUp }> = {
    melhorou: { texto: 'Melhorou', cor: 'bg-emerald-50 text-emerald-700', Icon: invertido ? ArrowDown : ArrowUp },
    piorou: { texto: 'Piorou', cor: 'bg-rose-50 text-rose-700', Icon: invertido ? ArrowUp : ArrowDown },
    estavel: { texto: 'Estável', cor: 'bg-slate-100 text-slate-600', Icon: Minus },
    sem_dados: { texto: 'Sem dados', cor: 'bg-slate-50 text-slate-400', Icon: Minus },
  }
  const { texto, cor, Icon } = cfg[direcao]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', cor)}>
      <Icon className="h-3 w-3" /> {texto}
    </span>
  )
}

function KpiComparado({
  titulo, icone: Icone, m, sufixo = '',
}: { titulo: string; icone: typeof Users; m: MetricaComparada; sufixo?: string }) {
  return (
    <Card className="bg-white shadow-sm border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icone className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{m.atual ?? '—'}{m.atual != null ? sufixo : ''}</span>
          <span className="text-xs text-muted-foreground">era {m.anterior ?? '—'}{m.anterior != null ? sufixo : ''}</span>
        </div>
        <div className="mt-2.5"><DirecaoPill direcao={m.direcao} /></div>
      </CardContent>
    </Card>
  )
}

function LinhaCategoria({ c }: { c: CategoriaComparada }) {
  const subiu = (c.delta ?? 0) > 0
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{c.nome}</p>
        <p className="text-xs text-muted-foreground">
          {c.satisfacaoAnterior ?? '—'} → {c.satisfacaoAtual ?? '—'} de 100
          {!c.amostraSuficiente && <span className="text-amber-600"> · poucas avaliações</span>}
        </p>
      </div>
      {c.delta != null && (
        <span className={cn(
          'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
          subiu ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
        )}>
          {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(c.delta)}
        </span>
      )}
    </div>
  )
}

/** Seletor de um intervalo de datas (popover + calendário de range). */
function SeletorIntervalo({
  label, range, onChange,
}: { label: string; range: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  return (
    <div>
      <p className="text-[13px] font-medium mb-1.5">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 bg-white font-normal">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {range?.from
              ? range.to
                ? `${fmt(range.from)} — ${fmt(range.to)}`
                : fmt(range.from)
              : 'Escolher datas'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="range" selected={range} onSelect={onChange} numberOfMonths={2} defaultMonth={range?.from} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default function Comparativo() {
  const { profile, loading: profileLoading } = useUserProfile()
  const restauranteId = profile?.restaurante_id ?? null

  const [preset, setPreset] = useState<PresetComparativo | 'personalizado'>('30d')
  const [customA, setCustomA] = useState<DateRange | undefined>()
  const [customB, setCustomB] = useState<DateRange | undefined>()

  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoComparativo | null>(null)
  const [periodosAtivos, setPeriodosAtivos] = useState<{ a: PeriodoIntervalo; b: PeriodoIntervalo } | null>(null)

  const [titulo, setTitulo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvos, setSalvos] = useState<ComparativoSalvo[]>([])
  const [carregandoSalvos, setCarregandoSalvos] = useState(true)

  const carregarSalvos = useCallback(() => {
    if (!restauranteId) { setCarregandoSalvos(false); return }
    listarComparativosSalvos(restauranteId)
      .then(setSalvos)
      .catch(() => {})
      .finally(() => setCarregandoSalvos(false))
  }, [restauranteId])

  useEffect(() => { carregarSalvos() }, [carregarSalvos])

  const executar = useCallback(async (periodoA: PeriodoIntervalo, periodoB: PeriodoIntervalo) => {
    if (!restauranteId) return
    setCarregando(true)
    setResultado(null)
    try {
      const r = await compararPeriodos(restauranteId, periodoA, periodoB)
      setResultado(r)
      setPeriodosAtivos({ a: periodoA, b: periodoB })
      setTitulo('')
    } catch (e: any) {
      toast.error('Erro ao comparar períodos', { description: e.message })
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  // Roda automaticamente ao trocar de preset (não exige clique extra).
  useEffect(() => {
    if (profileLoading || !restauranteId) return
    if (preset === 'personalizado') return
    const { periodoA, periodoB } = gerarPreset(preset)
    executar(periodoA, periodoB)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, restauranteId, profileLoading])

  const compararPersonalizado = () => {
    if (!customA?.from || !customA?.to || !customB?.from || !customB?.to) {
      toast.error('Escolha as duas datas dos dois períodos.')
      return
    }
    const fimExclusivo = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() + 1); x.setHours(0, 0, 0, 0); return x }
    const inicioDoDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
    executar(
      { inicio: inicioDoDia(customA.from), fim: fimExclusivo(customA.to) },
      { inicio: inicioDoDia(customB.from), fim: fimExclusivo(customB.to) },
    )
  }

  const handleSalvar = async () => {
    if (!restauranteId || !resultado || !periodosAtivos) return
    setSalvando(true)
    try {
      await salvarComparativo(restauranteId, titulo, periodosAtivos.a, periodosAtivos.b, resultado)
      toast.success('Comparação salva!')
      setTitulo('')
      carregarSalvos()
    } catch (e: any) {
      toast.error('Erro ao salvar', { description: e.message })
    } finally {
      setSalvando(false)
    }
  }

  const handleExcluirSalvo = async (id: string) => {
    setSalvos((prev) => prev.filter((s) => s.id !== id)) // otimista
    try {
      await excluirComparativo(id)
    } catch {
      toast.error('Erro ao excluir')
      carregarSalvos()
    }
  }

  const abrirSalvo = (s: ComparativoSalvo) => {
    setResultado(s.resultado_json)
    setPeriodosAtivos({
      a: { inicio: new Date(s.periodo_a_inicio), fim: new Date(s.periodo_a_fim) },
      b: { inicio: new Date(s.periodo_b_inicio), fim: new Date(s.periodo_b_fim) },
    })
    setPreset('personalizado')
    setTitulo(s.titulo ?? '')
  }

  return (
    <div className="flex-1 space-y-6">
      <div className="border-b pb-6">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ArrowLeftRight className="h-8 w-8 text-primary" />
          Comparativo de Períodos
        </h2>
        <p className="text-muted-foreground mt-1">
          Escolha dois períodos e veja exatamente o que melhorou e o que piorou.
        </p>
      </div>

      {/* Seletor de período */}
      <Card className="bg-white shadow-sm border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                  preset === p ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 hover:bg-muted',
                )}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
            <button
              onClick={() => setPreset('personalizado')}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                preset === 'personalizado' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 hover:bg-muted',
              )}
            >
              Personalizado
            </button>
          </div>

          {preset === 'personalizado' && (
            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              <SeletorIntervalo label="Período atual" range={customA} onChange={setCustomA} />
              <SeletorIntervalo label="Comparar com" range={customB} onChange={setCustomB} />
              <div className="sm:col-span-2">
                <Button onClick={compararPersonalizado} disabled={carregando} className="gap-2">
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                  Comparar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {carregando && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      )}

      {!carregando && resultado && (
        <>
          {/* Faixa com os dois períodos sendo comparados */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50/60 px-4 py-3 text-sm">
            <span className="font-semibold text-foreground">
              {fmt(resultado.periodoA.inicio)} – {fmtFimInclusivo(resultado.periodoA.fim)}
            </span>
            <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              comparado a {fmt(resultado.periodoB.inicio)} – {fmtFimInclusivo(resultado.periodoB.fim)}
            </span>
          </div>

          {resultado.amostraPequena && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Um dos períodos tem poucas avaliações — a leitura abaixo é preliminar.
            </p>
          )}

          {resultado.totalAtual === 0 && resultado.totalAnterior === 0 ? (
            <Card className="border-dashed bg-secondary/30">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <p className="font-semibold text-foreground">Nenhuma avaliação nos dois períodos</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Escolha períodos com avaliações para comparar, ou compartilhe o QR Code com mais clientes.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPIs principais */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-white shadow-sm border-border/60">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de avaliações</CardTitle>
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-foreground">{resultado.totalAtual}</span>
                      <span className="text-xs text-muted-foreground">era {resultado.totalAnterior}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2.5">volume, sem juízo de bom/ruim</p>
                  </CardContent>
                </Card>
                <KpiComparado titulo="Índice de satisfação" icone={Smile} m={resultado.satisfacao} />
                <KpiComparado titulo="Avaliações positivas" icone={ThumbsUp} m={resultado.positivas} sufixo="%" />
                <KpiComparado titulo="Avaliações negativas" icone={ThumbsDown} m={resultado.negativas} sufixo="%" />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1">
                  <KpiComparado titulo="Clientes únicos" icone={Users} m={resultado.clientesUnicos} />
                </div>
              </div>

              {/* Melhorou / Piorou por categoria */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-emerald-200/70 bg-emerald-50/40 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-emerald-800">
                      <TrendingUp className="h-5 w-5" /> O que melhorou
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 divide-y divide-emerald-100">
                    {resultado.melhorou.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">Nenhuma categoria melhorou de forma clara neste comparativo.</p>
                    ) : (
                      resultado.melhorou.map((c) => <LinhaCategoria key={c.nome} c={c} />)
                    )}
                  </CardContent>
                </Card>

                <Card className="border-rose-200/70 bg-rose-50/40 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-rose-800">
                      <TrendingDown className="h-5 w-5" /> O que piorou
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 divide-y divide-rose-100">
                    {resultado.piorou.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">Nenhuma categoria piorou de forma clara neste comparativo.</p>
                    ) : (
                      resultado.piorou.map((c) => <LinhaCategoria key={c.nome} c={c} />)
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Todas as categorias */}
              {resultado.categorias.length > 0 && (
                <Card className="bg-white shadow-sm border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">Todas as categorias</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 divide-y divide-border">
                    {resultado.categorias.map((c) => <LinhaCategoria key={c.nome} c={c} />)}
                  </CardContent>
                </Card>
              )}

              {/* Salvar comparação */}
              <Card className="bg-white shadow-sm border-border/60">
                <CardContent className="p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <Input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder='Dê um nome pra essa comparação (ex.: "Antes e depois da reforma")'
                    className="flex-1"
                  />
                  <Button onClick={handleSalvar} disabled={salvando} className="gap-2 shrink-0">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar comparação
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Comparações salvas */}
      {!carregandoSalvos && salvos.length > 0 && (
        <Card className="bg-white shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Comparações salvas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y divide-border">
            {salvos.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                <button onClick={() => abrirSalvo(s)} className="text-left min-w-0 flex-1 hover:opacity-70 transition-opacity">
                  <p className="text-sm font-medium text-foreground truncate">
                    {s.titulo || `Comparação de ${format(new Date(s.created_at), 'd/MM/yyyy')}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(s.periodo_a_inicio)} – {fmtFimInclusivo(s.periodo_a_fim)} vs. {fmt(s.periodo_b_inicio)} – {fmtFimInclusivo(s.periodo_b_fim)}
                  </p>
                </button>
                <Button variant="ghost" size="icon" onClick={() => handleExcluirSalvo(s.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
