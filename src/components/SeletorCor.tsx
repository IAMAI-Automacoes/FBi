/**
 * Botão redondo que abre um seletor de cor livre.
 *
 * Fechado é só o botão: um anel colorido com um "+", que não escolhe cor
 * nenhuma — ele existe para anunciar que dá pra sair da paleta pronta. Aberto,
 * mostra o quadrado de saturação/brilho, a barra de matiz e o campo do hex.
 *
 * O quadrado (e não uma roda) é de propósito: numa roda, matiz e saturação
 * ocupam o mesmo gesto e o brilho não cabe em lugar nenhum — dá pra pegar
 * "vermelho vivo", mas não "vermelho escuro e sujo", que é justamente o tipo de
 * tom que combina com o salão de um restaurante.
 */
import { useEffect, useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'

/** h em 0..360, s e v em 0..1. */
function hsvParaHex(h: number, s: number, v: number): string {
  const canal = (n: number) => {
    const k = (n + h / 60) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${canal(5)}${canal(3)}${canal(1)}`
}

function hexParaHsv(hex: string): { h: number; s: number; v: number } {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = h * 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Arrastar dentro de uma área, em fração 0..1 dos dois eixos.
 *
 * Usa pointer capture: sem ele, arrastar rápido para fora do quadrado perde o
 * ponteiro no meio do gesto e a cor congela onde o mouse saiu.
 */
function aoArrastar(aoMover: (fx: number, fy: number) => void) {
  return (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    const mover = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      aoMover(
        Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
      )
    }

    mover(e.clientX, e.clientY)

    const onMove = (ev: PointerEvent) => mover(ev.clientX, ev.clientY)
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }
}

export interface SeletorCorProps {
  /** Hex escolhido, ou null quando a escolha atual é um tema da paleta pronta. */
  valor: string | null
  onChange: (hex: string) => void
}

export function SeletorCor({ valor, onChange }: SeletorCorProps) {
  const [aberto, setAberto] = useState(false)
  const [hsv, setHsv] = useState(() => hexParaHsv(valor ?? '#C2622C'))
  const [rascunho, setRascunho] = useState(valor ?? '#C2622C')
  const caixaRef = useRef<HTMLDivElement>(null)

  // O valor pode mudar por fora (o dono clicou num quadradinho da paleta
  // pronta); quando isso acontece o seletor precisa acompanhar, senão ele
  // continua marcando a cor anterior.
  useEffect(() => {
    if (valor && HEX.test(valor)) {
      setHsv(hexParaHsv(valor))
      setRascunho(valor)
    }
  }, [valor])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const aplicar = (h: number, s: number, v: number) => {
    setHsv({ h, s, v })
    const hex = hsvParaHex(h, s, v)
    setRascunho(hex)
    onChange(hex)
  }

  const digitarHex = (texto: string) => {
    const t = texto.startsWith('#') ? texto : `#${texto}`
    setRascunho(t)
    if (HEX.test(t)) {
      setHsv(hexParaHsv(t))
      onChange(t)
    }
  }

  const contaGotas = async () => {
    // Só o Chromium tem a API; nos outros o botão simplesmente não aparece.
    const Conta = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!Conta) return
    try {
      const { sRGBHex } = await new Conta().open()
      if (HEX.test(sRGBHex)) {
        setHsv(hexParaHsv(sRGBHex))
        setRascunho(sRGBHex)
        onChange(sRGBHex)
      }
    } catch {
      /* o dono cancelou com Esc */
    }
  }

  const temContaGotas = typeof window !== 'undefined' && 'EyeDropper' in window
  const corPura = hsvParaHex(hsv.h, 1, 1)

  return (
    <div ref={caixaRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        title="Escolher outra cor"
        aria-label="Escolher outra cor"
        aria-expanded={aberto}
        className="relative flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105"
        style={{
          background:
            'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
      >
        {/* Miolo branco com o "+". Não recebe a cor escolhida de propósito: o
            botão é a PORTA para escolher, não o lugar que mostra a escolha —
            quem mostra é o quadradinho marcado na paleta e a própria prévia.
            Pintado com a cor atual ele viraria só mais um quadradinho da
            paleta, e o convite de "tem mais cor aqui" some. */}
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[15px] font-light leading-none text-gray-600 shadow-sm">
          +
        </span>
      </button>

      {aberto && (
        <div className="absolute left-0 top-10 z-50 w-[236px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          {/* Saturação no eixo X, brilho no Y — as duas camadas por cima da cor
              pura do matiz atual são o que desenha isso. */}
          <div
            onPointerDown={aoArrastar((fx, fy) => aplicar(hsv.h, fx, 1 - fy))}
            className="relative h-[124px] w-full cursor-crosshair rounded-lg"
            style={{
              background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${corPura})`,
            }}
          >
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: rascunho }}
            />
          </div>

          <div
            onPointerDown={aoArrastar((fx) => aplicar(fx * 360, hsv.s, hsv.v))}
            className="relative mt-3 h-3 w-full cursor-ew-resize rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: `${(hsv.h / 360) * 100}%`, background: corPura }}
            />
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
            <span
              className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/15"
              style={{ background: HEX.test(rascunho) ? rascunho : '#fff' }}
            />
            <input
              value={rascunho.toUpperCase()}
              onChange={(e) => digitarHex(e.target.value)}
              spellCheck={false}
              maxLength={7}
              aria-label="Código da cor em hexadecimal"
              className={cn(
                'w-full bg-transparent font-mono text-[13px] uppercase outline-none',
                !HEX.test(rascunho) && 'text-red-600',
              )}
            />
            {temContaGotas && (
              <button
                type="button"
                onClick={contaGotas}
                title="Pegar uma cor da tela"
                aria-label="Pegar uma cor da tela"
                className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <Pipette className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
