import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, Circle, Clapperboard, Clock, History, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { cn } from '@/lib/utils'
import {
  anoSP, aprovadosNoAno, duracaoDaMissao, formatarDuracao, formatarTamanho, hojeSP, inicioDoAnoSP, mimeDoArquivo,
  podeMandar, problemaDoArquivo, proximaMissao, rotuloDuracao, situacaoDaMissao, type EnvioVideo, type Missao,
} from '@/lib/missoes'
import { acaoVideos, buscarEnvios, buscarMaxPorAno, buscarMissoes, subirVideo } from '@/lib/queries/missoes'

/* Missões de vídeo: o restaurante grava um vídeo falando do EasyFeed, do jeito
   que quiser, e a IA confere se cumpriu os requisitos da missão. As missões são
   uma fila: ele só vê a da vez (proximaMissao), com os requisitos e o botão de
   subir; cumpriu, aparece a seguinte. O histórico fica em /missoes/historico.
   Por enquanto só o admin da plataforma vê (menu, rota e a função
   videos-missao com SO_ADMIN). */

function CartaoMissoes({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
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

  const limites = `${rotuloDuracao(missao)} · MP4, MOV ou WEBM · até 300 MB`

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button size="sm" onClick={() => entrada.current?.click()} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Subir o vídeo
          </Button>
          <span className="text-xs text-gray-500">{limites}</span>
        </div>
      ) : (
        <div className="max-w-md space-y-2">
          {previa && !semPrevia && (
            <video
              src={previa}
              controls
              playsInline
              preload="metadata"
              className="max-h-56 w-full rounded-lg bg-black"
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

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={enviar} disabled={!!problema || !autorizou || enviando} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
              {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Enviar vídeo
            </Button>
            {!enviando && <Button size="sm" variant="ghost" onClick={() => setArquivo(null)}>Cancelar</Button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── O próximo vídeo: os requisitos e o botão de subir ────────────────────────

function ProximoVideo({ missao, envios, limite, onEnviado }: {
  missao: Missao
  envios: EnvioVideo[]
  /** Chegou ao limite de vídeos do ano: o porquê (null = pode mandar). */
  limite: string | null
  onEnviado: () => void
}) {
  const { situacao, ultimo } = situacaoDaMissao(missao.id, envios)

  return (
    <CartaoMissoes>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Seu próximo vídeo</p>
      <h2 className="mt-1 text-lg font-bold text-gray-900">{missao.titulo}</h2>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">O vídeo precisa ter</p>
      <ul className="mt-2 space-y-2">
        {missao.requisitos.map((r) => (
          <li key={r.id} className="flex gap-2.5 text-sm text-gray-800">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
            <span>{r.texto}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500">O resto é com você: grave do seu jeito.</p>

      <div className="mt-5 border-t border-gray-100 pt-4">
        {situacao === 'analisando' && (
          <p className="flex items-start gap-2 text-sm text-blue-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Seu vídeo está em análise. Leva alguns minutos, e o resultado aparece no <Link to="/missoes/historico" className="font-medium underline underline-offset-2">histórico</Link>.</span>
          </p>
        )}
        {podeMandar(situacao) && limite && <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{limite}</p>}
        {podeMandar(situacao) && !limite && (
          // Envio novo (outro id) recomeça o formulário do zero.
          <SubirVideo key={`${missao.id}-${ultimo?.id ?? 'primeiro'}`} missao={missao} onEnviado={onEnviado} />
        )}
      </div>
    </CartaoMissoes>
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
  const cumpriuAlguma = envios.some((e) => e.status === 'aprovado')

  if (carregando) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 py-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Missões de vídeo</h1>
          <p className="mt-1 text-sm text-gray-500">Grave um vídeo falando do EasyFeed, do seu jeito. Uma IA assiste e, se cumprir os requisitos, libera o próximo.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/missoes/historico">
            <History className="mr-1.5 h-4 w-4" /> Histórico
            {emAnaliseAgora > 0 && <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700">{emAnaliseAgora} em análise</span>}
          </Link>
        </Button>
      </div>

      <div className="flex items-baseline gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-2xl font-bold tabular-nums text-gray-900">{aprovadas}</span>
        <span className="text-sm text-gray-500">
          {maxPorAno != null ? `de ${maxPorAno} ` : ''}{(maxPorAno ?? aprovadas) === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} em {ano}
        </span>
      </div>

      {daVez ? (
        <ProximoVideo missao={daVez} envios={envios} limite={limite} onEnviado={carregar} />
      ) : (
        <CartaoMissoes className="flex flex-col items-center gap-2 py-10 text-center">
          {cumpriuAlguma ? <CheckCircle2 className="h-8 w-8 text-green-500" /> : <Clapperboard className="h-8 w-8 text-gray-300" />}
          <p className="text-sm font-medium text-gray-700">{cumpriuAlguma ? 'Você fez todos os vídeos por enquanto.' : 'Nenhum vídeo para gravar agora.'}</p>
          <p className="text-xs text-gray-500">Quando tiver uma missão nova, ela aparece aqui.</p>
        </CartaoMissoes>
      )}
    </div>
  )
}
