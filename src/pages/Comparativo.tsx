import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import {
  ArrowLeftRight, ArrowUp, ArrowDown, Minus, Loader2, Users, ThumbsUp,
  ThumbsDown, MessageSquare, Save, Trash2, CalendarRange, Sparkles,
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
  type MetricaComparada, type CategoriaComparada, type ComparativoSalvo,
} from '@/lib/queries/comparativo'
import { toast } from 'sonner'

const PRESETS: PresetComparativo[] = ['7d', '30d', 'mes', 'ano']

// Cor por direção: nunca a única pista (sempre junto de ícone + sinal + texto),
// porque verde/vermelho puros ficam quase iguais sob daltonismo vermelho-verde.
const COR = {
  melhorou: { texto: 'text-emerald-700', bg: 'bg-emerald-50', barra: 'bg-emerald-500', anel: 'bg-emerald-100' },
  piorou: { texto: 'text-rose-700', bg: 'bg-rose-50', barra: 'bg-rose-500', anel: 'bg-rose-100' },
  estavel: { texto: 'text-slate-500', bg: 'bg-slate-50', barra: 'bg-slate-400', anel: 'bg-slate-100' },
  sem_dados: { texto: 'text-slate-400', bg: 'bg-slate-50', barra: 'bg-slate-300', anel: 'bg-slate-100' },
} as const

function fmt(d: Date | string): string {
  return format(typeof d === 'string' ? new Date(d) : d, "d 'de' MMM", { locale: ptBR })
}
/** Última data realmente incluída no intervalo (fim é exclusivo). */
function fmtFimInclusivo(fimExclusivo: Date | string): string {
  const d = new Date(fimExclusivo)
  d.setDate(d.getDate() - 1)
  return fmt(d)
}
function assinado(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

/** O número que resume tudo — a primeira e maior coisa que o olho encontra. */
function HeroDelta({ satisfacao }: { satisfacao: MetricaComparada }) {
  const c = COR[satisfacao.direcao]
  const Icone = satisfacao.direcao === 'melhorou' ? ArrowUp : satisfacao.direcao === 'piorou' ? ArrowDown : Minus
  const frase =
    satisfacao.direcao === 'melhorou' ? 'A satisfação melhorou' :
    satisfacao.direcao === 'piorou' ? 'A satisfação piorou' :
    satisfacao.direcao === 'sem_dados' ? 'Ainda não há dados suficientes' : 'A satisfação ficou estável'

  return (
    <div className={cn('rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6', c.bg)}>
      <div className="flex items-center gap-4 shrink-0">
        <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-sm', c.texto)}>
          <Icone className="h-8 w-8" strokeWidth={3} />
        </div>
        <div>
          <p className={cn('text-6xl font-bold leading-none tracking-tight', c.texto)}>
            {satisfacao.delta != null ? assinado(satisfacao.delta) : '—'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">pontos de satisfação (em 100)</p>
        </div>
      </div>
      <div className="sm:border-l sm:border-black/10 sm:pl-6 flex-1 text-center sm:text-left">
        <p className="text-lg font-semibold text-foreground">{frase}</p>
        {satisfacao.atual != null && satisfacao.anterior != null && (
          <p className="text-sm text-muted-foreground mt-1">
            Foi de <b className="text-foreground tabular-nums">{satisfacao.anterior}</b> para{' '}
            <b className="text-foreground tabular-nums">{satisfacao.atual}</b> de 100.
          </p>
        )}
      </div>
    </div>
  )
}

function StatTile({
  titulo, icone: Icone, m, sufixo = '', neutro = false,
}: { titulo: string; icone: typeof Users; m: MetricaComparada; sufixo?: string; neutro?: boolean }) {
  const c = COR[m.direcao]
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        <p className="text-xs font-medium">{titulo}</p>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {m.atual ?? '—'}{m.atual != null ? sufixo : ''}
        </span>
        {!neutro && m.delta != null && (
          <span className={cn('text-xs font-bold tabular-nums', c.texto)}>{assinado(m.delta)}{sufixo}</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">era {m.anterior ?? '—'}{sufixo}</p>
    </div>
  )
}

/**
 * Gráfico de barras divergentes: cada categoria é UMA linha, a barra cresce
 * pra direita (melhorou) ou esquerda (piorou) a partir de uma linha central —
 * dá pra ver o que mudou (e o quanto) numa olhada só, sem ler texto.
 * Cor nunca é a única pista: cada barra também tem ícone + sinal + a posição
 * (direita/esquerda), que sozinha já mostra a direção pra quem não distingue
 * verde de vermelho.
 */
function GraficoMudancas({ categorias }: { categorias: CategoriaComparada[] }) {
  const comAmostra = categorias.filter((c) => c.amostraSuficiente && c.delta != null)
  const semAmostra = categorias.filter((c) => !c.amostraSuficiente)
  const ordenadas = [...comAmostra].sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number))
  const dominio = Math.max(10, ...ordenadas.map((c) => Math.abs(c.delta as number)))

  return (
    <Card className="bg-white shadow-sm border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">O que mudou, por categoria</CardTitle>
        <p className="text-xs text-muted-foreground">
          Barra pra direita = melhorou · pra esquerda = piorou. Da maior mudança pra menor.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {ordenadas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Ainda não há categorias com avaliações suficientes nos dois períodos pra comparar com confiança.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {ordenadas.map((c) => {
              const delta = c.delta as number
              const subiu = delta > 0
              const cor = subiu ? COR.melhorou : COR.piorou
              const largura = `${Math.max((Math.abs(delta) / dominio) * 100, 4)}%`
              return (
                <div key={c.nome} className="grid grid-cols-[minmax(88px,1fr)_minmax(110px,2.2fr)_50px] items-center gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{c.satisfacaoAnterior} → {c.satisfacaoAtual}</p>
                  </div>

                  <div className="flex items-center h-6">
                    <div className="flex-1 flex justify-end">
                      {!subiu && <div className="h-5 rounded-l-[4px]" style={{ width: largura, backgroundColor: '#e11d48' }} />}
                    </div>
                    <div className="w-px self-stretch bg-slate-300 shrink-0" />
                    <div className="flex-1 flex justify-start">
                      {subiu && <div className="h-5 rounded-r-[4px]" style={{ width: largura, backgroundColor: '#059669' }} />}
                    </div>
                  </div>

                  <div className={cn('flex items-center justify-end gap-0.5 text-xs font-bold tabular-nums', cor.texto)}>
                    {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(delta)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      {semAmostra.length > 0 && (
        <div className="border-t px-6 py-3 text-xs text-muted-foreground">
          <b>Poucas avaliações pra comparar com confiança:</b> {semAmostra.map((c) => c.nome).join(', ')}.
        </div>
      )}
    </Card>
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
              ? range.to ? `${fmt(range.from)} — ${fmt(range.to)}` : fmt(range.from)
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
    listarComparativosSalvos(restauranteId).then(setSalvos).catch(() => {}).finally(() => setCarregandoSalvos(false))
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
    setSalvos((prev) => prev.filter((s) => s.id !== id))
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
        <p className="text-muted-foreground mt-1">Veja o que melhorou e o que piorou entre dois períodos, numa olhada.</p>
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
        <div className="space-y-6">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          <Skeleton className="h-64" />
        </div>
      )}

      {!carregando && resultado && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {fmt(resultado.periodoA.inicio)} – {fmtFimInclusivo(resultado.periodoA.fim)}
            </span>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
            <span>comparado a {fmt(resultado.periodoB.inicio)} – {fmtFimInclusivo(resultado.periodoB.fim)}</span>
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
              <HeroDelta satisfacao={resultado.satisfacao} />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile titulo="Total de avaliações" icone={MessageSquare} m={{ atual: resultado.totalAtual, anterior: resultado.totalAnterior, delta: resultado.totalAtual - resultado.totalAnterior, deltaPercentual: null, direcao: 'estavel' }} neutro />
                <StatTile titulo="Avaliações positivas" icone={ThumbsUp} m={resultado.positivas} sufixo="%" />
                <StatTile titulo="Avaliações negativas" icone={ThumbsDown} m={resultado.negativas} sufixo="%" />
                <StatTile titulo="Clientes únicos" icone={Users} m={resultado.clientesUnicos} />
              </div>

              <GraficoMudancas categorias={resultado.categorias} />

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
