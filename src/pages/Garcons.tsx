import { useEffect, useState, useCallback } from 'react'
import { addDays, addMonths, format } from 'date-fns'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2, Download, FileDown, Loader2, Settings, Trophy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { desenharPoster, landingUrl, baixarBlob, canvasToBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
import { cn } from '@/lib/utils'

interface Garcom { id: number; nome_garcon: string; ativo: boolean; bonus_pago_em: string | null }
interface QrInfo { slug: string; total_scans: number }

type Frequencia = 'semanal' | 'mensal' | 'trimestral'

interface ConfigBonificacao {
  meta_escaneamentos: number
  frequencia: Frequencia
  premio: string
  renovar_automatico: boolean
  /** null = regra nunca foi salva/ativada ainda. */
  periodo_inicio: string | null
}

const CONFIG_BONIF_PADRAO: ConfigBonificacao = {
  meta_escaneamentos: 50,
  frequencia: 'mensal',
  premio: '',
  renovar_automatico: true,
  periodo_inicio: null,
}

const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
}

function avancarPeriodo(inicio: Date, frequencia: Frequencia): Date {
  if (frequencia === 'semanal') return addDays(inicio, 7)
  if (frequencia === 'trimestral') return addMonths(inicio, 3)
  return addMonths(inicio, 1)
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function gerarSlug(n = 8) {
  let s = ''
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]
  return s
}

// Sem nome do garçom na imagem — o QR já é único por garçom
async function posterCanvas(url: string, nome: string, temaId: string, tagline: string): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  await desenharPoster(c, { url, nome, temaId, tagline })
  return c
}

export default function Garcons() {
  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  const [restaurantName, setRestaurantName] = useState('Restaurante')
  const [garcons, setGarcons] = useState<Garcom[]>([])
  const [qrs, setQrs] = useState<Record<number, QrInfo>>({})
  const [posterTema, setPosterTema] = useState('classico')
  const [posterMsg, setPosterMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [saving, setSaving] = useState(false)
  const [baixando, setBaixando] = useState(false)
  /** Garçom aberto no dialog pra renomear (null = fechado). */
  const [editando, setEditando] = useState<Garcom | null>(null)
  const [editNome, setEditNome] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  // Regra de bonificação da equipe — `configBonif` é o rascunho editável na
  // tela, `configBonifSalvo` é o último estado gravado no banco (usado pelo
  // botão "Cancelar" pra descartar edições não salvas).
  const [configBonif, setConfigBonif] = useState<ConfigBonificacao>(CONFIG_BONIF_PADRAO)
  const [configBonifSalvo, setConfigBonifSalvo] = useState<ConfigBonificacao>(CONFIG_BONIF_PADRAO)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  /** Escaneamentos de cada garçom DESDE o início do período atual da regra
   *  (não o total acumulado) — é contra isso que a meta é medida. */
  const [scansPeriodo, setScansPeriodo] = useState<Record<number, number>>({})
  const [pagando, setPagando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) { setLoading(false); return }
    const { data: r } = await supabase
      .from('restaurantes')
      .select('id, nome_restaurante, qr_estilo, qr_mensagem, config_bonificacao')
      .eq('auth_user_id', u.user.id)
      .single()
    if (!r) { setLoading(false); return }
    setRestauranteId(r.id)
    if (r.nome_restaurante) setRestaurantName(r.nome_restaurante)
    setPosterTema(r.qr_estilo ?? 'classico')
    setPosterMsg(r.qr_mensagem ?? '')

    let cfg: ConfigBonificacao = { ...CONFIG_BONIF_PADRAO, ...(r.config_bonificacao as Partial<ConfigBonificacao> | null) }

    // Se o período configurado já acabou e "renovar automaticamente" está
    // ligado, avança pro período atual (pode pular vários de uma vez, se
    // ninguém abriu a tela por um tempo) e grava de volta no banco. É isso
    // que zera o progresso de todo mundo sem precisar de um job rodando.
    let periodoInicio = cfg.periodo_inicio ? new Date(cfg.periodo_inicio) : null
    if (periodoInicio && cfg.renovar_automatico) {
      let fim = avancarPeriodo(periodoInicio, cfg.frequencia)
      let mudou = false
      while (fim.getTime() <= Date.now()) {
        periodoInicio = fim
        fim = avancarPeriodo(periodoInicio, cfg.frequencia)
        mudou = true
      }
      if (mudou) {
        cfg = { ...cfg, periodo_inicio: periodoInicio.toISOString() }
        await supabase.from('restaurantes').update({ config_bonificacao: cfg as any }).eq('id', r.id)
      }
    }
    setConfigBonif(cfg)
    setConfigBonifSalvo(cfg)

    const { data: gs } = await supabase
      .from('garcons')
      .select('id, nome_garcon, ativo, bonus_pago_em')
      .eq('restaurante_id', r.id)
      .order('created_at', { ascending: true })
    setGarcons((gs ?? []) as Garcom[])

    const { data: qc } = await supabase
      .from('qr_codes')
      .select('id, garcom_id, slug, total_scans')
      .eq('restaurante_id', r.id)
      .not('garcom_id', 'is', null)
    const map: Record<number, QrInfo> = {}
    const qrCodeIdParaGarcom: Record<number, number> = {}
    for (const q of qc ?? []) {
      if (!q.garcom_id) continue
      map[q.garcom_id] = { slug: q.slug, total_scans: q.total_scans ?? 0 }
      qrCodeIdParaGarcom[q.id] = q.garcom_id
    }
    setQrs(map)

    const idsQr = Object.keys(qrCodeIdParaGarcom).map(Number)
    if (periodoInicio && idsQr.length > 0) {
      const { data: scans } = await supabase
        .from('qr_scans')
        .select('qr_code_id')
        .in('qr_code_id', idsQr)
        .gte('scanned_at', periodoInicio.toISOString())
      const porGarcom: Record<number, number> = {}
      for (const s of scans ?? []) {
        const gId = qrCodeIdParaGarcom[s.qr_code_id]
        if (gId) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
      }
      setScansPeriodo(porGarcom)
    } else {
      setScansPeriodo({})
    }

    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Cria (se necessário) o QR daquele garçom e retorna o slug
  const ensureQr = async (garcomId: number): Promise<string> => {
    if (qrs[garcomId]) return qrs[garcomId].slug
    const slug = gerarSlug()
    const { error } = await supabase.from('qr_codes').insert({
      restaurante_id: restauranteId, garcom_id: garcomId, slug, papel_fundo: 'padrao', ativo: true, total_scans: 0,
    })
    if (error) throw error
    setQrs((p) => ({ ...p, [garcomId]: { slug, total_scans: 0 } }))
    return slug
  }

  const adicionar = async () => {
    const nome = novo.trim()
    if (!nome || !restauranteId) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('garcons')
        .insert({ nome_garcon: nome, restaurante_id: restauranteId, ativo: true })
        .select('id, nome_garcon, ativo, bonus_pago_em')
        .single()
      if (error) throw error
      setGarcons((p) => [...p, data as Garcom])
      setNovo('')
    } catch (e: any) {
      toast.error('Erro ao adicionar', { description: e.message })
    } finally {
      setSaving(false)
    }
  }

  const abrirEdicao = (g: Garcom) => {
    setEditando(g)
    setEditNome(g.nome_garcon)
  }

  const salvarEdicao = async () => {
    const nome = editNome.trim()
    if (!nome || !editando) return
    setSalvandoEdicao(true)
    try {
      const { error } = await supabase
        .from('garcons')
        .update({ nome_garcon: nome })
        .eq('id', editando.id)
      if (error) throw error
      setGarcons((p) => p.map((g) => (g.id === editando.id ? { ...g, nome_garcon: nome } : g)))
      setEditando(null)
    } catch (e: any) {
      toast.error('Erro ao salvar', { description: e.message })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const remover = async (id: number) => {
    try {
      await supabase.from('garcons').delete().eq('id', id)
      setGarcons((p) => p.filter((g) => g.id !== id))
      if (editando?.id === id) setEditando(null)
    } catch {
      toast.error('Erro ao remover garçom')
    }
  }

  const baixarPng = async (g: Garcom) => {
    try {
      const slug = await ensureQr(g.id)
      const canvas = await posterCanvas(landingUrl(slug), restaurantName, posterTema, posterMsg)
      const blob = await canvasToBlob(canvas)
      baixarBlob(blob, `qrcode-${g.nome_garcon.replace(/\s+/g, '-').toLowerCase()}.png`)
    } catch (e: any) {
      toast.error('Erro ao gerar PNG', { description: e.message })
    }
  }

  const baixarPdf = async () => {
    const ativos = garcons.filter((g) => g.ativo)
    if (!ativos.length) { toast.error('Nenhum garçom para exportar'); return }
    setBaixando(true)
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const w = 170
      const h = w * (POSTER_H / POSTER_W)
      const x = (pw - w) / 2
      const y = (ph - h) / 2
      for (let i = 0; i < ativos.length; i++) {
        const g = ativos[i]
        const slug = await ensureQr(g.id)
        const canvas = await posterCanvas(landingUrl(slug), restaurantName, posterTema, posterMsg)
        if (i > 0) pdf.addPage()
        pdf.addImage(canvas, 'PNG', x, y, w, h)
      }
      baixarBlob(pdf.output('blob'), `qrcodes-garcons-${restaurantName.replace(/\s+/g, '-').toLowerCase()}.pdf`)
      toast.success('PDF baixado!')
    } catch (e: any) {
      toast.error('Erro ao gerar PDF', { description: e.message })
    } finally {
      setBaixando(false)
    }
  }

  const salvarConfig = async () => {
    if (!restauranteId) return
    setSalvandoConfig(true)
    try {
      const cfg: ConfigBonificacao = {
        ...configBonif,
        // Primeira vez que a regra é salva: começa o período agora.
        periodo_inicio: configBonif.periodo_inicio ?? new Date().toISOString(),
      }
      const { error } = await supabase
        .from('restaurantes')
        .update({ config_bonificacao: cfg as any })
        .eq('id', restauranteId)
      if (error) throw error
      setConfigBonif(cfg)
      setConfigBonifSalvo(cfg)
      toast.success('Regra de bonificação salva!')
    } catch (e: any) {
      toast.error('Erro ao salvar regra', { description: e.message })
    } finally {
      setSalvandoConfig(false)
    }
  }

  const cancelarConfig = () => setConfigBonif(configBonifSalvo)

  const pagarBonus = async (g: Garcom) => {
    setPagando(g.id)
    try {
      const agora = new Date().toISOString()
      const { error } = await supabase.from('garcons').update({ bonus_pago_em: agora }).eq('id', g.id)
      if (error) throw error
      setGarcons((p) => p.map((x) => (x.id === g.id ? { ...x, bonus_pago_em: agora } : x)))
      toast.success(`Bônus de ${g.nome_garcon} marcado como pago!`)
    } catch (e: any) {
      toast.error('Erro ao marcar bônus como pago', { description: e.message })
    } finally {
      setPagando(null)
    }
  }

  const ranking = [...garcons].sort((a, b) => (qrs[b.id]?.total_scans ?? 0) - (qrs[a.id]?.total_scans ?? 0))
  const temAberturas = ranking.some((g) => (qrs[g.id]?.total_scans ?? 0) > 0)
  const medalha = ['🥇', '🥈', '🥉']

  const regraAtiva = !!configBonif.periodo_inicio && configBonif.meta_escaneamentos > 0

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1">
      <Tabs defaultValue="ranking" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="ranking">Ranking de aberturas do QR</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        {/* Ranking */}
        <TabsContent value="ranking" className="mt-0">
          <Card>
            <CardContent className="p-2">
              {ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Nenhum garçom cadastrado ainda.</p>
              ) : !temAberturas ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Ainda não há aberturas registradas. Baixe os QR Codes na aba <b>Equipe</b> e distribua.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {ranking.map((g, i) => {
                    const scans = qrs[g.id]?.total_scans ?? 0
                    return (
                      <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 text-center text-base font-bold text-muted-foreground">
                            {i < 3 ? medalha[i] : `${i + 1}º`}
                          </span>
                          <span className="font-medium truncate">{g.nome_garcon}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-lg font-bold text-emerald-600">{scans}</span>
                          <span className="text-xs text-muted-foreground ml-1">aberturas</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equipe */}
        <TabsContent value="equipe" className="mt-0 space-y-4">
          {/* Configuração da regra de bonificação */}
          <Card className="shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Configuração da Regra de Bonificação da Equipe
                </h3>
                {regraAtiva && (
                  <Badge className="gap-1.5 border-none bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Regra Ativa
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-escaneamentos">Meta de Escaneamentos</Label>
                  <div className="relative">
                    <Input
                      id="meta-escaneamentos"
                      type="number"
                      min={1}
                      value={configBonif.meta_escaneamentos}
                      onChange={(e) => setConfigBonif((p) => ({
                        ...p, meta_escaneamentos: Math.max(0, Number(e.target.value) || 0),
                      }))}
                      className="pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      QRs
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Frequência / Período</Label>
                  <Select
                    value={configBonif.frequencia}
                    onValueChange={(v) => setConfigBonif((p) => ({ ...p, frequencia: v as Frequencia }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQUENCIA_LABEL) as Frequencia[]).map((f) => (
                        <SelectItem key={f} value={f}>{FREQUENCIA_LABEL[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="premio-bonif">Prêmio / Bonificação</Label>
                  <Input
                    id="premio-bonif"
                    value={configBonif.premio}
                    onChange={(e) => setConfigBonif((p) => ({ ...p, premio: e.target.value }))}
                    placeholder="Ex.: R$ 100,00 de Bônus"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <Switch
                  checked={configBonif.renovar_automatico}
                  onCheckedChange={(v) => setConfigBonif((p) => ({ ...p, renovar_automatico: v }))}
                />
                <span className="text-sm text-gray-600">
                  Renovar automaticamente ao fim do período:{' '}
                  <span className={cn(
                    'font-semibold',
                    configBonif.renovar_automatico ? 'text-emerald-600' : 'text-muted-foreground',
                  )}
                  >
                    {configBonif.renovar_automatico ? 'Ativado' : 'Desativado'}
                  </span>
                </span>
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={cancelarConfig} disabled={salvandoConfig}>
                  Cancelar
                </Button>
                <Button onClick={salvarConfig} disabled={salvandoConfig || configBonif.meta_escaneamentos <= 0}>
                  {salvandoConfig && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Salvar Regra
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Adicionar garçom + exportar tudo */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
              placeholder="Nome do garçom..."
              className="max-w-xs"
            />
            <Button onClick={adicionar} disabled={saving || !novo.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
            <div className="flex-1" />
            {garcons.length > 0 && (
              <Button variant="outline" onClick={baixarPdf} disabled={baixando}>
                {baixando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                PDF de todos
              </Button>
            )}
          </div>

          {garcons.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum garçom cadastrado. Adicione o primeiro acima.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {garcons.map((g) => {
                    const scans = scansPeriodo[g.id] ?? 0
                    const meta = configBonif.meta_escaneamentos
                    const pct = meta > 0 ? Math.min(100, Math.round((scans / meta) * 100)) : 0
                    const atingiu = regraAtiva && scans >= meta
                    const falta = Math.max(0, meta - scans)
                    const pago = !!(
                      g.bonus_pago_em && configBonif.periodo_inicio && g.bonus_pago_em >= configBonif.periodo_inicio
                    )

                    return (
                      <li
                        key={g.id}
                        className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(g)}
                            title="Clique para renomear"
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                              atingiu ? 'bg-emerald-500' : 'bg-slate-400',
                            )}
                          >
                            {g.nome_garcon.slice(0, 2).toUpperCase()}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => abrirEdicao(g)}
                                className="text-left font-semibold hover:underline"
                              >
                                {g.nome_garcon}
                              </button>
                              {atingiu && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  <Trophy className="h-3 w-3" /> Meta atingida
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {regraAtiva ? `${scans} / ${meta} QRs (${pct}%)` : `${scans} aberturas`}
                              {regraAtiva && (
                                <>
                                  {' • '}
                                  {atingiu
                                    ? pago
                                      ? `Bônus pago${g.bonus_pago_em ? ` em ${format(new Date(g.bonus_pago_em), 'dd/MM')}` : ''}`
                                      : 'Recompensa liberada para pagamento'
                                    : `Faltam ${falta} escaneamento${falta === 1 ? '' : 's'} para atingir a meta`}
                                </>
                              )}
                            </p>
                            {regraAtiva && (
                              <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    atingiu ? 'bg-emerald-500' : 'bg-blue-500',
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                          {atingiu && !pago && (
                            <Button
                              size="sm"
                              onClick={() => pagarBonus(g)}
                              disabled={pagando === g.id}
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              {pagando === g.id
                                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                : <Check className="h-3.5 w-3.5 mr-1" />}
                              Pagar Bônus
                            </Button>
                          )}
                          {atingiu && pago && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <Check className="h-3.5 w-3.5" /> Bônus pago
                            </span>
                          )}
                          <Button variant="outline" size="sm" onClick={() => baixarPng(g)}>
                            <Download className="h-3.5 w-3.5 mr-1" /> PNG
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost" size="icon"
                                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                title="Excluir garçom"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir {g.nome_garcon}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O QR Code dele sai junto. Não dá para desfazer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => remover(g.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Renomear garçom — abre ao clicar no avatar ou no nome */}
      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Renomear Garçom</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="editar-garcom">Nome</Label>
            <Input
              id="editar-garcom"
              autoFocus
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao() }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdicao || !editNome.trim()}>
              {salvandoEdicao && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
