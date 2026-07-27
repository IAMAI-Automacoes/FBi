import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CATALOGO_AGENTES, AgenteInfo, BlocoPrompt } from '@/lib/ia/catalogo-agentes'
import { promptOverride, salvarPromptEditavel } from '@/lib/ia/prompt-store'
import {
  ModeloIA, listarModelos, adicionarModelo, ativarModelo, removerModelo,
} from '@/lib/queries/modelos-ia'
import { PainelMemorias } from '@/pages/admin/PainelMemorias'
import {
  Bot, ChevronRight, ArrowLeft, Database, Brain, Pencil, Save, RotateCcw, Lock, Loader2,
  Info, Cpu, Plus, Check, Trash2, KeyRound,
} from 'lucide-react'

// ── Editor de um bloco de prompt ─────────────────────────────────────────────
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
    } finally { setSalvando(false) }
  }
  const restaurar = async () => {
    if (!bloco.chave) return
    setSalvando(true)
    try {
      await salvarPromptEditavel(bloco.chave, '')
      setTexto(bloco.conteudo)
      toast({ title: 'Padrão restaurado' })
      setEditando(false)
    } catch (e: any) {
      toast({ title: 'Não consegui restaurar', description: e.message, variant: 'destructive' })
    } finally { setSalvando(false) }
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 bg-gray-50/70 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
            {bloco.titulo}
            {bloco.editavel
              ? sobrescrito && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">editado</span>
              : <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> referência</span>}
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
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16}
              className="text-[12px] font-mono leading-relaxed resize-y" />
            <div className="flex items-center gap-2 mt-2.5">
              <Button size="sm" className="h-8 gap-1.5" onClick={salvar} disabled={salvando || !mudou}>
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setTexto(valorAtual); setEditando(false) }}>Cancelar</Button>
              {sobrescrito && (
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-amber-700 hover:text-amber-800 ml-auto" onClick={restaurar} disabled={salvando}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
                </Button>
              )}
            </div>
          </>
        ) : (
          <pre className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-gray-700 bg-gray-50/50 rounded-md p-3 max-h-80 overflow-y-auto sem-barra">
            {valorAtual}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── Detalhe de um agente (tela dedicada) ─────────────────────────────────────
function AgenteDetalhe({ agente, onVoltar }: { agente: AgenteInfo; onVoltar: () => void }) {
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Voltar aos agentes
      </button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{agente.nome}</h2>
          <p className="text-[13px] text-gray-600 mt-1 leading-snug">{agente.papel}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-3.5">
          <p className="text-[11px] font-semibold text-violet-800 flex items-center gap-1.5 mb-1.5">
            <Brain className="h-3.5 w-3.5" /> Memória
          </p>
          <p className="text-[12.5px] text-violet-900/80 leading-snug">{agente.memoria}</p>
        </div>
        <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3.5">
          <p className="text-[11px] font-semibold text-sky-800 flex items-center gap-1.5 mb-1.5">
            <Database className="h-3.5 w-3.5" /> Dados e memórias que ele acessa
          </p>
          <ul className="space-y-1">
            {agente.acessos.map((a, i) => (
              <li key={i} className="text-[12.5px] text-sky-900/80 leading-snug flex gap-1.5">
                <span className="text-sky-400">•</span> {a}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {agente.blocos.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-gray-700">System prompt</p>
          {agente.blocos.map((b, i) => <BlocoEditor key={i} bloco={b} />)}
        </div>
      ) : (
        <p className="text-[13px] text-gray-500">Este componente é código puro (sem IA), então não tem system prompt.</p>
      )}
    </div>
  )
}

// ── Gestão de modelos do OpenRouter ──────────────────────────────────────────
function mascararChave(k: string) {
  if (k.length <= 8) return '••••'
  return `${k.slice(0, 5)}…${k.slice(-4)}`
}

function PainelModelos() {
  const { toast } = useToast()
  const [modelos, setModelos] = useState<ModeloIA[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState({ nome: '', modelo: '', api_key: '' })
  const [salvando, setSalvando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)

  const carregar = async () => {
    try { setModelos(await listarModelos()) } catch (e: any) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' })
    } finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [])

  const adicionar = async () => {
    if (!form.nome.trim() || !form.modelo.trim() || !form.api_key.trim()) return
    setSalvando(true)
    try {
      await adicionarModelo(form)
      setForm({ nome: '', modelo: '', api_key: '' })
      toast({ title: 'Modelo adicionado' })
      await carregar()
    } catch (e: any) {
      toast({ title: 'Não consegui adicionar', description: e.message, variant: 'destructive' })
    } finally { setSalvando(false) }
  }
  const ativar = async (id: string) => {
    setOcupadoId(id)
    try { await ativarModelo(id); await carregar(); toast({ title: 'Modelo ativado', description: 'A IA passa a usar este modelo.' }) }
    catch (e: any) { toast({ title: 'Não consegui ativar', description: e.message, variant: 'destructive' }) }
    finally { setOcupadoId(null) }
  }
  const remover = async (id: string) => {
    setOcupadoId(id)
    try { await removerModelo(id); await carregar() }
    catch (e: any) { toast({ title: 'Não consegui remover', description: e.message, variant: 'destructive' }) }
    finally { setOcupadoId(null) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> Modelo de IA (OpenRouter)</h2>
        <p className="text-sm text-gray-600 mt-1">
          Cadastre modelos do OpenRouter e ative um. A IA (edge function <code>chamar-ia</code>) usa o
          modelo <b>ativo</b>; sem nenhum ativo, usa o padrão do ambiente. Só 1 fica ativo por vez.
        </p>
      </div>

      {/* Lista */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y">
        {carregando ? (
          <p className="p-4 text-sm text-gray-400">Carregando…</p>
        ) : modelos.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Nenhum modelo cadastrado ainda.</p>
        ) : modelos.map((m) => (
          <div key={m.id} className={cn('flex items-center gap-3 px-4 py-3', m.ativo && 'bg-emerald-50/40')}>
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', m.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400')}>
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900 flex items-center gap-2">
                {m.nome}
                {m.ativo && <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">ativo</span>}
              </p>
              <p className="text-[12px] text-gray-500 font-mono truncate">{m.modelo}</p>
              <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><KeyRound className="h-3 w-3" /> {mascararChave(m.api_key)}</p>
            </div>
            {!m.ativo && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={() => ativar(m.id)} disabled={ocupadoId === m.id}>
                {ocupadoId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ativar
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={() => remover(m.id)} disabled={ocupadoId === m.id}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Adicionar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5"><Plus className="h-4 w-4" /> Novo modelo</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Nome (como você quer ver)</label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Gemini 2.0 Flash" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">ID do modelo no OpenRouter</label>
            <Input value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} placeholder="google/gemini-2.0-flash-exp:free" className="font-mono text-[13px]" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Chave da API (OpenRouter)</label>
          <Input type="password" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder="sk-or-v1-..." className="font-mono text-[13px]" />
        </div>
        <Button className="gap-1.5" onClick={adicionar} disabled={salvando || !form.nome.trim() || !form.modelo.trim() || !form.api_key.trim()}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
        </Button>
        <p className="text-[11px] text-gray-400">
          Pegue o ID e a chave em openrouter.ai. A chave fica visível só para administradores.
        </p>
      </div>
    </div>
  )
}

// ── Painel principal ─────────────────────────────────────────────────────────
type Vista = { t: 'lista' } | { t: 'agente'; id: string } | { t: 'modelo' } | { t: 'memoria' }

export function PainelAgentes() {
  const [vista, setVista] = useState<Vista>({ t: 'lista' })

  if (vista.t === 'agente') {
    const agente = CATALOGO_AGENTES.find((a) => a.id === vista.id)!
    return (
      <div className="flex-1 overflow-y-auto sem-barra p-6">
        <AgenteDetalhe agente={agente} onVoltar={() => setVista({ t: 'lista' })} />
      </div>
    )
  }
  if (vista.t === 'modelo' || vista.t === 'memoria') {
    return (
      <div className="flex-1 overflow-y-auto sem-barra p-6">
        <button onClick={() => setVista({ t: 'lista' })} className="max-w-3xl mx-auto mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {vista.t === 'modelo' ? <PainelModelos /> : <PainelMemorias />}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto sem-barra p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Agentes de IA</h2>
          <p className="text-sm text-gray-600 mt-1">
            Todos os agentes do sistema. Clique num agente para ver e editar o que ele acessa, sua
            memória e o system prompt real.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => setVista({ t: 'modelo' })}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Cpu className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900">Modelo de IA</p>
              <p className="text-[12px] text-gray-600 mt-0.5">Modelos e chaves do OpenRouter.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
          <button
            onClick={() => setVista({ t: 'memoria' })}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Brain className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900">Memória da IA</p>
              <p className="text-[12px] text-gray-600 mt-0.5">Ver e editar o que a IA aprendeu.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        </div>

        <div className="space-y-2.5">
          {CATALOGO_AGENTES.map((a) => (
            <button
              key={a.id}
              onClick={() => setVista({ t: 'agente', id: a.id })}
              className="w-full flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors"
            >
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-gray-900">{a.nome}</p>
                <p className="text-[12.5px] text-gray-600 mt-0.5 leading-snug line-clamp-2">{a.papel}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
