import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  AlertTriangle, ExternalLink, Loader2, MessageSquareText, Pencil, RefreshCw, Reply, Send, Star, Trash2, Unplug, X,
} from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import {
  contarFiltros, filtrarAvaliacoes, FILTROS_FIXOS, LIMITE_RESPOSTA_BYTES, bytesUtf8, respostaPublicavel, taxaDeResposta,
  type FiltroAvaliacoes,
} from '@/lib/google-avaliacoes'
import {
  acaoGoogle, buscarAvaliacoes, buscarConexaoGoogle, buscarMediasMensais, buscarResumoGoogle, MENSAGENS_GOOGLE,
  type AcaoGoogle, type AvaliacaoGoogle, type ConexaoGoogle, type MediaMensal, type ResumoGoogle,
} from '@/lib/queries/google'

const configGrafico: ChartConfig = {
  media: { label: 'Média do mês', color: 'hsl(var(--chart-1))' },
  media_acumulada: { label: 'Média geral', color: '#f59e0b' },
}

/** Quantas avaliações a lista mostra de cada vez. */
const POR_PAGINA = 10

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
const haQuanto = (iso: string) => formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true })
const nomeDe = (a: AvaliacaoGoogle) => (a.anonimo || !a.autor ? 'Cliente anônimo' : a.autor)

/** Responder, editar e apagar a resposta de uma avaliação (vai direto para o Google). */
function RespostaDaAvaliacao({ a, aoSalvar }: {
  a: AvaliacaoGoogle
  /** texto = publicar/trocar; null = apagar. Devolve se deu certo. */
  aoSalvar: (texto: string | null) => Promise<boolean>
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const usado = bytesUtf8(texto.trim())
  const primeiroNome = !a.anonimo && a.autor ? a.autor.split(/\s+/)[0] : null

  const salvar = async (valor: string | null) => {
    setSalvando(true)
    try {
      if (await aoSalvar(valor)) setEditando(false)
    } finally {
      setSalvando(false)
    }
  }

  if (editando) {
    return (
      <div className="mt-3 space-y-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && respostaPublicavel(texto) && !salvando) salvar(texto)
            if (e.key === 'Escape' && !salvando) setEditando(false)
          }}
          rows={4}
          autoFocus
          disabled={salvando}
          aria-label={`Resposta à avaliação de ${nomeDe(a)}`}
          placeholder={primeiroNome ? `Escreva a resposta para ${primeiroNome}…` : 'Escreva a resposta…'}
          className="bg-white text-[14px] leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-xs text-gray-500">Fica pública no Google, com o nome do restaurante.</p>
          <span className={cn('text-xs tabular-nums', usado > LIMITE_RESPOSTA_BYTES ? 'font-medium text-red-600' : 'text-gray-400')}>
            {usado.toLocaleString('pt-BR')} / {LIMITE_RESPOSTA_BYTES.toLocaleString('pt-BR')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => salvar(texto)} disabled={!respostaPublicavel(texto) || salvando}>
            {salvando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {a.resposta ? 'Salvar resposta' : 'Publicar resposta'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
        </div>
      </div>
    )
  }

  if (a.resposta) {
    return (
      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <MessageSquareText className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-medium text-gray-700">Sua resposta</span>
          {a.resposta_em && <span className="text-gray-400">· {dataCurta(a.resposta_em)}</span>}
        </div>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">{a.resposta}</p>
        <div className="mt-2 flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => { setTexto(a.resposta ?? ''); setEditando(true) }}
            className="inline-flex items-center gap-1 font-medium text-gray-500 transition-colors hover:text-gray-800"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" disabled={salvando} className="inline-flex items-center gap-1 font-medium text-gray-500 transition-colors hover:text-red-600 disabled:opacity-50">
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Apagar
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar a resposta?</AlertDialogTitle>
                <AlertDialogDescription>
                  A resposta some do Google para todo mundo. A avaliação de {nomeDe(a)} continua lá, sem resposta.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => salvar(null)} className="bg-red-600 hover:bg-red-700">Apagar resposta</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    )
  }

  return (
    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setTexto(''); setEditando(true) }}>
      <Reply className="mr-1.5 h-4 w-4" /> Responder
    </Button>
  )
}

/**
 * Avaliações do Google: o dono conecta a conta Google (login oficial, OAuth),
 * e a página mostra a nota, a evolução mês a mês e as avaliações — que ele
 * responde daqui mesmo (a resposta vai para o Google).
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
  const [filtro, setFiltro] = useState<FiltroAvaliacoes>('todas')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const listaRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const c = await buscarConexaoGoogle(restauranteId)
      setConexao(c)
      if (c?.status === 'conectado') {
        const [m, r, a] = await Promise.all([buscarMediasMensais(24), buscarResumoGoogle(), buscarAvaliacoes(restauranteId)])
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

  /** Publica, troca (texto) ou apaga (null) a resposta de uma avaliação no Google. */
  const salvarResposta = async (id: string, texto: string | null): Promise<boolean> => {
    const r = await acaoGoogle(texto === null ? 'apagar_resposta' : 'responder', { avaliacao: id, ...(texto === null ? {} : { texto }) })
    if (!r.ok) {
      toast.error(MENSAGENS_GOOGLE[r.motivo ?? ''] ?? r.mensagem ?? MENSAGENS_GOOGLE.erro)
      if (r.motivo === 'precisa_reconectar' || r.motivo === 'nao_conectado') await carregar()
      return false
    }
    setAvaliacoes((lista) => lista.map((a) => (a.id === id ? { ...a, resposta: r.resposta ?? null, resposta_em: r.resposta_em ?? null } : a)))
    toast.success(texto === null ? 'Resposta apagada do Google.' : 'Resposta publicada no Google.')
    return true
  }

  const escolherFiltro = (f: FiltroAvaliacoes, rolar = false) => {
    setFiltro(f)
    setMostrar(POR_PAGINA)
    if (rolar) listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const contagens = useMemo(() => contarFiltros(avaliacoes), [avaliacoes])
  const filtradas = useMemo(() => filtrarAvaliacoes(avaliacoes, filtro), [avaliacoes, filtro])
  const taxa = useMemo(() => taxaDeResposta(avaliacoes), [avaliacoes])

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
      <p className="mt-1 text-sm text-gray-500">A nota do seu restaurante no Google, como ela muda mês a mês e as respostas aos clientes.</p>
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
              avaliações sozinho, mostra a evolução da sua nota e deixa você responder os clientes daqui. Você pode
              desconectar quando quiser.
            </p>
          </div>
          <BotaoGoogle onClick={() => executar('conectar')} carregando={ocupado === 'conectar'} />
          <p className="text-xs text-gray-400">
            O EasyFeed lê as avaliações e só publica no seu perfil as respostas que você escrever aqui. Veja como os
            dados são usados na{' '}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">política de privacidade</a>.
          </p>
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
            O EasyFeed para de buscar as avaliações e apaga as que estão guardadas aqui. Nada muda no seu perfil do
            Google: as respostas que você já publicou continuam lá.
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
  const ultima = avaliacoes[0]?.criada_em ?? null
  const visiveis = filtradas.slice(0, mostrar)

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

      {/* No celular cada coisa numa linha (sem o "·" sobrando no começo da linha). */}
      <div className="flex flex-col gap-y-1 text-sm text-gray-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
        <span className="font-medium text-gray-800">{conexao.local_nome}</span>
        {conexao.endereco && <span><span className="hidden sm:inline">· </span>{conexao.endereco}</span>}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {conexao.maps_uri && (
            <a href={conexao.maps_uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Ver no Google Maps <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {conexao.ultima_sincronizacao && <span>· atualizado {haQuanto(conexao.ultima_sincronizacao)}</span>}
        </span>
      </div>

      {conexao.erro && <Aviso>{MENSAGENS_GOOGLE[conexao.erro] ?? MENSAGENS_GOOGLE.google}</Aviso>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Cartao className="p-4 sm:p-6">
          <p className="text-sm text-gray-500">Nota no Google</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl text-gray-900">{conexao.nota_media?.toFixed(1).replace('.', ',') ?? '—'}</p>
          {conexao.nota_media !== null && <div className="mt-1"><Estrelas nota={conexao.nota_media} /></div>}
        </Cartao>
        <Cartao className="p-4 sm:p-6">
          <p className="text-sm text-gray-500">Avaliações no Google</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl text-gray-900">{conexao.total_avaliacoes?.toLocaleString('pt-BR') ?? '—'}</p>
          {ultima && <p className="mt-1 text-xs text-gray-400">a última {haQuanto(ultima)}</p>}
        </Cartao>
        <Cartao className="p-4 sm:p-6">
          <p className="text-sm text-gray-500">Respondidas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl text-gray-900">{taxa === null ? '—' : `${Math.round(taxa * 100)}%`}</p>
          {contagens.sem_resposta > 0 ? (
            <button
              type="button"
              onClick={() => escolherFiltro('sem_resposta', true)}
              className="mt-1 text-left text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              {contagens.sem_resposta} sem resposta · responder
            </button>
          ) : (
            <p className="mt-1 text-xs text-gray-400">{avaliacoes.length ? 'todas respondidas' : 'nenhuma avaliação ainda'}</p>
          )}
        </Cartao>
        <Cartao className="p-4 sm:p-6">
          <p className="text-sm text-gray-500">Últimos 30 dias</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl text-gray-900">{resumo?.media30d?.toFixed(1).replace('.', ',') ?? '—'}</p>
          <p className="mt-1 text-xs text-gray-400">
            {resumo?.quantidade30d
              ? `${resumo.quantidade30d} avaliaç${resumo.quantidade30d === 1 ? 'ão' : 'ões'}`
              : 'nenhuma avaliação no período'}
          </p>
        </Cartao>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Cartao className="lg:col-span-3">
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

        <Cartao className="lg:col-span-2">
          <h3 className="text-base font-bold text-gray-900">Estrelas</h3>
          <p className="mt-0.5 text-xs text-gray-500">Toque numa linha para ver só essas avaliações.</p>
          <div className="mt-3 space-y-1">
            {[5, 4, 3, 2, 1].map((n) => {
              const qtd = resumo?.estrelas[n - 1] ?? 0
              const pct = totalEstrelas ? Math.round((qtd / totalEstrelas) * 100) : 0
              const ativo = filtro === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => escolherFiltro(ativo ? 'todas' : (n as FiltroAvaliacoes), !ativo)}
                  disabled={qtd === 0}
                  aria-pressed={ativo}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors disabled:cursor-default',
                    ativo ? 'bg-amber-50' : 'hover:bg-gray-50 disabled:hover:bg-transparent',
                  )}
                >
                  <span className="w-3 text-right font-medium text-gray-700">{n}</span>
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-12 text-right tabular-nums text-gray-500">{qtd}</span>
                </button>
              )
            })}
          </div>
        </Cartao>
      </div>

      <div ref={listaRef} className="scroll-mt-20">
        <Cartao>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-gray-900">Avaliações</h3>
            <p className="text-xs text-gray-500">Responda por aqui: a resposta vai direto para o Google, com o nome do restaurante.</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar avaliações">
            {FILTROS_FIXOS.map((f) => {
              const ativo = filtro === f.chave
              return (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => escolherFiltro(f.chave)}
                  aria-pressed={ativo}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                    ativo ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {f.rotulo}
                  <span className={cn('tabular-nums', ativo ? 'text-gray-300' : 'text-gray-400')}>{contagens[f.chave]}</span>
                </button>
              )
            })}
            {typeof filtro === 'number' && (
              <button
                type="button"
                onClick={() => escolherFiltro('todas')}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[13px] font-medium text-amber-800"
                aria-label={`Tirar o filtro de ${filtro} estrelas`}
              >
                {filtro} <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {avaliacoes.length === 0 ? (
            <p className="mt-6 text-sm text-gray-400">Nenhuma avaliação ainda.</p>
          ) : filtradas.length === 0 ? (
            <p className="mt-6 text-sm text-gray-400">
              {filtro === 'sem_resposta' ? 'Todas as avaliações já têm resposta.' : 'Nenhuma avaliação neste filtro.'}
            </p>
          ) : (
            <div className="mt-2 divide-y divide-gray-100">
              {visiveis.map((a) => (
                <div key={a.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Estrelas nota={a.nota} tamanho="h-3.5 w-3.5" />
                    <span className="text-sm font-medium text-gray-800">{nomeDe(a)}</span>
                    <span className="text-xs text-gray-400">{dataCurta(a.criada_em)}</span>
                    {!a.resposta && (
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        a.nota <= 3 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
                      )}
                      >
                        Sem resposta
                      </span>
                    )}
                  </div>
                  <p className={cn('mt-1.5 whitespace-pre-line text-sm leading-relaxed', a.comentario ? 'text-gray-700' : 'italic text-gray-400')}>
                    {a.comentario ?? 'Avaliou só com estrelas.'}
                  </p>
                  <RespostaDaAvaliacao a={a} aoSalvar={(texto) => salvarResposta(a.id, texto)} />
                </div>
              ))}
            </div>
          )}

          {filtradas.length > visiveis.length && (
            <div className="mt-2 flex justify-center border-t border-gray-100 pt-4">
              <Button variant="outline" size="sm" onClick={() => setMostrar((n) => n + POR_PAGINA)}>
                Mostrar mais ({filtradas.length - visiveis.length} restante{filtradas.length - visiveis.length === 1 ? '' : 's'})
              </Button>
            </div>
          )}
        </Cartao>
      </div>

      <p className="text-center text-xs text-gray-400">
        Dados do Google, atualizados a cada 2 minutos. O EasyFeed só publica no seu perfil as respostas que você escreve aqui.{' '}
        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Política de privacidade</a>
      </p>
    </div>
  )
}
