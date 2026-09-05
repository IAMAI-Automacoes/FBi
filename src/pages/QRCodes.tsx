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
import { QrCode, Download, Loader2, ChevronDown, FileImage, FileText, ImageUp, Check, Palette, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QR_CORES, QR_TEXTURAS, ehCorPersonalizada, fundoCss, getTema } from '@/lib/qr-temas'
import { landingUrl, desenharPoster, baixarBlob, canvasToBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
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

/** HSL → '#rrggbb'. Usado só pela roda de cores. */
function hslParaHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const canal = (n: number) => {
    const k = (n + h / 30) % 12
    const cor = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * cor).toString(16).padStart(2, '0')
  }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}

export default function QRCodes() {
  const [qrData, setQrData] = useState<QrData | null>(null)
  const [restaurantName, setRestaurantName] = useState('Restaurante')
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Config da página que o cliente abre ao escanear
  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  // 'estilo' (foto do tema como fundo) foi removido das opções — só existe
  // hoje pra não quebrar quem já tinha essa escolha salva de antes (ver
  // fallback em `loadData`). Configuração nova sempre nasce em 'upload'.
  const [cfgModo, setCfgModo] = useState<'estilo' | 'upload'>('upload')
  const [cfgEstilo, setCfgEstilo] = useState('branco')
  const [cfgImagem, setCfgImagem] = useState<string | null>(null)
  const [cfgMensagem, setCfgMensagem] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)

  // Métricas
  const [metricas, setMetricas] = useState<{ dia7: number; dia30: number; barras: { label: string; n: number }[] }>({ dia7: 0, dia30: 0, barras: [] })
  const [aba, setAba] = useState('config')
  /** A roda de cores só aparece quando o dono pede — ver o botão que a abre. */
  const [mostrarRoda, setMostrarRoda] = useState(false)
  const cfgSalvoRef = useRef({ modo: 'upload', estilo: 'branco', imagem: null as string | null, mensagem: '' })

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
          .select('id, nome_restaurante, qr_bg_modo, qr_estilo, qr_bg_imagem, qr_mensagem')
          .eq('auth_user_id', userData.user.id)
          .single()

        restauranteId = config?.id ?? null
        setRestauranteId(config?.id ?? null)
        if (config?.nome_restaurante) setRestaurantName(config.nome_restaurante)
        // Só continua em 'estilo' se foi EXPLICITAMENTE salvo assim antes
        // (restaurante configurado antes da opção sair do ar) — qualquer
        // outro caso (nunca configurou, ou já era 'upload') cai em 'upload'.
        const modo = config?.qr_bg_modo === 'estilo' ? 'estilo' : 'upload'
        setCfgModo(modo)
        // Ids dos temas com foto antigos (`classico`, `moderno`...) não existem
        // mais; `getTema` os resolve no padrão, e é esse id que passa a valer.
        const estilo = getTema(config?.qr_estilo).id
        setCfgEstilo(estilo)
        setCfgImagem(config?.qr_bg_imagem ?? null)
        setCfgMensagem(config?.qr_mensagem ?? '')
        cfgSalvoRef.current = {
          modo, estilo,
          imagem: config?.qr_bg_imagem ?? null, mensagem: config?.qr_mensagem ?? '',
        }
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
      toast.success('QR Code e página salvos!')
    } catch (err: any) {
      toast.error('Erro ao salvar', { description: err.message })
    } finally {
      setSavingCfg(false)
    }
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
      toast.success('Arte enviada!')
    } catch (err: any) {
      toast.error('Erro no upload', { description: err.message })
    } finally {
      setUploading(false)
    }
  }

  const removerImagem = async () => {
    if (!restauranteId) return
    setCfgImagem(null)
    await supabase.from('restaurantes').update({ qr_bg_imagem: null }).eq('id', restauranteId)
    toast.success('Arte removida — o tema volta a valer.')
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

  /**
   * A roda de cores. O clique vira hex pela posição: ângulo = matiz, distância
   * do centro = saturação — exatamente o que o `conic-gradient` + o brilho
   * branco central desenham, então o que o dono vê é o que ele pega.
   */
  const pegarDaRoda = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const raio = r.width / 2
    const dx = e.clientX - r.left - raio
    const dy = e.clientY - r.top - raio
    const dist = Math.min(Math.hypot(dx, dy) / raio, 1)
    const graus = (Math.atan2(dy, dx) * 180) / Math.PI
    setCfgEstilo(hslParaHex((graus + 450) % 360, dist * 100, 50))
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
  const tema = getTema(cfgEstilo)
  const personalizada = ehCorPersonalizada(cfgEstilo)

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
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ───────── A. Tema do display impresso ───────── */}
            <Card className="border-gray-200">
              <CardHeader className="pb-5">
                <CardTitle className="text-[22px] leading-snug font-semibold tracking-tight">
                  A. Tema do QR Code Impresso (Display de Mesa)
                </CardTitle>
                <CardDescription className="text-[13px] leading-relaxed">
                  Escolha uma cor sólida ou textura simples para a base do display físico que vai na mesa.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-7 sm:grid-cols-2">
                  {/* ── Paleta de Cores ── */}
                  <div>
                    <p className="text-[13px] font-semibold text-gray-700 mb-3">Paleta de Cores</p>

                    <div className="grid grid-cols-6 gap-1.5">
                      {QR_CORES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setCfgEstilo(t.id)}
                          title={t.nome}
                          aria-label={t.nome}
                          aria-pressed={cfgEstilo === t.id}
                          className={cn(
                            // `aspect-[1/1]` e não `aspect-square`: o projeto usa o plugin
                            // legado @tailwindcss/aspect-ratio, que troca a escala nomeada e
                            // faz `aspect-square` NÃO ser gerado — o quadradinho vira um
                            // risco de 0px de altura. Valor arbitrário passa pelo core.
                            'relative aspect-[1/1] rounded-[7px] ring-1 ring-black/10 transition-all',
                            cfgEstilo === t.id
                              ? 'ring-2 ring-gray-900 ring-offset-2'
                              : 'hover:scale-110 hover:ring-black/25',
                          )}
                          style={{ background: fundoCss(t) }}
                        >
                          {cfgEstilo === t.id && (
                            <Check
                              className="absolute inset-0 m-auto h-3.5 w-3.5"
                              style={{ color: t.escuro ? '#fff' : '#1a1a1a' }}
                            />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Cor livre.
                        Fechada, é só um botão redondo pequeno — não escolhe cor
                        nenhuma, só anuncia que existe mais. Aberta, a roda toma
                        o lugar dele: matiz na volta, saturação do centro para a
                        borda, que é exatamente o que o gradiente desenha. */}
                    <div className="mt-3.5">
                      {mostrarRoda ? (
                        <div className="relative flex justify-center">
                          <div
                            onClick={pegarDaRoda}
                            role="button"
                            tabIndex={0}
                            aria-label="Escolher uma cor na roda"
                            className="h-[132px] w-[132px] cursor-crosshair rounded-full shadow-inner ring-1 ring-black/10"
                            style={{
                              background:
                                'radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 70%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                            }}
                          />
                          <button
                            onClick={() => setMostrarRoda(false)}
                            title="Fechar a roda de cores"
                            className="absolute right-0 top-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMostrarRoda(true)}
                          title="Escolher outra cor"
                          className={cn(
                            'flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50',
                            personalizada && 'text-gray-900',
                          )}
                        >
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full ring-1 ring-black/15',
                              personalizada && 'ring-2 ring-gray-900',
                            )}
                            style={{
                              background: personalizada
                                ? cfgEstilo
                                : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                            }}
                          />
                          {personalizada ? cfgEstilo.toUpperCase() : 'Outra cor'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Texturas Neutras ── */}
                  <div>
                    <p className="text-[13px] font-semibold text-gray-700 mb-3">Texturas Neutras</p>
                    <div className="grid grid-cols-4 gap-2">
                      {QR_TEXTURAS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setCfgEstilo(t.id)}
                          aria-pressed={cfgEstilo === t.id}
                          className={cn(
                            'group overflow-hidden rounded-lg border-2 bg-white transition-all',
                            cfgEstilo === t.id
                              ? 'border-[#C2622C] shadow-sm'
                              : 'border-gray-200 hover:border-gray-300',
                          )}
                        >
                          <span
                            className="relative block aspect-[4/5] w-full"
                            style={{ background: fundoCss(t) }}
                          >
                            {cfgEstilo === t.id && (
                              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#C2622C] shadow">
                                <Check className="h-2.5 w-2.5 text-white" />
                              </span>
                            )}
                          </span>
                          <span className="block px-1 py-1.5 text-[9px] font-medium leading-tight text-gray-600">
                            {t.nome}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Botão miúdo: arte própria no lugar da cor/textura */}
                    <div className="mt-3">
                      {cfgImagem ? (
                        <div className="flex items-center gap-2">
                          <img src={cfgImagem} alt="Arte enviada" className="h-9 w-9 rounded-md border object-cover" />
                          <span className="text-[11px] text-gray-500 leading-tight flex-1">Arte própria em uso</span>
                          <button
                            onClick={removerImagem}
                            title="Remover arte"
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50">
                          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageUp className="h-3 w-3" />}
                          {uploading ? 'Enviando…' : 'Subir arte'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* Frase impressa no cartaz e repetida na página do cliente */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                    Mensagem para o cliente
                  </label>
                  <textarea
                    value={cfgMensagem}
                    onChange={(e) => setCfgMensagem(e.target.value)}
                    rows={2}
                    maxLength={120}
                    placeholder="Ex: É rapidinho! Conte como foi sua experiência."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C2622C]/25"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{cfgMensagem.length}/120</p>
                </div>

                <Button onClick={salvarCfg} disabled={savingCfg} variant="outline" className="w-full">
                  {savingCfg ? 'Salvando…' : 'Salvar tema'}
                </Button>
              </CardContent>
            </Card>

            {/* ───────── Prévia: o display de mesa ───────── */}
            <div className="flex flex-col">
              <h2 className="mb-3 text-[15px] font-semibold text-gray-800">QR Code impresso</h2>

              {/* O fundo da bancada acompanha o tema: é o que faz a troca de cor
                  ser percebida na hora, e não só dentro da plaquinha. */}
              <div
                className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 p-8 transition-[background] duration-500"
                style={{ background: `linear-gradient(160deg, ${tema.fundo[0]}22, ${tema.fundo[1]}44)` }}
              >
                {/* Display acrílico de mesa.
                    A leve rotação em Y é o que faz ler como OBJETO em cima de
                    uma mesa, e não como uma imagem colada na tela: sem ela, a
                    chapa transparente e o bloco de madeira viram dois
                    retângulos empilhados. */}
                <div className="w-full max-w-[290px]" style={{ perspective: '1300px' }}>
                  <div
                    className="relative"
                    style={{ transform: 'rotateY(-10deg) rotateX(2deg)', transformStyle: 'preserve-3d' }}
                  >
                    {/* Chapa de acrílico. O preenchimento é quase transparente
                        de propósito: acrílico se enxerga pela ARESTA e pelo
                        reflexo, não por uma moldura branca. Com opacidade alta
                        a chapa vira um passe-partout de papel. O canvas fica
                        SEMPRE montado — é dele que saem o PNG e o PDF. */}
                    <div
                      className="relative rounded-[6px] px-[10px] pb-[46px] pt-[10px] shadow-[0_24px_46px_-14px_rgba(0,0,0,0.45)] ring-1 ring-white/60"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(255,255,255,0.30), rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.24))',
                      }}
                    >
                      <canvas
                        ref={canvasRef}
                        width={POSTER_W}
                        height={POSTER_H}
                        className="block h-auto w-full rounded-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                      />
                      {/* Reflexo diagonal e aresta viva da chapa */}
                      <div className="pointer-events-none absolute inset-0 rounded-[6px] bg-gradient-to-tr from-white/0 via-white/35 to-white/0" />
                      <div className="pointer-events-none absolute inset-0 rounded-[6px] ring-1 ring-inset ring-white/70" />
                    </div>

                    {/* Base de madeira. Ancorada no PÉ da chapa e um pouco mais
                        larga que ela: é o que faz a chapa parecer encaixada no
                        bloco em vez de apoiada em cima dele. Sobram ~12px de
                        acrílico transparente entre o cartaz e a madeira. */}
                    <div className="absolute inset-x-[-3%] bottom-0 h-[34px]">
                      <div className="absolute inset-0 rounded-[5px] bg-gradient-to-b from-[#EEDAB8] via-[#D8B98D] to-[#AC8757] shadow-[0_14px_22px_-10px_rgba(0,0,0,0.5)]" />
                      <div
                        className="absolute inset-0 rounded-[5px] opacity-40"
                        style={{
                          background:
                            'repeating-linear-gradient(90deg, rgba(146,104,62,0.24) 0 1px, rgba(0,0,0,0) 1px 7px)',
                        }}
                      />
                      {/* Face de cima do bloco, pegando a luz */}
                      <div className="absolute inset-x-0 top-0 h-[4px] rounded-t-[5px] bg-white/40" />
                    </div>
                  </div>

                  {/* Sombra projetada na mesa */}
                  <div className="mx-auto mt-3 h-3 w-[82%] rounded-[50%] bg-black/20 blur-[9px]" />

                  <p className="mt-5 text-center text-[12px] text-gray-500">
                    É esta arte que sai no PNG e no PDF do botão “Baixar”.
                  </p>
                </div>
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
          title="Ajuste a sua arte"
          instructions="Arraste para posicionar e dê zoom com a roda do mouse (ou o controle abaixo). O que ficar dentro da moldura é o que aparece na tela do celular."
        />
      )}
    </div>
  )
}
