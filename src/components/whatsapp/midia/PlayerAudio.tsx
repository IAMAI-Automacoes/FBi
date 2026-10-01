import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracao } from '@/lib/whatsapp/formatacao'
import { Avatar, MicOuvido, WA } from '../pecas'

/**
 * Player de áudio no estilo do WhatsApp:
 *  - onda de verdade, calculada do próprio arquivo (WebAudio) e guardada em
 *    cache — calculada só quando o balão aparece na tela;
 *  - tocar/pausar, arrastar na onda para avançar, velocidade 1× · 1,5× · 2×;
 *  - um áudio por vez: tocar outro pausa o anterior;
 *  - ao terminar, a conversa pode tocar o próximo áudio seguido (`aoTerminar`).
 *
 * O arquivo é mp3 (o n8n já converte o ogg do WhatsApp com generate_mp3).
 */

const BARRAS = 44
const ondasEmCache = new Map<string, number[]>()
const tocando = new Set<HTMLAudioElement>()

function ondaReserva(semente: string): number[] {
  // Enquanto a onda real não chega (ou se o navegador não decodificar):
  // um desenho estável por áudio, para não "pular" de forma.
  let h = 0
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0
  return Array.from({ length: BARRAS }, (_, i) => {
    h = (h * 1103515245 + 12345 + i) >>> 0
    return 0.25 + ((h >>> 8) % 1000) / 1000 * 0.55
  })
}

async function calcularOnda(url: string): Promise<number[]> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(buf)
    const dados = audio.getChannelData(0)
    const passo = Math.floor(dados.length / BARRAS) || 1
    const picos: number[] = []
    for (let b = 0; b < BARRAS; b++) {
      let soma = 0
      for (let i = b * passo; i < (b + 1) * passo && i < dados.length; i++) soma += dados[i] * dados[i]
      picos.push(Math.sqrt(soma / passo))
    }
    const max = Math.max(...picos, 0.0001)
    return picos.map((p) => Math.max(0.12, p / max))
  } finally {
    ctx.close().catch(() => {})
  }
}

const VELOCIDADES = [1, 1.5, 2]

export function PlayerAudio({
  url, caminho, deMim, ouvido, nomeContato, fotoContato, autoTocar, aoTerminar, aoTocar,
}: {
  url: string
  caminho: string
  deMim: boolean
  /** Mensagem enviada já ouvida pelo cliente (status PLAYED). */
  ouvido?: boolean
  nomeContato: string | null
  /** Foto de quem mandou (como no WhatsApp); sem ela, iniciais. */
  fotoContato?: string | null
  autoTocar?: boolean
  aoTerminar?: () => void
  aoTocar?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const ondaRef = useRef<HTMLDivElement>(null)
  const [onda, setOnda] = useState<number[]>(() => ondasEmCache.get(caminho) ?? ondaReserva(caminho))
  const [total, setTotal] = useState(0)
  const [atual, setAtual] = useState(0)
  const [tocandoAgora, setTocandoAgora] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [jaTocou, setJaTocou] = useState(false)

  // Onda real só quando o balão aparece na tela.
  useEffect(() => {
    if (ondasEmCache.has(caminho) || !url) return
    const el = caixaRef.current
    if (!el) return
    let cancelado = false
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      calcularOnda(url)
        .then((o) => { ondasEmCache.set(caminho, o); if (!cancelado) setOnda(o) })
        .catch(() => { /* fica a onda de reserva */ })
    })
    obs.observe(el)
    return () => { cancelado = true; obs.disconnect() }
  }, [url, caminho])

  const tocar = useCallback(async () => {
    const a = audioRef.current
    if (!a) return
    for (const outro of tocando) if (outro !== a) outro.pause()
    setCarregando(a.readyState < 2)
    try {
      await a.play()
    } catch {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { if (autoTocar) tocar() }, [autoTocar, tocar])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = velocidade
  }, [velocidade])

  useEffect(() => {
    const a = audioRef.current
    return () => { if (a) { a.pause(); tocando.delete(a) } }
  }, [])

  const alternar = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) tocar()
    else a.pause()
  }

  const irPara = (clientX: number) => {
    const a = audioRef.current
    const el = ondaRef.current
    if (!a || !el || !total) return
    const r = el.getBoundingClientRect()
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    a.currentTime = f * total
    setAtual(a.currentTime)
  }

  const arrastar = (e: React.PointerEvent) => {
    e.stopPropagation()
    irPara(e.clientX)
    const mover = (ev: PointerEvent) => irPara(ev.clientX)
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const progresso = total > 0 ? atual / total : 0
  const corTocada = deMim ? '#4FA387' : '#34B7F1'
  const corResto = deMim ? '#A7C9A0' : '#C6CED3'

  return (
    <div ref={caixaRef} className="flex items-center gap-2.5 py-1 pr-1 w-[min(300px,68vw)]">
      {/* Avatar com microfone (como no WhatsApp) — vira o botão de velocidade enquanto toca */}
      <div className="relative shrink-0">
        {tocandoAgora || jaTocou ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length]) }}
            className="h-11 w-11 rounded-full bg-black/[0.08] text-[13px] font-semibold text-gray-700 hover:bg-black/[0.12]"
            title="Velocidade"
          >
            {String(velocidade).replace('.', ',')}×
          </button>
        ) : (
          <>
            <Avatar nome={deMim ? 'Você' : nomeContato} foto={deMim ? null : fotoContato} tamanho={44} />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
              <MicOuvido ouvido={deMim ? !!ouvido : jaTocou} />
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); alternar() }}
        className="shrink-0 h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-800"
        aria-label={tocandoAgora ? 'Pausar áudio' : 'Tocar áudio'}
      >
        {carregando ? <Loader2 className="h-5 w-5 animate-spin" />
          : tocandoAgora ? <Pause className="h-6 w-6 fill-current" />
          : <Play className="h-6 w-6 fill-current" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={ondaRef}
          className="relative flex h-8 cursor-pointer items-center gap-[2px] touch-none"
          onPointerDown={arrastar}
          role="slider"
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(atual)}
        >
          {onda.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{ height: `${Math.round(v * 100)}%`, minHeight: 3, background: i / onda.length < progresso ? corTocada : corResto }}
            />
          ))}
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow"
            style={{ left: `${progresso * 100}%`, background: corTocada }}
          />
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500 tabular-nums">
          {duracao(tocandoAgora || atual > 0 ? atual : total)}
        </p>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setTotal(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setTotal(d) }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onPlay={(e) => { tocando.add(e.currentTarget); setTocandoAgora(true); setJaTocou(true); aoTocar?.() }}
        onPlaying={() => setCarregando(false)}
        onWaiting={() => setCarregando(true)}
        onPause={(e) => { tocando.delete(e.currentTarget); setTocandoAgora(false); setCarregando(false) }}
        onEnded={(e) => {
          tocando.delete(e.currentTarget)
          setTocandoAgora(false)
          setAtual(0)
          e.currentTarget.currentTime = 0
          aoTerminar?.()
        }}
      />
    </div>
  )
}

/** Transcrição embaixo do áudio — chega fechada; um toque abre. */
export function Transcricao({ texto, deMim }: { texto: string; deMim: boolean }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className={cn('mt-1 rounded-md px-2 py-1.5 text-[13px] leading-snug', deMim ? 'bg-black/[0.05]' : 'bg-black/[0.04]')}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberta((v) => !v) }}
        className={cn('text-[11px] font-semibold uppercase tracking-wide', aberta && 'mb-0.5')}
        style={{ color: WA.TEAL }}
        aria-expanded={aberta}
      >
        Transcrição {aberta ? '▾' : '▸'}
      </button>
      {aberta && <p className="whitespace-pre-wrap text-gray-700">{texto}</p>}
    </div>
  )
}
