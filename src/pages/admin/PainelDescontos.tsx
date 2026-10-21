import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Clapperboard, Loader2, Pencil, Play, Plus, RefreshCw, Settings2, Trash2, UserPlus, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useArea } from '@/lib/area'
import { DEFINICOES, type Area } from '@/lib/areas'
import {
  DURACAO_TETO_S, estadoDoPeriodo, formatarDuracao, formatarTamanho, hojeSP, idDoRequisito, rotuloDuracao, rotuloPeriodo, type Missao,
} from '@/lib/missoes'
import { buscarPrecos } from '@/lib/queries/cobranca'
import {
  acaoVideos, buscarConfigDosVideos, buscarTodasMissoes, buscarTodosEnvios, buscarTodosPremios, linkDoVideo, salvarConfigDosVideos, salvarMissao,
  type ConfigDosVideos, type EnvioAdmin, type MissaoParaSalvar, type PremioAdmin,
} from '@/lib/queries/missoes'
import { reais } from '@/lib/vendedores'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'

/* Admin → Descontos (antes "Vídeos"), nos dois softwares. Pedido do Raver
   (21/10/2026): só o essencial, nomes fáceis, sem botão de atualizar.
   - Vídeos: os vídeos que as contas mandam (a IA confere, o admin revisa) e
     as missões (o que gravar). Cada vídeo aprovado vale um saldo de X% de uma
     mensalidade, até N vídeos por ano: os dois ficam em Configurações (a
     escada de prêmios e a lista de prêmios saíram).
   - Indicação: em branco, até a regra do desconto por indicação ser definida. */

const quando = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
const campo = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-[#1D4ED8]'

const COR_STATUS: Record<EnvioAdmin['status'], string> = {
  enviando: 'bg-gray-100 text-gray-600',
  analisando: 'bg-blue-50 text-blue-700',
  aprovado: 'bg-emerald-50 text-emerald-700',
  reprovado: 'bg-rose-50 text-rose-700',
  erro: 'bg-amber-50 text-amber-700',
}
const ROTULO_STATUS: Record<EnvioAdmin['status'], string> = {
  enviando: 'Enviando', analisando: 'Em análise', aprovado: 'Aprovado', reprovado: 'Recusado', erro: 'Revisar',
}

function Pilula({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

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
    toast.success(acao === 'admin_analisar_de_novo' ? 'A IA vai assistir de novo.' : extra.aprovado ? 'Aprovado.' : 'Recusado.')
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
              <Pilula className={COR_STATUS[envio.status]}>{ROTULO_STATUS[envio.status]}</Pilula>
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

            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Recado para o cliente (opcional)" className="text-[13px]" />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" size="sm" disabled={!!fazendo || envio.status === 'analisando'} onClick={() => agir('admin_analisar_de_novo')}>
                {fazendo === 'admin_analisar_de_novo' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                IA assiste de novo
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!!fazendo} onClick={() => agir('admin_decidir', { aprovado: false, motivo })} className="text-rose-700">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" /> Recusar
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

function EditarMissao({ area, rascunho, onFechar, onSalvo }: { area: Area; rascunho: Rascunho | null; onFechar: () => void; onSalvo: () => void }) {
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
      await salvarMissao(area, { ...m, requisitos })
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
              <DialogDescription>O cliente vê o título e os requisitos. A IA assiste o vídeo e confere cada requisito.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <input className={campo} value={m.titulo} onChange={(e) => setM({ ...m, titulo: e.target.value })} placeholder="Título (ex.: Depoimento sobre o EasyFeed)" />
              <Textarea value={m.descricao} onChange={(e) => setM({ ...m, descricao: e.target.value })} rows={2} placeholder="Explicação para a IA (o cliente não vê)" className="text-[13px]" />
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Requisitos <span className="font-normal text-gray-400">· algo que dá para ver ou ouvir no vídeo</span></p>
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
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Duração do vídeo</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <CampoTempo rotulo="Mínimo (0 = sem mínimo)" valor={m.duracao_min_s} onMudar={(v) => setM({ ...m, duracao_min_s: v })} />
                  <CampoTempo rotulo={`Máximo (até ${formatarDuracao(DURACAO_TETO_S)})`} valor={m.duracao_max_s} onMudar={(v) => setM({ ...m, duracao_max_s: v })} />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-gray-600">No ar entre <span className="font-normal text-gray-400">· vazio = sempre</span></p>
                <div className="flex items-center gap-2">
                  <input type="date" className={cn(campo, 'w-40')} value={m.disponivel_de ?? ''} onChange={(e) => setM({ ...m, disponivel_de: e.target.value || null })} />
                  <span className="text-[12px] text-gray-400">e</span>
                  <input type="date" className={cn(campo, 'w-40')} value={m.disponivel_ate ?? ''} onChange={(e) => setM({ ...m, disponivel_ate: e.target.value || null })} />
                </div>
              </div>
              {problema && m.titulo.trim() && <p className="text-[12px] text-rose-600">{problema}</p>}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[13px] text-gray-700">
                  Posição na fila
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

// ── Configurações: saldo por vídeo e limite por ano ──────────────────────────

function Configuracoes({ area, aberto, config, mensalidade, onFechar, onSalvo }: {
  area: Area
  aberto: boolean
  config: ConfigDosVideos
  mensalidade: number | null
  onFechar: () => void
  onSalvo: (c: ConfigDosVideos) => void
}) {
  const [pct, setPct] = useState('')
  const [max, setMax] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (!aberto) return
    setPct(String(config.saldoPct).replace('.', ','))
    setMax(config.maxPorAno == null ? '' : String(config.maxPorAno))
  }, [aberto, config])

  const pctLido = Number(pct.replace(',', '.'))
  const maxLido = max.trim() === '' ? null : Number(max)
  const pctOk = pct.trim() !== '' && Number.isFinite(pctLido) && pctLido >= 0 && pctLido <= 1000
  const maxOk = maxLido === null || (Number.isInteger(maxLido) && maxLido >= 1 && maxLido <= 100)

  const salvar = async () => {
    if (!pctOk || !maxOk) return
    const nova = { saldoPct: Math.round(pctLido * 100) / 100, maxPorAno: maxLido }
    setSalvando(true)
    try {
      await salvarConfigDosVideos(area, nova)
      toast.success('Configurações salvas.')
      onSalvo(nova)
      onFechar()
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Configurações dos vídeos</DialogTitle>
          <DialogDescription>Valem para as contas do {DEFINICOES[area].nome}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="cfg-saldo" className="text-[13px] font-medium text-gray-800">Saldo de cada vídeo aprovado</label>
            <div className="flex items-center gap-2">
              <Input id="cfg-saldo" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" className="w-24 text-right tabular-nums" />
              <span className="text-[13px] text-gray-500">% de uma mensalidade</span>
            </div>
            <p className="text-[12px] text-gray-500">
              {pctOk && mensalidade ? `Hoje dá ${reais(Math.round(mensalidade * pctLido / 100))} por vídeo (mensalidade de ${reais(mensalidade)}).` : 'O saldo é usado para abater a mensalidade.'}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="cfg-max" className="text-[13px] font-medium text-gray-800">Máximo de vídeos aprovados por ano</label>
            <div className="flex items-center gap-2">
              <Input id="cfg-max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Sem limite" className="w-24 text-right tabular-nums" />
              <span className="text-[13px] text-gray-500">por conta</span>
            </div>
            <p className="text-[12px] text-gray-500">Somando todas as missões. Recomeça em 1º de janeiro.</p>
          </div>
          {(!pctOk || !maxOk) && <p className="text-[12px] text-rose-600">{!pctOk ? 'Ponha a porcentagem (0 a 1000).' : 'O máximo vai de 1 a 100 (vazio = sem limite).'}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!pctOk || !maxOk || salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── A página ─────────────────────────────────────────────────────────────────

const FILTROS = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'erro', rotulo: 'Para revisar' },
  { chave: 'analisando', rotulo: 'Em análise' },
  { chave: 'aprovado', rotulo: 'Aprovados' },
  { chave: 'reprovado', rotulo: 'Recusados' },
] as const

const ROTULO_PERIODO = { sempre: 'Sempre', agendada: 'Agendada', no_ar: 'No ar', encerrada: 'Encerrada' } as const
const COR_PERIODO = { sempre: 'bg-gray-100 text-gray-600', agendada: 'bg-blue-50 text-blue-700', no_ar: 'bg-emerald-50 text-emerald-700', encerrada: 'bg-gray-100 text-gray-500' } as const

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[12px] text-gray-500">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{valor}</p>
      {detalhe && <p className="text-[11.5px] text-gray-400">{detalhe}</p>}
    </div>
  )
}

export function PainelDescontos() {
  // Cada software tem as suas missões, o seu saldo por vídeo e o seu limite.
  const { area } = useArea()
  const [carregando, setCarregando] = useState(true)
  const [envios, setEnvios] = useState<EnvioAdmin[]>([])
  const [premios, setPremios] = useState<PremioAdmin[]>([])
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [config, setConfig] = useState<ConfigDosVideos>({ saldoPct: 50, maxPorAno: 6 })
  const [mensalidade, setMensalidade] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['chave']>('todos')
  const [vista, setVista] = useState<'recebidos' | 'missoes'>('recebidos')
  const [aberto, setAberto] = useState<EnvioAdmin | null>(null)
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [mexendo, setMexendo] = useState<number | null>(null)
  const [configAberta, setConfigAberta] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [e, p, m, c] = await Promise.all([buscarTodosEnvios(area), buscarTodosPremios(area), buscarTodasMissoes(area), buscarConfigDosVideos(area)])
      setEnvios(e)
      setPremios(p)
      setMissoes(m)
      setConfig(c)
    } catch {
      toast.error('Não foi possível carregar os vídeos.')
    } finally {
      setCarregando(false)
    }
  }, [area])
  useEffect(() => { setCarregando(true); carregar() }, [carregar])
  useEffect(() => {
    buscarPrecos(area).then((p) => setMensalidade(p.find((x) => x.ciclo === 'mensal')?.total_centavos ?? null)).catch(() => setMensalidade(null))
  }, [area])
  // Enquanto a IA assiste algum vídeo, confere sozinha de tempos em tempos.
  const emAnalise = envios.some((e) => e.status === 'analisando')
  useEffect(() => {
    if (!emAnalise) return
    const t = setInterval(carregar, 15_000)
    return () => clearInterval(t)
  }, [emAnalise, carregar])

  const saldoDoEnvio = useMemo(() => new Map(premios.map((p) => [p.envio_id, p.valor_centavos ?? null])), [premios])
  const filtrados = useMemo(() => envios.filter((e) => filtro === 'todos' || e.status === filtro), [envios, filtro])
  const paraRevisar = envios.filter((e) => e.status === 'erro').length
  const anoAtual = new Date().getFullYear()
  const aprovadosNoAno = envios.filter((e) => e.status === 'aprovado' && e.aprovado_em && new Date(e.aprovado_em).getFullYear() === anoAtual).length
  const hoje = hojeSP()
  const noAr = missoes.filter((m) => m.ativa && ['sempre', 'no_ar'].includes(estadoDoPeriodo(m, hoje))).length
  const saldoPorVideo = mensalidade ? Math.round(mensalidade * config.saldoPct / 100) : null

  const alternarMissao = async (m: Missao) => {
    setMexendo(m.id)
    try {
      await salvarMissao(area, { ...m, ativa: !m.ativa })
      await carregar()
    } catch {
      toast.error('Não foi possível mudar a missão.')
    } finally {
      setMexendo(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Descontos <span className="font-normal text-gray-400">· versão {DEFINICOES[area].nome}</span></h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Como as contas ganham saldo para abater a mensalidade.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setConfigAberta(true)} className="shrink-0">
            <Settings2 className="mr-1.5 h-4 w-4" /> Configurações
          </Button>
        </div>

        <Tabs defaultValue="videos">
          <TabsList className="mb-4">
            <TabsTrigger value="videos"><Clapperboard className="mr-1.5 h-4 w-4" /> Vídeos</TabsTrigger>
            <TabsTrigger value="indicacao"><UserPlus className="mr-1.5 h-4 w-4" /> Indicação</TabsTrigger>
          </TabsList>

          <TabsContent value="videos">
            {carregando ? <Skeleton className="h-64 w-full rounded-xl" /> : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Numero rotulo="Saldo por vídeo aprovado" valor={saldoPorVideo != null ? reais(saldoPorVideo) : `${String(config.saldoPct).replace('.', ',')}%`} detalhe={`${String(config.saldoPct).replace('.', ',')}% de uma mensalidade`} />
                  <Numero rotulo="Limite por conta" valor={config.maxPorAno == null ? 'Sem limite' : `${config.maxPorAno} por ano`} />
                  <Numero rotulo={`Aprovados em ${anoAtual}`} valor={String(aprovadosNoAno)} detalhe="somando todas as contas" />
                  <Numero rotulo="Para revisar" valor={String(paraRevisar)} detalhe={paraRevisar ? 'a IA não conseguiu decidir' : 'nada parado'} />
                </div>

                <div className="inline-flex rounded-lg bg-gray-100 p-1">
                  {([['recebidos', `Vídeos recebidos${paraRevisar ? ` · ${paraRevisar} para revisar` : ''}`], ['missoes', `Missões · ${noAr} no ar`]] as const).map(([v, rotulo]) => (
                    <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                      className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors', vista === v ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
                      {rotulo}
                    </button>
                  ))}
                </div>

                {vista === 'recebidos' ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
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
                        <thead><tr><Th>Conta</Th><Th>Missão</Th><Th>Enviado em</Th><Th>Situação</Th><Th>Saldo</Th><Th className="text-right">Ver</Th></tr></thead>
                        <tbody>
                          {filtrados.map((e) => {
                            const saldo = saldoDoEnvio.get(e.id)
                            return (
                              <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                                <Td className="font-medium text-gray-800">{e.restaurante}</Td>
                                <Td className="text-gray-600">{e.missao}</Td>
                                <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(e.criado_em)}</Td>
                                <Td>
                                  <Pilula className={COR_STATUS[e.status]}>
                                    {e.status === 'analisando' && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {ROTULO_STATUS[e.status]}
                                  </Pilula>
                                </Td>
                                <Td className="whitespace-nowrap text-[12.5px] tabular-nums text-gray-700">
                                  {e.status === 'aprovado' ? (saldo != null ? reais(saldo) : <span className="text-gray-400">—</span>) : ''}
                                </Td>
                                <Td className="text-right">
                                  <button onClick={() => setAberto(e)} title="Assistir e decidir" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                                    <Play className="h-4 w-4" />
                                  </button>
                                </Td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </CrudTable>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[12.5px] text-gray-500">O cliente faz uma missão por vez, na ordem da fila.</p>
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
                      <thead><tr><Th>Fila</Th><Th>Missão</Th><Th>No ar</Th><Th>Duração</Th><Th>Ativa</Th><Th className="text-right">Editar</Th></tr></thead>
                      <tbody>
                        {missoes.map((m) => (
                          <tr key={m.id} className="border-b border-gray-100 last:border-0">
                            <Td className="text-[12px] font-semibold tabular-nums text-gray-500">{m.ordem}</Td>
                            <Td>
                              <p className="font-medium text-gray-800">{m.titulo}</p>
                              <p className="text-[12px] text-gray-500">{m.requisitos.length} {m.requisitos.length === 1 ? 'requisito' : 'requisitos'}</p>
                            </Td>
                            <Td>
                              <Pilula className={COR_PERIODO[estadoDoPeriodo(m, hoje)]}>{ROTULO_PERIODO[estadoDoPeriodo(m, hoje)]}</Pilula>
                              {rotuloPeriodo(m) && <p className="mt-0.5 text-[11px] text-gray-400">{rotuloPeriodo(m)}</p>}
                            </Td>
                            <Td className="whitespace-nowrap text-[12px] text-gray-600">{rotuloDuracao(m)}</Td>
                            <Td><Switch checked={m.ativa} disabled={mexendo === m.id} onCheckedChange={() => alternarMissao(m)} aria-label={`Missão ${m.titulo} ativa`} /></Td>
                            <Td className="text-right">
                              <button onClick={() => setEditando({ ...m })} title="Editar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                                <Pencil className="h-4 w-4" />
                              </button>
                            </Td>
                          </tr>
                        ))}
                        {missoes.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-500">Nenhuma missão ainda. Crie a primeira em <span className="font-medium text-gray-700">Nova missão</span>.</td></tr>
                        )}
                      </tbody>
                    </CrudTable>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="indicacao">
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
              <UserPlus className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">Desconto por indicação</p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-gray-500">A regra ainda vai ser definida. Quando estiver pronta, a configuração fica aqui.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <DetalheEnvio envio={aberto} onFechar={() => setAberto(null)} onMudou={carregar} />
      <EditarMissao area={area} rascunho={editando} onFechar={() => setEditando(null)} onSalvo={carregar} />
      <Configuracoes area={area} aberto={configAberta} config={config} mensalidade={mensalidade} onFechar={() => setConfigAberta(false)} onSalvo={setConfig} />
    </div>
  )
}
