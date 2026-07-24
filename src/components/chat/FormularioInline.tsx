import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Sparkles, ArrowRight, Check, X } from 'lucide-react'
import { FormularioIA, CampoFormulario } from '@/lib/queries/agente-ia'

/**
 * Formulário que a IA usa quando precisa de respostas mais precisas. Ocupa o
 * lugar do campo de digitação e faz uma pergunta por vez:
 * - com opções → botões numerados; clicou, já avança
 * - sem opções → campo de texto multilinha (Enter envia, Shift+Enter pula linha)
 * Última pergunta respondida → dispara a ação. Visual destacado para saltar na tela.
 */
export function FormularioInline({
  formulario,
  onEnviar,
  onCancelar,
}: {
  formulario: FormularioIA
  onEnviar: (respostas: Record<string, string>) => void
  onCancelar: () => void
}) {
  const [passo, setPasso] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [texto, setTexto] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const campo: CampoFormulario | undefined = formulario.campos[passo]
  const total = formulario.campos.length
  const ultimo = passo === total - 1
  if (!campo) return null

  const temOpcoes = (campo.tipo === 'escolha' || campo.tipo === 'multipla') && !!campo.opcoes?.length

  const avancar = (valor: string) => {
    const novas = { ...respostas, [campo.nome]: valor }
    setRespostas(novas)
    setTexto('')
    if (ultimo) onEnviar(novas)
    else setPasso((p) => p + 1)
  }

  const pular = () => {
    if (ultimo) onEnviar(respostas)
    else setPasso((p) => p + 1)
  }

  // Cresce conforme digita, até um limite; depois rola dentro do campo
  const ajustarAltura = () => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-primary/60 bg-white shadow-[0_0_0_3px_rgba(99,102,241,0.12)]">
      {/* Cabeçalho de destaque */}
      <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[11px] font-semibold text-primary">
          {total > 1 ? `Pergunta ${passo + 1} de ${total}` : 'Pergunta rápida'}
        </span>
        <button
          onClick={onCancelar}
          title="Cancelar"
          className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-primary/70 hover:bg-primary/15"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="px-3 pb-2.5 pt-2">
        {passo === 0 && formulario.titulo && (
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">{formulario.titulo}</p>
        )}
        <p className="mb-2 text-sm font-medium text-foreground">{campo.label}</p>

        {temOpcoes ? (
          <div className="flex flex-col gap-1.5">
            {campo.opcoes!.map((o, i) => (
              <button
                key={o}
                onClick={() => avancar(o)}
                className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-[11px] font-semibold text-gray-500">
                  {i + 1}
                </span>
                {o}
              </button>
            ))}
          </div>
        ) : campo.tipo === 'numero' || campo.tipo === 'data' ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              type={campo.tipo === 'numero' ? 'number' : 'date'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && texto.trim()) avancar(texto.trim())
              }}
              className="h-9 text-sm"
            />
            <BotaoEnviar ultimo={ultimo} desabilitado={!texto.trim()} onClick={() => avancar(texto.trim())} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              ref={areaRef}
              autoFocus
              value={texto}
              onChange={(e) => { setTexto(e.target.value); ajustarAltura() }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && texto.trim()) {
                  e.preventDefault()
                  avancar(texto.trim())
                }
              }}
              rows={2}
              placeholder="Escreva sua resposta…"
              className="max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
            <div className="ml-auto">
              <BotaoEnviar ultimo={ultimo} desabilitado={!texto.trim()} onClick={() => avancar(texto.trim())} />
            </div>
          </div>
        )}

        {!campo.obrigatorio && (
          <button
            onClick={pular}
            className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {ultimo ? 'Pular e criar' : 'Pular esta'}
          </button>
        )}
      </div>
    </div>
  )
}

function BotaoEnviar({
  ultimo,
  desabilitado,
  onClick,
}: {
  ultimo: boolean
  desabilitado: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
    >
      {ultimo ? 'Criar' : 'Continuar'}
      {ultimo ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
    </button>
  )
}
