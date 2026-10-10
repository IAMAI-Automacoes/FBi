import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Clapperboard, Clock, Loader2, Play, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import {
  anoSP, aprovadosNoAno, duracaoDaMissao, formatarDuracao, formatarTamanho, hojeSP, inicioDoAnoSP, mimeDoArquivo, passosDoRoteiro,
  podeMandar, problemaDoArquivo, proximaMissao, ROTULO_STATUS, rotuloDuracao, situacaoDaMissao, type EnvioVideo, type Missao,
} from '@/lib/missoes'
import { acaoVideos, buscarEnvios, buscarMaxPorAno, buscarMissoes, linkDoVideo, subirVideo } from '@/lib/queries/missoes'

/* Missões de vídeo: o restaurante grava um vídeo falando do EasyFeed e a IA
   confere os requisitos da missão. As missões são uma fila: ele só vê a da
   vez (proximaMissao), com o roteiro e o botão de subir; cumpriu, aparece a
   seguinte. Os requisitos e os prêmios ficam com o admin. Por enquanto só o
   admin da plataforma vê (menu, rota e a função videos-missao com SO_ADMIN). */

function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
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
      toast.success('Vídeo enviado! A IA está assistindo. O resultado aparece no histórico em alguns minutos.')
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
          <span className="text-sm font-semibold text-gray-800">Subir o vídeo</span>
          <span className="text-xs text-gray-500">{rotuloDuracao(missao)} · MP4, MOV ou WEBM · <span className="whitespace-nowrap">até 300 MB</span></span>
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

// ── O próximo vídeo: o roteiro e o botão de subir ────────────────────────────

function ProximoVideo({ missao, envios, limite, onEnviado }: {
  missao: Missao
  envios: EnvioVideo[]
  /** Chegou ao limite de vídeos do ano: o porquê (null = pode mandar). */
  limite: string | null
  onEnviado: () => void
}) {
  const { situacao, ultimo } = situacaoDaMissao(missao.id, envios)
  // Missão antiga sem roteiro: a descrição faz as vezes dele.
  const passos = passosDoRoteiro(missao.roteiro || missao.descricao)

  return (
    <Cartao>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Seu próximo vídeo</p>
      <h2 className="mt-1 text-lg font-bold text-gray-900">{missao.titulo}</h2>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <Rotulo>Roteiro para gravar</Rotulo>
          <ol className="space-y-2">
            {passos.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="md:border-l md:border-gray-100 md:pl-6">
          {situacao === 'analisando' && (
            <p className="flex items-start gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" /> Seu vídeo está em análise. Leva alguns minutos, e o resultado aparece no histórico.
            </p>
          )}
          {podeMandar(situacao) && limite && (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{limite}</p>
          )}
          {podeMandar(situacao) && !limite && (
            // Envio novo (outro id) recomeça o formulário do zero.
            <SubirVideo key={`${missao.id}-${ultimo?.id ?? 'primeiro'}`} missao={missao} onEnviado={onEnviado} />
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
  const [envios, setEnvios] = useState<EnvioVideo[]>([])
  const [maxPorAno, setMaxPorAno] = useState<number | null>(null)
  const [assistindo, setAssistindo] = useState<EnvioVideo | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [m, e, max] = await Promise.all([buscarMissoes(), buscarEnvios(restauranteId), buscarMaxPorAno()])
      setMaxPorAno(max)
      setMissoes(m)
      setEnvios(e)
    } catch {
      toast.error('Não foi possível carregar as missões.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['video_envios'], restauranteId, carregar)
  // Se o Realtime falhar, confere de tempos em tempos enquanto houver vídeo em análise.
  const emAnalise = envios.some((e) => e.status === 'analisando')
  useEffect(() => {
    if (!emAnalise) return
    const t = setInterval(carregar, 10_000)
    return () => clearInterval(t)
  }, [emAnalise, carregar])

  // O limite conta por ano (recomeça em 1º de janeiro, horário de Brasília).
  const hoje = hojeSP()
  const ano = anoSP()
  const aprovadas = useMemo(() => aprovadosNoAno(envios, inicioDoAnoSP()), [envios])
  const daVez = useMemo(() => proximaMissao(missoes, envios, hoje), [missoes, envios, hoje])
  const emAnaliseAgora = envios.filter((e) => e.status === 'analisando').length
  const limite = maxPorAno == null || aprovadas + emAnaliseAgora < maxPorAno
    ? null
    : aprovadas >= maxPorAno
      ? `Você chegou ao limite de ${maxPorAno} ${maxPorAno === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} este ano. Em janeiro dá para mandar de novo.`
      : `Contando os vídeos em análise, você chegou ao limite de ${maxPorAno} deste ano. Se algum não for aprovado, libera de novo.`
  const historico = envios.filter((e) => e.status !== 'enviando')
  const cumpriuAlguma = envios.some((e) => e.status === 'aprovado')
  const tituloMissao = (id: number) => missoes.find((m) => m.id === id)?.titulo ?? 'Missão'

  if (carregando) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 py-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Missões de vídeo</h1>
          <p className="mt-1 text-sm text-gray-500">Grave um vídeo falando do EasyFeed seguindo o roteiro. Uma IA assiste e, aprovado, libera o próximo.</p>
        </div>
        <div className="flex items-baseline gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-2xl font-bold tabular-nums text-gray-900">{aprovadas}</span>
          <span className="text-sm text-gray-500">
            {maxPorAno != null ? `de ${maxPorAno} ` : ''}{(maxPorAno ?? aprovadas) === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} em {ano}
          </span>
        </div>
      </div>

      {daVez ? (
        <ProximoVideo missao={daVez} envios={envios} limite={limite} onEnviado={carregar} />
      ) : (
        <Cartao className="flex flex-col items-center gap-2 py-10 text-center">
          {cumpriuAlguma ? <CheckCircle2 className="h-8 w-8 text-green-500" /> : <Clapperboard className="h-8 w-8 text-gray-300" />}
          <p className="text-sm font-medium text-gray-700">{cumpriuAlguma ? 'Você fez todos os vídeos por enquanto.' : 'Nenhum vídeo para gravar agora.'}</p>
          <p className="text-xs text-gray-500">Quando tiver uma missão nova, ela aparece aqui.</p>
        </Cartao>
      )}

      <Cartao>
        <h2 className="text-base font-bold text-gray-900">Histórico</h2>
        {historico.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Você ainda não mandou nenhum vídeo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {historico.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{tituloMissao(e.missao_id)}</p>
                    <Selo className={COR_STATUS[e.status]}>
                      {e.status === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {ROTULO_STATUS[e.status]}
                    </Selo>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{quando(e.criado_em)}{e.duracao_segundos ? ` · ${formatarDuracao(e.duracao_segundos)}` : ''}</p>
                  {e.status === 'analisando'
                    ? <p className="mt-1 text-sm text-gray-600">A IA está assistindo. Leva alguns minutos.</p>
                    : e.motivo && <p className="mt-1 text-sm text-gray-600">{e.motivo}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setAssistindo(e)}><Play className="mr-1.5 h-3.5 w-3.5" /> Ver</Button>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Assistir envio={assistindo} onFechar={() => setAssistindo(null)} />
    </div>
  )
}
