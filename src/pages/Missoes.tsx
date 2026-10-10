import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, Circle, Clapperboard, Clock, Gift, ListOrdered, Loader2, Play, Timer, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import {
  anoSP, aprovadosNoAno, duracaoDaMissao, escadaDePremios, formatarDuracao, formatarTamanho, hojeSP, inicioDoAnoSP, mimeDoArquivo,
  ordinal, passosDoRoteiro, podeMandar, problemaDoArquivo, proximaMissao, ROTULO_STATUS, rotuloDuracao, rotuloPeriodo,
  situacaoDaMissao, type Degrau, type EnvioVideo, type Missao, type PremioVideo, type Recompensa, type Situacao,
} from '@/lib/missoes'
import {
  acaoVideos, buscarEnvios, buscarMaxPorAno, buscarMissoes, buscarPremios, buscarRecompensas, linkDoVideo, subirVideo,
} from '@/lib/queries/missoes'

/* Missões de vídeo: o restaurante grava um vídeo falando do EasyFeed, a IA
   confere os requisitos e, a cada missão cumprida, ele ganha o próximo prêmio
   da escada. As missões são uma fila: ele só vê a da vez (proximaMissao) e só
   ela aceita vídeo; cumpriu, aparece a seguinte. Por enquanto só o admin da
   plataforma vê (menu, rota e a função videos-missao com SO_ADMIN). */

function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

const COR_SITUACAO: Record<Situacao, string> = {
  nao_enviada: 'bg-gray-100 text-gray-600',
  analisando: 'bg-blue-50 text-blue-700',
  aprovada: 'bg-green-50 text-green-700',
  reprovada: 'bg-rose-50 text-rose-700',
  em_revisao: 'bg-amber-50 text-amber-700',
  sem_tentativas: 'bg-gray-100 text-gray-500',
}
const ROTULO_SITUACAO: Record<Situacao, string> = {
  nao_enviada: 'Não enviada',
  analisando: 'Analisando',
  aprovada: 'Cumprida',
  reprovada: 'Não aprovada',
  em_revisao: 'Em revisão',
  sem_tentativas: 'Sem tentativas',
}
const COR_STATUS: Record<EnvioVideo['status'], string> = {
  enviando: 'bg-gray-100 text-gray-600',
  analisando: 'bg-blue-50 text-blue-700',
  aprovado: 'bg-green-50 text-green-700',
  reprovado: 'bg-rose-50 text-rose-700',
  erro: 'bg-amber-50 text-amber-700',
}

function Selo({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>{children}</span>
}

function Rotulo({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</p>
}

const quando = (iso: string) => format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR })

function ListaRoteiro({ passos }: { passos: string[] }) {
  return (
    <ol className="space-y-1.5">
      {passos.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-gray-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">{i + 1}</span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
  )
}

// ── A escada de prêmios ──────────────────────────────────────────────────────

function DegrauPremio({ d }: { d: Degrau }) {
  const ganho = d.estado === 'aplicado' || d.estado === 'pendente'
  return (
    <div className={cn('rounded-lg border p-4', ganho ? 'border-green-200 bg-green-50/50' : d.estado === 'proximo' ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{ordinal(d.ordem)}</span>
        {ganho
          ? <Gift className="h-4 w-4 text-green-600" />
          : <span className="text-xs text-gray-400">{d.faltam === 1 ? 'falta 1' : `faltam ${d.faltam}`}</span>}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-gray-900">{d.descricao}</p>
      <p className={cn('mt-1 text-xs', ganho ? 'text-green-700' : 'text-gray-500')}>
        {d.estado === 'aplicado' && 'Já aplicado.'}
        {d.estado === 'pendente' && 'Ganho! Entra na próxima mensalidade.'}
        {d.estado === 'proximo' && 'É o próximo: cumpra a missão da vez.'}
        {d.estado === 'futuro' && 'Continue cumprindo missões.'}
      </p>
    </div>
  )
}

// ── Assistir um vídeo ────────────────────────────────────────────────────────

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

// ── Subir o vídeo (o único jeito de mandar: direto na missão da vez) ─────────

function SubirVideo({ missao, onEnviado }: { missao: Missao; onEnviado: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [duracao, setDuracao] = useState<number | null>(null)
  const [semPrevia, setSemPrevia] = useState(false)
  const [autorizou, setAutorizou] = useState(false)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const enviando = progresso !== null

  useEffect(() => {
    if (!arquivo) return setPrevia(null)
    const u = URL.createObjectURL(arquivo)
    setPrevia(u)
    return () => URL.revokeObjectURL(u)
  }, [arquivo])
  // Fechar a aba no meio do envio perde o vídeo: o navegador pergunta antes.
  useEffect(() => {
    if (!enviando) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [enviando])

  const escolher = (f: File | null) => {
    if (!f || enviando) return
    setArquivo(f)
    setDuracao(null)
    setSemPrevia(false)
    setErro(null)
  }
  const problema = arquivo
    ? problemaDoArquivo({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, duracao }, duracaoDaMissao(missao))
    : null

  const enviar = async () => {
    if (!arquivo || problema || !autorizou) return
    setErro(null)
    setProgresso(0)
    try {
      const mime = mimeDoArquivo(arquivo.name, arquivo.type)
      const aberto = await acaoVideos('criar_envio', {
        missao_id: missao.id, nome_arquivo: arquivo.name, tamanho_bytes: arquivo.size, duracao_segundos: duracao, mime, autorizou_uso: true,
      })
      if (!aberto.ok || !aberto.envio_id || !aberto.caminho) throw new Error(aberto.error || 'Não foi possível começar o envio.')
      await subirVideo(aberto.caminho, arquivo, aberto.mime || mime, setProgresso)
      const analise = await acaoVideos('analisar', { envio_id: aberto.envio_id })
      if (!analise.ok) throw new Error(analise.error || 'O vídeo subiu, mas a análise não começou. Tente de novo.')
      toast.success('Vídeo enviado! A IA está assistindo. O resultado aparece aqui em alguns minutos.')
      onEnviado()
    } catch (e) {
      setErro((e as Error).message)
      setProgresso(null)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={entrada}
        type="file"
        accept="video/*,.mov,.mp4,.webm,.m4v"
        className="hidden"
        onChange={(e) => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }}
      />
      {!arquivo ? (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0] ?? null) }}
          className={cn(
            'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors',
            arrastando ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40',
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50"><Upload className="h-5 w-5 text-blue-700" /></span>
          <span className="text-sm font-semibold text-gray-800">Escolher o vídeo</span>
          <span className="text-xs text-gray-500">MP4, MOV ou WEBM · {rotuloDuracao(missao)} · <span className="whitespace-nowrap">até 300 MB</span></span>
        </button>
      ) : (
        <div className="space-y-2">
          {previa && !semPrevia && (
            <video
              src={previa}
              controls
              playsInline
              preload="metadata"
              className="max-h-64 w-full rounded-lg bg-black"
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuracao(d) }}
              onError={() => setSemPrevia(true)}
            />
          )}
          {semPrevia && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Este navegador não mostra a prévia deste vídeo, mas dá para enviar normalmente.</p>}
          <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
            <span className="truncate">{arquivo.name} · {formatarTamanho(arquivo.size)}{duracao != null ? ` · ${formatarDuracao(duracao)}` : ''}</span>
            {!enviando && <button type="button" className="shrink-0 font-medium text-blue-700 hover:underline" onClick={() => entrada.current?.click()}>Trocar</button>}
          </div>
          {problema && <p className="text-sm text-rose-600">{problema}</p>}

          <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-gray-700">
            <Checkbox checked={autorizou} onCheckedChange={(v) => setAutorizou(v === true)} disabled={enviando} className="mt-0.5" />
            <span>Autorizo o EasyFeed a usar este vídeo na divulgação do sistema (site, redes sociais e anúncios).</span>
          </label>

          {enviando && (
            <div className="space-y-1.5">
              <Progress value={Math.round((progresso ?? 0) * 100)} />
              <p className="text-xs text-gray-500">
                {(progresso ?? 0) < 1 ? `Enviando… ${Math.round((progresso ?? 0) * 100)}%. Não feche esta página.` : 'Mandando para a análise…'}
              </p>
            </div>
          )}
          {erro && <p className="text-sm text-rose-600">{erro}</p>}

          <Button onClick={enviar} disabled={!!problema || !autorizou || enviando} className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF]">
            {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Enviar vídeo
          </Button>
        </div>
      )}
    </div>
  )
}

// ── A missão da vez ──────────────────────────────────────────────────────────

function MissaoDaVez({ missao, envios, premio, limite, onEnviado, onAssistir }: {
  missao: Missao
  envios: EnvioVideo[]
  /** O prêmio que esta missão vale (o próximo degrau da escada). */
  premio: Degrau | null
  /** Chegou ao limite de vídeos do ano: o porquê (null = pode mandar). */
  limite: string | null
  onEnviado: () => void
  onAssistir: (e: EnvioVideo) => void
}) {
  const { situacao, ultimo, tentativasRestantes } = situacaoDaMissao(missao.id, envios)
  const passos = passosDoRoteiro(missao.roteiro)
  const periodo = rotuloPeriodo(missao)
  // O ✓/✗ de cada requisito vem da última tentativa (se a IA chegou a avaliar).
  const avaliados = situacao === 'reprovada' ? ultimo?.analise?.requisitos ?? [] : []
  const sobreRoteiro = situacao === 'reprovada' ? ultimo?.analise?.roteiro : undefined

  return (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Sua missão agora</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">{missao.titulo}</h2>
          {missao.descricao && <p className="mt-0.5 text-sm text-gray-500">{missao.descricao}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{rotuloDuracao(missao)}</span>
            {periodo && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{periodo}</span>}
            {premio && !limite && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                <Gift className="h-3.5 w-3.5" /> Vale: {premio.descricao}
              </span>
            )}
          </div>
        </div>
        {situacao !== 'nao_enviada' && (
          <Selo className={COR_SITUACAO[situacao]}>
            {situacao === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
            {ROTULO_SITUACAO[situacao]}
          </Selo>
        )}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          {passos.length > 0 && (
            <div>
              <Rotulo>Roteiro para gravar</Rotulo>
              <ListaRoteiro passos={passos} />
            </div>
          )}
          <div>
            <Rotulo>O vídeo precisa</Rotulo>
            <ul className="space-y-2">
              {missao.requisitos.map((r) => {
                const a = avaliados.find((x) => x.id === r.id)
                return (
                  <li key={r.id} className="flex gap-2.5 text-sm">
                    {a ? (a.cumpriu
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />)
                      : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
                    <div>
                      <p className="text-gray-800">{r.texto}</p>
                      {a?.motivo && <p className="text-xs text-gray-500">{a.motivo}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          {sobreRoteiro?.comentario && (
            <p className="flex gap-2 text-xs text-gray-500">
              <ListOrdered className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', sobreRoteiro.seguido ? 'text-green-600' : 'text-amber-500')} />
              <span>Roteiro: {sobreRoteiro.comentario}</span>
            </p>
          )}
        </div>

        <div className="space-y-3 md:border-l md:border-gray-100 md:pl-6">
          {situacao === 'analisando' && ultimo && (
            <div className="space-y-3 rounded-lg bg-blue-50 p-4">
              <p className="flex items-start gap-2 text-sm text-blue-800">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" /> A IA está assistindo seu vídeo. Leva alguns minutos, e o resultado aparece aqui.
              </p>
              <Button variant="outline" size="sm" onClick={() => onAssistir(ultimo)} className="bg-white">
                <Play className="mr-1.5 h-3.5 w-3.5" /> Ver o vídeo que mandei
              </Button>
            </div>
          )}

          {podeMandar(situacao) && limite && (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{limite}</p>
          )}

          {podeMandar(situacao) && !limite && (
            <>
              {ultimo?.motivo && (
                <div className={cn('space-y-1.5 rounded-lg px-3 py-2.5 text-sm', situacao === 'em_revisao' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800')}>
                  <p>{ultimo.motivo}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <button type="button" onClick={() => onAssistir(ultimo)} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                      <Play className="h-3 w-3" /> Ver o vídeo que mandei
                    </button>
                    {situacao === 'reprovada' && (
                      <span className="opacity-80">{tentativasRestantes} {tentativasRestantes === 1 ? 'tentativa restante' : 'tentativas restantes'}</span>
                    )}
                  </div>
                </div>
              )}
              <Rotulo>{situacao === 'nao_enviada' ? 'Mande seu vídeo' : 'Mande outro vídeo'}</Rotulo>
              {/* Envio novo (outro id) recomeça o formulário do zero. */}
              <SubirVideo key={`${missao.id}-${ultimo?.id ?? 'primeiro'}`} missao={missao} onEnviado={onEnviado} />
            </>
          )}
        </div>
      </div>
    </Cartao>
  )
}

// ── A página ─────────────────────────────────────────────────────────────────

export default function Missoes() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [carregando, setCarregando] = useState(true)
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [recompensas, setRecompensas] = useState<Recompensa[]>([])
  const [envios, setEnvios] = useState<EnvioVideo[]>([])
  const [premios, setPremios] = useState<PremioVideo[]>([])
  const [maxPorAno, setMaxPorAno] = useState<number | null>(null)
  const [assistindo, setAssistindo] = useState<EnvioVideo | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [m, r, e, p, max] = await Promise.all([
        buscarMissoes(), buscarRecompensas(), buscarEnvios(restauranteId), buscarPremios(restauranteId), buscarMaxPorAno(),
      ])
      setMaxPorAno(max)
      setMissoes(m)
      setRecompensas(r)
      setEnvios(e)
      setPremios(p)
    } catch {
      toast.error('Não foi possível carregar as missões.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['video_envios', 'video_premios'], restauranteId, carregar)
  // Se o Realtime falhar, confere de tempos em tempos enquanto houver vídeo em análise.
  const emAnalise = envios.some((e) => e.status === 'analisando')
  useEffect(() => {
    if (!emAnalise) return
    const t = setInterval(carregar, 10_000)
    return () => clearInterval(t)
  }, [emAnalise, carregar])

  // A escada e o limite contam por ano (recomeçam em 1º de janeiro, horário de Brasília).
  const hoje = hojeSP()
  const ano = anoSP()
  const aprovadas = useMemo(() => aprovadosNoAno(envios, inicioDoAnoSP()), [envios])
  const degraus = useMemo(() => escadaDePremios(recompensas, premios, aprovadas, ano), [recompensas, premios, aprovadas, ano])
  const daVez = useMemo(() => proximaMissao(missoes, envios, hoje), [missoes, envios, hoje])
  const emAnaliseAgora = envios.filter((e) => e.status === 'analisando').length
  const limite = maxPorAno == null || aprovadas + emAnaliseAgora < maxPorAno
    ? null
    : aprovadas >= maxPorAno
      ? `Você chegou ao limite de ${maxPorAno} ${maxPorAno === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} este ano. Em janeiro a escada recomeça e dá para mandar de novo.`
      : `Contando os vídeos em análise, você chegou ao limite de ${maxPorAno} deste ano. Se algum não for aprovado, libera de novo.`
  const enviados = envios.filter((e) => e.status !== 'enviando')
  const cumpriuAlguma = envios.some((e) => e.status === 'aprovado')
  const tituloMissao = (id: number) => missoes.find((m) => m.id === id)?.titulo ?? 'Missão'

  if (carregando) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Missões de vídeo</h1>
        <p className="mt-1 text-sm text-gray-500">
          Grave um vídeo falando do EasyFeed para cumprir a missão e ganhar prêmios. Uma IA assiste e confere os requisitos. Cumpriu, libera a próxima.
        </p>
      </div>

      {daVez ? (
        <MissaoDaVez
          missao={daVez}
          envios={envios}
          premio={degraus.find((d) => d.estado === 'proximo') ?? null}
          limite={limite}
          onEnviado={carregar}
          onAssistir={setAssistindo}
        />
      ) : (
        <Cartao className="flex flex-col items-center gap-2 py-10 text-center">
          {cumpriuAlguma ? <CheckCircle2 className="h-8 w-8 text-green-500" /> : <Clapperboard className="h-8 w-8 text-gray-300" />}
          <p className="text-sm font-medium text-gray-700">{cumpriuAlguma ? 'Você fez todas as missões por enquanto.' : 'Nenhuma missão disponível agora.'}</p>
          <p className="text-xs text-gray-500">Quando tiver uma missão nova, ela aparece aqui.</p>
        </Cartao>
      )}

      {(degraus.length > 0 || maxPorAno != null) && (
        <Cartao>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-gray-900">Seus prêmios em {ano}</h2>
            <span className="text-sm text-gray-500">
              {maxPorAno != null
                ? `${aprovadas} de ${maxPorAno} ${maxPorAno === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} este ano`
                : aprovadas === 0 ? 'Nenhuma missão cumprida este ano' : `${aprovadas} ${aprovadas === 1 ? 'missão cumprida' : 'missões cumpridas'} este ano`}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">A escada recomeça em 1º de janeiro.</p>
          {degraus.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {degraus.map((d) => <DegrauPremio key={d.ordem} d={d} />)}
            </div>
          )}
        </Cartao>
      )}

      {enviados.length > 0 && (
        <Cartao>
          <h2 className="text-base font-bold text-gray-900">Seus envios</h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {enviados.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{tituloMissao(e.missao_id)}</p>
                  <p className="text-xs text-gray-500">{quando(e.criado_em)}{e.duracao_segundos ? ` · ${formatarDuracao(e.duracao_segundos)}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Selo className={COR_STATUS[e.status]}>
                    {e.status === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {ROTULO_STATUS[e.status]}
                  </Selo>
                  <Button variant="ghost" size="sm" onClick={() => setAssistindo(e)}><Play className="mr-1 h-3.5 w-3.5" /> Ver</Button>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Assistir envio={assistindo} onFechar={() => setAssistindo(null)} />
    </div>
  )
}
