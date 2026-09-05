/**
 * Painel de propriedades dos elementos do cartaz.
 *
 * O posicionamento não mora aqui: quem move é o arrasto sobre a própria prévia
 * (em `QRCodes.tsx`), porque arrastar o elemento onde ele aparece é mais direto
 * que digitar coordenada. Este painel cuida do resto — conteúdo, tipografia,
 * cor, tamanho e exclusão.
 */
import { Bold, Italic, Trash2, Type, ImagePlus, Minus, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ESCALA_MAX,
  ESCALA_MIN,
  FONTES,
  TAMANHO_MAX,
  TAMANHO_MIN,
  type ElementoCartaz,
} from '@/lib/cartaz-elementos'

interface Props {
  elementos: ElementoCartaz[]
  selecionado: string | null
  enviandoLogo?: boolean
  onSelecionar: (id: string | null) => void
  onAlterar: (id: string, campos: Partial<ElementoCartaz>) => void
  onRemover: (id: string) => void
  onAdicionarTexto: () => void
  onEscolherLogo: (arquivo: File) => void
}

export function EditorCartaz({
  elementos,
  selecionado,
  enviandoLogo,
  onSelecionar,
  onAlterar,
  onRemover,
  onAdicionarTexto,
  onEscolherLogo,
}: Props) {
  const atual = elementos.find((e) => e.id === selecionado) ?? null

  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-gray-700">Textos e logo</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAdicionarTexto}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <Type className="h-3.5 w-3.5" /> Adicionar texto
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50">
          {enviandoLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {enviandoLogo ? 'Enviando…' : 'Adicionar logo'}
          <input
            type="file"
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onEscolherLogo(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {elementos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {elementos.map((el) => (
            <button
              key={el.id}
              type="button"
              onClick={() => onSelecionar(el.id === selecionado ? null : el.id)}
              className={cn(
                'max-w-[150px] truncate rounded-md border px-2 py-1 text-[11px] transition-colors',
                el.id === selecionado
                  ? 'border-[#C2622C] bg-[#C2622C]/10 text-[#8A431C]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {el.tipo === 'logo' ? 'Logo' : el.texto.split('\n')[0] || 'Texto'}
            </button>
          ))}
        </div>
      )}

      {atual && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          {atual.tipo === 'texto' ? (
            <>
              <textarea
                value={atual.texto}
                onChange={(e) => onAlterar(atual.id, { texto: e.target.value })}
                rows={2}
                className="w-full resize-none rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C2622C]/25"
                placeholder="Escreva o texto"
              />

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={atual.fonte}
                  onChange={(e) => onAlterar(atual.id, { fonte: e.target.value })}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px]"
                  aria-label="Fonte"
                >
                  {FONTES.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>

                <div className="flex items-center rounded-md border border-gray-200 bg-white">
                  <button
                    type="button"
                    aria-label="Diminuir a fonte"
                    onClick={() => onAlterar(atual.id, { tamanho: Math.max(TAMANHO_MIN, atual.tamanho - 4) })}
                    className="px-1.5 py-1 text-gray-500 hover:bg-gray-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[30px] text-center text-[12px] tabular-nums text-gray-700">
                    {atual.tamanho}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar a fonte"
                    onClick={() => onAlterar(atual.id, { tamanho: Math.min(TAMANHO_MAX, atual.tamanho + 4) })}
                    className="px-1.5 py-1 text-gray-500 hover:bg-gray-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  aria-label="Negrito"
                  aria-pressed={atual.negrito}
                  onClick={() => onAlterar(atual.id, { negrito: !atual.negrito })}
                  className={cn(
                    'rounded-md border px-2 py-1',
                    atual.negrito ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600',
                  )}
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Itálico"
                  aria-pressed={atual.italico}
                  onClick={() => onAlterar(atual.id, { italico: !atual.italico })}
                  className={cn(
                    'rounded-md border px-2 py-1',
                    atual.italico ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600',
                  )}
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>

                {/* `cor: null` significa "usa a tinta do tema", que já contrasta
                    com o fundo escolhido — por isso dá pra voltar pra ela. */}
                <label className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600">
                  <input
                    type="color"
                    value={atual.cor ?? '#241E18'}
                    onChange={(e) => onAlterar(atual.id, { cor: e.target.value })}
                    className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Cor do texto"
                  />
                  Cor
                </label>
                {atual.cor && (
                  <button
                    type="button"
                    onClick={() => onAlterar(atual.id, { cor: null })}
                    className="text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
                  >
                    usar a cor do tema
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {atual.url && (
                <img src={atual.url} alt="" className="h-10 w-10 rounded border bg-white object-contain" />
              )}
              <div className="flex flex-1 items-center gap-2">
                <span className="text-[12px] text-gray-600">Tamanho</span>
                <input
                  type="range"
                  min={ESCALA_MIN}
                  max={ESCALA_MAX}
                  step={0.01}
                  value={atual.escala}
                  onChange={(e) => onAlterar(atual.id, { escala: Number(e.target.value) })}
                  className="flex-1"
                  aria-label="Tamanho da logo"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemover(atual.id)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </div>
      )}
    </div>
  )
}
