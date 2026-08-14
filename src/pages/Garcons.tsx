import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Download, FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { desenharPoster, landingUrl, baixarBlob, canvasToBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
import { cn } from '@/lib/utils'

interface Garcom { id: number; nome_garcon: string; ativo: boolean }
interface QrInfo { slug: string; total_scans: number }

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

  const carregar = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) { setLoading(false); return }
    const { data: r } = await supabase
      .from('restaurantes')
      .select('id, nome_restaurante, qr_estilo, qr_mensagem')
      .eq('auth_user_id', u.user.id)
      .single()
    if (!r) { setLoading(false); return }
    setRestauranteId(r.id)
    if (r.nome_restaurante) setRestaurantName(r.nome_restaurante)
    setPosterTema(r.qr_estilo ?? 'classico')
    setPosterMsg(r.qr_mensagem ?? '')

    const { data: gs } = await supabase
      .from('garcons')
      .select('id, nome_garcon, ativo')
      .eq('restaurante_id', r.id)
      .order('created_at', { ascending: true })
    setGarcons((gs ?? []) as Garcom[])

    const { data: qc } = await supabase
      .from('qr_codes')
      .select('garcom_id, slug, total_scans')
      .eq('restaurante_id', r.id)
      .not('garcom_id', 'is', null)
    const map: Record<number, QrInfo> = {}
    for (const q of qc ?? []) if (q.garcom_id) map[q.garcom_id] = { slug: q.slug, total_scans: q.total_scans ?? 0 }
    setQrs(map)
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
        .select('id, nome_garcon, ativo')
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

  const remover = async (id: number) => {
    try {
      await supabase.from('garcons').delete().eq('id', id)
      setGarcons((p) => p.filter((g) => g.id !== id))
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

  const ranking = [...garcons].sort((a, b) => (qrs[b.id]?.total_scans ?? 0) - (qrs[a.id]?.total_scans ?? 0))
  const temAberturas = ranking.some((g) => (qrs[g.id]?.total_scans ?? 0) > 0)
  const medalha = ['🥇', '🥈', '🥉']

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
          <TabsTrigger value="ranking">Ranking de feedbacks</TabsTrigger>
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
                          <span className="text-xs text-muted-foreground ml-1">feedbacks</span>
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
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
              placeholder="Nome do garçom"
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button onClick={adicionar} disabled={saving || !novo.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
              {garcons.length > 0 && (
                <Button variant="outline" onClick={baixarPdf} disabled={baixando}>
                  {baixando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                  PDF de todos
                </Button>
              )}
            </div>
          </div>

          {garcons.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum garçom cadastrado. Adicione o primeiro acima.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {garcons.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 bg-slate-400')}>
                          {g.nome_garcon.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{g.nome_garcon}</p>
                          <p className="text-[11px] text-muted-foreground">{qrs[g.id]?.total_scans ?? 0} aberturas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => baixarPng(g)} title="Baixar QR Code (PNG)">
                          <Download className="h-4 w-4 mr-1" /> PNG
                        </Button>
                        <Button
                          variant="ghost" size="icon" onClick={() => remover(g.id)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50" title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
