import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { jsPDF } from 'jspdf'
import { QrCode, Download, Loader2, ChevronDown, FileImage, FileText, ExternalLink, ImagePlus, Check, ArrowRight, ArrowLeft, Palette, MessageSquare, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QR_TEMAS, getTema } from '@/lib/qr-temas'
import { landingUrl, desenharPoster, baixarBlob, canvasToBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
import { LandingView } from '@/components/LandingView'
import { ImageCropper } from '@/components/ImageCropper'
import { toast } from 'sonner'

interface QrData {
  id: number
  slug: string
  total_scans: number
  papel_fundo: string
  url_redirect: string
}

const SLUG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function gerarSlug(n = 8) {
  let s = ''
  for (let i = 0; i < n; i++) s += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
  return s
}

export default function QRCodes() {
  const [qrData, setQrData] = useState<QrData | null>(null)
  const [restaurantName, setRestaurantName] = useState('Restaurante')
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Config da página que o cliente abre ao escanear
  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  const [cfgModo, setCfgModo] = useState<'estilo' | 'upload'>('estilo')
  const [cfgEstilo, setCfgEstilo] = useState('classico')
  const [cfgImagem, setCfgImagem] = useState<string | null>(null)
  const [cfgMensagem, setCfgMensagem] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)

  // Métricas
  const [metricas, setMetricas] = useState<{ dia7: number; dia30: number; barras: { label: string; n: number }[] }>({ dia7: 0, dia30: 0, barras: [] })
  const [aba, setAba] = useState('config')
  const [previewAba, setPreviewAba] = useState<'pagina' | 'qr'>('qr')
  const [numero, setNumero] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [passo, setPasso] = useState<1 | 2>(1)
  const cfgSalvoRef = useRef({ modo: 'estilo', estilo: 'classico', imagem: null as string | null, mensagem: '' })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (qrData) {
      drawCanvas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrData, restaurantName, cfgEstilo, cfgMensagem])

  const loadData = async () => {
    try {
      setLoading(true)

      const { data: userData } = await supabase.auth.getUser()
      let restauranteId: number | null = null
      if (userData?.user) {
        const { data: config } = await supabase
          .from('restaurantes')
          .select('id, nome_restaurante, numero_whatsapp, qr_bg_modo, qr_estilo, qr_bg_imagem, qr_mensagem')
          .eq('auth_user_id', userData.user.id)
          .single()

        restauranteId = config?.id ?? null
        setRestauranteId(config?.id ?? null)
        if (config?.nome_restaurante) setRestaurantName(config.nome_restaurante)
        setNumero(config?.numero_whatsapp ?? null)
        const modo = config?.qr_bg_modo === 'upload' ? 'upload' : 'estilo'
        setCfgModo(modo)
        setCfgEstilo(config?.qr_estilo ?? 'classico')
        setCfgImagem(config?.qr_bg_imagem ?? null)
        setCfgMensagem(config?.qr_mensagem ?? '')
        cfgSalvoRef.current = {
          modo, estilo: config?.qr_estilo ?? 'classico',
          imagem: config?.qr_bg_imagem ?? null, mensagem: config?.qr_mensagem ?? '',
        }
        // Nunca configurou → já abre no modo edição (passo 1)
        const jaConfigurou = !!(config?.qr_bg_modo || config?.qr_estilo || config?.qr_mensagem || config?.qr_bg_imagem)
        setEditando(!jaConfigurou)
        if (!jaConfigurou) { setPasso(1); setPreviewAba('qr') }
      }

      // Sem restaurante vinculado: não há QR Code a gerar — encerra sem erro
      if (!restauranteId) {
        setLoading(false)
        return
      }

      // Busca o QR do restaurante (garcom_id null). Se não existir, cria (RLS permite o dono).
      const { data: existente } = await supabase
        .from('qr_codes')
        .select('id, slug, total_scans, papel_fundo')
        .eq('restaurante_id', restauranteId)
        .is('garcom_id', null)
        .eq('ativo', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let qr = existente
      if (!qr) {
        const { data: novo, error } = await supabase
          .from('qr_codes')
          .insert({ restaurante_id: restauranteId, slug: gerarSlug(), papel_fundo: 'padrao', ativo: true, total_scans: 0 })
          .select('id, slug, total_scans, papel_fundo')
          .single()
        if (error) throw error
        qr = novo
      }
      setQrData({ id: qr.id, slug: qr.slug, total_scans: qr.total_scans ?? 0, papel_fundo: qr.papel_fundo ?? 'padrao', url_redirect: '' })
      loadMetrics(qr.id)
    } catch (err: any) {
      toast.error('Erro ao carregar', { description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadMetrics = async (qrId: number) => {
    const desde30 = new Date(Date.now() - 30 * 86400000)
    const { data } = await supabase
      .from('qr_scans')
      .select('scanned_at')
      .eq('qr_code_id', qrId)
      .gte('scanned_at', desde30.toISOString())
    const scans = (data ?? []).map((s: any) => new Date(s.scanned_at).getTime())
    const agora = Date.now()
    const dia7 = scans.filter((t) => t >= agora - 7 * 86400000).length
    const dia30 = scans.length
    // Barras dos últimos 7 dias
    const barras: { label: string; n: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const ini = new Date(); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - i)
      const fim = ini.getTime() + 86400000
      const n = scans.filter((t) => t >= ini.getTime() && t < fim).length
      barras.push({ label: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][ini.getDay()], n })
    }
    setMetricas({ dia7, dia30, barras })
  }

  const salvarCfg = async () => {
    if (!restauranteId) return
    setSavingCfg(true)
    try {
      const { error } = await supabase
        .from('restaurantes')
        .update({
          qr_bg_modo: cfgModo,
          qr_estilo: cfgEstilo,
          qr_bg_imagem: cfgImagem,
          qr_mensagem: cfgMensagem.trim() || null,
        })
        .eq('id', restauranteId)
      if (error) throw error
      cfgSalvoRef.current = { modo: cfgModo, estilo: cfgEstilo, imagem: cfgImagem, mensagem: cfgMensagem }
      setEditando(false)
      toast.success('QR Code e página salvos!')
    } catch (err: any) {
      toast.error('Erro ao salvar', { description: err.message })
    } finally {
      setSavingCfg(false)
    }
  }

  const cancelarEdicao = () => {
    const s = cfgSalvoRef.current
    setCfgModo(s.modo as 'estilo' | 'upload')
    setCfgEstilo(s.estilo)
    setCfgImagem(s.imagem)
    setCfgMensagem(s.mensagem)
    setEditando(false)
  }

  // Recebe o blob já recortado no formato do celular (1080×1920) pelo ImageCropper
  const enviarImagem = async (blob: Blob) => {
    if (!restauranteId) return
    setUploading(true)
    try {
      const path = `${restauranteId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('qr-fundos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('qr-fundos').getPublicUrl(path)
      setCfgImagem(data.publicUrl)
      setCfgModo('upload')
      await supabase
        .from('restaurantes')
        .update({ qr_bg_imagem: data.publicUrl, qr_bg_modo: 'upload' })
        .eq('id', restauranteId)
      setCropFile(null)
      toast.success('Imagem de fundo enviada!')
    } catch (err: any) {
      toast.error('Erro no upload', { description: err.message })
    } finally {
      setUploading(false)
    }
  }

  const drawCanvas = async () => {
    const canvas = canvasRef.current
    if (!canvas || !qrData) return
    try {
      await desenharPoster(canvas, {
        url: landingUrl(qrData.slug),
        nome: restaurantName,
        tagline: cfgMensagem,
        temaId: cfgEstilo,
      })
    } catch (err) {
      // Antes uma falha aqui deixava o canvas em branco sem avisar nada —
      // nenhum try/catch, então a promise rejeitada só sumia no console
      // (ou nem isso). Logar de verdade é o que permite achar a causa real.
      console.error('Falha ao desenhar o QR impresso:', err)
      toast.error('Não foi possível gerar a visualização do QR impresso.')
    }
  }

  const downloadPNG = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await canvasToBlob(canvas)
      baixarBlob(blob, `qrcode-${restaurantName.replace(/\s+/g, '-').toLowerCase()}.png`)
    } catch {
      toast.error('Erro ao baixar PNG')
    }
  }

  const downloadPDF = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const w = 170
      const h = w * (POSTER_H / POSTER_W)
      const x = (pw - w) / 2
      const y = (ph - h) / 2
      pdf.addImage(canvas, 'PNG', x, y, w, h)
      baixarBlob(pdf.output('blob'), `qrcode-${restaurantName.replace(/\s+/g, '-').toLowerCase()}.pdf`)
      toast.success('PDF baixado com sucesso!')
    } catch {
      toast.error('Erro ao gerar PDF')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!qrData) {
    return (
      <div className="flex-1 space-y-6">
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50/50 rounded-xl border border-dashed border-border">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 mb-5">
            <QrCode className="h-8 w-8 text-[#1D4ED8]" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">QR Code ainda não disponível</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Conclua a configuração do seu restaurante para gerar o QR Code de coleta de feedbacks.
          </p>
        </div>
      </div>
    )
  }

  const maxBar = Math.max(1, ...metricas.barras.map((b) => b.n))
  const mostraQr = previewAba === 'qr'

  return (
    <div className="flex-1">
      <Tabs value={aba} onValueChange={setAba} className="w-full">
        <div className="flex items-center justify-between gap-3 mb-6">
          {/* Cardzinho cinza claro e retangular (não pill, não sólido azul) —
              o destaque vem da PRÓPRIA caixa, e a aba ativa é só um branco
              suave por cima, sem cor forte. */}
          <TabsList className="h-auto gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
            <TabsTrigger
              value="config"
              className="gap-2 rounded-md px-4 py-2 text-sm font-semibold text-gray-600 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
            >
              <Palette className="h-4 w-4" />
              Personalizar
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="gap-2 rounded-md px-4 py-2 text-sm font-semibold text-gray-600 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
            >
              <Info className="h-4 w-4" />
              Informações
            </TabsTrigger>
          </TabsList>
          {aba === 'config' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Download className="h-4 w-4" /> Baixar <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={downloadPNG} className="gap-2 cursor-pointer">
                  <FileImage className="h-4 w-4" /> PNG (imagem)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadPDF} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" /> PDF (impressão)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* ── INFORMAÇÕES ── */}
        <TabsContent value="info" className="mt-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Aberturas totais', valor: qrData.total_scans },
              { label: 'Últimos 7 dias', valor: metricas.dia7 },
              { label: 'Últimos 30 dias', valor: metricas.dia30 },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="rounded-full bg-blue-100 p-3">
                    <QrCode className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{m.valor}</p>
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Aberturas nos últimos 7 dias</CardTitle>
              <CardDescription>Cada abertura ≈ um cliente indo dar feedback</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-3 h-40">
                {metricas.barras.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                    <span className="text-xs font-semibold text-muted-foreground">{b.n || ''}</span>
                    <div
                      className="w-full rounded-t-md bg-blue-500/80 transition-all"
                      style={{ height: `${(b.n / maxBar) * 100}%`, minHeight: b.n > 0 ? 6 : 2 }}
                    />
                    <span className="text-[11px] text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PERSONALIZAR ── */}
        <TabsContent value="config" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            {editando ? (
            <Card>
              <CardHeader className="pb-4">
                {/* Trilho dos 2 passos */}
                <div className="flex items-center gap-2 mb-3">
                  {[1, 2].map((n) => (
                    <div key={n} className="flex items-center gap-2 flex-1">
                      <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold shrink-0',
                        passo >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        {passo > n ? <Check className="h-4 w-4" /> : n}
                      </div>
                      <div className={cn('h-1 flex-1 rounded-full', passo > n ? 'bg-primary' : 'bg-muted')} />
                    </div>
                  ))}
                </div>
                <CardTitle className="flex items-center gap-2">
                  {passo === 1 ? <><Palette className="h-5 w-5 text-primary" /> Escolha o tema</> : <><MessageSquare className="h-5 w-5 text-primary" /> Mensagem e página</>}
                </CardTitle>
                <CardDescription>
                  {passo === 1
                    ? 'Define a arte do QR impresso e o visual da página que abre ao escanear.'
                    : 'A frase que o cliente vê e, se quiser, uma foto própria de fundo.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {passo === 1 ? (
                  /* ── PASSO 1: tema (miniaturas com foto) ── */
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      {QR_TEMAS.map((t) => {
                        const sel = cfgEstilo === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => setCfgEstilo(t.id)}
                            className={cn('group relative aspect-[3/4] overflow-hidden rounded-xl ring-2 transition-all',
                              sel ? 'ring-primary ring-offset-2' : 'ring-transparent hover:ring-primary/40')}
                          >
                            <img src={t.foto} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                            {sel && (
                              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow">
                                <Check className="h-3.5 w-3.5 text-white" />
                              </span>
                            )}
                            <span className="absolute inset-x-0 bottom-1.5 text-center text-[11px] font-semibold text-white drop-shadow">{t.nome}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button variant="ghost" onClick={cancelarEdicao} className="text-muted-foreground">Cancelar</Button>
                      <Button onClick={() => { setPasso(2); setPreviewAba('pagina') }} size="lg" className="gap-1.5 px-7 rounded-full shadow-md">
                        Próximo <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  /* ── PASSO 2: mensagem + página ── */
                  <>
                    <div>
                      <label className="text-[13px] font-medium mb-1.5 block">Mensagem para o cliente</label>
                      <textarea
                        value={cfgMensagem}
                        onChange={(e) => setCfgMensagem(e.target.value)}
                        rows={2}
                        maxLength={120}
                        placeholder="Ex: É rapidinho! Conte como foi sua experiência."
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{cfgMensagem.length}/120</p>
                    </div>

                    <div>
                      <p className="text-[13px] font-medium mb-2">Fundo da página do cliente</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => { setCfgModo('estilo'); setPreviewAba('pagina') }}
                          className={cn('rounded-xl border-2 p-3 text-left transition-all',
                            cfgModo === 'estilo' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-muted')}
                        >
                          <p className="text-[13px] font-semibold">Foto do tema</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Usa a imagem de “{getTema(cfgEstilo).nome}”.</p>
                        </button>
                        <button
                          onClick={() => { setCfgModo('upload'); setPreviewAba('pagina') }}
                          className={cn('rounded-xl border-2 p-3 text-left transition-all',
                            cfgModo === 'upload' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-muted')}
                        >
                          <p className="text-[13px] font-semibold">Minha imagem</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Suba a sua própria foto de fundo.</p>
                        </button>
                      </div>
                    </div>

                    {cfgModo === 'upload' && (
                      <div className="space-y-3">
                        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-[12px] text-blue-800">
                          Você ajusta o recorte (arrastar e zoom) no formato do celular. A gente só adiciona o botão do WhatsApp por cima.
                        </div>
                        {cfgImagem && (
                          <img src={cfgImagem} alt="Fundo" className="w-full max-h-56 object-contain rounded-lg border bg-slate-50" />
                        )}
                        <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer rounded-lg border px-3 py-2 hover:bg-muted">
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                          {uploading ? 'Enviando…' : (cfgImagem ? 'Trocar imagem' : 'Enviar imagem')}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }} />
                        </label>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button variant="ghost" onClick={() => { setPasso(1); setPreviewAba('qr') }} className="gap-1.5 text-muted-foreground">
                        <ArrowLeft className="h-4 w-4" /> Voltar
                      </Button>
                      <Button onClick={salvarCfg} disabled={savingCfg} size="lg" className="px-7 rounded-full shadow-md">
                        {savingCfg ? 'Salvando…' : 'Salvar'}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            ) : (
            <Card>
              <CardHeader>
                <CardTitle>Seu QR Code está pronto</CardTitle>
                <CardDescription>Baixe pelo botão “Baixar” acima e imprima para as mesas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-800 flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  QR e página configurados. Cada garçom tem o seu próprio QR na aba <b>Garçons</b>.
                </div>
                <dl className="text-sm divide-y divide-border rounded-lg border">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <dt className="text-muted-foreground">Tema</dt>
                    <dd className="flex items-center gap-2 font-medium">
                      <img src={getTema(cfgEstilo).foto} alt="" className="h-6 w-6 rounded object-cover" />
                      {getTema(cfgEstilo).nome}
                    </dd>
                  </div>
                  <div className="flex justify-between px-3 py-2.5">
                    <dt className="text-muted-foreground">Fundo da página</dt>
                    <dd className="font-medium">{cfgModo === 'upload' ? 'Imagem própria' : 'Foto do tema'}</dd>
                  </div>
                  <div className="flex justify-between px-3 py-2.5">
                    <dt className="text-muted-foreground">Mensagem</dt>
                    <dd className="font-medium max-w-[55%] truncate">{cfgMensagem.trim() || 'Padrão'}</dd>
                  </div>
                </dl>
                <Button onClick={() => { setEditando(true); setPasso(1); setPreviewAba('qr') }} variant="outline" className="w-full gap-2">
                  <Palette className="h-4 w-4" /> Personalizar
                </Button>
              </CardContent>
            </Card>
            )}

            {/* Preview: alterna entre QR impresso e a página do cliente */}
            <div className="flex flex-col items-center gap-4 rounded-xl border bg-slate-50/50 p-6">
              <div className="inline-flex rounded-lg bg-white border p-1 text-sm shadow-sm">
                <button
                  onClick={() => setPreviewAba('qr')}
                  className={cn('px-3.5 py-1.5 rounded-md font-medium transition-colors', mostraQr ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  QR impresso
                </button>
                <button
                  onClick={() => setPreviewAba('pagina')}
                  className={cn('px-3.5 py-1.5 rounded-md font-medium transition-colors', !mostraQr ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  Página do cliente
                </button>
              </div>

              {/* Página (celular) */}
              <div className={cn('flex flex-col items-center gap-3', !mostraQr ? '' : 'hidden')}>
                <div className="w-[248px] h-[500px] rounded-[2.4rem] border-[9px] border-slate-800 bg-black overflow-hidden shadow-xl">
                  <LandingView
                    preview
                    restauranteNome={restaurantName}
                    modo={cfgModo}
                    imagem={cfgImagem}
                    estilo={cfgEstilo}
                    mensagem={cfgMensagem}
                    whatsapp={numero}
                  />
                </div>
                <button
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  onClick={() => window.open(landingUrl(qrData.slug), '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir página real
                </button>
              </div>

              {/* QR impresso (canvas sempre montado para desenho/download) */}
              <div className={cn('flex flex-col items-center gap-3', mostraQr ? '' : 'hidden')}>
                <div className="w-full max-w-[300px] overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
                  <canvas ref={canvasRef} width={POSTER_W} height={POSTER_H} className="h-auto w-full object-contain" />
                </div>
                <p className="text-sm text-muted-foreground">Arte do QR para impressão</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {cropFile && (
        <ImageCropper
          file={cropFile}
          salvando={uploading}
          onConfirm={enviarImagem}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  )
}
