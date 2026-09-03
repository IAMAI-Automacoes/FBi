import { useEffect, useState, useCallback } from 'react'
import { addDays, addMonths, format } from 'date-fns'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
import { Plus, Trash2, Download, FileDown, Loader2, Settings2, Check, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { desenharPoster, landingUrl, baixarBlob, canvasToBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
import { getIniciais, corAvatar } from '@/lib/iniciais'
import { cn } from '@/lib/utils'

interface Garcom {
  id: number
  nome_garcon: string
  ativo: boolean
  /** regra.id -> data em que o bônus daquela regra foi marcado como pago. */
  bonus_pagamentos: Record<string, string>
}
interface QrInfo { slug: string; total_scans: number }

type Frequencia = 'semanal' | 'mensal' | 'trimestral'

interface RegraBonificacao {
  id: string
  nome: string
  meta_escaneamentos: number
  frequencia: Frequencia
  premio: string
  renovar_automatico: boolean
  ativa: boolean
  /** null = regra recém-criada, ainda sem período rodando. */
  periodo_inicio: string | null
}

const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
}
const FREQUENCIA_CURTA: Record<Frequencia, string> = {
  semanal: 'semana',
  mensal: 'mês',
  trimestral: 'trimestre',
}

function novaRegraVazia(): RegraBonificacao {
  return {
    id: '', nome: '', meta_escaneamentos: 50, frequencia: 'mensal',
    premio: '', renovar_automatico: true, ativa: true, periodo_inicio: null,
  }
}

function rotuloRegra(r: RegraBonificacao): string {
  return r.nome.trim() || `${r.meta_escaneamentos} QRs por ${FREQUENCIA_CURTA[r.frequencia]}`
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

  const [regras, setRegras] = useState<RegraBonificacao[]>([])
  /** Painel de regras aberto? */
  const [regrasAbertas, setRegrasAbertas] = useState(false)
  /** null = mostrando a lista de regras; objeto = editando/criando uma. */
  const [regraForm, setRegraForm] = useState<RegraBonificacao | null>(null)
  const [salvandoRegra, setSalvandoRegra] = useState(false)
  /** scansPorRegra[regraId][garcomId] = escaneamentos DESDE o início do
   *  período atual daquela regra (não o total acumulado). */
  const [scansPorRegra, setScansPorRegra] = useState<Record<string, Record<number, number>>>({})
  const [pagando, setPagando] = useState('')

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

    let listaRegras = (Array.isArray(r.config_bonificacao) ? r.config_bonificacao : []) as unknown as RegraBonificacao[]

    // Cada regra ativa que já passou do fim do período avança sozinha (pode
    // pular vários períodos de uma vez, se ninguém abriu a tela por um
    // tempo) — é isso que zera o progresso sem precisar de um job rodando.
    let mudou = false
    listaRegras = listaRegras.map((regra) => {
      if (!regra.periodo_inicio || !regra.renovar_automatico) return regra
      let inicio = new Date(regra.periodo_inicio)
      let fim = avancarPeriodo(inicio, regra.frequencia)
      while (fim.getTime() <= Date.now()) {
        inicio = fim
        fim = avancarPeriodo(inicio, regra.frequencia)
        mudou = true
      }
      return mudou ? { ...regra, periodo_inicio: inicio.toISOString() } : regra
    })
    if (mudou) await supabase.from('restaurantes').update({ config_bonificacao: listaRegras as any }).eq('id', r.id)
    setRegras(listaRegras)

    const { data: gs } = await supabase
      .from('garcons')
      .select('id, nome_garcon, ativo, bonus_pagamentos')
      .eq('restaurante_id', r.id)
      .order('created_at', { ascending: true })
    setGarcons(((gs ?? []) as any[]).map((g) => ({ ...g, bonus_pagamentos: g.bonus_pagamentos ?? {} })) as Garcom[])

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
    const regrasComPeriodo = listaRegras.filter((reg) => reg.periodo_inicio && reg.meta_escaneamentos > 0)
    if (regrasComPeriodo.length > 0 && idsQr.length > 0) {
      const maisAntigo = regrasComPeriodo.reduce(
        (min, reg) => (reg.periodo_inicio! < min ? reg.periodo_inicio! : min),
        regrasComPeriodo[0].periodo_inicio!,
      )
      const { data: scans } = await supabase
        .from('qr_scans')
        .select('qr_code_id, scanned_at')
        .in('qr_code_id', idsQr)
        .gte('scanned_at', maisAntigo)
      const porRegra: Record<string, Record<number, number>> = {}
      for (const reg of regrasComPeriodo) {
        const porGarcom: Record<number, number> = {}
        for (const s of scans ?? []) {
          if (s.scanned_at < reg.periodo_inicio!) continue
          const gId = qrCodeIdParaGarcom[s.qr_code_id]
          if (gId) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
        }
        porRegra[reg.id] = porGarcom
      }
      setScansPorRegra(porRegra)
    } else {
      setScansPorRegra({})
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
        .select('id, nome_garcon, ativo, bonus_pagamentos')
        .single()
      if (error) throw error
      setGarcons((p) => [...p, { ...(data as any), bonus_pagamentos: (data as any).bonus_pagamentos ?? {} }])
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

  const gravarRegras = async (novasRegras: RegraBonificacao[]) => {
    if (!restauranteId) return
    const { error } = await supabase
      .from('restaurantes')
      .update({ config_bonificacao: novasRegras as any })
      .eq('id', restauranteId)
    if (error) throw error
    setRegras(novasRegras)
  }

  const salvarRegraForm = async () => {
    if (!regraForm) return
    setSalvandoRegra(true)
    try {
      const ehNova = !regraForm.id
      const regraFinal: RegraBonificacao = {
        ...regraForm,
        id: regraForm.id || crypto.randomUUID(),
        // Primeira vez que a regra é salva: começa o período agora.
        periodo_inicio: regraForm.periodo_inicio ?? new Date().toISOString(),
      }
      const novasRegras = ehNova
        ? [...regras, regraFinal]
        : regras.map((r) => (r.id === regraFinal.id ? regraFinal : r))
      await gravarRegras(novasRegras)
      setRegraForm(null)
      toast.success(ehNova ? 'Regra criada.' : 'Regra salva.')
    } catch (e: any) {
      toast.error('Erro ao salvar regra', { description: e.message })
    } finally {
      setSalvandoRegra(false)
    }
  }

  const excluirRegra = async (id: string) => {
    try {
      await gravarRegras(regras.filter((r) => r.id !== id))
    } catch (e: any) {
      toast.error('Erro ao excluir regra', { description: e.message })
    }
  }

  const alternarAtivaRegra = async (regra: RegraBonificacao) => {
    const anteriores = regras
    setRegras((p) => p.map((r) => (r.id === regra.id ? { ...r, ativa: !r.ativa } : r)))
    try {
      await gravarRegras(regras.map((r) => (r.id === regra.id ? { ...r, ativa: !r.ativa } : r)))
    } catch (e: any) {
      setRegras(anteriores)
      toast.error('Erro ao atualizar regra', { description: e.message })
    }
  }

  const pagarBonus = async (g: Garcom, regra: RegraBonificacao) => {
    const chave = `${g.id}:${regra.id}`
    setPagando(chave)
    try {
      const pagamentos = { ...g.bonus_pagamentos, [regra.id]: new Date().toISOString() }
      const { error } = await supabase.from('garcons').update({ bonus_pagamentos: pagamentos }).eq('id', g.id)
      if (error) throw error
      setGarcons((p) => p.map((x) => (x.id === g.id ? { ...x, bonus_pagamentos: pagamentos } : x)))
      toast.success(`Bônus de ${g.nome_garcon} marcado como pago.`)
    } catch (e: any) {
      toast.error('Erro ao marcar bônus como pago', { description: e.message })
    } finally {
      setPagando('')
    }
  }

  const ranking = [...garcons].sort((a, b) => (qrs[b.id]?.total_scans ?? 0) - (qrs[a.id]?.total_scans ?? 0))
  const temAberturas = ranking.some((g) => (qrs[g.id]?.total_scans ?? 0) > 0)
  const medalha = ['🥇', '🥈', '🥉']
  const regrasAtivas = regras.filter((r) => r.ativa && r.periodo_inicio && r.meta_escaneamentos > 0)

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
            <Button variant="outline" onClick={() => setRegrasAbertas(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" />
              Bonificação{regrasAtivas.length > 0 ? ` (${regrasAtivas.length})` : ''}
            </Button>
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
                    const cor = corAvatar(g.nome_garcon)
                    return (
                      <li key={g.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(g)}
                            title="Renomear"
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              cor.bg, cor.text,
                            )}
                          >
                            {getIniciais(g.nome_garcon)}
                          </button>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => abrirEdicao(g)}
                              className="text-left text-sm font-semibold text-gray-900 hover:underline"
                            >
                              {g.nome_garcon}
                            </button>

                            {regrasAtivas.length === 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {qrs[g.id]?.total_scans ?? 0} aberturas
                              </p>
                            ) : (
                              <div className="mt-1.5 space-y-2">
                                {regrasAtivas.map((regra) => {
                                  const scans = scansPorRegra[regra.id]?.[g.id] ?? 0
                                  const meta = regra.meta_escaneamentos
                                  const pct = Math.min(100, Math.round((scans / meta) * 100))
                                  const atingiu = scans >= meta
                                  const pagoEm = g.bonus_pagamentos[regra.id]
                                  const pago = !!(pagoEm && regra.periodo_inicio && pagoEm >= regra.periodo_inicio)

                                  return (
                                    <div key={regra.id}>
                                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                        <p className="text-xs text-gray-500">
                                          <span className="font-medium text-gray-700">{rotuloRegra(regra)}</span>
                                          {' — '}
                                          {scans}/{meta}
                                          {atingiu
                                            ? pago
                                              ? `, pago${pagoEm ? ` em ${format(new Date(pagoEm), 'dd/MM')}` : ''}`
                                              : `, meta batida${regra.premio ? ` (${regra.premio})` : ''}`
                                            : ` (faltam ${meta - scans})`}
                                        </p>
                                        {atingiu && !pago && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            disabled={pagando === `${g.id}:${regra.id}`}
                                            onClick={() => pagarBonus(g, regra)}
                                          >
                                            {pagando === `${g.id}:${regra.id}`
                                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              : <Check className="h-3 w-3 mr-1" />}
                                            Marcar como pago
                                          </Button>
                                        )}
                                      </div>
                                      <div className="mt-1 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-gray-100">
                                        <div
                                          className={cn('h-full rounded-full', atingiu ? 'bg-emerald-500' : 'bg-gray-400')}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-start">
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

      {/* Regras de bonificação — lista, ou o formulário de uma regra */}
      <Dialog
        open={regrasAbertas}
        onOpenChange={(open) => { setRegrasAbertas(open); if (!open) setRegraForm(null) }}
      >
        <DialogContent className="sm:max-w-[440px]">
          {!regraForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Bonificação por escaneamentos</DialogTitle>
              </DialogHeader>
              {regras.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma regra criada ainda.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {regras.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <button type="button" onClick={() => setRegraForm({ ...r })} className="min-w-0 flex-1 text-left">
                        <p className={cn('truncate text-sm font-medium', r.ativa ? 'text-gray-900' : 'text-muted-foreground')}>
                          {rotuloRegra(r)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {FREQUENCIA_LABEL[r.frequencia]}{r.premio ? ` · ${r.premio}` : ''}
                        </p>
                      </button>
                      <Switch checked={r.ativa} onCheckedChange={() => alternarAtivaRegra(r)} />
                    </li>
                  ))}
                </ul>
              )}
              <DialogFooter className="sm:justify-start">
                <Button variant="outline" onClick={() => setRegraForm(novaRegraVazia())} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-1.5" /> Nova regra
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <button
                  type="button"
                  onClick={() => setRegraForm(null)}
                  className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Regras
                </button>
                <DialogTitle>{regraForm.id ? 'Editar regra' : 'Nova regra'}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="regra-nome">Nome (opcional)</Label>
                  <Input
                    id="regra-nome"
                    value={regraForm.nome}
                    onChange={(e) => setRegraForm({ ...regraForm, nome: e.target.value })}
                    placeholder="Ex.: Meta do mês"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-meta">Meta de escaneamentos</Label>
                    <div className="relative">
                      <Input
                        id="regra-meta"
                        type="number"
                        min={1}
                        value={regraForm.meta_escaneamentos}
                        onChange={(e) => setRegraForm({
                          ...regraForm, meta_escaneamentos: Math.max(0, Number(e.target.value) || 0),
                        })}
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        QRs
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Frequência</Label>
                    <Select
                      value={regraForm.frequencia}
                      onValueChange={(v) => setRegraForm({ ...regraForm, frequencia: v as Frequencia })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FREQUENCIA_LABEL) as Frequencia[]).map((f) => (
                          <SelectItem key={f} value={f}>{FREQUENCIA_LABEL[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="regra-premio">Prêmio</Label>
                  <Input
                    id="regra-premio"
                    value={regraForm.premio}
                    onChange={(e) => setRegraForm({ ...regraForm, premio: e.target.value })}
                    placeholder="Ex.: R$ 100,00"
                  />
                </div>

                <label htmlFor="regra-renovar" className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm text-gray-600">Renovar automaticamente ao fim do período</span>
                  <Switch
                    id="regra-renovar"
                    checked={regraForm.renovar_automatico}
                    onCheckedChange={(v) => setRegraForm({ ...regraForm, renovar_automatico: v })}
                  />
                </label>

                <label htmlFor="regra-ativa" className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm text-gray-600">Regra ativa</span>
                  <Switch
                    id="regra-ativa"
                    checked={regraForm.ativa}
                    onCheckedChange={(v) => setRegraForm({ ...regraForm, ativa: v })}
                  />
                </label>
              </div>

              <DialogFooter className="sm:justify-between">
                {regraForm.id ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700">
                        Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{rotuloRegra(regraForm)}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O progresso e o histórico de pagamento dela somem junto. Não dá para desfazer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => { excluirRegra(regraForm.id); setRegraForm(null) }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : <div />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRegraForm(null)}>Cancelar</Button>
                  <Button onClick={salvarRegraForm} disabled={salvandoRegra || regraForm.meta_escaneamentos <= 0}>
                    {salvandoRegra && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
