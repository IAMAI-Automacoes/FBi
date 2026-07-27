import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CATALOGO_AGENTES, AgenteInfo, BlocoPrompt } from '@/lib/ia/catalogo-agentes'
import { promptOverride, salvarPromptEditavel } from '@/lib/ia/prompt-store'
import {
  Bot, ChevronDown, Database, Brain, Pencil, Save, RotateCcw, Lock, Loader2, Info,
} from 'lucide-react'

function BlocoEditor({ bloco }: { bloco: BlocoPrompt }) {
  const { toast } = useToast()
  const valorAtual = (bloco.chave && promptOverride(bloco.chave)) || bloco.conteudo
  const [texto, setTexto] = useState(valorAtual)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const sobrescrito = !!(bloco.chave && promptOverride(bloco.chave))
  const mudou = texto !== valorAtual

  const salvar = async () => {
    if (!bloco.chave) return
    setSalvando(true)
    try {
      await salvarPromptEditavel(bloco.chave, texto)
      toast({ title: 'Prompt salvo', description: 'A IA passa a usar este texto.' })
      setEditando(false)
    } catch (e: any) {
      toast({ title: 'Não consegui salvar', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const restaurar = async () => {
    if (!bloco.chave) return
    setSalvando(true)
    try {
      await salvarPromptEditavel(bloco.chave, '') // remove a sobrescrita
      setTexto(bloco.conteudo)
      toast({ title: 'Padrão restaurado', description: 'Voltou ao texto original do código.' })
      setEditando(false)
    } catch (e: any) {
      toast({ title: 'Não consegui restaurar', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 bg-gray-50/70 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
            {bloco.titulo}
            {bloco.editavel ? (
              sobrescrito && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                  editado
                </span>
              )
            ) : (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> referência
              </span>
            )}
          </p>
          <p className="text-[11.5px] text-gray-500 mt-0.5 leading-snug">{bloco.explicacao}</p>
        </div>
        {bloco.editavel && !editando && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 text-xs" onClick={() => setEditando(true)}>
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        )}
      </div>

      <div className="p-3.5">
        {bloco.dinamico && (
          <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
            As partes entre chaves ({'{...}'}) são preenchidas em tempo real com dados da conversa.
          </p>
        )}

        {editando && bloco.editavel ? (
          <>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={16}
              className="text-[12px] font-mono leading-relaxed resize-y"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <Button size="sm" className="h-8 gap-1.5" onClick={salvar} disabled={salvando || !mudou}>
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setTexto(valorAtual); setEditando(false) }}>
                Cancelar
              </Button>
              {sobrescrito && (
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-amber-700 hover:text-amber-800 ml-auto" onClick={restaurar} disabled={salvando}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
                </Button>
              )}
            </div>
          </>
        ) : (
          <pre className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-gray-700 bg-gray-50/50 rounded-md p-3 max-h-72 overflow-y-auto sem-barra">
            {valorAtual}
          </pre>
        )}
      </div>
    </div>
  )
}

function CardAgente({ agente }: { agente: AgenteInfo }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-gray-900">{agente.nome}</p>
          <p className="text-[12.5px] text-gray-600 mt-0.5 leading-snug">{agente.papel}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 shrink-0 mt-1 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-3">
              <p className="text-[11px] font-semibold text-violet-800 flex items-center gap-1.5 mb-1">
                <Brain className="h-3.5 w-3.5" /> Memória
              </p>
              <p className="text-[12px] text-violet-900/80 leading-snug">{agente.memoria}</p>
            </div>
            <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3">
              <p className="text-[11px] font-semibold text-sky-800 flex items-center gap-1.5 mb-1.5">
                <Database className="h-3.5 w-3.5" /> O que ele acessa
              </p>
              <ul className="space-y-1">
                {agente.acessos.map((a, i) => (
                  <li key={i} className="text-[12px] text-sky-900/80 leading-snug flex gap-1.5">
                    <span className="text-sky-400">•</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {agente.blocos.length > 0 && (
            <div className="space-y-3">
              {agente.blocos.map((b, i) => <BlocoEditor key={i} bloco={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PainelAgentes() {
  return (
    <div className="flex-1 overflow-y-auto sem-barra p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Agentes de IA</h2>
          <p className="text-sm text-gray-600 mt-1">
            Cada agente, o que ele enxerga (dados e memória) e o system prompt real. Os blocos do
            assistente principal são <b>editáveis</b> — a mudança é salva e usada pela IA na hora.
            Os prompts dos especialistas têm partes dinâmicas e aparecem como referência.
          </p>
        </div>
        {CATALOGO_AGENTES.map((a) => <CardAgente key={a.id} agente={a} />)}
      </div>
    </div>
  )
}
