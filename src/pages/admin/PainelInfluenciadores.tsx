import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Check, ChevronRight, Copy, ExternalLink, Loader2, Megaphone, Plus, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { supabase } from '@/lib/supabase/client'
import { linkDeIndicacao } from '@/lib/indicacoes'
import {
  COR_VIDEO, DIAS_DA_JANELA, exemploDaComissao, FAIXAS, faixaDosSeguidores, formatarSeguidores, lerArroba, lerSeguidores, problemaDoCadastro,
  redeDoVideo, ROTULO_VIDEO_ADMIN, situacaoDoInfluenciador, SITUACOES, textoDaComissao, videosNaJanela,
  type CadastroDoInfluenciador, type SituacaoDoInfluenciador, type SituacaoDoVideo,
} from '@/lib/influenciadores'
import { buscarPrecos } from '@/lib/queries/cobranca'
import { buscarCustosDaComissao } from '@/lib/queries/indicacoes'
import {
  conferirVideo, definirIncluiTestes, lerIncluiTestes, listarInfluenciadores, removerInfluenciador, salvarInfluenciador,
  type InfluenciadorAdmin,
} from '@/lib/queries/influencers'
import { mensalidadeLiquida, reais } from '@/lib/vendedores'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'

/* Admin → Influenciadores, nas duas versões (pedido do Raver, 21/10/2026).
   A troca: o influenciador entra na área /influencers e usa os dados
   anônimos dos restaurantes; em troca, posta vídeos vendendo o EasyFeed com o
   link dele. Quem assina pelo link rende a ele X% de cada mensalidade
   líquida, da 2ª em diante, por N meses — X e N são de cada um (mudam com o
   tamanho dele) e o asaas-webhook calcula como a comissão dos vendedores.
   Para pegar quem só usa os dados, cada um tem uma situação, pelos últimos 30
   dias: vídeos que ele registrou (o admin confere), visitas no link e dias em
   que entrou no painel.
   O login da área é SEPARADO do EasyFeed (outro cliente do Supabase); um
   e-mail de conta EasyFeed não pode ser de influenciador (EMAIL_DE_RESTAURANTE). */

const LINK_DA_AREA = 'https://easyfeed.com.br/influencers'

/** O endereço público do site: é para lá que o link aponta. */
function siteDoEasyFeed(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
}

const dia = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function Pilula({ situacao }: { situacao: SituacaoDoInfluenciador }) {
  const s = SITUACOES[situacao]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', s.cor)} title={s.explica}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.ponto)} />
      {s.rotulo}
    </span>
  )
}

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe: string; alerta?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-white px-4 py-3', alerta ? 'border-rose-200' : 'border-gray-200')}>
      <p className="text-[12px] text-gray-500">{rotulo}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', alerta ? 'text-rose-700' : 'text-gray-900')}>{valor}</p>
      <p className="text-[11.5px] text-gray-400">{detalhe}</p>
    </div>
  )
}

// ── O cadastro (popup de adicionar e de editar) ──────────────────────────────

interface Texto { email: string; nome: string; arroba: string; seguidores: string; pct: string; meses: string; videos: string }
const TEXTO_NOVO: Texto = { email: '', nome: '', arroba: '', seguidores: '', pct: '15', meses: '12', videos: '2' }

function textoDe(i: InfluenciadorAdmin): Texto {
  return {
    email: i.email,
    nome: i.nome ?? '',
    arroba: i.arroba ? `@${i.arroba}` : '',
    seguidores: i.seguidores == null ? '' : String(i.seguidores),
    pct: i.comissao_pct == null ? '' : String(i.comissao_pct).replace('.', ','),
    meses: i.comissao_meses == null ? '' : String(i.comissao_meses),
    videos: String(i.videos_por_mes),
  }
}

function cadastroDe(t: Texto): CadastroDoInfluenciador {
  const n = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(',', '.')))
  return {
    email: t.email,
    nome: t.nome,
    arroba: lerArroba(t.arroba),
    seguidores: lerSeguidores(t.seguidores),
    comissaoPct: n(t.pct),
    comissaoMeses: n(t.meses),
    videosPorMes: n(t.videos),
  }
}

function Campos({ texto, mudar, novo, liquida, aoTocarPct }: {
  texto: Texto
  mudar: (m: Partial<Texto>) => void
  novo: boolean
  liquida: number | null
  aoTocarPct: () => void
}) {
  const c = cadastroDe(texto)
  const faixa = faixaDosSeguidores(Number.isNaN(c.seguidores) ? null : c.seguidores)
  const comissaoOk = Number.isFinite(c.comissaoPct) && c.comissaoPct > 0 && Number.isInteger(c.comissaoMeses) && c.comissaoMeses >= 1
  const exemplo = liquida && comissaoOk ? exemploDaComissao(c.comissaoPct, c.comissaoMeses, liquida) : null
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="inf-email" className="text-[13px] text-gray-700">E-mail para entrar na área</Label>
        <Input id="inf-email" type="email" value={texto.email} onChange={(e) => mudar({ email: e.target.value })} disabled={!novo} placeholder="nome@exemplo.com" />
        <p className="text-[12px] text-gray-500">
          {novo
            ? 'No primeiro acesso, a pessoa recebe neste e-mail o link para criar a senha. O login é separado do EasyFeed: e-mail de conta de restaurante não serve.'
            : 'O e-mail não muda: é o login da pessoa.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inf-nome" className="text-[13px] text-gray-700">Nome</Label>
          <Input id="inf-nome" value={texto.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ana Souza" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inf-arroba" className="text-[13px] text-gray-700">Perfil</Label>
          <Input id="inf-arroba" value={texto.arroba} onChange={(e) => mudar({ arroba: e.target.value })} placeholder="@anacome ou o link do perfil" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inf-seg" className="text-[13px] text-gray-700">Seguidores</Label>
        <Input id="inf-seg" value={texto.seguidores} onChange={(e) => mudar({ seguidores: e.target.value })} placeholder="25 mil" className="sm:w-48" />
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <p className="text-[13px] font-medium text-gray-800">Comissão</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
          <Input aria-label="Porcentagem" value={texto.pct} onChange={(e) => { aoTocarPct(); mudar({ pct: e.target.value.replace(/[^\d,]/g, '') }) }} inputMode="decimal" className="h-9 w-20 text-right tabular-nums" />
          % de cada mensalidade, da 2ª em diante, por
          <Input aria-label="Meses" value={texto.meses} onChange={(e) => mudar({ meses: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="h-9 w-16 text-right tabular-nums" />
          meses
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-gray-500">Sugestão pelo tamanho:</span>
          {FAIXAS.map((f, i) => (
            <button
              key={f.rotulo}
              type="button"
              onClick={() => { aoTocarPct(); mudar({ pct: String(f.pct) }) }}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[12px] transition-colors',
                faixa === i ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {f.rotulo} · {f.pct}%
            </button>
          ))}
        </div>
        {exemplo && (
          <p className="rounded-md bg-gray-50 px-2.5 py-2 text-[12px] text-gray-600">
            Com a mensalidade líquida de {reais(liquida!)}: {reais(exemplo.porMes)} por mês para cada assinante que vier pelo link, até{' '}
            <b className="text-gray-800">{reais(exemplo.total)}</b> por assinante. Calculada e registrada como a dos vendedores.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inf-videos" className="text-[13px] text-gray-700">Vídeos combinados por mês</Label>
        <div className="flex items-center gap-2">
          <Input id="inf-videos" value={texto.videos} onChange={(e) => mudar({ videos: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="h-9 w-20 text-right tabular-nums" />
          <span className="text-[12px] text-gray-500">vendendo o EasyFeed com o link (0 = sem meta)</span>
        </div>
      </div>
    </div>
  )
}

// ── Os vídeos que a pessoa registrou ─────────────────────────────────────────

function Videos({ inf, aoMudar }: { inf: InfluenciadorAdmin; aoMudar: () => void }) {
  const [mexendo, setMexendo] = useState<string | null>(null)
  const [recusando, setRecusando] = useState<string | null>(null)
  const [recado, setRecado] = useState('')

  const marcar = async (id: string, situacao: SituacaoDoVideo, texto = '') => {
    setMexendo(id)
    try {
      await conferirVideo(id, situacao, texto)
      setRecusando(null)
      setRecado('')
      aoMudar()
    } catch {
      toast.error('Não foi possível conferir agora.')
    } finally {
      setMexendo(null)
    }
  }

  if (inf.videos.length === 0) {
    return <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-[13px] text-gray-500">Nenhum vídeo registrado ainda.</p>
  }
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {inf.videos.map((v) => (
        <li key={v.id} className="space-y-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-gray-800 hover:underline">
              <span className="truncate">{redeDoVideo(v.url) ?? 'Vídeo'} · {dia(v.criado_em)}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </a>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_VIDEO[v.situacao])}>{ROTULO_VIDEO_ADMIN[v.situacao]}</span>
            {mexendo === v.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : v.situacao === 'pendente' ? (
              <>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => marcar(v.id, 'aprovado')}><Check className="mr-1 h-3.5 w-3.5" /> Conta</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => { setRecusando(v.id); setRecado('') }}><X className="mr-1 h-3.5 w-3.5" /> Não conta</Button>
              </>
            ) : (
              <button type="button" title="Voltar para conferir" aria-label="Voltar para conferir" onClick={() => marcar(v.id, 'pendente')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="truncate text-[12px] text-gray-400">{v.url}</p>
          {v.situacao === 'recusado' && v.recado && <p className="text-[12px] text-rose-700">Recado: {v.recado}</p>}
          {recusando === v.id && (
            <div className="flex flex-wrap gap-2">
              <Input autoFocus value={recado} onChange={(e) => setRecado(e.target.value.slice(0, 300))} placeholder="Por que não conta? (a pessoa vê)" className="h-8 min-w-0 flex-1 basis-56 text-[13px]" />
              <Button size="sm" className="h-8" onClick={() => marcar(v.id, 'recusado', recado)}>Confirmar</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setRecusando(null)}>Cancelar</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function Popup({ aberto, liquida, aoFechar, aoMudar }: {
  aberto: InfluenciadorAdmin | 'novo' | null
  liquida: number | null
  aoFechar: () => void
  aoMudar: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const novo = aberto === 'novo'
  const inf = aberto && aberto !== 'novo' ? aberto : null
  const [texto, setTexto] = useState<Texto>(TEXTO_NOVO)
  const [pctTocado, setPctTocado] = useState(false)
  const [vista, setVista] = useState<'acompanhamento' | 'cadastro'>('acompanhamento')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  // Abriu outro (ou o novo): começa do zero. Recarregar a lista não apaga o que está sendo digitado.
  const chave = aberto === 'novo' ? 'novo' : aberto?.id ?? null
  useEffect(() => {
    if (!chave) return
    setTexto(inf ? textoDe(inf) : TEXTO_NOVO)
    setPctTocado(!!inf)
    setVista('acompanhamento')
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const mudar = (m: Partial<Texto>) => {
    setErro(null)
    setTexto((t) => {
      const n = { ...t, ...m }
      // Sem % digitada à mão, os seguidores sugerem a da faixa.
      if (m.seguidores !== undefined && !pctTocado) {
        const s = lerSeguidores(n.seguidores)
        const f = faixaDosSeguidores(s == null || Number.isNaN(s) ? null : s)
        if (f != null) n.pct = String(FAIXAS[f].pct)
      }
      return n
    })
  }

  const cadastro = cadastroDe(texto)
  const problema = problemaDoCadastro(cadastro, novo)

  const salvar = async () => {
    if (problema) return setErro(problema)
    setSalvando(true)
    try {
      await salvarInfluenciador(inf?.id ?? null, cadastro)
      toast.success(novo ? 'Influenciador adicionado. O link dele já está pronto.' : 'Salvo.')
      aoMudar()
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar agora.')
    } finally {
      setSalvando(false)
    }
  }

  const tirar = async () => {
    if (!inf) return
    const ok = await confirmar({
      titulo: `Tirar ${inf.nome || inf.email}?`,
      descricao: 'O acesso à área acaba na hora e o link para de valer. Quem já entrou pelo link continua contado. Dá para adicionar o e-mail de novo depois (com outro link).',
      confirmar: 'Tirar acesso',
      destrutivo: true,
    })
    if (!ok) return
    setSalvando(true)
    try {
      await removerInfluenciador(inf.id)
      toast.success('Acesso tirado.')
      aoMudar()
      aoFechar()
    } catch {
      toast.error('Não foi possível tirar agora.')
    } finally {
      setSalvando(false)
    }
  }

  const link = inf?.codigo ? linkDeIndicacao(siteDoEasyFeed(), inf.codigo) : ''
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem permissão */ }
  }

  const situacao = inf ? situacaoDoInfluenciador({ entrouEm: inf.onboarding_em, acessos30: inf.acessos_30d, visitas30: inf.visitas_30d, videos: inf.videos, videosPorMes: inf.videos_por_mes }) : null
  const paraConferir = inf ? inf.videos.filter((v) => v.situacao === 'pendente').length : 0

  return (
    <>
    {dialogo}
    <Dialog open={!!aberto} onOpenChange={(a) => !a && !salvando && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{novo ? 'Adicionar influenciador' : inf?.nome || inf?.email}</DialogTitle>
          <DialogDescription>
            {novo
              ? 'Ganha acesso à área com os dados dos restaurantes e um link próprio. Em troca, posta vídeos vendendo o EasyFeed com esse link.'
              : [inf?.arroba && `@${inf.arroba}`, inf?.seguidores != null && `${formatarSeguidores(inf.seguidores)} seguidores`, inf?.email].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {inf && (
          <div className="inline-flex self-start rounded-lg bg-gray-100 p-1">
            {([['acompanhamento', `Acompanhamento${paraConferir ? ` · ${paraConferir} para conferir` : ''}`], ['cadastro', 'Cadastro e comissão']] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors', vista === v ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
                {r}
              </button>
            ))}
          </div>
        )}

        {inf && vista === 'acompanhamento' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
              <Pilula situacao={situacao!} />
              <p className="text-[12.5px] text-gray-600">{SITUACOES[situacao!].explica}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [String(inf.acessos_30d), inf.acessos_30d === 1 ? 'dia no painel' : 'dias no painel'],
                [String(inf.visitas_30d), inf.visitas_30d === 1 ? 'visita no link' : 'visitas no link'],
                [String(inf.contas), inf.contas === 1 ? 'criou conta' : 'criaram conta'],
                [String(inf.assinando), 'assinando hoje'],
              ].map(([n, r]) => (
                <div key={r} className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-base font-semibold tabular-nums text-gray-900">{n}</p>
                  <p className="text-[11.5px] text-gray-500">{r}</p>
                </div>
              ))}
            </div>
            <p className="-mt-2 text-[11.5px] text-gray-400">
              Painel e visitas: últimos {DIAS_DA_JANELA} dias. Último acesso: {inf.ultimo_acesso_em ? format(parseISO(inf.ultimo_acesso_em), "dd/MM/yyyy 'às' HH:mm") : 'nunca'}.
            </p>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-gray-800">Link de indicação</p>
              {inf.codigo && inf.link_ativo ? (
                <div className="flex gap-2">
                  <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-gray-50 px-3">
                    <span className="truncate text-[13px] text-gray-700">{link}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-9" onClick={copiar}>
                    {copiado ? <Check className="mr-1 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1 h-4 w-4" />} {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              ) : (
                <p className="text-[12.5px] text-gray-500">Sem link. Salve o cadastro para criar.</p>
              )}
              {inf.comissao_pct != null && inf.comissao_meses != null && (
                <p className="text-[12px] text-gray-500">Comissão: {textoDaComissao(inf.comissao_pct, inf.comissao_meses)}.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-gray-800">
                Vídeos{' '}
                <span className="font-normal text-gray-500">
                  · {videosNaJanela(inf.videos)}{inf.videos_por_mes > 0 && ` de ${inf.videos_por_mes} combinados`} nos últimos {DIAS_DA_JANELA} dias
                </span>
              </p>
              <Videos inf={inf} aoMudar={aoMudar} />
            </div>
          </div>
        ) : (
          <Campos texto={texto} mudar={mudar} novo={novo} liquida={liquida} aoTocarPct={() => setPctTocado(true)} />
        )}

        {erro && <p className="text-[12.5px] text-rose-600">{erro}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {inf ? (
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={tirar} disabled={salvando}>Tirar acesso</Button>
          ) : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={aoFechar} disabled={salvando}>{inf && vista === 'acompanhamento' ? 'Fechar' : 'Cancelar'}</Button>
            {(novo || vista === 'cadastro') && (
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {novo ? 'Adicionar' : 'Salvar'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ── A página ─────────────────────────────────────────────────────────────────

export function PainelInfluenciadores() {
  const [lista, setLista] = useState<InfluenciadorAdmin[] | null>(null)
  const [erro, setErro] = useState(false)
  const [abertoId, setAbertoId] = useState<string | 'novo' | null>(null)
  const [liquida, setLiquida] = useState<number | null>(null)
  const [incluiTestes, setIncluiTestes] = useState<boolean | null>(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setLista(await listarInfluenciadores())
      setErro(false)
    } catch (e) {
      console.error(e)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    carregar()
    lerIncluiTestes().then(setIncluiTestes).catch(() => setIncluiTestes(null))
    // A comissão é sobre a mensalidade líquida do Restaurante (o link cria conta de restaurante).
    Promise.all([buscarPrecos('restaurante'), buscarCustosDaComissao('restaurante').catch(() => [])])
      .then(([p, c]) => {
        const m = p.find((x) => x.ciclo === 'mensal')?.total_centavos
        setLiquida(m ? mensalidadeLiquida(m, c) : null)
      })
      .catch(() => setLiquida(null))
    // Atualiza sozinha quando alguém termina o primeiro acesso ou entra.
    const canal = supabase
      .channel('admin-influenciadores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'influenciadores' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const linhas = useMemo(() => (lista ?? []).map((i) => ({
    inf: i,
    situacao: situacaoDoInfluenciador({ entrouEm: i.onboarding_em, acessos30: i.acessos_30d, visitas30: i.visitas_30d, videos: i.videos, videosPorMes: i.videos_por_mes }),
    videos30: videosNaJanela(i.videos),
    paraConferir: i.videos.filter((v) => v.situacao === 'pendente').length,
  })), [lista])

  const total = linhas.length
  const entraram = linhas.filter((l) => !!l.inf.onboarding_em).length
  const visitas = linhas.reduce((s, l) => s + l.inf.visitas_30d, 0)
  const contas = linhas.reduce((s, l) => s + l.inf.contas, 0)
  const assinando = linhas.reduce((s, l) => s + l.inf.assinando, 0)
  const soDados = linhas.filter((l) => l.situacao === 'so_usa_dados').length
  const aberto = abertoId === 'novo' ? 'novo' : lista?.find((i) => i.id === abertoId) ?? null

  const alternarTestes = async (v: boolean) => {
    const antes = incluiTestes
    setIncluiTestes(v)
    try {
      await definirIncluiTestes(v)
    } catch {
      setIncluiTestes(antes)
      toast.error('Não foi possível mudar agora.')
    }
  }

  const copiarLinkDaArea = async () => {
    try {
      await navigator.clipboard.writeText(LINK_DA_AREA)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem permissão */ }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800">Influenciadores</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Usam os dados anônimos dos restaurantes e, em troca, postam vídeos vendendo o EasyFeed com o próprio link.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copiarLinkDaArea} title={LINK_DA_AREA}>
              {copiado ? <Check className="mr-1 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1 h-4 w-4" />}
              {copiado ? 'Copiado' : 'Link da área'}
            </Button>
            <Button size="sm" onClick={() => setAbertoId('novo')}><Plus className="mr-1 h-4 w-4" /> Adicionar influenciador</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero rotulo="Influenciadores" valor={String(total)} detalhe={`${entraram} já ${entraram === 1 ? 'entrou' : 'entraram'} na área`} />
          <Numero rotulo="Visitas nos links" valor={String(visitas)} detalhe={`últimos ${DIAS_DA_JANELA} dias`} />
          <Numero rotulo="Contas pelos links" valor={String(contas)} detalhe={`${assinando} ${assinando === 1 ? 'assina' : 'assinam'} hoje`} />
          <Numero rotulo="Só usam os dados" valor={String(soDados)} detalhe="entram e não divulgam" alerta={soDados > 0} />
        </div>

        {erro ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-600">Não foi possível carregar os influenciadores.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        ) : !lista ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : linhas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">
            <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum influenciador ainda.</p>
          </div>
        ) : (
          <CrudTable>
            <thead>
              <tr>
                <Th>Influenciador</Th>
                <Th>Comissão</Th>
                <Th>Vídeos ({DIAS_DA_JANELA} dias)</Th>
                <Th>Link ({DIAS_DA_JANELA} dias)</Th>
                <Th>Situação</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ inf, situacao, videos30, paraConferir }) => (
                <tr key={inf.id} onClick={() => setAbertoId(inf.id)} className="cursor-pointer border-t border-gray-200 hover:bg-gray-50/70">
                  <Td>
                    <p className="font-medium text-gray-800">{inf.nome || inf.email}</p>
                    <p className="text-[12px] text-gray-400">
                      {[inf.arroba && `@${inf.arroba}`, inf.seguidores != null && `${formatarSeguidores(inf.seguidores)} seguidores`].filter(Boolean).join(' · ') || (inf.nome ? inf.email : '')}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-gray-700">
                    {inf.comissao_pct != null && inf.comissao_meses != null
                      ? <>{String(inf.comissao_pct).replace('.', ',')}% <span className="text-gray-400">· {inf.comissao_meses} meses</span></>
                      : <span className="text-gray-400">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-gray-700">
                    <span className="tabular-nums">{videos30}{inf.videos_por_mes > 0 && <span className="text-gray-400"> de {inf.videos_por_mes}</span>}</span>
                    {paraConferir > 0 && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">{paraConferir} para conferir</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-gray-700">
                    <p className="tabular-nums">{plural(inf.visitas_30d, 'visita', 'visitas')}</p>
                    <p className="text-[12px] text-gray-400">{plural(inf.contas, 'conta', 'contas')} · {inf.assinando} {inf.assinando === 1 ? 'assina' : 'assinam'}</p>
                  </Td>
                  <Td><Pilula situacao={situacao} /></Td>
                  <Td className="text-right">
                    <button type="button" aria-label={`Abrir ${inf.nome || inf.email}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CrudTable>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-gray-500" title="As suas, a do Caio e as de demonstração dos vendedores.">
          <Switch checked={incluiTestes === true} disabled={incluiTestes === null} onCheckedChange={alternarTestes} />
          Mostrar também as contas de teste nos dados da área
        </label>
      </div>

      <Popup aberto={aberto} liquida={liquida} aoFechar={() => setAbertoId(null)} aoMudar={carregar} />
    </div>
  )
}
