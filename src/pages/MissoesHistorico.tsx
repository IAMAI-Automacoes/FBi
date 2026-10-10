import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import { formatarDuracao, ROTULO_STATUS, type EnvioVideo, type Missao, type StatusEnvio } from '@/lib/missoes'
import { buscarEnvios, buscarMissoes, linkDoVideo } from '@/lib/queries/missoes'

/* Histórico das missões de vídeo (/missoes/historico): cada vídeo que o
   restaurante mandou, com o resultado da IA (ou da equipe) e o vídeo. */

const COR_STATUS: Record<StatusEnvio, string> = {
  enviando: 'bg-gray-100 text-gray-600',
  analisando: 'bg-blue-50 text-blue-700',
  aprovado: 'bg-green-50 text-green-700',
  reprovado: 'bg-rose-50 text-rose-700',
  erro: 'bg-amber-50 text-amber-700',
}

type Filtro = 'todos' | 'aprovado' | 'reprovado' | 'analisando' | 'erro'
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'aprovado', rotulo: 'Aprovados' },
  { id: 'reprovado', rotulo: 'Não aprovados' },
  { id: 'analisando', rotulo: 'Em análise' },
  { id: 'erro', rotulo: 'Em revisão' },
]

const quando = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

function Selo({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>{children}</span>
}

function Assistir({ envio, onFechar }: { envio: EnvioVideo | null; onFechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    setUrl(null)
    setFalhou(false)
    if (envio) linkDoVideo(envio.caminho).then((u) => (u ? setUrl(u) : setFalhou(true)))
  }, [envio])
  return (
    <Dialog open={!!envio} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seu vídeo</DialogTitle>
          <DialogDescription>{envio ? `Enviado em ${quando(envio.criado_em)}` : ''}</DialogDescription>
        </DialogHeader>
        {falhou && <p className="text-sm text-rose-600">Não foi possível abrir o vídeo agora.</p>}
        {!url && !falhou && <Skeleton className="aspect-video w-full rounded-lg" />}
        {url && <video src={url} controls playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />}
      </DialogContent>
    </Dialog>
  )
}

/** O que dizer sobre o resultado: o que faltou (pela IA) ou o motivo. */
function Resultado({ e, missao }: { e: EnvioVideo; missao: Missao | undefined }) {
  if (e.status === 'analisando') return <p className="mt-1 text-sm text-gray-600">A IA está assistindo. Leva alguns minutos.</p>
  // Reprovado pela IA por requisito: mostra cada um que faltou, com a explicação dela.
  const faltou = e.status === 'reprovado' && !e.revisado_por && e.analise?.conteudo_adequado !== false
    ? (e.analise?.requisitos ?? []).filter((r) => !r.cumpriu)
    : []
  if (faltou.length) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <p className="text-sm text-gray-700">Quase lá! Faltou:</p>
        <ul className="space-y-1.5">
          {faltou.map((r) => (
            <li key={r.id} className="flex gap-2 text-sm">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div>
                {/* O texto vem gravado na análise; se faltar, o da missão. */}
                <p className="text-gray-800">{r.texto || missao?.requisitos.find((x) => x.id === r.id)?.texto}</p>
                {r.motivo && <p className="text-xs text-gray-500">{r.motivo}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return e.motivo ? <p className="mt-1 text-sm text-gray-600">{e.motivo}</p> : null
}

export default function MissoesHistorico() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [carregando, setCarregando] = useState(true)
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [envios, setEnvios] = useState<EnvioVideo[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [assistindo, setAssistindo] = useState<EnvioVideo | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [m, e] = await Promise.all([buscarMissoes(), buscarEnvios(restauranteId)])
      setMissoes(m)
      setEnvios(e)
    } catch {
      toast.error('Não foi possível carregar o histórico.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['video_envios'], restauranteId, carregar)
  const emAnalise = envios.some((e) => e.status === 'analisando')
  useEffect(() => {
    if (!emAnalise) return
    const t = setInterval(carregar, 10_000)
    return () => clearInterval(t)
  }, [emAnalise, carregar])

  // "enviando" é um envio que não terminou de subir: não entra no histórico.
  const historico = useMemo(() => envios.filter((e) => e.status !== 'enviando'), [envios])
  const contagem = (f: Filtro) => (f === 'todos' ? historico.length : historico.filter((e) => e.status === f).length)
  // O filtro esvaziou (ex.: a análise terminou): volta para Todos.
  const ativo: Filtro = filtro !== 'todos' && contagem(filtro) === 0 ? 'todos' : filtro
  const visiveis = ativo === 'todos' ? historico : historico.filter((e) => e.status === ativo)
  const missaoDe = (id: number) => missoes.find((m) => m.id === id)

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Histórico de vídeos</h1>
          <p className="mt-1 text-sm text-gray-500">Todos os vídeos que você mandou e o resultado de cada um.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/missoes"><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar para Missões</Link>
        </Button>
      </div>

      {carregando ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : historico.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Você ainda não mandou nenhum vídeo.</p>
          <Button asChild size="sm" variant="link" className="mt-1"><Link to="/missoes">Ver a missão da vez</Link></Button>
        </div>
      ) : (
        <>
          {/* Só os filtros que têm algo, para não oferecer botão que dá lista vazia. */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {FILTROS.filter((f) => f.id === 'todos' || contagem(f.id) > 0).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
                  ativo === f.id ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {f.rotulo} <span className={cn('tabular-nums', ativo === f.id ? 'text-blue-100' : 'text-gray-400')}>{contagem(f.id)}</span>
              </button>
            ))}
          </div>

          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white px-5 shadow-sm sm:px-6">
            {visiveis.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{missaoDe(e.missao_id)?.titulo ?? 'Missão'}</p>
                    <Selo className={COR_STATUS[e.status]}>
                      {e.status === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {ROTULO_STATUS[e.status]}
                    </Selo>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{quando(e.criado_em)}{e.duracao_segundos ? ` · ${formatarDuracao(e.duracao_segundos)}` : ''}</p>
                  <Resultado e={e} missao={missaoDe(e.missao_id)} />
                </div>
                <Button variant="outline" size="sm" onClick={() => setAssistindo(e)}><Play className="mr-1.5 h-3.5 w-3.5" /> Ver</Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Assistir envio={assistindo} onFechar={() => setAssistindo(null)} />
    </div>
  )
}
