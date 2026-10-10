import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Pencil, Play, Plus, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import {
  DURACAO_TETO_S, estadoDoPeriodo, formatarDuracao, formatarTamanho, hojeSP, idDoRequisito, ordinal, ROTULO_STATUS, rotuloDuracao, rotuloPeriodo,
  type Missao, type Recompensa,
} from '@/lib/missoes'
import {
  acaoVideos, buscarMaxPorAno, buscarRecompensas, buscarTodasMissoes, buscarTodosEnvios, buscarTodosPremios, linkDoVideo, marcarPremioAplicado,
  removerRecompensa, salvarMaxPorAno, salvarMissao, salvarRecompensa, type EnvioAdmin, type MissaoParaSalvar, type PremioAdmin,
} from '@/lib/queries/missoes'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'

/* Aba "Vídeos" do painel do admin: as missões de vídeo dos restaurantes.
   Revisa o que a IA decidiu, marca os prêmios dados e edita as missões e a
   escada de prêmios (o que ganha quem cumpre a 1ª, a 2ª, a 3ª missão…). */

const quando = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

const COR_STATUS: Record<EnvioAdmin['status'], string> = {
  enviando: 'bg-gray-100 text-gray-600',
  analisando: 'bg-blue-50 text-blue-700',
  aprovado: 'bg-emerald-50 text-emerald-700',
  reprovado: 'bg-rose-50 text-rose-700',
  erro: 'bg-amber-50 text-amber-700',
}
const ROTULO_ADMIN: Record<EnvioAdmin['status'], string> = { ...ROTULO_STATUS, erro: 'Erro na análise' }

function Pilula({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

const campo = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-[#1D4ED8]'

// ── Um vídeo: assistir, ver a análise e decidir ──────────────────────────────

function DetalheEnvio({ envio, onFechar, onMudou }: { envio: EnvioAdmin | null; onFechar: () => void; onMudou: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [fazendo, setFazendo] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    setMotivo('')
    if (envio) linkDoVideo(envio.caminho).then(setUrl)
  }, [envio])

  const agir = async (acao: 'admin_decidir' | 'admin_analisar_de_novo', extra: Record<string, unknown> = {}) => {
    if (!envio) return
    setFazendo(acao + String(extra.aprovado ?? ''))
    const r = await acaoVideos(acao, { envio_id: envio.id, ...extra })
    setFazendo(null)
    if (!r.ok) return toast.error(r.error || 'Não foi possível.')
    toast.success(acao === 'admin_analisar_de_novo' ? 'A IA vai assistir de novo.' : extra.aprovado ? 'Aprovado.' : 'Reprovado.')
    onMudou()
    onFechar()
  }

  const a = envio?.analise
  return (
    <Dialog open={!!envio} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {envio && (
          <>
            <DialogHeader>
              <DialogTitle>{envio.restaurante} · {envio.missao}</DialogTitle>
              <DialogDescription>
                {quando(envio.criado_em)} · {formatarTamanho(envio.tamanho_bytes)}{envio.duracao_segundos ? ` · ${formatarDuracao(envio.duracao_segundos)}` : ''}
              </DialogDescription>
            </DialogHeader>
            {url ? <video src={url} controls playsInline className="max-h-[50vh] w-full rounded-lg bg-black" /> : <Skeleton className="aspect-video w-full rounded-lg" />}

            <div className="flex flex-wrap items-center gap-2">
              <Pilula className={COR_STATUS[envio.status]}>{ROTULO_ADMIN[envio.status]}</Pilula>
              {envio.revisado_por && <span className="text-[12px] text-gray-500">Revisado por {envio.revisado_por}</span>}
            </div>
            {envio.motivo && <p className="text-[13px] text-gray-700">{envio.motivo}</p>}
            {a?.requisitos?.length ? (
              <ul className="space-y-1.5 rounded-lg bg-gray-50 p-3">
                {a.requisitos.map((r) => (
                  <li key={r.id} className="flex gap-2 text-[13px]">
                    {r.cumpriu ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                    <div><p className="text-gray-800">{r.texto}</p>{r.motivo && <p className="text-[12px] text-gray-500">{r.motivo}</p>}</div>
                  </li>
                ))}
              </ul>
            ) : null}
            {a?.conteudo_adequado === false && <p className="text-[13px] text-rose-700">Conteúdo inadequado: {a.problema_conteudo}</p>}
            {a?.resumo && <p className="text-[12px] text-gray-500">Resumo da IA: {a.resumo}</p>}
            {a?.erro && <p className="rounded-lg bg-amber-50 p-2 font-mono text-[11px] text-amber-800">{a.erro}</p>}

            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo para o restaurante (opcional)" className="text-[13px]" />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" size="sm" disabled={!!fazendo || envio.status === 'analisando'} onClick={() => agir('admin_analisar_de_novo')}>
                {fazendo === 'admin_analisar_de_novo' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Analisar de novo
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!!fazendo} onClick={() => agir('admin_decidir', { aprovado: false, motivo })} className="text-rose-700">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reprovar
                </Button>
                <Button size="sm" disabled={!!fazendo} onClick={() => agir('admin_decidir', { aprovado: true, motivo })} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Aprovar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Criar ou editar uma missão ───────────────────────────────────────────────

type Rascunho = MissaoParaSalvar

/** O que está errado no rascunho (null = pode salvar). */
function problemaDoRascunho(m: Rascunho): string | null {
  if (!m.titulo.trim()) return 'Dê um título.'
  if (!m.requisitos.some((r) => r.texto.trim())) return 'Ponha pelo menos um requisito.'
  if (m.duracao_min_s == null) return 'Defina a duração mínima (0 = sem mínimo).'
  if (m.duracao_max_s == null) return 'Defina a duração máxima.'
  if (m.duracao_max_s < 5 || m.duracao_max_s > DURACAO_TETO_S) return `A duração máxima vai de 5 s a ${formatarDuracao(DURACAO_TETO_S)}.`
  if (m.duracao_min_s >= m.duracao_max_s) return 'A duração mínima tem que ser menor que a máxima.'
  if (m.disponivel_de && m.disponivel_ate && m.disponivel_de > m.disponivel_ate) return 'O período termina antes de começar.'
  return null
}

/** Um tempo em minutos e segundos; vazio nos dois = ainda não definido. */
function CampoTempo({ rotulo, valor, onMudar }: { rotulo: string; valor: number | null; onMudar: (segundos: number | null) => void }) {
  const min = valor == null ? '' : String(Math.floor(valor / 60))
  const seg = valor == null ? '' : String(valor % 60)
  const mudar = (m: string, s: string) => {
    if (m.trim() === '' && s.trim() === '') return onMudar(null)
    onMudar(Math.max(0, Math.round(Number(m) || 0)) * 60 + Math.min(59, Math.max(0, Math.round(Number(s) || 0))))
  }
  return (
    <div>
      <p className="mb-1 text-[12px] text-gray-500">{rotulo}</p>
      <div className="flex items-center gap-1.5">
        <input type="number" min={0} max={5} aria-label={`${rotulo}: minutos`} className={cn(campo, 'w-16')} value={min} onChange={(e) => mudar(e.target.value, seg)} />
        <span className="text-[12px] text-gray-500">min</span>
        <input type="number" min={0} max={59} aria-label={`${rotulo}: segundos`} className={cn(campo, 'w-16')} value={seg} onChange={(e) => mudar(min, e.target.value)} />
        <span className="text-[12px] text-gray-500">s</span>
      </div>
    </div>
  )
}

function EditarMissao({ rascunho, onFechar, onSalvo }: { rascunho: Rascunho | null; onFechar: () => void; onSalvo: () => void }) {
  const [m, setM] = useState<Rascunho | null>(rascunho)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setM(rascunho), [rascunho])

  const problema = m ? problemaDoRascunho(m) : null
  const valido = !!m && !problema

  const salvar = async () => {
    if (!m || !valido) return
    setSalvando(true)
    try {
      // Requisito novo ganha um id a partir do texto; os que já existiam mantêm o deles.
      const usados: string[] = []
      const requisitos = m.requisitos.filter((r) => r.texto.trim()).map((r) => {
        const id = r.id && !usados.includes(r.id) ? r.id : idDoRequisito(r.texto, usados)
        usados.push(id)
        return { id, texto: r.texto.trim() }
      })
      await salvarMissao({ ...m, requisitos })
      toast.success('Missão salva.')
      onSalvo()
      onFechar()
    } catch {
      toast.error('Não foi possível salvar a missão.')
    } finally {
      setSalvando(false)
    }
  }

  const mudarRequisito = (i: number, texto: string) => m && setM({ ...m, requisitos: m.requisitos.map((r, j) => (j === i ? { ...r, texto } : r)) })

  return (
    <Dialog open={!!rascunho} onOpenChange={(abrir) => !abrir && !salvando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        {m && (
          <>
            <DialogHeader>
              <DialogTitle>{m.id ? 'Editar missão' : 'Nova missão'}</DialogTitle>
              <DialogDescription>O restaurante vê o título e os requisitos e grava do jeito que quiser. A IA assiste e confere cada requisito.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <input className={campo} value={m.titulo} onChange={(e) => setM({ ...m, titulo: e.target.value })} placeholder="Título (ex.: Depoimento sobre o EasyFeed)" />
              <Textarea value={m.descricao} onChange={(e) => setM({ ...m, descricao: e.target.value })} rows={2} placeholder="Descrição (só para a IA entender a missão)" className="text-[13px]" />
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Requisitos (o vídeo precisa cumprir todos)</p>
                <p className="mb-2 text-[11px] text-gray-400">O restaurante vê esta lista. Escreva como algo que dá para ver ou ouvir no vídeo.</p>
                <div className="space-y-2">
                  {m.requisitos.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={campo} value={r.texto} onChange={(e) => mudarRequisito(i, e.target.value)} placeholder={`Requisito ${i + 1}`} />
                      <button
                        type="button"
                        title="Tirar"
                        onClick={() => setM({ ...m, requisitos: m.requisitos.filter((_, j) => j !== i) })}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setM({ ...m, requisitos: [...m.requisitos, { id: '', texto: '' }] })} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1D4ED8] hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Requisito
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Duração do vídeo</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <CampoTempo rotulo="Mínimo" valor={m.duracao_min_s} onMudar={(v) => setM({ ...m, duracao_min_s: v })} />
                    <CampoTempo rotulo="Máximo" valor={m.duracao_max_s} onMudar={(v) => setM({ ...m, duracao_max_s: v })} />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Mínimo 0 = sem mínimo. O máximo vai até {formatarDuracao(DURACAO_TETO_S)} (mais que isso a análise demora demais).</p>
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Período (vazio = sempre)</p>
                  <div className="flex items-center gap-2">
                    <input type="date" className={cn(campo, 'w-40')} value={m.disponivel_de ?? ''} onChange={(e) => setM({ ...m, disponivel_de: e.target.value || null })} />
                    <span className="text-[12px] text-gray-400">a</span>
                    <input type="date" className={cn(campo, 'w-40')} value={m.disponivel_ate ?? ''} onChange={(e) => setM({ ...m, disponivel_ate: e.target.value || null })} />
                  </div>
                </div>
              </div>
              {problema && m.titulo.trim() && <p className="text-[12px] text-rose-600">{problema}</p>}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[13px] text-gray-700" title="Posição na fila: o restaurante faz as missões nesta ordem, uma de cada vez.">
                  Ordem na fila
                  <input type="number" className={cn(campo, 'w-20')} value={m.ordem} onChange={(e) => setM({ ...m, ordem: Number(e.target.value) || 0 })} />
                </label>
                <label className="flex items-center gap-2 text-[13px] text-gray-700">
                  <Switch checked={m.ativa} onCheckedChange={(v) => setM({ ...m, ativa: v })} /> Ativa
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvar} disabled={!valido || salvando} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Um degrau da escada (o texto salva ao sair do campo) ─────────────────────

function DegrauEditavel({ r, ultimo, onSalvo, onRemover }: { r: Recompensa; ultimo: boolean; onSalvo: () => void; onRemover: () => void }) {
  const [texto, setTexto] = useState(r.descricao)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setTexto(r.descricao), [r.descricao])
  const salvar = async () => {
    if (!texto.trim() || texto.trim() === r.descricao) return setTexto(r.descricao)
    setSalvando(true)
    try {
      await salvarRecompensa({ ordem: r.ordem, descricao: texto })
      onSalvo()
    } catch {
      toast.error('Não foi possível salvar o prêmio.')
    } finally {
      setSalvando(false)
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0">
      <span className="w-24 shrink-0 text-[12px] font-semibold text-gray-500">{ordinal(r.ordem)}</span>
      <input
        className={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      {salvando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" /> : (
        <button
          type="button"
          title={ultimo ? 'Tirar este degrau' : 'Só dá para tirar o último degrau'}
          disabled={!ultimo}
          onClick={onRemover}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ── A aba ────────────────────────────────────────────────────────────────────

const FILTROS = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'revisar', rotulo: 'Para revisar' },
  { chave: 'aprovado', rotulo: 'Aprovados' },
  { chave: 'reprovado', rotulo: 'Não aprovados' },
  { chave: 'analisando', rotulo: 'Analisando' },
] as const

export function PainelVideosAdmin() {
  const { confirmar, dialogo } = useConfirmacao()
  const [carregando, setCarregando] = useState(true)
  const [envios, setEnvios] = useState<EnvioAdmin[]>([])
  const [premios, setPremios] = useState<PremioAdmin[]>([])
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [recompensas, setRecompensas] = useState<Recompensa[]>([])
  const [maxPorAno, setMaxPorAno] = useState<number | null>(null)
  const [textoMax, setTextoMax] = useState('')
  const [salvandoMax, setSalvandoMax] = useState(false)
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['chave']>('todos')
  const [aberto, setAberto] = useState<EnvioAdmin | null>(null)
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [mexendo, setMexendo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [e, p, m, r, max] = await Promise.all([buscarTodosEnvios(), buscarTodosPremios(), buscarTodasMissoes(), buscarRecompensas(), buscarMaxPorAno()])
      setMaxPorAno(max)
      setTextoMax(max == null ? '' : String(max))
      setEnvios(e)
      setPremios(p)
      setMissoes(m)
      setRecompensas(r)
    } catch {
      toast.error('Não foi possível carregar os vídeos.')
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  // Enquanto a IA assiste algum vídeo, confere de tempos em tempos.
  const emAnalise = envios.some((e) => e.status === 'analisando')
  useEffect(() => {
    if (!emAnalise) return
    const t = setInterval(carregar, 15_000)
    return () => clearInterval(t)
  }, [emAnalise, carregar])

  const filtrados = useMemo(() => envios.filter((e) =>
    filtro === 'todos' ? true : filtro === 'revisar' ? e.status === 'erro' : e.status === filtro), [envios, filtro])
  const pendentes = premios.filter((p) => p.status === 'pendente').length
  const paraRevisar = envios.filter((e) => e.status === 'erro').length
  const premiosOrdenados = useMemo(() => [...premios].sort((a, b) => (a.status === b.status ? 0 : a.status === 'pendente' ? -1 : 1)), [premios])

  const alternarAplicado = async (p: PremioAdmin) => {
    setMexendo(p.id)
    try {
      await marcarPremioAplicado(p.id, p.status !== 'aplicado')
      await carregar()
    } catch {
      toast.error('Não foi possível mudar o prêmio.')
    } finally {
      setMexendo(null)
    }
  }
  const alternarMissao = async (m: Missao) => {
    setMexendo(`m${m.id}`)
    try {
      await salvarMissao({ ...m, ativa: !m.ativa })
      await carregar()
    } catch {
      toast.error('Não foi possível mudar a missão.')
    } finally {
      setMexendo(null)
    }
  }
  const salvarMax = async () => {
    const n = textoMax.trim() === '' ? null : Math.round(Number(textoMax))
    if (n !== null && (!Number.isFinite(n) || n < 1)) return setTextoMax(maxPorAno == null ? '' : String(maxPorAno))
    if (n === maxPorAno) return
    setSalvandoMax(true)
    try {
      await salvarMaxPorAno(n)
      setMaxPorAno(n)
      toast.success(n == null ? 'Sem limite por ano.' : `Limite: ${n} ${n === 1 ? 'vídeo aprovado' : 'vídeos aprovados'} por ano.`)
    } catch {
      toast.error('Não foi possível salvar o limite.')
    } finally {
      setSalvandoMax(false)
    }
  }
  const hoje = hojeSP()
  const ROTULO_PERIODO = { sempre: 'Sempre', agendada: 'Agendada', no_ar: 'No ar', encerrada: 'Encerrada' } as const
  const COR_PERIODO = { sempre: 'bg-gray-100 text-gray-600', agendada: 'bg-blue-50 text-blue-700', no_ar: 'bg-emerald-50 text-emerald-700', encerrada: 'bg-gray-100 text-gray-500' } as const

  const novoDegrau = async () => {
    const ordem = (recompensas.at(-1)?.ordem ?? 0) + 1
    try {
      await salvarRecompensa({ ordem, descricao: 'Novo prêmio (edite o texto)' })
      await carregar()
    } catch {
      toast.error('Não foi possível adicionar o degrau.')
    }
  }
  const tirarDegrau = async (r: Recompensa) => {
    if (!(await confirmar({ titulo: `Tirar o prêmio da ${ordinal(r.ordem)}?`, descricao: 'Quem já ganhou continua com o prêmio.', destrutivo: true }))) return
    try {
      await removerRecompensa(r.ordem)
      await carregar()
    } catch {
      toast.error('Não foi possível tirar o degrau.')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      {dialogo}
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Vídeos</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Missões de vídeo: o restaurante grava falando do EasyFeed, o Gemini confere os requisitos e cada missão cumprida dá o próximo prêmio da escada.
            </p>
          </div>
          <button
            onClick={() => { setCarregando(true); carregar() }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {carregando ? <Skeleton className="h-64 w-full rounded-xl" /> : (
          <Tabs defaultValue="envios">
            <TabsList className="mb-3">
              <TabsTrigger value="envios">Vídeos enviados{paraRevisar ? ` (${paraRevisar})` : ''}</TabsTrigger>
              <TabsTrigger value="premios">Prêmios{pendentes ? ` (${pendentes})` : ''}</TabsTrigger>
              <TabsTrigger value="missoes">Missões</TabsTrigger>
              <TabsTrigger value="escada">Escada e limite</TabsTrigger>
            </TabsList>

            <TabsContent value="envios">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {FILTROS.map((f) => (
                  <button
                    key={f.chave}
                    onClick={() => setFiltro(f.chave)}
                    className={cn('h-7 rounded-full px-3 text-[12px] font-medium transition-colors', filtro === f.chave ? 'bg-[#1D4ED8] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
                  >
                    {f.rotulo}
                  </button>
                ))}
              </div>
              {filtrados.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-500">Nenhum vídeo aqui.</p>
              ) : (
                <CrudTable>
                  <thead><tr><Th>Restaurante</Th><Th>Missão</Th><Th>Enviado</Th><Th>Situação</Th><Th className="text-right">Ver</Th></tr></thead>
                  <tbody>
                    {filtrados.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                        <Td className="font-medium text-gray-800">{e.restaurante}</Td>
                        <Td className="text-gray-600">{e.missao}</Td>
                        <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(e.criado_em)}</Td>
                        <Td>
                          <Pilula className={COR_STATUS[e.status]}>
                            {e.status === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
                            {ROTULO_ADMIN[e.status]}
                          </Pilula>
                          {e.revisado_por && <span className="ml-1.5 text-[11px] text-gray-400">revisado</span>}
                        </Td>
                        <Td className="text-right">
                          <button onClick={() => setAberto(e)} title="Assistir e revisar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                            <Play className="h-4 w-4" />
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </CrudTable>
              )}
            </TabsContent>

            <TabsContent value="premios">
              <p className="mb-3 text-[12px] text-gray-500">O prêmio ainda não é aplicado sozinho na cobrança: dê o prêmio e marque aqui como aplicado.</p>
              {premios.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-500">Nenhum prêmio ganho ainda.</p>
              ) : (
                <CrudTable>
                  <thead><tr><Th>Restaurante</Th><Th>Ano</Th><Th>Degrau</Th><Th>Prêmio</Th><Th>Ganho em</Th><Th>Situação</Th><Th className="text-right" /></tr></thead>
                  <tbody>
                    {premiosOrdenados.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0">
                        <Td className="font-medium text-gray-800">{p.restaurante}</Td>
                        <Td className="text-[12px] tabular-nums text-gray-500">{p.ano}</Td>
                        <Td className="whitespace-nowrap text-[12px] text-gray-500">{ordinal(p.recompensa_ordem)}</Td>
                        <Td className="text-gray-700">{p.descricao}</Td>
                        <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(p.criado_em)}</Td>
                        <Td>
                          <Pilula className={p.status === 'aplicado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                            {p.status === 'aplicado' ? 'Aplicado' : 'Pendente'}
                          </Pilula>
                        </Td>
                        <Td className="text-right">
                          <Button variant="outline" size="sm" disabled={mexendo === p.id} onClick={() => alternarAplicado(p)} className="h-8 text-[12px]">
                            {mexendo === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : p.status === 'aplicado'
                              ? <><RotateCcw className="mr-1 h-3.5 w-3.5" /> Desfazer</>
                              : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar como aplicado</>}
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </CrudTable>
              )}
            </TabsContent>

            <TabsContent value="missoes">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[12px] text-gray-500">
                  As missões são uma fila: o restaurante vê só a da vez e, quando cumpre, aparece a seguinte, nesta ordem. Desativada ou fora do período é pulada.
                </p>
                <Button
                  size="sm"
                  onClick={() => setEditando({
                    titulo: '', descricao: '', requisitos: [{ id: '', texto: '' }], ordem: (missoes.at(-1)?.ordem ?? 0) + 1, ativa: true,
                    duracao_min_s: null, duracao_max_s: null, disponivel_de: null, disponivel_ate: null,
                  })}
                  className="bg-[#1D4ED8] hover:bg-[#1E40AF]"
                >
                  <Plus className="mr-1 h-4 w-4" /> Nova missão
                </Button>
              </div>
              <CrudTable>
                <thead><tr><Th>Ordem</Th><Th>Missão</Th><Th>Período</Th><Th>Duração</Th><Th>Requisitos</Th><Th>Ativa</Th><Th className="text-right">Editar</Th></tr></thead>
                <tbody>
                  {missoes.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0">
                      <Td className="text-[12px] font-semibold text-gray-500 tabular-nums">{m.ordem}</Td>
                      <Td>
                        <p className="font-medium text-gray-800">{m.titulo}</p>
                        {m.descricao && <p className="text-[12px] text-gray-500">{m.descricao}</p>}
                      </Td>
                      <Td>
                        <Pilula className={COR_PERIODO[estadoDoPeriodo(m, hoje)]}>{ROTULO_PERIODO[estadoDoPeriodo(m, hoje)]}</Pilula>
                        {rotuloPeriodo(m) && <p className="mt-0.5 text-[11px] text-gray-400">{rotuloPeriodo(m)}</p>}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-gray-600">{rotuloDuracao(m)}</Td>
                      <Td className="text-[12px] text-gray-600">{m.requisitos.length}</Td>
                      <Td><Switch checked={m.ativa} disabled={mexendo === `m${m.id}`} onCheckedChange={() => alternarMissao(m)} /></Td>
                      <Td className="text-right">
                        <button onClick={() => setEditando({ ...m })} title="Editar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </Td>
                    </tr>
                  ))}
                  {missoes.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-500">Nenhuma missão ainda. Crie a primeira em <span className="font-medium text-gray-700">Nova missão</span>.</td></tr>
                  )}
                </tbody>
              </CrudTable>
            </TabsContent>

            <TabsContent value="escada">
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-800">Máximo de vídeos aprovados por ano, por restaurante</p>
                  <p className="text-[11px] text-gray-500">Somando todas as missões. Os vídeos em análise contam. Vazio = sem limite.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={textoMax}
                    onChange={(e) => setTextoMax(e.target.value)}
                    onBlur={salvarMax}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    placeholder="Sem limite"
                    className={cn(campo, 'w-28')}
                  />
                  {salvandoMax && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                </div>
              </div>
              <p className="mb-3 text-[12px] text-gray-500">
                O que o restaurante ganha a cada missão cumprida no ano: a 1ª dá o primeiro prêmio, a 2ª o segundo, e assim por diante. A escada recomeça em 1º de janeiro. Mudar o texto não muda o que já foi ganho. Por enquanto os prêmios são de exemplo.
              </p>
              <div className="rounded-xl border border-gray-200 bg-white">
                {recompensas.map((r, i) => (
                  <DegrauEditavel key={r.ordem} r={r} ultimo={i === recompensas.length - 1} onSalvo={carregar} onRemover={() => tirarDegrau(r)} />
                ))}
                {recompensas.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-gray-500">Nenhum prêmio na escada.</p>}
              </div>
              {maxPorAno != null && recompensas.length > maxPorAno && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Com o limite de {maxPorAno} por ano, {recompensas.length - maxPorAno === 1 ? `o prêmio da ${ordinal(maxPorAno + 1)} nunca é alcançado` : `os prêmios da ${ordinal(maxPorAno + 1)} em diante nunca são alcançados`}.
                </p>
              )}
              <button onClick={novoDegrau} className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#1D4ED8] hover:underline">
                <Plus className="h-3.5 w-3.5" /> Prêmio da {ordinal((recompensas.at(-1)?.ordem ?? 0) + 1)}
              </button>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <DetalheEnvio envio={aberto} onFechar={() => setAberto(null)} onMudou={carregar} />
      <EditarMissao rascunho={editando} onFechar={() => setEditando(null)} onSalvo={carregar} />
    </div>
  )
}
