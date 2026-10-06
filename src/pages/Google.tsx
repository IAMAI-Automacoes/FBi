import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Loader2, MessageSquareText, RefreshCw, Star, Unplug } from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import {
  acaoGoogle, buscarConexaoGoogle, buscarMediasMensais, buscarResumoGoogle, buscarUltimasAvaliacoes, MENSAGENS_GOOGLE,
  type AcaoGoogle, type AvaliacaoGoogle, type ConexaoGoogle, type MediaMensal, type ResumoGoogle,
} from '@/lib/queries/google'

const configGrafico: ChartConfig = {
  media: { label: 'Média do mês', color: 'hsl(var(--chart-1))' },
  media_acumulada: { label: 'Média geral', color: '#f59e0b' },
}

function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

function Estrelas({ nota, tamanho = 'h-4 w-4' }: { nota: number; tamanho?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(tamanho, i <= Math.round(nota) ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
      ))}
    </span>
  )
}

/** "G" do Google nas cores oficiais (regras de marca do botão de login). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function BotaoGoogle({ onClick, carregando, texto = 'Conectar com o Google' }: { onClick: () => void; carregando: boolean; texto?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      className="inline-flex h-11 items-center gap-3 rounded-full border border-[#747775] bg-white px-5 text-[14px] font-medium text-[#1f1f1f] shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
    >
      {carregando ? <Loader2 className="h-5 w-5 animate-spin text-gray-500" /> : <LogoGoogle />}
      {texto}
    </button>
  )
}

function Aviso({ children, tom = 'amber' }: { children: ReactNode; tom?: 'amber' | 'red' }) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
      tom === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900',
    )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TooltipNota({ active, payload }: { active?: boolean; payload?: Array<{ payload: MediaMensal & { rotulo: string } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const n = (v: number | null) => (v === null ? '—' : v.toFixed(1).replace('.', ','))
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold capitalize text-gray-900">{d.rotulo}</p>
      <p className="text-gray-600">Média do mês: <b>{n(d.media)}</b> ({d.quantidade} avaliaç{d.quantidade === 1 ? 'ão' : 'ões'})</p>
      <p className="text-gray-600">Média geral: <b>{n(d.media_acumulada)}</b></p>
    </div>
  )
}

const rotuloMes = (iso: string) => format(parseISO(iso), 'MMM/yy', { locale: ptBR })
const dataCurta = (iso: string) => format(parseISO(iso), "dd 'de' MMM 'de' yyyy", { locale: ptBR })

/**
 * Avaliações do Google: o dono conecta a conta Google (login oficial, OAuth),
 * e a página mostra a nota, a evolução mês a mês e as últimas avaliações.
 */
export default function Google() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [params, setParams] = useSearchParams()
  const [carregando, setCarregando] = useState(true)
  const [conexao, setConexao] = useState<ConexaoGoogle | null>(null)
  const [medias, setMedias] = useState<MediaMensal[]>([])
  const [resumo, setResumo] = useState<ResumoGoogle | null>(null)
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoGoogle[]>([])
  const [ocupado, setOcupado] = useState<AcaoGoogle | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const c = await buscarConexaoGoogle(restauranteId)
      setConexao(c)
      if (c?.status === 'conectado') {
        const [m, r, a] = await Promise.all([buscarMediasMensais(24), buscarResumoGoogle(), buscarUltimasAvaliacoes(restauranteId, 20)])
        setMedias(m)
        setResumo(r)
        setAvaliacoes(a)
      }
    } catch {
      toast.error('Não foi possível carregar as avaliações do Google.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['google_conexoes', 'google_avaliacoes'], restauranteId, carregar)

  // Volta da tela do Google: ?conectado=1, ?escolher=1 ou ?erro=...
  useEffect(() => {
    const erro = params.get('erro')
    if (params.has('conectado')) toast.success('Google conectado! As avaliações já estão sendo buscadas.')
    else if (params.has('escolher')) toast('Escolha qual restaurante ligar ao EasyFeed.')
    else if (erro === 'acesso_nao_liberado') toast(MENSAGENS_GOOGLE.acesso_nao_liberado)
    else if (erro) toast.error(MENSAGENS_GOOGLE[erro] ?? MENSAGENS_GOOGLE.google)
    if (params.has('conectado') || params.has('escolher') || erro) setParams({}, { replace: true })
    // só na chegada à página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const executar = async (acao: AcaoGoogle, extra?: Record<string, unknown>) => {
    setOcupado(acao)
    try {
      const r = await acaoGoogle(acao, extra)
      if (acao === 'conectar' && r.ok && r.url) {
        window.location.href = r.url
        return
      }
      if (!r.ok) {
        const msg = MENSAGENS_GOOGLE[r.motivo ?? ''] ?? r.mensagem ?? MENSAGENS_GOOGLE.erro
        if (r.motivo === 'aguarde' || r.motivo === 'acesso_nao_liberado') toast(msg)
        else toast.error(msg)
      } else if (acao === 'desconectar') {
        toast.success('Google desconectado. As avaliações guardadas foram apagadas.')
      } else if (acao === 'sincronizar') {
        toast.success('Avaliações atualizadas.')
      }
      await carregar()
    } finally {
      setOcupado(null)
    }
  }

  if (carregando) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  const titulo = (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Avaliações do Google</h1>
      <p className="mt-1 text-sm text-gray-500">A nota do seu restaurante no Google e como ela muda mês a mês.</p>
    </div>
  )

  // ── Ainda não conectado ──
  if (!conexao || conexao.status === 'sem_local') {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        {titulo}
        {conexao?.status === 'sem_local' && <Aviso>{MENSAGENS_GOOGLE.sem_local} Entre com a conta que administra o perfil do restaurante.</Aviso>}
        <Cartao className="flex flex-col items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Conecte o perfil do seu restaurante no Google</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600">
              Entre com a conta Google que administra o perfil do restaurante e autorize o acesso. O EasyFeed busca as
              avaliações sozinho e mostra a evolução da sua nota. Você pode desconectar quando quiser.
            </p>
          </div>
          <BotaoGoogle onClick={() => executar('conectar')} carregando={ocupado === 'conectar'} />
        </Cartao>
      </div>
    )
  }

  const desconectar = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-red-600" disabled={!!ocupado}>
          <Unplug className="mr-1.5 h-4 w-4" /> Desconectar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar o Google?</AlertDialogTitle>
          <AlertDialogDescription>
            O EasyFeed para de buscar as avaliações e apaga as que estão guardadas aqui. Nada muda no seu perfil do Google.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => executar('desconectar')} className="bg-red-600 hover:bg-red-700">Desconectar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // ── Escolher o restaurante ──
  if (conexao.status === 'escolher_local') {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        {titulo}
        <Cartao>
          <h2 className="text-base font-semibold text-gray-900">Qual restaurante é este?</h2>
          <p className="mt-1 text-sm text-gray-500">Sua conta Google administra mais de um perfil. Escolha o deste restaurante.</p>
          <div className="mt-4 divide-y divide-gray-100">
            {(conexao.locais_disponiveis ?? []).map((l) => (
              <div key={l.local} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{l.titulo}</p>
                  {l.endereco && <p className="truncate text-xs text-gray-500">{l.endereco}</p>}
                </div>
                <Button size="sm" onClick={() => executar('escolher_local', { local: l.local })} disabled={!!ocupado}>
                  {ocupado === 'escolher_local' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Usar este'}
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">{desconectar}</div>
        </Cartao>
      </div>
    )
  }

  // ── Esperando o Google liberar a API / precisa reconectar ──
  if (conexao.status === 'aguardando_google' || conexao.status === 'precisa_reconectar') {
    const reconectar = conexao.status === 'precisa_reconectar'
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        {titulo}
        <Aviso tom={reconectar ? 'red' : 'amber'}>
          {reconectar ? MENSAGENS_GOOGLE.precisa_reconectar : MENSAGENS_GOOGLE.acesso_nao_liberado}
        </Aviso>
        <Cartao className="flex flex-wrap items-center gap-3">
          {reconectar
            ? <BotaoGoogle onClick={() => executar('conectar')} carregando={ocupado === 'conectar'} texto="Conectar de novo" />
            : (
              <Button onClick={() => executar('descobrir')} disabled={!!ocupado}>
                {ocupado === 'descobrir' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Tentar de novo
              </Button>
            )}
          {desconectar}
        </Cartao>
      </div>
    )
  }

  // ── Conectado ──
  const totalEstrelas = resumo ? resumo.estrelas.reduce((s, n) => s + n, 0) : 0
  const dadosGrafico = medias.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) }))

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {titulo}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => executar('sincronizar')} disabled={!!ocupado}>
            {ocupado === 'sincronizar' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Atualizar agora
          </Button>
          {desconectar}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
        <span className="font-medium text-gray-800">{conexao.local_nome}</span>
        {conexao.endereco && <span>· {conexao.endereco}</span>}
        {conexao.maps_uri && (
          <a href={conexao.maps_uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Ver no Google Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {conexao.ultima_sincronizacao && (
          <span>· atualizado {formatDistanceToNow(parseISO(conexao.ultima_sincronizacao), { locale: ptBR, addSuffix: true })}</span>
        )}
      </div>

      {conexao.erro && <Aviso>{MENSAGENS_GOOGLE[conexao.erro] ?? MENSAGENS_GOOGLE.google}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao>
          <p className="text-sm text-gray-500">Nota no Google</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{conexao.nota_media?.toFixed(1).replace('.', ',') ?? '—'}</p>
          {conexao.nota_media !== null && <div className="mt-1"><Estrelas nota={conexao.nota_media} /></div>}
        </Cartao>
        <Cartao>
          <p className="text-sm text-gray-500">Avaliações no Google</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{conexao.total_avaliacoes?.toLocaleString('pt-BR') ?? '—'}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-gray-500">Últimos 30 dias</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{resumo?.media30d?.toFixed(1).replace('.', ',') ?? '—'}</p>
          <p className="mt-1 text-xs text-gray-400">
            {resumo?.quantidade30d ? `${resumo.quantidade30d} avaliaç${resumo.quantidade30d === 1 ? 'ão' : 'ões'}` : 'nenhuma avaliação no período'}
          </p>
        </Cartao>
      </div>

      <Cartao>
        <h3 className="text-base font-bold text-gray-900">Evolução da nota</h3>
        <p className="mt-0.5 text-xs text-gray-500">Média das avaliações de cada mês e a média geral até aquele mês.</p>
        {dadosGrafico.length === 0 ? (
          <p className="mt-6 text-sm text-gray-400">Ainda não há avaliações para mostrar.</p>
        ) : (
          <ChartContainer config={configGrafico} className="mt-4 h-[240px] w-full">
            <LineChart data={dadosGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.6} />
              <XAxis dataKey="rotulo" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval={dadosGrafico.length > 12 ? Math.ceil(dadosGrafico.length / 8) : 0} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <ChartTooltip content={<TooltipNota />} />
              <Line type="monotone" dataKey="media_acumulada" stroke="var(--color-media_acumulada)" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="media" stroke="var(--color-media)" strokeWidth={2.5} connectNulls
                dot={{ r: 3.5, fill: 'var(--color-media)', stroke: 'white', strokeWidth: 2 }} />
            </LineChart>
          </ChartContainer>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: 'hsl(var(--chart-1))' }} /> Média do mês</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-amber-500" /> Média geral</span>
        </div>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-5">
        <Cartao className="lg:col-span-2">
          <h3 className="text-base font-bold text-gray-900">Estrelas</h3>
          <div className="mt-4 space-y-2.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const qtd = resumo?.estrelas[n - 1] ?? 0
              const pct = totalEstrelas ? Math.round((qtd / totalEstrelas) * 100) : 0
              return (
                <div key={n} className="flex items-center gap-3 text-sm">
                  <span className="w-3 text-right font-medium text-gray-700">{n}</span>
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums text-gray-500">{qtd}</span>
                </div>
              )
            })}
          </div>
        </Cartao>

        <Cartao className="lg:col-span-3">
          <h3 className="text-base font-bold text-gray-900">Últimas avaliações</h3>
          {avaliacoes.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">Nenhuma avaliação ainda.</p>
          ) : (
            <div className="mt-3 divide-y divide-gray-100">
              {avaliacoes.map((a) => (
                <div key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Estrelas nota={a.nota} tamanho="h-3.5 w-3.5" />
                    <span className="text-sm font-medium text-gray-800">{a.anonimo || !a.autor ? 'Cliente anônimo' : a.autor}</span>
                    <span className="text-xs text-gray-400">{dataCurta(a.criada_em)}</span>
                  </div>
                  <p className={cn('mt-1 text-sm leading-relaxed', a.comentario ? 'text-gray-700' : 'italic text-gray-400')}>
                    {a.comentario ?? 'Avaliou só com estrelas.'}
                  </p>
                  {a.resposta && (
                    <div className="mt-2 flex gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span><span className="font-medium text-gray-700">Sua resposta:</span> {a.resposta}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Cartao>
      </div>

      <p className="text-center text-xs text-gray-400">
        Dados do Google, atualizados a cada 6 horas. O EasyFeed só lê as avaliações; nada é publicado no seu perfil.
      </p>
    </div>
  )
}
