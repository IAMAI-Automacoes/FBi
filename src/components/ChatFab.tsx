import {
  MessageCircle,
  Send,
  Plus,
  RefreshCw,
  History,
  ArrowLeft,
  PlusCircle,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  ImageIcon,
  X,
  Globe,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  FileText,
  Zap,
  HelpCircle,
  Sparkles,
  ArrowDown,
  Reply,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { FormattedMessage, parseInline, LINK_ESCURO } from '@/lib/chat-utils'
import { useChat, AnexoMensagem } from '@/hooks/use-chat'
import {
  AcaoAgente, FormularioIA as TipoFormulario, RegistroAcao,
  ACOES_DESTRUTIVAS, executarAcao, reverterAcao,
} from '@/lib/queries/agente-ia'
import { ConfirmacaoAcao } from '@/components/chat/ConfirmacaoAcao'
import { FormularioInline } from '@/components/chat/FormularioInline'
import { montarAcao, montarInsight } from '@/lib/ia/agentes'
import { VisualizadorAnexo, AnexoVisivel } from '@/components/chat/VisualizadorAnexo'
import { extrairTextoDePdf } from '@/lib/queries/conhecimento'
import { buscarMemoria, FatoMemoria } from '@/lib/queries/memoria-assistente'
import { buscarKpis } from '@/lib/queries/visao-geral'
import { buscarEstatisticasRelatorio } from '@/lib/queries/relatorios'
import { supabase } from '@/lib/supabase/client'
import {
  PastaChat,
  buscarConversas,
  buscarPastas,
  salvarNomeConversa,
  alternarFixada,
  moverConversaParaPasta,
  excluirConversa,
  criarPasta,
  renomearPasta,
  excluirPasta,
  migrarNomesLocaisParaBanco,
} from '@/lib/queries/conversas-chat'
import { buscarFeedbacks } from '@/lib/queries/feedbacks'
import type { Insight } from '@/lib/tipos/insight'
import { useAuth } from '@/hooks/use-auth'
import { useIsMobile } from '@/hooks/use-mobile'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const SUGGESTIONS = [
  'Como estão as avaliações do almoço?',
  'Resumo das reclamações',
  'Elogios recentes à equipe',
]

// Os nomes e as fixações das conversas moraram no localStorage até a migration
// `20260813000000_conversas_e_pastas_chat`. Agora vivem na tabela
// `conversas_chat` (ver src/lib/queries/conversas-chat.ts), então sincronizam
// entre aparelhos e sobrevivem a uma limpeza de cache.

/** Texto do botão que abre a confirmação, por tipo de alteração. */
const ROTULO_ACAO: Record<string, string> = {
  criar_acao: 'Criar esta ação',
  editar_acao: 'Editar a ação',
  excluir_acao: 'Excluir a ação',
  criar_insight: 'Criar este insight',
  editar_insight: 'Editar o insight',
  excluir_insight: 'Arquivar o insight',
  atualizar_config: 'Alterar a configuração',
  criar_anotacao: 'Guardar esta anotação',
  excluir_anotacao: 'Apagar a anotação',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface AnexoPendente {
  id: string
  nome: string
  tipo: 'imagem' | 'pdf' | 'texto'
  /** URL pública (imagem e PDF) — usada para exibir e para a IA ver a imagem */
  url?: string
  /** Texto extraído (PDF e arquivos de texto) — vai como contexto da conversa */
  texto?: string
  previewLocal?: string
  enviando: boolean
}

interface SessaoItem {
  id: string
  preview: string
  date: Date
  pinned: boolean
  nome?: string
  /** `null` = conversa na raiz da lista (fora de qualquer pasta). */
  pastaId: string | null
}

/** Um bloco do histórico: uma pasta com suas conversas, ou um período. */
type GrupoHistorico =
  | { tipo: 'pasta'; pasta: PastaChat; items: SessaoItem[] }
  | { tipo: 'data'; label: string; items: SessaoItem[] }

/** Botão que revela as fontes usadas na pesquisa. */
function Fontes({ fontes }: { fontes: { url: string; titulo: string }[] }) {
  const [aberto, setAberto] = useState(false)
  const dominio = (u: string) => {
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u }
  }
  return (
    <div className="mt-2 pt-2 border-t border-gray-200/70">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        <Globe className="h-3 w-3" />
        {fontes.length} {fontes.length === 1 ? 'fonte' : 'fontes'}
        <ChevronDown className={cn('h-3 w-3 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="mt-1.5 flex flex-col gap-1">
          {fontes.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 hover:underline"
              title={f.url}
            >
              <span className="text-gray-400">{dominio(f.url)}</span> · {f.titulo || f.url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

const LARGURA_CHAT = 380 // largura fixa do chat no desktop (px)

export function ChatFab({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { pathname } = useLocation()
  const isMobile = useIsMobile()

  const { user, usuario, refetchUsuario } = useAuth()
  const { mascote, refetch: refetchConfig } = useRestauranteConfig()
  const mascoteNome = mascote.nome
  // O return condicional fica no fim do componente: sair antes dos hooks
  // muda a quantidade de hooks entre renders e quebra o React.
  const ocultar = pathname === '/sugestoes'
  const { toast } = useToast()
  const {
    messages, loading, buscandoWeb, sessaoId, enviar, adicionarMensagemUsuario,
    removerUltimaMensagem, excluirMensagem, rebobinarPara, anexarProposta,
    marcarPropostaAplicada, desmarcarPropostaPorRegistro, anexarRegistro, removerRegistro,
    registrarTroca, setLoading, carregarHistorico, novaConversa, mudarSessao,
    uso, creditoEsgotado,
  } = useChat('global')

  const [message, setMessage] = useState('')
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [sessoes, setSessoes] = useState<SessaoItem[]>([])
  const [loadingSessoes, setLoadingSessoes] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  // ── Pastas do histórico ──
  const [pastas, setPastas] = useState<PastaChat[]>([])
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [novaPastaNome, setNovaPastaNome] = useState('')
  const [renomeandoPastaId, setRenomeandoPastaId] = useState<string | null>(null)
  const [nomePastaEdit, setNomePastaEdit] = useState('')
  const [excluirPastaId, setExcluirPastaId] = useState<string | null>(null)
  const [moverSessaoId, setMoverSessaoId] = useState<string | null>(null)
  // Insight em discussão: entra no contexto de TODAS as mensagens, não só na
  // primeira, para a IA não perder o assunto no meio da conversa.
  const [contextoInsight, setContextoInsight] = useState<{
    insight: Insight
    feedbacksRelacionados: unknown[]
  } | null>(null)
  // Vários anexos por mensagem, de tipos misturados
  const [anexos, setAnexos] = useState<AnexoPendente[]>([])
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  const [anexoAberto, setAnexoAberto] = useState<AnexoVisivel | null>(null)
  // Mensagem citada: o trecho vai como contexto para a IA saber do que se trata
  const [citacao, setCitacao] = useState<{ autor: 'user' | 'assistant'; texto: string; uid: string } | null>(null)
  const [editandoUid, setEditandoUid] = useState<string | null>(null)
  const [textoEdicao, setTextoEdicao] = useState('')
  const [destacada, setDestacada] = useState<string | null>(null)
  // Guarda o elemento de cada mensagem para poder rolar ate ela
  const refsMensagens = useRef<Record<string, HTMLDivElement | null>>({})
  const memoriaRef = useRef<FatoMemoria[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const areaRolagemRef = useRef<HTMLDivElement>(null)
  const [longeDoFim, setLongeDoFim] = useState(false)

  const [hasError, setHasError] = useState(false)
  const [failedMessage, setFailedMessage] = useState('')
  // Fluxo do agente
  // Proposta aberta no popup: guarda a ação e de qual mensagem ela veio
  const [popup, setPopup] = useState<{ acao: AcaoAgente; uid: string } | null>(null)
  const [formularioPendente, setFormularioPendente] = useState<(TipoFormulario & { acao_pretendida?: string }) | null>(null)
  // Ações já aplicadas nesta conversa: ficam marcadas abaixo do chat
  const [registrosFeitos, setRegistrosFeitos] = useState<RegistroAcao[]>([])
  // Enquanto um popup está aberto, o Sheet do chat não pode fechar
  const temPopupAberto = !!popup || !!formularioPendente
  const [modoAcao, setModoAcao] = useState<'perguntar' | 'automatico'>('perguntar')
  // ref espelha o modo: handleSend captura o state pelo closure e leria o valor
  // antigo na primeira mensagem depois que o modo é carregado do banco
  const modoAcaoRef = useRef<'perguntar' | 'automatico'>('perguntar')

  useEffect(() => {
    if (open && user) carregarHistorico(sessaoId)
  }, [open, user, sessaoId, carregarHistorico])

  // Carrega o modo (Perguntar antes x Fazer sozinha) do banco assim que o
  // restaurante é conhecido. Sem isto, o botão começava sempre em "Perguntar
  // antes" (padrão) e só sincronizava no 1º envio — então uma conta em
  // "automático" no banco editava direto enquanto o botão ainda dizia "perguntar".
  useEffect(() => {
    const rid = usuario?.restaurante_id
    if (!rid) return
    let vivo = true
    void (async () => {
      const { data } = await supabase
        .from('restaurantes')
        .select('ia_modo_acao')
        .eq('id', rid)
        .single()
      if (!vivo || !data) return
      const m = (data as any).ia_modo_acao === 'automatico' ? 'automatico' : 'perguntar'
      modoAcaoRef.current = m
      setModoAcao(m)
    })()
    return () => { vivo = false }
  }, [usuario?.restaurante_id])

  const irParaOFim = useCallback((suave = true) => {
    scrollRef.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto' })
    setLongeDoFim(false)
  }, [])

  useEffect(() => {
    if (!longeDoFim) irParaOFim()
  }, [messages, loading, hasError, longeDoFim, irParaOFim])

  // Ao abrir (ou trocar de conversa), começa sempre no fim
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => irParaOFim(false), 80)
      return () => clearTimeout(t)
    }
  }, [open, view, sessaoId, irParaOFim])

  /** Rola ate a mensagem citada e a destaca por 2 segundos. */
  const irParaMensagem = (uid: string) => {
    const el = refsMensagens.current[uid]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDestacada(uid)
    setTimeout(() => setDestacada((atual) => (atual === uid ? null : atual)), 2000)
  }

  const salvarEdicao = async () => {
    if (!editandoUid || !textoEdicao.trim()) return
    const uid = editandoUid
    const novo = textoEdicao.trim()
    setEditandoUid(null)
    setTextoEdicao('')
    setHasError(false)
    setFormularioPendente(null)

    // Rebobina: esquece as mensagens seguintes E as anotações aprendidas dali em
    // diante. Depois refaz o contexto (memória já sem o que foi esquecido) e
    // reenvia o novo texto — como se a conversa continuasse a partir da edição.
    const ok = await rebobinarPara(uid, novo, usuario?.restaurante_id ?? null)
    if (!ok) return

    const contexto: Record<string, any> = await fetchContexto()
    const result = await enviar(novo, contexto, undefined, undefined, {
      jaExibida: true,
      memoria: memoriaRef.current,
      modoAcao: modoAcaoRef.current,
    })
    await tratarResultado(result, novo)
  }

  const aoRolar = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setLongeDoFim(el.scrollHeight - el.clientHeight - el.scrollTop > 120)
  }

  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.focus()
  }, [renamingId])

  // Abre o chat. Se vier um insight no evento ("Discutir com IA"), começa uma
  // conversa nova já com o insight e os feedbacks que o originaram no contexto.
  useEffect(() => {
    const handler = (e: Event) => {
      onOpenChange(true)
      const insight = (e as CustomEvent<{ insight?: Insight }>).detail?.insight
      if (!insight) return

      novaConversa()
      setView('chat')
      setHasError(false)
      setFailedMessage('')
      setAnexos([])

      void (async () => {
        let feedbacksRelacionados: unknown[] = []
        const ids = insight.feedback_ids ?? []
        if (ids.length > 0) {
          try {
            const { feedbacks } = await buscarFeedbacks(
              { periodo: 'all', sentimento: 'all', categorias: [], busca: '', ordenacao: 'recent', ids },
              30,
              0,
            )
            feedbacksRelacionados = feedbacks
          } catch {
            // Sem os feedbacks a conversa ainda é útil: a IA fica com título,
            // descrição e sugestão do insight.
          }
        }

        const contextoDoInsight = { insight, feedbacksRelacionados }
        setContextoInsight(contextoDoInsight)

        const contexto = { ...(await fetchContexto()), ...contextoDoInsight }
        const texto = `Vamos discutir o insight: "${insight.titulo}".`
        const result = await enviar(texto, contexto, undefined, undefined, {
          memoria: memoriaRef.current,
          modoAcao: modoAcaoRef.current,
        })
        await tratarResultado(result, texto)
      })()
    }
    document.addEventListener('open-ai-chat', handler)
    return () => document.removeEventListener('open-ai-chat', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenChange])

  // ── History fetch ──────────────────────────────────────────────────────────

  const fetchSessoes = useCallback(async () => {
    if (!user) return
    const restauranteId = usuario?.restaurante_id
    setLoadingSessoes(true)
    try {
      // As mensagens seguem sendo a única fonte de preview e data; os metadados
      // (nome, fixada, pasta) vêm de `conversas_chat` e são juntados aqui.
      const [{ data }, metadados, listaPastas] = await Promise.all([
        supabase
          .from('mensagens_chat')
          .select('sessao_id, created_at, mensagem, papel')
          .eq('usuario_id', user.id)
          .eq('papel', 'usuario')
          .order('created_at', { ascending: false }),
        restauranteId ? buscarConversas(restauranteId) : Promise.resolve([]),
        restauranteId ? buscarPastas(restauranteId) : Promise.resolve([]),
      ])

      setPastas(listaPastas)
      if (!data) return

      const previewMap = new Map<string, string>()
      const dateMap = new Map<string, Date>()

      for (const msg of data) {
        if (!dateMap.has(msg.sessao_id)) dateMap.set(msg.sessao_id, new Date(msg.created_at))
        previewMap.set(msg.sessao_id, msg.mensagem)
      }

      const metaPorSessao = new Map(metadados.map((c) => [c.sessao_id, c]))

      const result = Array.from(dateMap.entries())
        .sort(([, a], [, b]) => b.getTime() - a.getTime())
        .map(([id, date]) => {
          const meta = metaPorSessao.get(id)
          return {
            id,
            preview: previewMap.get(id)?.slice(0, 80) || '',
            date,
            pinned: meta?.fixada ?? false,
            nome: meta?.titulo ?? undefined,
            pastaId: meta?.pasta_id ?? null,
          }
        })

      setSessoes(result)
    } finally {
      setLoadingSessoes(false)
    }
  }, [user, usuario?.restaurante_id])

  // Sobe uma única vez os nomes/fixações que estavam no localStorage.
  useEffect(() => {
    const rid = usuario?.restaurante_id
    if (!rid) return
    void migrarNomesLocaisParaBanco(rid)
  }, [usuario?.restaurante_id])

  // ── Grouped sessions ───────────────────────────────────────────────────────

  const groupedSessoes = useMemo<GrupoHistorico[]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    const grupos: GrupoHistorico[] = []

    // As pastas vêm primeiro e aparecem mesmo vazias — senão não dá para
    // arrastar a primeira conversa para dentro de uma pasta recém-criada.
    for (const pasta of pastas) {
      grupos.push({
        tipo: 'pasta',
        pasta,
        items: sessoes.filter((s) => s.pastaId === pasta.id),
      })
    }

    const pinned: SessaoItem[] = []
    const todays: SessaoItem[] = []
    const yesterdays: SessaoItem[] = []
    const thisWeek: SessaoItem[] = []
    const older: SessaoItem[] = []

    // Só as conversas fora de pasta entram nos períodos.
    for (const s of sessoes) {
      if (s.pastaId) continue
      if (s.pinned) { pinned.push(s); continue }
      const d = new Date(s.date); d.setHours(0, 0, 0, 0)
      if (d.getTime() === today.getTime()) todays.push(s)
      else if (d.getTime() === yesterday.getTime()) yesterdays.push(s)
      else if (d >= weekAgo) thisWeek.push(s)
      else older.push(s)
    }

    if (pinned.length) grupos.push({ tipo: 'data', label: 'Fixadas', items: pinned })
    if (todays.length) grupos.push({ tipo: 'data', label: 'Hoje', items: todays })
    if (yesterdays.length) grupos.push({ tipo: 'data', label: 'Ontem', items: yesterdays })
    if (thisWeek.length) grupos.push({ tipo: 'data', label: 'Esta semana', items: thisWeek })
    if (older.length) grupos.push({ tipo: 'data', label: 'Mais antigas', items: older })
    return grupos
  }, [sessoes, pastas])

  // ── History actions ────────────────────────────────────────────────────────

  const handleOpenHistory = () => {
    fetchSessoes()
    setView('history')
    setRenamingId(null)
    setDeleteConfirmId(null)
  }

  const handleSelectSessao = async (id: string) => {
    if (renamingId === id) return
    await mudarSessao(id)
    setView('chat')
    setHasError(false)
    setFailedMessage('')
    // O insight em discussão pertence à conversa que o abriu; ao trocar de
    // conversa ele não pode continuar no contexto.
    setContextoInsight(null)
  }

  const handleNovaConversa = () => {
    novaConversa()
    setView('chat')
    setHasError(false)
    setFailedMessage('')
    setFormularioPendente(null)
    setAnexos([])
    setContextoInsight(null)
  }

  const handleTogglePin = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const rid = usuario?.restaurante_id
    if (!rid) return
    const atual = sessoes.find((s) => s.id === id)?.pinned ?? false
    // Otimista: inverte na hora e volta atrás se o banco recusar.
    setSessoes((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !atual } : s)))
    try {
      await alternarFixada(rid, id, !atual)
    } catch {
      setSessoes((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: atual } : s)))
      toast({ title: 'Erro ao fixar conversa', variant: 'destructive' })
    }
  }

  const handleStartRename = (e: React.MouseEvent, s: SessaoItem) => {
    e.stopPropagation()
    setDeleteConfirmId(null)
    setRenameValue(s.nome || s.preview)
    setRenamingId(s.id)
  }

  const handleSaveRename = async (id: string) => {
    const rid = usuario?.restaurante_id
    const novo = renameValue.trim()
    setRenamingId(null)
    if (!rid) return
    setSessoes((prev) => prev.map((s) => (s.id === id ? { ...s, nome: novo || undefined } : s)))
    try {
      await salvarNomeConversa(rid, id, novo)
    } catch {
      toast({ title: 'Erro ao renomear conversa', variant: 'destructive' })
      fetchSessoes()
    }
  }

  const handleDeleteRequest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRenamingId(null)
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = async (id: string) => {
    const rid = usuario?.restaurante_id
    if (!rid) return
    try {
      await excluirConversa(rid, id)

      setSessoes((prev) => prev.filter((s) => s.id !== id))
      // Excluir a conversa aberta não deve jogar o dono para um chat novo:
      // ele continua no histórico, escolhendo para onde ir.
      if (id === sessaoId) {
        novaConversa()
        setView('history')
      }
      toast({ title: 'Conversa excluída' })
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' })
    }
    setDeleteConfirmId(null)
  }

  // ── Pastas ─────────────────────────────────────────────────────────────────

  const handleCriarPasta = async () => {
    const rid = usuario?.restaurante_id
    const nome = novaPastaNome.trim()
    if (!rid || !nome) { setCriandoPasta(false); setNovaPastaNome(''); return }
    try {
      const pasta = await criarPasta(rid, nome)
      setPastas((prev) => [...prev, pasta])
      setExpandidas((prev) => new Set(prev).add(pasta.id))
    } catch {
      toast({ title: 'Erro ao criar pasta', variant: 'destructive' })
    }
    setCriandoPasta(false)
    setNovaPastaNome('')
  }

  const handleSalvarNomePasta = async (pastaId: string) => {
    const nome = nomePastaEdit.trim()
    setRenomeandoPastaId(null)
    if (!nome) return
    setPastas((prev) => prev.map((p) => (p.id === pastaId ? { ...p, nome } : p)))
    try {
      await renomearPasta(pastaId, nome)
    } catch {
      toast({ title: 'Erro ao renomear pasta', variant: 'destructive' })
      fetchSessoes()
    }
  }

  const handleExcluirPasta = async (pastaId: string) => {
    setExcluirPastaId(null)
    try {
      await excluirPasta(pastaId)
      setPastas((prev) => prev.filter((p) => p.id !== pastaId))
      // As conversas não são apagadas: o FK usa `on delete set null`, então
      // voltam para a raiz da lista.
      setSessoes((prev) =>
        prev.map((s) => (s.pastaId === pastaId ? { ...s, pastaId: null } : s)),
      )
      toast({ title: 'Pasta excluída', description: 'As conversas voltaram para a lista.' })
    } catch {
      toast({ title: 'Erro ao excluir pasta', variant: 'destructive' })
    }
  }

  const handleMoverParaPasta = async (sessaoIdAlvo: string, pastaId: string | null) => {
    const rid = usuario?.restaurante_id
    setMoverSessaoId(null)
    if (!rid) return
    const anterior = sessoes.find((s) => s.id === sessaoIdAlvo)?.pastaId ?? null
    setSessoes((prev) =>
      prev.map((s) => (s.id === sessaoIdAlvo ? { ...s, pastaId } : s)),
    )
    if (pastaId) setExpandidas((prev) => new Set(prev).add(pastaId))
    try {
      await moverConversaParaPasta(rid, sessaoIdAlvo, pastaId)
    } catch {
      setSessoes((prev) =>
        prev.map((s) => (s.id === sessaoIdAlvo ? { ...s, pastaId: anterior } : s)),
      )
      toast({ title: 'Erro ao mover conversa', variant: 'destructive' })
    }
  }

  const alternarExpansao = (pastaId: string) => {
    setExpandidas((prev) => {
      const novo = new Set(prev)
      if (novo.has(pastaId)) novo.delete(pastaId)
      else novo.add(pastaId)
      return novo
    })
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  const TEXTO_ACEITO = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
  const ACCEPT = 'image/*,application/pdf,.txt,.md,.csv,.json'

  /**
   * Envia um arquivo ao bucket e devolve a URL pública.
   * O contentType é obrigatório: sem ele o Storage serve como text/plain e o
   * navegador se recusa a exibir o PDF.
   */
  const subirArquivo = async (file: File) => {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const porExtensao: Record<string, string> = {
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
      csv: 'text/csv', json: 'application/json',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp',
    }
    const contentType = file.type || porExtensao[ext] || 'application/octet-stream'
    const caminho = `${user?.id ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { error } = await supabase.storage
      .from('chat-imagens')
      .upload(caminho, file, { upsert: true, contentType })
    if (error) throw error
    return supabase.storage.from('chat-imagens').getPublicUrl(caminho).data.publicUrl
  }

  /** Aceita vários arquivos de uma vez, de tipos misturados. */
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files || [])
    e.target.value = ''
    if (!arquivos.length) return

    setEnviandoImagem(true)
    for (const file of arquivos) {
      const ehImagem = file.type.startsWith('image/')
      const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const ehTexto = TEXTO_ACEITO.includes(file.type) || /\.(txt|md|csv|json)$/i.test(file.name)

      if (!ehImagem && !ehPdf && !ehTexto) {
        toast({
          title: `"${file.name}" não é suportado`,
          description: 'Envie imagem, PDF ou arquivo de texto (.txt, .md, .csv, .json).',
          variant: 'destructive',
        })
        continue
      }

      const limite = ehImagem ? 5 : 15
      if (file.size > limite * 1024 * 1024) {
        toast({ title: `"${file.name}" é muito grande`, description: `Máximo ${limite} MB`, variant: 'destructive' })
        continue
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const tipo: AnexoPendente['tipo'] = ehImagem ? 'imagem' : ehPdf ? 'pdf' : 'texto'
      const previewLocal = ehImagem ? URL.createObjectURL(file) : undefined

      setAnexos((p) => [...p, { id, nome: file.name, tipo, previewLocal, enviando: true }])

      try {
        let url: string | undefined
        let texto: string | undefined

        if (ehImagem) {
          url = await subirArquivo(file)
        } else if (ehPdf) {
          // sobe para poder visualizar no chat e extrai o texto para a IA
          ;[url, texto] = await Promise.all([subirArquivo(file), extrairTextoDePdf(file)])
          if (!texto || texto.trim().length < 20) {
            texto = ''
            toast({
              title: `Não consegui ler o texto de "${file.name}"`,
              description: 'Você ainda pode visualizá-lo, mas se for digitalizado a IA não lê o conteúdo.',
            })
          }
        } else {
          texto = await file.text()
        }

        setAnexos((p) => p.map((a) => (a.id === id ? { ...a, url, texto, enviando: false } : a)))
      } catch (err: any) {
        toast({ title: `Erro em "${file.name}"`, description: err.message, variant: 'destructive' })
        setAnexos((p) => p.filter((a) => a.id !== id))
      }
    }
    setEnviandoImagem(false)
  }

  const removerAnexo = (id: string) =>
    setAnexos((p) => {
      const alvo = p.find((a) => a.id === id)
      if (alvo?.previewLocal) URL.revokeObjectURL(alvo.previewLocal)
      return p.filter((a) => a.id !== id)
    })

  const abrirAnexo = (a: { nome: string; tipo: string; url?: string; texto?: string }) => {
    if (a.tipo === 'texto' && !a.texto) return
    if (a.tipo !== 'texto' && !a.url) return
    setAnexoAberto({ nome: a.nome, tipo: a.tipo as AnexoVisivel['tipo'], url: a.url, texto: a.texto })
  }

  /** Reúne, de forma organizada, tudo que a IA precisa saber para responder. */
  const fetchContexto = async () => {
    if (!user) return {}
    const rId = usuario?.restaurante_id ?? null
    const vazio = Promise.resolve({ data: [] as any[] })

    const [feedbacksRes, insightsRes, acoesRes, garconsRes, configRes, kpis, estatisticas, memoria] =
      await Promise.all([
        rId
          ? supabase
              .from('feedbacks_restaurante')
              .select('created_at, categoria, sentimento, texto_original, resumo')
              .eq('restaurante_id', rId) // antes buscava sem filtrar por restaurante
              .order('created_at', { ascending: false })
              .limit(25)
          : vazio,
        // o id é obrigatório: sem ele o agente não consegue editar nem excluir
        rId
          ? supabase.from('insights').select('id, titulo, descricao, prioridade, categoria')
              .eq('ativo', true).eq('restaurante_id', rId).limit(10)
          : vazio,
        rId
          ? supabase.from('acoes_operacionais')
              .select('id, titulo_acao, status, prioridade, categoria')
              .eq('restaurante_id', rId) // antes buscava de todos os restaurantes
              .neq('status', 'CONCLUIDO').limit(10)
          : vazio,
        rId ? supabase.from('garcons').select('nome_garcon').eq('restaurante_id', rId).eq('ativo', true) : vazio,
        rId
          ? supabase.from('restaurantes')
              .select('nome_restaurante, detalhes, mascote_config, perfil_restaurante, tipo_culinaria, numero_mesas, ia_modo_acao')
              .eq('id', rId).single()
          : Promise.resolve({ data: null as any }),
        buscarKpis(rId, '30d').catch(() => null),
        buscarEstatisticasRelatorio(rId, '30d').catch(() => null),
        buscarMemoria(rId),
      ])

    memoriaRef.current = memoria
    // NÃO sincronizamos o modo aqui: o toggle (alternarModo) e a carga na montagem
    // são a fonte única. Sobrescrever a cada envio fazia o comportamento divergir
    // do botão quando a gravação do toggle no banco falhava — a narração vinha de
    // "perguntar" mesmo com o botão em "Fazer sozinha".

    const cfg = configRes.data as any
    // Campos de PESSOA (nome/perfil_notas) vêm do usuário logado (tabela `usuarios`),
    // não mais de `restaurantes`. Sobrepõe no cfg pra manter o resto do código igual.
    if (cfg) {
      cfg.nome = usuario?.nome ?? null
      cfg.perfil_notas = usuario?.perfil_notas ?? null
    }
    const perfil = (cfg?.perfil_restaurante as any) || {}

    return {
      restaurante_id: rId,
      restaurante: cfg
        ? {
            nome: cfg.nome,
            nome_restaurante: cfg.nome_restaurante,
            detalhes: cfg.detalhes,
            perfil_notas: cfg.perfil_notas,
            tipo_culinaria: cfg.tipo_culinaria,
            numero_mesas: cfg.numero_mesas,
            perfil,
          }
        : null,
      // versão achatada, só com o que a IA pode atualizar (para detectar conflito)
      configAtual: cfg
        ? {
            nome: cfg.nome ?? '',
            nome_restaurante: cfg.nome_restaurante ?? '',
            tipo_culinaria: cfg.tipo_culinaria ?? '',
            numero_mesas: cfg.numero_mesas ?? '',
            detalhes: cfg.detalhes ?? '',
            perfil_notas: cfg.perfil_notas ?? '',
            ...perfil,
          }
        : {},
      usuario: { nome: usuario?.nome ?? null },
      mascote_config: configRes.data?.mascote_config,
      memoria,
      kpis,
      categorias: estatisticas?.porCategoria ?? [],
      garcons: garconsRes.data || [],
      insights: insightsRes.data || [],
      acoes: acoesRes.data || [],
      feedbacks: feedbacksRes.data || [],
      // Quando a conversa nasceu de "Discutir com IA", o insight e os feedbacks
      // que o originaram acompanham TODAS as mensagens — não só a primeira.
      ...(contextoInsight ?? {}),
    }
  }

  const handleSend = async (text: string) => {
    const msgTexto = text.trim()
    if ((!msgTexto && !anexos.length) || loading || enviandoImagem) return

    const citando = citacao
    const anexosMsg: AnexoMensagem[] = anexos.map((a) => ({
      nome: a.nome, tipo: a.tipo, url: a.url, texto: a.texto,
    }))
    // Documentos vão como texto no contexto; imagens vão como imagem
    const documentos = anexosMsg.filter((a) => a.tipo !== 'imagem' && a.texto)

    setMessage('')
    setAnexos([])
    setCitacao(null)
    setHasError(false)
    setFailedMessage('')
    setFormularioPendente(null)

    // A mensagem aparece na hora — buscar contexto e chamar a IA vem depois
    adicionarMensagemUsuario(msgTexto, anexosMsg.length ? anexosMsg : undefined, citando || undefined)

    const contexto: Record<string, any> = await fetchContexto()
    if (documentos.length) contexto.arquivos = documentos
    if (citando) contexto.citacao = citando

    const result = await enviar(msgTexto, contexto, undefined, anexosMsg, {
      jaExibida: true,
      memoria: memoriaRef.current,
      respondendoA: citando || undefined,
      // A narração da IA precisa saber se vai aplicar ou só propor
      modoAcao: modoAcaoRef.current,
    })

    await tratarResultado(result, msgTexto)
  }

  /** Trata o retorno do enviar (erro / formulário / ação). Compartilhado entre
   *  o envio normal e o reenvio pós-edição. */
  const tratarResultado = async (result: Awaited<ReturnType<typeof enviar>>, msgTexto: string) => {
    if (result?.error) {
      setHasError(true)
      setFailedMessage(msgTexto)
      // Remove a mensagem que falhou: se ela ficar no histórico (ex: com um
      // anexo inválido), toda mensagem seguinte a reenvia e falha também.
      removerUltimaMensagem()
      return
    }

    if (result?.formulario) {
      setFormularioPendente(result.formulario)
    } else if (result?.acao) {
      // Em qualquer modo a proposta fica PRESA à resposta — o botão nunca some.
      // Excluir nunca roda sozinho, nem no modo automático.
      const destrutiva = ACOES_DESTRUTIVAS.includes(result.acao.tipo)
      const uid = anexarProposta(result.acao)
      if (modoAcaoRef.current === 'automatico' && !destrutiva) {
        // Aplica na hora e marca o MESMO botão como feito (verde, com desfazer).
        await aplicarAcao(result.acao, 'automatico', undefined, uid || undefined)
      } else {
        // Perguntar antes: abre o popup para editar/confirmar; o botão azul fica.
        if (uid) setPopup({ acao: result.acao, uid })
      }
    }
  }

  /** Executa a alteração e guarda o registro para permitir desfazer. */
  const aplicarAcao = async (
    acao: AcaoAgente,
    modo: 'automatico' | 'confirmado',
    dadosEditados?: Record<string, any>,
    uidMensagem?: string,
  ) => {
    if (!usuario?.restaurante_id) {
      // Antes isto falhava calado e parecia que o botão não fazia nada
      toast({
        title: 'Não consegui identificar seu restaurante',
        description: 'Recarregue a página e tente de novo.',
        variant: 'destructive',
      })
      return
    }
    const final: AcaoAgente = dadosEditados ? { ...acao, dados: dadosEditados } : acao
    try {
      const registro = await executarAcao(usuario.restaurante_id, final, modo)
      if (registro) {
        setRegistrosFeitos((p) => [...p, registro])
        if (uidMensagem) {
          // Fluxo com proposta: o botão FICA e vira verde (aceita). Nunca some.
          marcarPropostaAplicada(uidMensagem, { id: registro.id, descricao: registro.descricao })
        } else {
          // Modo automático (sem botão de proposta): marca de "feito" avulsa
          anexarRegistro({ id: registro.id, descricao: registro.descricao })
        }
      }
      setPopup(null)
      refetchConfig()   // sidebar/banner/chat
      refetchUsuario()  // dados do restaurante no useAuth — reflete sem F5
      toast({
        title: modo === 'automatico' ? 'Feito pela IA' : 'Alteração aplicada',
        description: final.descricao,
      })
    } catch (e: any) {
      toast({ title: 'Não consegui aplicar', description: e.message, variant: 'destructive' })
    }
  }

  const desfazer = async (id: string) => {
    const registro = registrosFeitos.find((r) => r.id === id)
    if (!registro) return
    try {
      await reverterAcao(registro)
      setRegistrosFeitos((p) => p.filter((r) => r.id !== id))
      removerRegistro(id) // marca avulsa (modo automático)
      desmarcarPropostaPorRegistro(id) // volta a proposta ao azul, mantendo o botão
      refetchConfig()
      toast({ title: 'Desfeito', description: 'Voltou ao estado anterior. Você pode aplicar de novo.' })
    } catch (e: any) {
      toast({ title: 'Não consegui desfazer', description: e.message, variant: 'destructive' })
    }
  }

  /** Só tira a marca da tela — a alteração continua valendo no sistema. */
  const ocultarRegistro = (id: string) => {
    setRegistrosFeitos((p) => p.filter((r) => r.id !== id))
    removerRegistro(id)
  }

  const alternarModo = async () => {
    const anterior = modoAcaoRef.current
    const novo = anterior === 'automatico' ? 'perguntar' : 'automatico'
    modoAcaoRef.current = novo
    setModoAcao(novo)

    if (usuario?.restaurante_id) {
      // .select('id'): confirma que gravou. Se a RLS bloquear (0 linhas) ou der
      // erro, o botão dizia "perguntar" mas o banco seguia "automatico" e a ação
      // era aplicada direto. Aqui revertemos o botão e avisamos.
      const { data, error } = await supabase
        .from('restaurantes')
        .update({ ia_modo_acao: novo })
        .eq('id', usuario.restaurante_id)
        .select('id')
      if (error || !data || data.length === 0) {
        modoAcaoRef.current = anterior
        setModoAcao(anterior)
        toast({
          title: 'Não consegui trocar o modo',
          description: 'Recarregue a página e tente de novo.',
          variant: 'destructive',
        })
        return
      }
    }

    toast({
      title: novo === 'automatico' ? 'A IA vai fazer sozinha' : 'A IA vai perguntar antes',
      description:
        novo === 'automatico'
          ? 'Alterações são aplicadas na hora, com opção de desfazer. Excluir sempre pergunta.'
          : 'Toda alteração abre uma confirmação que você pode editar.',
    })
  }

  /** Respostas do formulário voltam como mensagem, para a IA agir com os dados. */
  /**
   * Responder o formulário NÃO passa pelo redator: os agentes já têm tudo para
   * montar a ação. Antes, reenviávamos um texto de "pergunta: resposta" pelo chat
   * — virava mensagem feia, reprocessava tudo e às vezes dava erro e sumia.
   * Agora monta a ação direto e mostra a proposta, com mensagens limpas.
   */
  const responderFormulario = async (respostas: Record<string, string>) => {
    const form = formularioPendente
    setFormularioPendente(null)
    if (!form) return

    const preenchidos = form.campos.filter((c) => (respostas[c.nome] || '').trim())
    if (!preenchidos.length) return

    // Mensagem do usuário: curta e legível, só os valores respondidos
    const textoUsuario = preenchidos.map((c) => respostas[c.nome].trim()).join(' · ')
    // Pedido para o agente: junta pergunta + resposta para ele extrair os campos
    const pedido = preenchidos.map((c) => `${c.label}: ${respostas[c.nome].trim()}`).join('. ')
    const ehInsight = form.acao_pretendida === 'criar_insight'

    setLoading(true)
    try {
      const acao = ehInsight ? await montarInsight(pedido) : await montarAcao(pedido)
      if (!acao) {
        await registrarTroca(
          textoUsuario,
          'Consegui anotar, mas não montei a proposta. Pode me dar um pouco mais de detalhe?',
        )
        return
      }
      const destrutiva = ACOES_DESTRUTIVAS.includes(acao.tipo)
      if (modoAcaoRef.current === 'automatico' && !destrutiva) {
        await registrarTroca(textoUsuario, `Pronto! ${acao.descricao}.`)
        const puid = anexarProposta(acao) // botão fica preso e vira verde ao aplicar
        await aplicarAcao(acao, 'automatico', undefined, puid || undefined)
      } else {
        await registrarTroca(
          textoUsuario,
          ehInsight ? 'Preparei o insight. Confira e confirme:' : 'Preparei a ação. Confira e confirme:',
        )
        const puid = anexarProposta(acao)
        if (puid) setPopup({ acao, uid: puid })
      }
    } catch {
      await registrarTroca(textoUsuario, 'Desculpe, tive um problema ao montar. Pode tentar de novo?')
    } finally {
      setLoading(false)
    }
  }

  if (ocultar) return null

  const messagesToRender =
    messages.length === 0
      ? [{ uid: 'saudacao', role: 'assistant' as const, content: `Olá! Sou o ${mascoteNome}, seu assistente de inteligência. Como posso ajudar a melhorar seu restaurante hoje?`, anexos: undefined, fontes: undefined, registros: undefined, proposta: undefined, propostaRegistro: undefined, respondendoA: undefined }]
      : messages.map((m) => ({ uid: m.uid, role: m.role, content: m.text, anexos: m.anexos, fontes: m.fontes, registros: m.registros, proposta: m.proposta,
          propostaRegistro: m.propostaRegistro, respondendoA: m.respondendoA }))

  return (
    <>
      {/* Aba na borda direita (mesma altura da setinha de recolher) para ABRIR o
          chat quando está fechado — desktop. No celular usa o botão flutuante. */}
      {!open && !isMobile && (
        <button
          onClick={() => onOpenChange(true)}
          title="Abrir o chat"
          className="fixed right-0 top-1/2 z-40 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-gray-300 bg-white text-gray-500 shadow hover:bg-gray-50 hover:text-gray-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* modal={false}: o chat fica aberto sem escurecer nem travar o resto do app */}
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-elevation hover:shadow-lg hover:scale-105 transition-all z-40 bg-[#1D4ED8]"
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </Button>
        </SheetTrigger>

        <SheetContent
          semOverlay
          className="w-full p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.25)]"
          // Largura fixa no desktop; no celular é tela cheia.
          style={isMobile ? undefined : { width: LARGURA_CHAT }}
          // Sem isto, fechar o popup (Esc ou clique fora) fecha o chat junto:
          // o evento do dialog aninhado borbulha para o Sheet.
          onEscapeKeyDown={(e) => { if (temPopupAberto) e.preventDefault() }}
          // Clicar fora não fecha: o dono continua mexendo no painel com o chat aberto
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Setinha no meio da borda esquerda: recolhe o chat. Só desktop. */}
          {!isMobile && (
            <button
              onClick={() => onOpenChange(false)}
              title="Recolher o chat"
              className="absolute left-0 top-1/2 z-30 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-gray-300 bg-white text-gray-500 shadow hover:bg-gray-50 hover:text-gray-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {/* ── Header ── */}
          <SheetHeader className="p-4 border-b bg-white shrink-0">
            <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
              {view === 'history' ? (
                <>
                  <button onClick={() => setView('chat')} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <span className="font-bold text-gray-900 flex-1">Conversas</span>
                  <button
                    onClick={() => { setCriandoPasta(true); setNovaPastaNome('') }}
                    title="Nova pasta"
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                  <button onClick={handleNovaConversa} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] rounded-full hover:bg-blue-700 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Nova
                  </button>
                </>
              ) : (
                <>
                  <span className="font-bold text-gray-900 truncate min-w-0">{mascoteNome}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={handleOpenHistory} title="Histórico" className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
                      <History className="h-4 w-4" />
                    </button>
                    <button onClick={handleNovaConversa} title="Nova conversa" className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1" />
                </>
              )}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {view === 'history' ? 'Histórico de conversas' : 'Assistente de Inteligência'}
            </SheetDescription>
          </SheetHeader>

          {/* ── History view ── */}
          {!anexoAberto && view === 'history' && (
            <div className="flex-1 overflow-y-auto sem-barra bg-gray-50">
              {/* Campo de nome da nova pasta: mesmo padrão inline do renomear */}
              {criandoPasta && (
                <div className="px-4 py-3 flex items-center gap-2 bg-white border-b border-gray-100">
                  <FolderPlus className="h-4 w-4 text-gray-400 shrink-0" />
                  <input
                    autoFocus
                    className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Nome da pasta"
                    value={novaPastaNome}
                    onChange={(e) => setNovaPastaNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCriarPasta()
                      if (e.key === 'Escape') { setCriandoPasta(false); setNovaPastaNome('') }
                    }}
                    onBlur={handleCriarPasta}
                  />
                  <button onClick={handleCriarPasta} className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0">OK</button>
                </div>
              )}

              {loadingSessoes ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Carregando...</div>
              ) : groupedSessoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <History className="h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">Nenhuma conversa ainda</p>
                  <p className="text-xs text-gray-400 mt-1">Suas conversas aparecerão aqui</p>
                </div>
              ) : (
                <div className="py-2">
                  {groupedSessoes.map((group) => (
                    <div key={group.tipo === 'pasta' ? group.pasta.id : group.label}>
                      {group.tipo === 'pasta' ? (
                        renomeandoPastaId === group.pasta.id ? (
                          <div className="px-4 py-2 flex items-center gap-2 bg-white">
                            <Folder className="h-4 w-4 text-gray-400 shrink-0" />
                            <input
                              autoFocus
                              className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                              value={nomePastaEdit}
                              onChange={(e) => setNomePastaEdit(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSalvarNomePasta(group.pasta.id)
                                if (e.key === 'Escape') setRenomeandoPastaId(null)
                              }}
                              onBlur={() => handleSalvarNomePasta(group.pasta.id)}
                            />
                            <button onClick={() => handleSalvarNomePasta(group.pasta.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0">OK</button>
                          </div>
                        ) : excluirPastaId === group.pasta.id ? (
                          <div className="px-4 py-3 flex items-center justify-between gap-2 bg-rose-50">
                            <p className="text-xs text-rose-700 font-medium">Excluir esta pasta? As conversas voltam para a lista.</p>
                            <div className="flex gap-3 shrink-0">
                              <button onClick={() => setExcluirPastaId(null)} className="text-xs text-gray-500 hover:text-gray-800">Cancelar</button>
                              <button onClick={() => handleExcluirPasta(group.pasta.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Excluir</button>
                            </div>
                          </div>
                        ) : (
                          <div className="group/pasta flex items-center gap-1.5 px-4 py-2 hover:bg-white transition-colors">
                            <button
                              onClick={() => alternarExpansao(group.pasta.id)}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            >
                              {expandidas.has(group.pasta.id)
                                ? <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                : <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
                                {group.pasta.nome}
                              </span>
                              <span className="text-[11px] text-gray-400 shrink-0">({group.items.length})</span>
                            </button>
                            <div className="hidden group-hover/pasta:flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => { setNomePastaEdit(group.pasta.nome); setRenomeandoPastaId(group.pasta.id); setExcluirPastaId(null) }}
                                title="Renomear pasta"
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => { setExcluirPastaId(group.pasta.id); setRenomeandoPastaId(null) }}
                                title="Excluir pasta"
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        <p className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          {group.label === 'Fixadas' && <Pin className="h-3 w-3" />}
                          {group.label}
                        </p>
                      )}
                      {group.tipo === 'pasta' && !expandidas.has(group.pasta.id)
                        ? null
                        : group.items.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            'group relative border-b border-gray-100 last:border-0',
                            s.id === sessaoId && 'border-l-2 border-l-[#1D4ED8] bg-white',
                          )}
                        >
                          {renamingId === s.id ? (
                            // Rename mode
                            <div className="px-4 py-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={renameInputRef}
                                className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(s.id)
                                  if (e.key === 'Escape') setRenamingId(null)
                                }}
                                onBlur={() => handleSaveRename(s.id)}
                              />
                              <button onClick={() => handleSaveRename(s.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0">OK</button>
                            </div>
                          ) : deleteConfirmId === s.id ? (
                            // Delete confirm
                            <div className="px-4 py-3 flex items-center justify-between gap-2 bg-rose-50" onClick={(e) => e.stopPropagation()}>
                              <p className="text-xs text-rose-700 font-medium">Excluir esta conversa?</p>
                              <div className="flex gap-3">
                                <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-500 hover:text-gray-800">Cancelar</button>
                                <button onClick={() => handleDeleteConfirm(s.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Excluir</button>
                              </div>
                            </div>
                          ) : (
                            // Normal item
                            <button
                              onClick={() => handleSelectSessao(s.id)}
                              className={cn(
                                'w-full text-left px-4 py-3 hover:bg-white transition-colors flex flex-col gap-0.5',
                                s.id === sessaoId && 'bg-white',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-gray-800 line-clamp-2 leading-snug flex-1">
                                  {s.nome || s.preview}
                                </p>
                                {/* Hover actions */}
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 -mt-0.5">
                                  <button
                                    onClick={(e) => handleTogglePin(e, s.id)}
                                    title={s.pinned ? 'Desafixar' : 'Fixar'}
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-amber-500 transition-colors"
                                  >
                                    {s.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setMoverSessaoId(moverSessaoId === s.id ? null : s.id) }}
                                    title="Mover para pasta"
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-amber-600 transition-colors"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleStartRename(e, s)}
                                    title="Renomear"
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteRequest(e, s.id)}
                                    title="Excluir"
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-rose-600 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {formatDistanceToNow(s.date, { addSuffix: true, locale: ptBR })}
                              </p>
                            </button>
                          )}

                          {/* Escolha da pasta de destino */}
                          {moverSessaoId === s.id && (
                            <div className="px-4 pb-3 pt-1 bg-white border-t border-gray-100">
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                Mover para
                              </p>
                              <div className="flex flex-col gap-0.5">
                                {pastas.length === 0 && (
                                  <p className="text-xs text-gray-400 py-1">
                                    Nenhuma pasta ainda. Crie uma no topo da lista.
                                  </p>
                                )}
                                {pastas.map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleMoverParaPasta(s.id, p.id)}
                                    disabled={s.pastaId === p.id}
                                    className="flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent rounded px-2 py-1.5 text-left"
                                  >
                                    <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    <span className="truncate">{p.nome}</span>
                                    {s.pastaId === p.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                                  </button>
                                ))}
                                {s.pastaId && (
                                  <button
                                    onClick={() => handleMoverParaPasta(s.id, null)}
                                    className="flex items-center gap-2 text-xs text-rose-600 hover:bg-rose-50 rounded px-2 py-1.5 text-left"
                                  >
                                    <X className="h-3.5 w-3.5 shrink-0" />
                                    Remover da pasta
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Chat view ── */}
          {anexoAberto ? (
            <VisualizadorAnexo anexo={anexoAberto} onVoltar={() => setAnexoAberto(null)} />
          ) : null}

          {!anexoAberto && view === 'chat' && (
            <>
              <div
                ref={areaRolagemRef}
                onScroll={aoRolar}
                className="relative flex-1 overflow-y-auto overflow-x-hidden sem-barra p-4 flex flex-col gap-4 bg-white"
              >
                {messagesToRender.map((msg, i) => {
                  const isLast = i === messagesToRender.length - 1
                  return (
                    <div
                      key={msg.uid}
                      ref={(el) => { refsMensagens.current[msg.uid] = el }}
                      className={cn(
                        'flex flex-col gap-2 rounded-2xl transition-colors duration-500',
                        destacada === msg.uid && 'bg-amber-100/70 ring-2 ring-amber-300 -mx-1 px-1 py-1',
                      )}
                    >
                      <div className={cn('group/msg flex w-full gap-1', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        {/* Nas mensagens do dono os botões vêm ANTES da bolha:
                            depois dela, empurrariam o balão para longe da borda */}
                        <div
                          className={cn(
                            'px-4 py-3 rounded-2xl text-sm max-w-[85%] min-w-0 break-words shadow-sm',
                            msg.role === 'user' && 'order-2',
                            msg.role === 'user'
                              ? 'bg-[#1D4ED8] text-white rounded-tr-none'
                              : 'bg-[#F9FAFB] text-[#1F2937] border border-gray-100 rounded-tl-none',
                          )}
                        >
                          {msg.respondendoA && (
                            <button
                              onClick={() => irParaMensagem(msg.respondendoA!.uid)}
                              className={cn(
                                'w-full text-left mb-2 rounded-md border-l-2 px-2 py-1.5 transition-opacity hover:opacity-80',
                                msg.role === 'user'
                                  ? 'border-white/60 bg-white/15'
                                  : 'border-primary bg-primary/5',
                              )}
                              title="Ir para a mensagem respondida"
                            >
                              <p
                                className={cn(
                                  'text-[10px] font-semibold',
                                  msg.role === 'user' ? 'text-white/80' : 'text-primary',
                                )}
                              >
                                {msg.respondendoA.autor === 'user' ? 'Você' : mascoteNome}
                              </p>
                              <p
                                className={cn(
                                  'text-[11px] line-clamp-2',
                                  msg.role === 'user' ? 'text-white/75' : 'text-muted-foreground',
                                )}
                              >
                                {msg.respondendoA.texto}
                              </p>
                            </button>
                          )}
                          {!!msg.anexos?.length && (
                            <div
                              className={cn(
                                'flex flex-wrap gap-1.5 mb-2',
                                msg.role === 'user' ? 'justify-end' : 'justify-start',
                              )}
                            >
                              {msg.anexos.map((a, ai) =>
                                a.tipo === 'imagem' ? (
                                  <button key={ai} onClick={() => abrirAnexo(a)} className="block">
                                    <img
                                      src={a.url}
                                      alt={a.nome}
                                      className="max-w-[170px] max-h-[150px] object-cover rounded-lg hover:opacity-90 transition"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    key={ai}
                                    onClick={() => abrirAnexo(a)}
                                    className={cn(
                                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 max-w-[190px] transition',
                                      msg.role === 'user'
                                        ? 'bg-white/15 hover:bg-white/25'
                                        : 'bg-gray-100 hover:bg-gray-200',
                                    )}
                                    title={a.nome}
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-[11px] truncate">{a.nome}</span>
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                          {msg.role === 'user' && editandoUid === msg.uid ? (
                            <div className="flex flex-col gap-1.5 min-w-[180px]">
                              <Textarea
                                autoFocus
                                rows={2}
                                value={textoEdicao}
                                onChange={(e) => setTextoEdicao(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarEdicao() }
                                  if (e.key === 'Escape') setEditandoUid(null)
                                }}
                                className="resize-none text-sm bg-white/15 border-white/30 text-white"
                              />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditandoUid(null)} className="text-[11px] text-white/70 hover:text-white">
                                  Cancelar
                                </button>
                                <button onClick={salvarEdicao} className="text-[11px] font-semibold text-white">
                                  Salvar
                                </button>
                              </div>
                            </div>
                          ) : msg.role === 'user' ? (
                            <span className="whitespace-pre-wrap">
                              {parseInline(msg.content as string, LINK_ESCURO)}
                            </span>
                          ) : (
                            <FormattedMessage content={msg.content as string} />
                          )}
                          {!!msg.fontes?.length && <Fontes fontes={msg.fontes} />}
                        </div>
                        <div
                          className={cn(
                            'opacity-0 group-hover/msg:opacity-100 transition-opacity self-center flex items-center gap-0.5 shrink-0',
                            msg.role === 'user' && 'order-1',
                          )}
                        >
                          <button
                            onClick={() =>
                              setCitacao({
                                autor: msg.role,
                                texto: String(msg.content).slice(0, 400),
                                uid: msg.uid,
                              })
                            }
                            title="Responder esta mensagem"
                            className="h-6 w-6 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          {msg.role === 'user' && (
                            <>
                              <button
                                onClick={() => {
                                  setEditandoUid(msg.uid)
                                  setTextoEdicao(String(msg.content))
                                }}
                                title="Editar mensagem"
                                className="h-6 w-6 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => excluirMensagem(msg.uid)}
                                title="Excluir mensagem"
                                className="h-6 w-6 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {msg.role === 'assistant' && !!msg.registros?.length && (
                        <div className="flex w-full justify-start pl-2">
                          <div className="flex flex-col gap-1.5 w-full max-w-[85%]">
                            {msg.registros.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5"
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span className="text-[11px] text-emerald-900 flex-1 leading-snug">{r.descricao}</span>
                                <button
                                  onClick={() => desfazer(r.id)}
                                  className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 shrink-0"
                                  title="Reverter a alteração no sistema"
                                >
                                  Desfazer
                                </button>
                                <button
                                  onClick={() => ocultarRegistro(r.id)}
                                  className="h-4 w-4 rounded-full text-emerald-600 hover:bg-emerald-200 flex items-center justify-center shrink-0"
                                  title="Só tirar este aviso (a alteração continua valendo)"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.proposta && (
                        <div className="flex w-full justify-start pl-2">
                          {msg.propostaRegistro ? (
                            // Aceita: verde, com Desfazer. O botão NUNCA some.
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 max-w-[85%]">
                              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="text-[11px] text-emerald-900 flex-1 leading-snug">
                                {msg.propostaRegistro.descricao}
                              </span>
                              <button
                                onClick={() => desfazer(msg.propostaRegistro!.id)}
                                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 shrink-0"
                                title="Reverter e voltar ao estado não aplicado"
                              >
                                Desfazer
                              </button>
                            </div>
                          ) : (
                            // Não aceita: azul, clicável para revisar/aplicar
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs h-8 rounded-full border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                              onClick={() => setPopup({ acao: msg.proposta!, uid: msg.uid })}
                            >
                              <Sparkles className="h-3 w-3" />
                              {ROTULO_ACAO[msg.proposta.tipo] || 'Revisar alteração'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {loading && (
                  <div className="flex w-full justify-start">
                    <div className="px-4 py-3 rounded-2xl text-sm bg-[#F9FAFB] border border-gray-100 rounded-tl-none shadow-sm flex items-center gap-2">
                      {buscandoWeb ? (
                        <>
                          <Globe className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                          <span className="text-xs text-gray-500">Pesquisando na internet…</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </>
                      )}
                    </div>
                  </div>
                )}

                {hasError && (
                  <div className="flex w-full justify-start">
                    <div className="px-4 py-3 rounded-2xl text-sm bg-red-50 text-red-700 border border-red-100 rounded-tl-none shadow-sm flex flex-col gap-2 max-w-[85%]">
                      <span>Desculpe, tive um problema. Tente novamente.</span>
                      <Button size="sm" variant="ghost" className="h-7 w-fit text-xs bg-white text-red-700 hover:bg-red-100" onClick={() => handleSend(failedMessage)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Tentar Novamente
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />

                {longeDoFim && (
                  <button
                    onClick={() => irParaOFim()}
                    title="Ir para o fim da conversa"
                    className="sticky bottom-2 self-center z-10 flex items-center gap-1.5 rounded-full bg-white border border-gray-200 shadow-md px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> Ir para o fim
                  </button>
                )}
              </div>

              <div className="p-4 border-t bg-white flex flex-col gap-3 shrink-0">
                {/* Sugestões */}
                <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      disabled={loading}
                      className="whitespace-nowrap px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-700 transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Preview de imagem */}
                {citacao && (
                  <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-gray-50 px-3 py-2">
                    <button
                      onClick={() => irParaMensagem(citacao.uid)}
                      className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                      title="Ir para a mensagem"
                    >
                      <p className="text-[10px] font-semibold text-primary">
                        Respondendo {citacao.autor === 'user' ? 'você mesmo' : mascoteNome}
                      </p>
                      <p className="text-[11px] text-gray-600 line-clamp-2">{citacao.texto}</p>
                    </button>
                    <button
                      onClick={() => setCitacao(null)}
                      className="h-4 w-4 shrink-0 rounded-full text-gray-400 hover:bg-gray-200 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {anexos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {anexos.map((a) => (
                      <div key={a.id} className="relative group">
                        {a.tipo === 'imagem' ? (
                          <button
                            onClick={() => abrirAnexo(a)}
                            className="block h-16 w-16 rounded-lg border border-gray-200 overflow-hidden"
                          >
                            <img src={a.url || a.previewLocal} alt={a.nome} className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <button
                            onClick={() => abrirAnexo(a)}
                            className="flex items-center gap-2 h-16 max-w-[190px] rounded-lg border border-gray-200 bg-gray-50 px-3 hover:bg-gray-100"
                            title={a.nome}
                          >
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-[11px] text-gray-700 truncate text-left">{a.nome}</span>
                          </button>
                        )}
                        {a.enviando && (
                          <div className="absolute inset-0 bg-black/45 rounded-lg flex items-center justify-center">
                            <RefreshCw className="h-4 w-4 text-white animate-spin" />
                          </div>
                        )}
                        <button
                          onClick={() => removerAnexo(a.id)}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formularioPendente ? (
                  <FormularioInline
                    formulario={formularioPendente}
                    onEnviar={responderFormulario}
                    onCancelar={() => setFormularioPendente(null)}
                  />
                ) : (
                <>
                {/* Crédito do ciclo: só aparece quando já passou da metade, para
                    não poluir a conversa de quem mal usou. */}
                {uso && uso.limite > 0 && uso.gasto / uso.limite >= 0.5 && (
                  <div className="mb-2 px-0.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className={creditoEsgotado ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {creditoEsgotado
                          ? 'Crédito de IA esgotado neste ciclo'
                          : 'Crédito de IA do ciclo'}
                      </span>
                      <span className="text-gray-400 font-mono">
                        US$ {uso.gasto.toFixed(2)} / {uso.limite.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', creditoEsgotado ? 'bg-red-500' : 'bg-amber-400')}
                        style={{ width: `${Math.min((uso.gasto / uso.limite) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Compositor: texto ocupa a largura toda, botões na barra de baixo */}
                <div
                  className={cn(
                    'rounded-xl border bg-white transition-colors',
                    loading || creditoEsgotado
                      ? 'border-gray-200'
                      : 'border-gray-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100',
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <Textarea
                    placeholder={
                      creditoEsgotado
                        ? 'Crédito de IA esgotado — renova junto com a assinatura'
                        : `Pergunte ao ${mascoteNome}...`
                    }
                    className="min-h-[52px] max-h-[120px] resize-none border-0 bg-transparent px-3 pt-2.5 pb-0 text-sm shadow-none focus-visible:ring-0"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend(message)
                      }
                    }}
                    disabled={loading || creditoEsgotado}
                  />
                  <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      title="Anexar imagens, PDFs ou textos"
                      className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-[#1D4ED8] hover:bg-blue-50 transition-colors disabled:opacity-40"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={alternarModo}
                      disabled={loading}
                      title={
                        modoAcao === 'automatico'
                          ? 'A IA aplica as alterações sozinha. Clique para ela perguntar antes.'
                          : 'A IA pergunta antes de alterar. Clique para ela fazer sozinha.'
                      }
                      className={cn(
                        'h-7 flex items-center gap-1 px-1.5 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40',
                        modoAcao === 'automatico'
                          ? 'text-amber-600 hover:bg-amber-50'
                          : 'text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      {modoAcao === 'automatico' ? <Zap className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
                      {modoAcao === 'automatico' ? 'Fazer sozinha' : 'Perguntar antes'}
                    </button>
                    <div className="flex-1" />
                    <Button
                      size="icon"
                      className="h-7 w-7 bg-[#1D4ED8] hover:bg-blue-800 text-white rounded-md disabled:opacity-40"
                      onClick={() => handleSend(message)}
                      disabled={(!message.trim() && !anexos.length) || loading || enviandoImagem || creditoEsgotado}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmação da alteração proposta pela IA (modo perguntar) */}
      {popup && (
        <ConfirmacaoAcao
          acao={popup.acao}
          onConfirmar={(dados) => aplicarAcao(popup.acao, 'confirmado', dados, popup.uid)}
          onCancelar={() => setPopup(null)}
        />
      )}

    </>
  )
}
