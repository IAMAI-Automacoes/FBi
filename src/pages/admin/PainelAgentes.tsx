import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CATALOGO_AGENTES, COMO_FUNCIONA, AgenteInfo, BlocoPrompt } from '@/lib/ia/catalogo-agentes'
import { promptOverride, salvarPromptEditavel, placeholdersDe, dadoAtivo, salvarConfigObj } from '@/lib/ia/prompt-store'
import { configDoAgente, salvarConfigAgente, restaurarPadraoAgente } from '@/lib/ia/params'
import { Switch } from '@/components/ui/switch'
import {
  ModeloIA, listarModelos, adicionarModelo, ativarModelo, removerModelo,
} from '@/lib/queries/modelos-ia'
import { PainelMemorias } from '@/pages/admin/PainelMemorias'
import {
  Bot, ChevronRight, ArrowLeft, Database, Brain, Pencil, Save, RotateCcw, Lock, Loader2,
  Info, Cpu, Plus, Check, Trash2, Sliders, Server, MonitorSmartphone,
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
    // Protege as partes dinâmicas: todo placeholder do texto original precisa
    // continuar presente, senão o agente perde o dado da conversa e quebra.
    const obrigatorios = placeholdersDe(bloco.conteudo)
    const presentes = placeholdersDe(texto)
    const faltando = obrigatorios.filter((p) => !presentes.includes(p))
    if (faltando.length) {
      toast({
        title: 'Faltam campos obrigatórios',
        description: `Mantenha no texto: ${faltando.map((p) => `{${p}}`).join(', ')}`,
        variant: 'destructive',
      })
      return
    }
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

// ── Interruptores de dados do assistente principal ──────────────────────────
const DADOS_ASSISTENTE: { id: string; label: string }[] = [
  { id: 'perfil', label: 'Perfil do restaurante' },
  { id: 'perfil_notas', label: 'Notas pessoais do dono' },
  { id: 'kpis', label: 'Números do período (satisfação, volume)' },
  { id: 'categorias', label: 'Satisfação por categoria' },
  { id: 'garcons', label: 'Garçons cadastrados' },
  { id: 'insights', label: 'Insights ativos' },
  { id: 'acoes', label: 'Ações em aberto' },
  { id: 'feedbacks', label: 'Avaliações recentes dos clientes' },
  { id: 'memoria', label: 'Memória de longo prazo (anotações)' },
  { id: 'conhecimento', label: 'Materiais de treinamento (busca)' },
]

function ToggleDadosAssistente() {
  const { toast } = useToast()
  const [estado, setEstado] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (const d of DADOS_ASSISTENTE) o[d.id] = dadoAtivo('assistente_dados', d.id)
    return o
  })
  const [ocupado, setOcupado] = useState<string | null>(null)

  const alternar = async (id: string) => {
    const anterior = estado
    const novo = { ...estado, [id]: !estado[id] }
    setEstado(novo); setOcupado(id)
    try { await salvarConfigObj('assistente_dados', novo) }
    catch (e: any) { setEstado(anterior); toast({ title: 'Não consegui salvar', description: e.message, variant: 'destructive' }) }
    finally { setOcupado(null) }
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Dados que este agente recebe</p>
      <div className="rounded-lg border border-gray-200 divide-y">
        {DADOS_ASSISTENTE.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-gray-800">{d.label}</span>
            <Switch checked={estado[d.id] ?? true} disabled={ocupado === d.id} onCheckedChange={() => alternar(d.id)} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">Desligar um dado o tira do contexto que a IA recebe — vale para todos os restaurantes.</p>
    </div>
  )
}

// ── Parâmetros de inferência de um agente ───────────────────────────────────
/** Campos avançados: dependem do provider do modelo, então ficam recolhidos. */
const AVANCADOS: { id: string; label: string; dica: string }[] = [
  { id: 'top_k', label: 'top_k', dica: 'Limita a escolha às K palavras mais prováveis. O Gemini aceita.' },
  { id: 'min_p', label: 'min_p', dica: 'Corte por probabilidade mínima. O Gemini IGNORA este campo.' },
  { id: 'frequency_penalty', label: 'frequency_penalty', dica: 'Penaliza repetição de palavras (-2 a 2).' },
  { id: 'presence_penalty', label: 'presence_penalty', dica: 'Penaliza repetir assuntos já ditos (-2 a 2).' },
  { id: 'seed', label: 'seed', dica: 'Fixa a aleatoriedade para respostas reproduzíveis.' },
]

function EditorParams({ agente, modelos }: { agente: AgenteInfo; modelos: ModeloIA[] }) {
  const { toast } = useToast()
  const cfg = configDoAgente(agente.id)
  const [temperature, setTemperature] = useState(cfg?.temperature ?? agente.params.temperature ?? 0)
  const [maxTokens, setMaxTokens] = useState<string>(String(cfg?.max_tokens ?? agente.params.max_tokens ?? ''))
  const [topP, setTopP] = useState<string>(String(cfg?.top_p ?? agente.params.top_p ?? ''))
  const [modelo, setModelo] = useState<string>(cfg?.modelo ?? '')
  const [avancado, setAvancado] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const a of AVANCADOS) o[a.id] = String(cfg?.avancado?.[a.id] ?? '')
    return o
  })
  const [ativo, setAtivo] = useState(cfg?.ativo !== false)
  const [mostrarAvancado, setMostrarAvancado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const configurado = !!cfg

  // Temperatura alta num agente que precisa devolver JSON quebra o parse.
  const riscoJson = !!agente.params.json && temperature > 0.3

  const numero = (v: string): number | undefined => {
    const n = Number(v)
    return v.trim() && Number.isFinite(n) ? n : undefined
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const av: Record<string, number> = {}
      for (const a of AVANCADOS) {
        const n = numero(avancado[a.id])
        if (n !== undefined) av[a.id] = n
      }
      await salvarConfigAgente(agente.id, {
        modelo: modelo || null,
        temperature,
        max_tokens: numero(maxTokens),
        top_p: numero(topP),
        avancado: av,
        ativo,
      })
      toast({ title: 'Parâmetros salvos', description: 'Valem na próxima execução deste agente.' })
    } catch (e: any) {
      toast({ title: 'Não consegui salvar', description: e.message, variant: 'destructive' })
    } finally { setSalvando(false) }
  }

  const restaurar = async () => {
    setSalvando(true)
    try {
      await restaurarPadraoAgente(agente.id)
      setTemperature(agente.params.temperature ?? 0)
      setMaxTokens(String(agente.params.max_tokens ?? ''))
      setTopP(String(agente.params.top_p ?? ''))
      setModelo(''); setAtivo(true)
      setAvancado(Object.fromEntries(AVANCADOS.map((a) => [a.id, ''])))
      toast({ title: 'Padrão do código restaurado' })
    } catch (e: any) {
      toast({ title: 'Não consegui restaurar', description: e.message, variant: 'destructive' })
    } finally { setSalvando(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" /> Parâmetros de inferência
          {configurado && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">editado</span>}
        </p>
        {configurado && (
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-amber-700" onClick={restaurar} disabled={salvando}>
            <RotateCcw className="h-3 w-3" /> Restaurar padrão do código
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-3.5 space-y-3.5">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-[12.5px] font-medium text-gray-700">Temperatura</label>
            <span className="text-[12px] font-mono text-gray-500">{temperature.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={2} step={0.05} value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-[11px] text-gray-400 mt-0.5">0 = sempre a mesma resposta. Acima de 1, fica criativo e imprevisível.</p>
          {riscoJson && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1.5">
              Este agente precisa responder em JSON. Acima de 0,30 a resposta pode sair inválida e o agente falha.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12.5px] font-medium text-gray-700">Limite de tokens</label>
            <Input type="number" min={1} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)}
              placeholder={String(agente.params.max_tokens ?? 'padrão')} className="h-8 mt-1" />
            <p className="text-[11px] text-gray-400 mt-0.5">Afeta o custo e conta no crédito do restaurante.</p>
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-gray-700">top_p</label>
            <Input type="number" min={0} max={1} step={0.05} value={topP} onChange={(e) => setTopP(e.target.value)}
              placeholder="padrão do modelo" className="h-8 mt-1" />
            <p className="text-[11px] text-gray-400 mt-0.5">Alternativa à temperatura. Mexa em um dos dois, não nos dois.</p>
          </div>
        </div>

        <div>
          <label className="text-[12.5px] font-medium text-gray-700">Modelo deste agente</label>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)}
            className="w-full h-8 mt-1 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Usar o modelo global</option>
            {modelos.map((m) => <option key={m.id} value={m.modelo}>{m.nome} — {m.modelo}</option>)}
          </select>
        </div>

        <button type="button" onClick={() => setMostrarAvancado((v) => !v)}
          className="text-[12px] text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', mostrarAvancado && 'rotate-90')} />
          Avançado
        </button>
        {mostrarAvancado && (
          <div className="space-y-2.5 pt-1">
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Estes campos dependem do provedor do modelo. O que ele não suportar é simplesmente ignorado.
              Deixe em branco para não enviar.
            </p>
            {AVANCADOS.map((a) => (
              <div key={a.id} className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-[12px] font-mono text-gray-700">{a.label}</label>
                <div>
                  <Input type="number" step="any" value={avancado[a.id]} placeholder="não enviar"
                    onChange={(e) => setAvancado({ ...avancado, [a.id]: e.target.value })} className="h-7 text-xs" />
                  <p className="text-[10.5px] text-gray-400 mt-0.5">{a.dica}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {agente.desligavel && (
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-[12.5px] font-medium text-gray-700">Agente ativo</p>
              <p className="text-[11px] text-gray-400">Desligado, ele deixa de rodar e de gastar crédito.</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        )}
        {!agente.desligavel && (
          <p className="text-[11px] text-gray-400 border-t pt-3 flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Este agente não pode ser desligado: outros fluxos dependem dele.
          </p>
        )}

        <Button size="sm" className="h-8 gap-1.5" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar parâmetros
        </Button>
      </div>
    </div>
  )
}

// ── Detalhe de um agente (tela dedicada) ─────────────────────────────────────
function AgenteDetalhe({ agente, onVoltar, modelos }: { agente: AgenteInfo; onVoltar: () => void; modelos: ModeloIA[] }) {
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
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={cn(
              'text-[10.5px] font-medium rounded px-1.5 py-0.5 inline-flex items-center gap-1',
              agente.camada === 'servidor'
                ? 'text-indigo-700 bg-indigo-100'
                : 'text-teal-700 bg-teal-100',
            )}>
              {agente.camada === 'servidor' ? <Server className="h-2.5 w-2.5" /> : <MonitorSmartphone className="h-2.5 w-2.5" />}
              {agente.camada === 'servidor' ? 'Roda no servidor' : 'Roda no navegador'}
            </span>
            <code className="text-[10.5px] font-mono text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
              {agente.arquivo}
            </code>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {agente.camada === 'servidor'
              ? 'As alterações valem na próxima execução da edge function.'
              : 'As alterações valem quando a página for recarregada.'}
          </p>
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

      {agente.id === 'assistente' && <ToggleDadosAssistente />}

      <EditorParams agente={agente} modelos={modelos} />

      {agente.blocos.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-gray-700">System prompt</p>
          {agente.blocos.map((b, i) => <BlocoEditor key={i} bloco={b} />)}
        </div>
      )}
    </div>
  )
}

// ── Gestão de modelos do OpenRouter ──────────────────────────────────────────
function PainelModelos() {
  const { toast } = useToast()
  const [modelos, setModelos] = useState<ModeloIA[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState({ nome: '', modelo: '' })
  const [salvando, setSalvando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)

  const carregar = async () => {
    try { setModelos(await listarModelos()) } catch (e: any) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' })
    } finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [])

  const adicionar = async () => {
    if (!form.nome.trim() || !form.modelo.trim()) return
    setSalvando(true)
    try {
      await adicionarModelo(form)
      setForm({ nome: '', modelo: '' })
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
          Cadastre modelos do OpenRouter e ative um. Todos os agentes usam o modelo <b>ativo</b>,
          exceto os que tiverem um modelo próprio escolhido na tela do agente. Sem nenhum ativo,
          vale o padrão do ambiente. Só 1 fica ativo por vez.
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
        <Button className="gap-1.5" onClick={adicionar} disabled={salvando || !form.nome.trim() || !form.modelo.trim()}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
        </Button>
        <p className="text-[11px] text-gray-400">
          Pegue o ID do modelo em openrouter.ai. A chave da API fica num segredo do servidor
          (variável <code>OPENROUTER_API_KEY</code>), não no banco.
        </p>
      </div>
    </div>
  )
}

// ── Painel principal ─────────────────────────────────────────────────────────
type Vista = { t: 'lista' } | { t: 'agente'; id: string } | { t: 'modelo' } | { t: 'memoria' }

export function PainelAgentes() {
  const [vista, setVista] = useState<Vista>({ t: 'lista' })
  const [modelos, setModelos] = useState<ModeloIA[]>([])

  // Carregado no painel para o seletor "modelo deste agente" ter as opções.
  useEffect(() => {
    listarModelos().then(setModelos).catch(() => setModelos([]))
  }, [])

  if (vista.t === 'agente') {
    const agente = CATALOGO_AGENTES.find((a) => a.id === vista.id)!
    return (
      <div className="flex-1 overflow-y-auto sem-barra p-6">
        <AgenteDetalhe agente={agente} onVoltar={() => setVista({ t: 'lista' })} modelos={modelos} />
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
            memória, o system prompt real e os parâmetros de inferência.
          </p>
          <p className="text-[12px] text-gray-500 mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Criar e remover agente é mudança de código: um agente não é só um prompt, é também o
            ponto onde ele é chamado. Aqui você edita os que existem.
          </p>
        </div>

        <details className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <summary className="text-[13px] font-semibold text-gray-800 cursor-pointer select-none">
            {COMO_FUNCIONA.titulo}
          </summary>
          <p className="text-[12.5px] text-gray-600 leading-relaxed mt-2">{COMO_FUNCIONA.texto}</p>
          <code className="inline-block text-[10.5px] font-mono text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 mt-2">
            {COMO_FUNCIONA.arquivo}
          </code>
        </details>

        <div className="grid sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => setVista({ t: 'modelo' })}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Cpu className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900">Modelo de IA</p>
              <p className="text-[12px] text-gray-600 mt-0.5">Modelos do OpenRouter.</p>
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
                <p className="text-[14px] font-semibold text-gray-900 flex items-center gap-2">
                  {a.nome}
                  <span className={cn(
                    'text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0',
                    a.camada === 'servidor' ? 'text-indigo-700 bg-indigo-100' : 'text-teal-700 bg-teal-100',
                  )}>
                    {a.camada}
                  </span>
                </p>
                <p className="text-[12.5px] text-gray-600 mt-0.5 leading-snug line-clamp-2">{a.papel}</p>
                <code className="text-[10.5px] font-mono text-gray-400 mt-1 block truncate">{a.arquivo}</code>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
