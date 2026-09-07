/**
 * Barra de propriedades do elemento selecionado, acima da prévia.
 *
 * Fica colada na prévia de propósito: o elemento é posicionado arrastando ali,
 * e ter o controle do outro lado da tela obrigava a ir e voltar com o olho a
 * cada ajuste. O conteúdo do texto também não se digita aqui — se digita no
 * próprio elemento, sobre o cartaz.
 */
import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Trash2, Minus, Plus, ChevronDown, RotateCw, Contrast, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeletorCor } from '@/components/SeletorCor'
import {
  ESCALA_MAX,
  ESCALA_MIN,
  FONTES,
  GRUPOS_DE_FONTE,
  TAMANHO_MAX,
  TAMANHO_MIN,
  fonteCss,
  garantirCssDasFontes,
  type ElementoCartaz,
} from '@/lib/cartaz-elementos'

/** Dropdown de fontes em que cada opção é escrita na PRÓPRIA fonte. */
function EscolhaDeFonte({ valor, onChange }: { valor: string; onChange: (id: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const atual = FONTES.find((f) => f.id === valor) ?? FONTES[0]

  // Sem o CSS injetado a lista aparece toda na fonte de reserva, e escolher
  // pela aparência — que é o ponto deste dropdown — deixa de funcionar.
  useEffect(() => { void garantirCssDasFontes() }, [])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label="Fonte"
        aria-expanded={aberto}
        className="flex h-8 min-w-[124px] items-center justify-between gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[13px] text-gray-800 hover:bg-gray-50"
      >
        <span className="truncate" style={{ fontFamily: fonteCss(atual.id) }}>{atual.nome}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      </button>

      {/* Agrupado por gênero: são 50 famílias, e numa lista corrida quem
          procura "uma manuscrita" teria que rolar tudo reconhecendo pela
          aparência. O cabeçalho gruda no topo enquanto se rola o grupo. */}
      {aberto && (
        <div className="absolute left-0 top-9 z-50 max-h-[320px] w-[220px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
          {GRUPOS_DE_FONTE.map((grupo) => (
            <div key={grupo}>
              <p className="sticky top-0 z-10 bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 backdrop-blur-sm">
                {grupo}
              </p>
              {FONTES.filter((f) => f.grupo === grupo).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { onChange(f.id); setAberto(false) }}
                  className={cn(
                    'block w-full truncate px-3 py-1.5 text-left text-[15px] hover:bg-gray-50',
                    f.id === valor ? 'bg-[#C2622C]/10 text-[#8A431C]' : 'text-gray-800',
                  )}
                  style={{ fontFamily: fonteCss(f.id) }}
                >
                  {f.nome}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  elemento: ElementoCartaz
  onAlterar: (id: string, campos: Partial<ElementoCartaz>) => void
  onRemover: (id: string) => void
  /** `false` esconde o excluir — o nome do restaurante não sai do cartaz. */
  podeRemover?: boolean
}

export function BarraElemento({ elemento, onAlterar, onRemover, podeRemover = true }: Props) {
  const botao = 'flex h-8 items-center justify-center rounded-md border px-2'

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
      {elemento.tipo === 'texto' ? (
        <>
          <EscolhaDeFonte valor={elemento.fonte} onChange={(fonte) => onAlterar(elemento.id, { fonte })} />

          <div className="flex h-8 items-center rounded-md border border-gray-200 bg-white">
            <button
              type="button"
              aria-label="Diminuir a fonte"
              onClick={() => onAlterar(elemento.id, { tamanho: Math.max(TAMANHO_MIN, elemento.tamanho - 4) })}
              className="px-1.5 text-gray-500 hover:text-gray-900"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[26px] text-center text-[12px] tabular-nums text-gray-700">
              {elemento.tamanho}
            </span>
            <button
              type="button"
              aria-label="Aumentar a fonte"
              onClick={() => onAlterar(elemento.id, { tamanho: Math.min(TAMANHO_MAX, elemento.tamanho + 4) })}
              className="px-1.5 text-gray-500 hover:text-gray-900"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            aria-label="Negrito"
            aria-pressed={elemento.negrito}
            onClick={() => onAlterar(elemento.id, { negrito: !elemento.negrito })}
            className={cn(botao, elemento.negrito
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Itálico"
            aria-pressed={elemento.italico}
            onClick={() => onAlterar(elemento.id, { italico: !elemento.italico })}
            className={cn(botao, elemento.italico
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          {/* Mesmo seletor da cor da plaquinha: a escolha é a mesma coisa —
              uma cor livre — e dois seletores diferentes para isso ensinariam
              duas interfaces para o mesmo gesto. */}
          <SeletorCor
            compacto
            valor={elemento.cor}
            onChange={(hex) => onAlterar(elemento.id, { cor: hex })}
          />
          {elemento.cor && (
            <button
              type="button"
              onClick={() => onAlterar(elemento.id, { cor: null })}
              className="text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
            >
              cor do tema
            </button>
          )}
        </>
      ) : (
        /* Edição da imagem no próprio cartaz: tamanho, giro e opacidade.
           São os três ajustes que resolvem o que chega de foto de celular —
           grande demais, torta, e opaca demais pra servir de marca-d'água. */
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
          <label className="flex min-w-[132px] flex-1 items-center gap-1.5">
            <Maximize2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="range"
              min={ESCALA_MIN}
              max={ESCALA_MAX}
              step={0.01}
              value={elemento.escala}
              onChange={(e) => onAlterar(elemento.id, { escala: Number(e.target.value) })}
              className="min-w-0 flex-1"
              aria-label="Tamanho da imagem"
              title="Tamanho"
            />
          </label>

          <label className="flex min-w-[132px] flex-1 items-center gap-1.5">
            <RotateCw className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={elemento.rotacao ?? 0}
              onChange={(e) => onAlterar(elemento.id, { rotacao: Number(e.target.value) })}
              className="min-w-0 flex-1"
              aria-label="Girar a imagem"
              title="Girar"
            />
            <span className="w-[38px] text-right text-[11px] tabular-nums text-gray-500">
              {Math.round(elemento.rotacao ?? 0)}°
            </span>
          </label>

          <label className="flex min-w-[132px] flex-1 items-center gap-1.5">
            <Contrast className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={elemento.opacidade ?? 1}
              onChange={(e) => onAlterar(elemento.id, { opacidade: Number(e.target.value) })}
              className="min-w-0 flex-1"
              aria-label="Opacidade da imagem"
              title="Opacidade"
            />
          </label>

          {/* Volta ao estado de recém-subida sem precisar excluir e subir de
              novo — que é o que se faz quando não existe um "desfazer". */}
          <button
            type="button"
            onClick={() => onAlterar(elemento.id, { rotacao: 0, opacidade: 1, escala: 0.28 })}
            className="text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            redefinir
          </button>
        </div>
      )}

      {podeRemover && (
      <button
        type="button"
        onClick={() => onRemover(elemento.id)}
        aria-label="Remover o elemento"
        title="Remover"
        className={cn(botao, 'ml-auto border-gray-200 bg-white text-red-600 hover:bg-red-50')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      )}
    </div>
  )
}
