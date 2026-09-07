import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/types'
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
import { QrCode, Download, Loader2, ChevronDown, FileImage, FileText, ImageUp, Check, Palette, Info, X, Type, ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QR_CORES, QR_TEXTURAS, ehCorPersonalizada, fundoCss, getTema } from '@/lib/qr-temas'
import { landingUrl, desenharPoster, baixarBlob, canvasToBlob, POSTER_W, POSTER_H, ID_ROTULO, ID_TITULO, ID_MENSAGEM, MENSAGEM_PADRAO, type CaixaElemento } from '@/lib/qr-poster'
import { FONTES, fonteCss, lerElementos, lerEstiloDosTextos, novaLogo, novoTexto, type ElementoCartaz, type EstilosDosTextos } from '@/lib/cartaz-elementos'
import { BarraElemento } from '@/components/EditorCartaz'
import { ImageCropper } from '@/components/ImageCropper'
import { SeletorCor } from '@/components/SeletorCor'
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
  // 'estilo' (foto do tema como fundo) foi removido das opções — só existe
  // hoje pra não quebrar quem já tinha essa escolha salva de antes (ver
  // fallback em `loadData`). Configuração nova sempre nasce em 'upload'.
  const [cfgModo, setCfgModo] = useState<'estilo' | 'upload'>('upload')
  const [cfgEstilo, setCfgEstilo] = useState('branco')
  const [cfgImagem, setCfgImagem] = useState<string | null>(null)
  const [cfgMensagem, setCfgMensagem] = useState('')
  // Textos do topo do cartaz. Vazio = usa o padrao (ver qr-poster.ts).
  const [cfgRotulo, setCfgRotulo] = useState('')
  const [cfgTitulo, setCfgTitulo] = useState('')
  // Tipografia dos textos fixos, por id (ver qr_textos_estilo no banco).
  const [cfgEstilos, setCfgEstilos] = useState<EstilosDosTextos>({})
  const [savingCfg, setSavingCfg] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)

  // Métricas
  const [metricas, setMetricas] = useState<{ dia7: number; dia30: number; barras: { label: string; n: number }[] }>({ dia7: 0, dia30: 0, barras: [] })
  const [aba, setAba] = useState('config')

  // Elementos livres do cartaz (textos e logo do dono)
  const [elementos, setElementos] = useState<ElementoCartaz[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [caixas, setCaixas] = useState<CaixaElemento[]>([])
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  /** Largura da prévia em pixels de tela — converte o corpo do cartaz pro campo. */
  const [larguraPreview, setLarguraPreview] = useState(0)
  const camadaRef = useRef<HTMLDivElement>(null)

  const cfgSalvoRef = useRef({ modo: 'upload', estilo: 'branco', imagem: null as string | null, mensagem: '' })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (qrData) {
      drawCanvas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrData, restaurantName, cfgEstilo, cfgMensagem, cfgRotulo, cfgTitulo, cfgEstilos, elementos, editandoId])

  /**
   * Largura real da prévia na tela.
   *
   * O corpo da fonte é guardado em pixels do cartaz (720 de largura), e o campo
   * de edição vive na tela, onde a prévia tem ~300px. Sem essa medida a letra
   * digitada sairia num tamanho e a desenhada em outro.
   */
  useEffect(() => {
    const camada = camadaRef.current
    if (!camada || typeof ResizeObserver === 'undefined') return
    const medir = () => setLarguraPreview(camada.getBoundingClientRect().width)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(camada)
    return () => observador.disconnect()
  }, [qrData])

  const loadData = async () => {
    try {
      setLoading(true)

      const { data: userData } = await supabase.auth.getUser()
      let restauranteId: number | null = null
      if (userData?.user) {
        const { data: config } = await supabase
          .from('restaurantes')
          .select('id, nome_restaurante, qr_bg_modo, qr_estilo, qr_bg_imagem, qr_mensagem, qr_rotulo, qr_titulo, qr_textos_estilo, qr_elementos')
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
        // Mesma regra do rótulo: abre com o que ESTÁ no cartaz, pra apagar
        // significar 'cartaz sem esta linha' e não 'nunca configurei'.
        setCfgMensagem(config?.qr_mensagem ?? MENSAGEM_PADRAO)
        // O rótulo abre preenchido com o que ESTÁ no cartaz (o padrão, quando
        // nunca foi mexido). Assim apagar o campo tem um significado só e
        // óbvio: cartaz sem rótulo. Se abrisse vazio, "vazio" seria ao mesmo
        // tempo "não mexi" e "quero sem" — e a prévia mostraria uma coisa
        // enquanto o PDF imprimiria outra.
        setCfgRotulo((config as any)?.qr_rotulo ?? 'RESTAURANTE')
        // O título, ao contrário, não pode ficar vazio: cartaz sem nome não
        // existe. Vazio aqui significa "usa o nome do cadastro", e o
        // placeholder mostra qual é.
        setCfgTitulo((config as any)?.qr_titulo ?? '')
        setElementos(lerElementos(config?.qr_elementos))
        setCfgEstilos(lerEstiloDosTextos((config as any)?.qr_textos_estilo))
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
          qr_mensagem: cfgMensagem.trim(),
          // Rótulo guarda string vazia quando apagado — é uma escolha ("sem
          // rótulo"), não ausência de configuração.
          qr_rotulo: cfgRotulo.trim(),
          // Título vazio volta a null: o cartaz passa a seguir o nome do
          // cadastro de novo, inclusive se ele for renomeado depois.
          qr_titulo: cfgTitulo.trim() || null,
          // A coluna é jsonb livre; o tipo gerado a descreve como `Json`, que
          // não aceita uma interface nomeada mesmo sendo serializável.
          qr_textos_estilo: cfgEstilos as unknown as Json,
          qr_elementos: elementos as unknown as Json,
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

  // ── Elementos livres do cartaz ──

  const alterarElemento = (id: string, campos: Partial<ElementoCartaz>) => {
    setElementos((prev) => prev.map((el) => (el.id === id ? { ...el, ...campos } : el)))
  }

  const removerElemento = (id: string) => {
    setElementos((prev) => prev.filter((el) => el.id !== id))
    setSelecionado((atual) => (atual === id ? null : atual))
  }

  const adicionarTexto = () => {
    const novo = novoTexto(elementos)
    setElementos((prev) => [...prev, novo])
    setSelecionado(novo.id)
  }

  /**
   * A logo do dono sobe SEM passar pelo recorte, ao contrário da arte de fundo.
   * Recortar logo é destrutivo — o corte come a margem da marca — e o recorte
   * exporta JPEG, que não guarda transparência: a logo cairia no cartaz dentro
   * de um retângulo branco. Aqui o arquivo vai como está e quem ajusta o
   * tamanho é o controle do editor.
   */
  const enviarLogo = async (arquivo: File) => {
    if (!restauranteId) return
    setEnviandoLogo(true)
    try {
      const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'png'
      const caminho = `${restauranteId}/logo-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('qr-fundos')
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type || 'image/png' })
      if (error) throw error
      const { data } = supabase.storage.from('qr-fundos').getPublicUrl(caminho)
      const nova = novaLogo(data.publicUrl, elementos)
      setElementos((prev) => [...prev, nova])
      setSelecionado(nova.id)
      toast.success('Logo adicionada — arraste na prévia para posicionar.')
    } catch (err: any) {
      toast.error('Erro ao enviar a logo', { description: err.message })
    } finally {
      setEnviandoLogo(false)
    }
  }

  /**
   * Arrasto do elemento sobre a prévia.
   *
   * O deslocamento é medido em FRAÇÃO da camada, e não em pixel: a prévia é
   * exibida bem menor que o cartaz de 720×1080, então pixel de tela e pixel de
   * cartaz não são a mesma coisa — e a fração vale nos dois.
   */
  const arrastarElemento = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setSelecionado(id)

    const camada = camadaRef.current
    const el = elementos.find((x) => x.id === id)
    if (!camada || !el) return

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    alvo.setPointerCapture(e.pointerId)
    const inicio = { px: e.clientX, py: e.clientY, x: el.x, y: el.y }

    const mover = (ev: PointerEvent) => {
      const nx = inicio.x + (ev.clientX - inicio.px) / area.width
      const ny = inicio.y + (ev.clientY - inicio.py) / area.height
      alterarElemento(id, {
        x: Math.min(1, Math.max(0, nx)),
        y: Math.min(1, Math.max(0, ny)),
      })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /**
   * Os três textos que já vinham no cartaz e agora se editam clicando neles.
   *
   * Não são elementos livres: não se arrastam (o lugar deles faz parte do
   * desenho) e o rótulo e o nome não se excluem. A mensagem pode sair, e sai
   * pelo mesmo "×" dos outros elementos — apagar o conteúdo é o que significa
   * "não quero esta linha no cartaz".
   */
  const tema = getTema(cfgEstilo)

  /** O estilo em vigor de um texto fixo: o que o dono mexeu, sobre o padrão. */
  const estiloFixo = (id: string, padrao: { tamanho: number; fonteCssPadrao: string; negrito: boolean; cor: string }) => {
    const e = cfgEstilos[id] ?? {}
    return {
      tamanho: e.tamanho ?? padrao.tamanho,
      familia: e.fonte ? fonteCss(e.fonte) : padrao.fonteCssPadrao,
      fonteId: e.fonte ?? null,
      negrito: e.negrito ?? padrao.negrito,
      italico: e.italico ?? false,
      cor: e.cor ?? padrao.cor,
      corPropria: e.cor ?? null,
    }
  }

  const tituloVisivel = cfgTitulo || restaurantName
  const textosFixos: Record<string, {
    valor: string
    alterar: (v: string) => void
    podeExcluir: boolean
    rotuloAcessivel: string
    maiuscula?: boolean
    espacado?: boolean
    estilo: ReturnType<typeof estiloFixo>
  }> = {
    [ID_ROTULO]: {
      valor: cfgRotulo,
      alterar: setCfgRotulo,
      // Apagar o rótulo é uma escolha legítima — o cartaz fica sem ele.
      podeExcluir: true,
      rotuloAcessivel: 'o rótulo acima do nome',
      maiuscula: true,
      espacado: true,
      estilo: estiloFixo(ID_ROTULO, { tamanho: 24, fonteCssPadrao: 'sans-serif', negrito: true, cor: tema.acento }),
    },
    [ID_TITULO]: {
      // Mostra o que ESTÁ no cartaz. Com o campo vazio (seguindo o cadastro),
      // editar aqui começa a partir do nome que se vê, não de um campo em
      // branco.
      valor: tituloVisivel,
      alterar: setCfgTitulo,
      // O único que não sai: cartaz sem nome do restaurante não é cartaz.
      podeExcluir: false,
      rotuloAcessivel: 'o nome no cartaz',
      estilo: estiloFixo(ID_TITULO, {
        tamanho: tituloVisivel.length > 22 ? 38 : tituloVisivel.length > 15 ? 46 : 52,
        fonteCssPadrao: 'Georgia, serif',
        negrito: true,
        cor: tema.tinta,
      }),
    },
    [ID_MENSAGEM]: {
      valor: cfgMensagem,
      alterar: setCfgMensagem,
      podeExcluir: true,
      rotuloAcessivel: 'a mensagem para o cliente',
      estilo: estiloFixo(ID_MENSAGEM, { tamanho: 25, fonteCssPadrao: 'sans-serif', negrito: false, cor: tema.suave }),
    },
  }

  /**
   * Um texto fixo, vestido de `ElementoCartaz` pra caber na MESMA barra de
   * propriedades dos textos livres. Sem isso seriam duas barras iguais com
   * dois códigos — e a segunda sairia do lugar na primeira mudança.
   */
  const comoElemento = (id: string): ElementoCartaz | null => {
    const f = textosFixos[id]
    if (!f) return null
    return {
      id,
      tipo: 'texto',
      x: 0.5,
      y: 0.5,
      texto: f.valor,
      fonte: f.estilo.fonteId ?? FONTES[0].id,
      tamanho: f.estilo.tamanho,
      negrito: f.estilo.negrito,
      italico: f.estilo.italico,
      cor: f.estilo.corPropria,
      url: null,
      escala: 0.3,
    }
  }

  /** Aplica no estilo guardado o que a barra de propriedades mudou. */
  const alterarTextoFixo = (id: string, campos: Partial<ElementoCartaz>) => {
    if ('texto' in campos && typeof campos.texto === 'string') textosFixos[id]?.alterar(campos.texto)
    const estilo: Record<string, unknown> = { ...(cfgEstilos[id] ?? {}) }
    if (campos.fonte !== undefined) estilo.fonte = campos.fonte
    if (campos.tamanho !== undefined) estilo.tamanho = campos.tamanho
    if (campos.negrito !== undefined) estilo.negrito = campos.negrito
    if (campos.italico !== undefined) estilo.italico = campos.italico
    if ('cor' in campos) estilo.cor = campos.cor
    setCfgEstilos((p) => ({ ...p, [id]: estilo }))
  }

  const drawCanvas = async () => {
    const canvas = canvasRef.current
    if (!canvas || !qrData) return
    try {
      setCaixas(
        await desenharPoster(canvas, {
          url: landingUrl(qrData.slug),
          // Título e rótulo vazios caem no padrão (nome do cadastro e
          // "RESTAURANTE"); rótulo em branco de propósito some do cartaz.
          nome: cfgTitulo.trim() || restaurantName,
          rotulo: cfgRotulo,
          tagline: cfgMensagem,
          estilos: cfgEstilos,
          temaId: cfgEstilo,
          elementos,
          editandoId: editandoId ?? undefined,
        }),
      )
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
  const personalizada = ehCorPersonalizada(cfgEstilo)
  const elementoSelecionado = elementos.find((e) => e.id === selecionado) ?? null
  const temLogo = elementos.some((e) => e.tipo === 'logo')

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
          {/* A coluna da prévia é dimensionada pelo CONTEÚDO (`auto`), não por
              metade da tela: a plaquinha tem largura fixa, então numa grade
              50/50 sobrava uma faixa vazia grande dos dois lados dela — espaço
              que a configuração, essa sim cheia de controles, aproveita melhor. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            {/* ───────── A. Tema do display impresso ───────── */}
            <Card className="border-gray-200">
              <CardHeader className="pb-5">
                <CardTitle className="text-[22px] leading-snug font-semibold tracking-tight">
                  Tema do QR Code Impresso
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

                    {/* Cor livre, fora da paleta pronta. O respiro maior é para
                        o botão não ler como a 13ª cor da grade acima. */}
                    <div className="mt-6">
                      <SeletorCor
                        valor={personalizada ? cfgEstilo : null}
                        onChange={setCfgEstilo}
                      />
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

                    {/* Arte própria: é uma OPÇÃO DE FUNDO como as outras, então
                        tem o mesmo tamanho e a mesma forma de uma textura, na
                        mesma grade. Como faixa larga separada, lia como outra
                        coisa — e quem estava escolhendo fundo não a via como
                        alternativa às texturas ao lado. */}
                    {/* Deitado: ocupa duas colunas da grade e fica com a mesma
                        altura de uma textura. Em pé competia visualmente com
                        elas sendo outra coisa; deitado se lê como o que é —
                        uma ação, no meio das opções de fundo. */}
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {cfgImagem ? (
                        <div className="relative col-span-2 overflow-hidden rounded-lg border-2 border-[#C2622C] bg-white shadow-sm">
                          <span className="relative block aspect-[8/5] w-full">
                            <img src={cfgImagem} alt="Arte enviada" className="h-full w-full object-cover" />
                            <button
                              onClick={removerImagem}
                              title="Remover arte"
                              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                          <span className="block px-1 py-1.5 text-[9px] font-medium leading-tight text-gray-600">
                            Arte própria
                          </span>
                        </div>
                      ) : (
                        <label className="group col-span-2 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-white transition-colors hover:border-[#C2622C]/60">
                          <span className="flex aspect-[8/5] w-full items-center justify-center gap-1.5 bg-[#C2622C]/5">
                            {uploading ? (
                              <Loader2 className="h-5 w-5 animate-spin text-[#C2622C]" />
                            ) : (
                              <ImageUp className="h-5 w-5 text-[#C2622C]" />
                            )}
                          </span>
                          <span className="block px-1 py-1.5 text-[9px] font-medium leading-tight text-gray-600">
                            {uploading ? 'Enviando…' : 'Subir arte'}
                          </span>
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

                {/* Rótulo e nome NÃO têm campo aqui de propósito: editam-se
                    clicando neles na plaquinha, com os mesmos controles de
                    tipografia de qualquer outro texto. Um campo aqui seria um
                    segundo lugar pra mexer na mesma coisa. A mensagem tem os
                    dois caminhos porque é texto corrido, e digitar frase longa
                    dentro da prévia pequena é ruim. */}

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
            <div className="flex w-[330px] max-w-full flex-col">
              <h2 className="mb-2 text-[15px] font-semibold text-gray-800">QR Code impresso</h2>

              {/* A barra do elemento e os botões de adicionar ficam JUNTO da
                  prévia: é nela que o elemento é posicionado e digitado, e ter
                  o controle no outro lado da tela obrigava a ir e voltar com o
                  olho a cada ajuste. */}
              {elementoSelecionado && (
                <BarraElemento
                  elemento={elementoSelecionado}
                  onAlterar={alterarElemento}
                  onRemover={removerElemento}
                />
              )}
              {/* Mesma barra para os textos fixos: fonte, corpo, negrito,
                  itálico e cor funcionam igual. Só o excluir muda — o nome do
                  restaurante é o único que não sai do cartaz. */}
              {selecionado && textosFixos[selecionado] && (
                <BarraElemento
                  elemento={comoElemento(selecionado)!}
                  onAlterar={alterarTextoFixo}
                  onRemover={(id) => {
                    if (!textosFixos[id]?.podeExcluir) return
                    textosFixos[id].alterar('')
                    setSelecionado(null)
                    setEditandoId(null)
                  }}
                  podeRemover={textosFixos[selecionado].podeExcluir}
                />
              )}

              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={adicionarTexto}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <Type className="h-3.5 w-3.5" /> Texto
                </button>

                {/* Some quando já existe uma logo: o cartaz comporta uma marca
                    só, e um segundo botão só levaria a duas logos sobrepostas. */}
                {!temLogo && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50">
                    {enviandoLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {enviandoLogo ? 'Enviando…' : 'Logo'}
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = '' }}
                    />
                  </label>
                )}
              </div>

              {/* O fundo da bancada acompanha o tema: é o que faz a troca de cor
                  ser percebida na hora, e não só dentro da plaquinha. */}
              <div
                className="flex items-center justify-center rounded-xl border border-gray-200 p-5 transition-[background] duration-500"
                style={{ background: `linear-gradient(160deg, ${tema.fundo[0]}22, ${tema.fundo[1]}44)` }}
              >
                {/* Display acrílico de mesa.
                    A leve rotação em Y é o que faz ler como OBJETO em cima de
                    uma mesa, e não como uma imagem colada na tela: sem ela, a
                    chapa transparente e o bloco de madeira viram dois
                    retângulos empilhados. */}
                {/* Largura fixa, e não `w-full`: é ela que segura o tamanho da
                    plaquinha agora que a caixa em volta encolheu. `max-w-full`
                    só entra em tela estreita demais, pra não vazar. */}
                <div className="w-[290px] max-w-full" style={{ perspective: '1300px' }}>
                  {/* Com um elemento selecionado a plaquinha fica RETA.
                      A inclinação em 3D deforma o mapeamento do arrasto — o
                      retângulo que o navegador reporta é a caixa alinhada aos
                      eixos, não o trapézio que se vê —, então arrastar sairia
                      deslocado. Sem seleção ela volta a inclinar, que é como o
                      display fica de verdade em cima da mesa. */}
                  <div
                    className="relative transition-transform duration-300"
                    style={{
                      transform: selecionado ? 'none' : 'rotateY(-10deg) rotateX(2deg)',
                      transformStyle: 'preserve-3d',
                    }}
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
                      {/* Camada de arraste, exatamente sobre o canvas: as
                          caixas vêm de `desenharPoster`, medidas no MESMO
                          desenho, então o alvo cai onde o elemento está —
                          estimar a largura do texto aqui daria alvo torto. */}
                      <div ref={camadaRef} className="relative">
                        <canvas
                          ref={canvasRef}
                          width={POSTER_W}
                          height={POSTER_H}
                          className="block h-auto w-full rounded-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                          onPointerDown={() => setSelecionado(null)}
                        />
                        {caixas.map((c) => {
                          const fixo = textosFixos[c.id]
                          const el = elementos.find((e) => e.id === c.id)
                          if (!fixo && !el) return null
                          const emEdicao = editandoId === c.id
                          // Margem de 6px do cartaz: alvo de texto fino ainda
                          // precisa dar pra pegar com o dedo.
                          const molduraFixa = {
                            left: `${((c.x - 6) / POSTER_W) * 100}%`,
                            top: `${((c.y - 6) / POSTER_H) * 100}%`,
                            width: `${((c.w + 12) / POSTER_W) * 100}%`,
                            height: `${((c.h + 12) / POSTER_H) * 100}%`,
                          }

                          /* Rótulo, nome e mensagem: editam clicando no
                             próprio cartaz, mas não se arrastam (o lugar
                             deles é parte do desenho) e só a mensagem pode
                             ser excluída — cartaz sem nome não existe. */
                          if (fixo) {
                            return (
                              <div
                                key={c.id}
                                className={cn(
                                  'group absolute rounded-[2px] transition-colors',
                                  emEdicao ? 'ring-2 ring-[#C2622C] ring-offset-1' : 'hover:ring-2 hover:ring-[#C2622C]/45',
                                )}
                                style={molduraFixa}
                              >
                                {emEdicao ? (
                                  <textarea
                                    autoFocus
                                    value={fixo.valor}
                                    onChange={(e) => fixo.alterar(e.target.value)}
                                    onBlur={() => setEditandoId(null)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setEditandoId(null) }}
                                    className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-center leading-[1.2] outline-none"
                                    style={{
                                      fontFamily: fixo.estilo.familia,
                                      fontSize: (fixo.estilo.tamanho * larguraPreview) / POSTER_W || 12,
                                      fontWeight: fixo.estilo.negrito ? 700 : 400,
                                      fontStyle: fixo.estilo.italico ? 'italic' : 'normal',
                                      letterSpacing: fixo.espacado ? `${(6 * larguraPreview) / POSTER_W}px` : undefined,
                                      textTransform: fixo.maiuscula ? 'uppercase' : undefined,
                                      color: fixo.estilo.cor,
                                    }}
                                  />
                                ) : (
                                  /* Um clique só: seleciona (a barra de
                                     propriedades aparece) e já abre pra
                                     digitar. Eram dois gestos diferentes pro
                                     mesmo texto, e ninguém adivinha qual é
                                     qual num cartaz. */
                                  <div
                                    onClick={() => { setSelecionado(c.id); setEditandoId(c.id) }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { setSelecionado(c.id); setEditandoId(c.id) } }}
                                    aria-label={`Editar ${fixo.rotuloAcessivel}`}
                                    title={`Clique para editar: ${fixo.rotuloAcessivel}`}
                                    className="h-full w-full cursor-text"
                                  />
                                )}

                                {fixo.podeExcluir && (
                                  <button
                                    type="button"
                                    onClick={() => { fixo.alterar(''); setEditandoId(null) }}
                                    aria-label="Tirar a mensagem do cartaz"
                                    title="Tirar do cartaz"
                                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-2 ring-white group-hover:flex"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )
                          }
                          if (!el) return null
                          // Margem de 6px do cartaz: alvo de texto fino ainda
                          // precisa dar pra pegar com o dedo.
                          const moldura = {
                            left: `${((c.x - 6) / POSTER_W) * 100}%`,
                            top: `${((c.y - 6) / POSTER_H) * 100}%`,
                            width: `${((c.w + 12) / POSTER_W) * 100}%`,
                            height: `${((c.h + 12) / POSTER_H) * 100}%`,
                          }

                          return (
                            <div
                              key={c.id}
                              className={cn(
                                'group absolute rounded-[2px] transition-colors',
                                selecionado === c.id
                                  ? 'ring-2 ring-[#C2622C] ring-offset-1'
                                  : 'hover:ring-2 hover:ring-[#C2622C]/45',
                              )}
                              style={moldura}
                            >
                              {emEdicao && el.tipo === 'texto' ? (
                                /* O texto se digita AQUI, sobre o cartaz. O
                                   canvas deixa de pintá-lo enquanto isso (ver
                                   `editandoId` em qr-poster), senão apareceria
                                   dobrado. O corpo é convertido de pixel de
                                   cartaz para pixel de tela pela largura real
                                   da prévia — sem isso a letra do campo não
                                   bate com a desenhada. */
                                <textarea
                                  autoFocus
                                  value={el.texto}
                                  onChange={(e) => alterarElemento(el.id, { texto: e.target.value })}
                                  onBlur={() => setEditandoId(null)}
                                  onKeyDown={(e) => { if (e.key === 'Escape') setEditandoId(null) }}
                                  className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-center leading-[1.2] outline-none"
                                  style={{
                                    fontFamily: fonteCss(el.fonte),
                                    fontSize: (el.tamanho * larguraPreview) / POSTER_W || 12,
                                    fontWeight: el.negrito ? 700 : 400,
                                    fontStyle: el.italico ? 'italic' : 'normal',
                                    color: el.cor ?? tema.tinta,
                                  }}
                                />
                              ) : (
                                <div
                                  onPointerDown={arrastarElemento(c.id)}
                                  onDoubleClick={() => { if (el.tipo === 'texto') setEditandoId(c.id) }}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={el.tipo === 'texto' ? 'Mover o texto (dois cliques para editar)' : 'Mover a logo'}
                                  className="h-full w-full cursor-move touch-none"
                                />
                              )}

                              {/* Excluir no hover — some junto com o elemento */}
                              <button
                                type="button"
                                onClick={() => removerElemento(c.id)}
                                aria-label="Excluir o elemento"
                                title="Excluir"
                                className={cn(
                                  'absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-2 ring-white',
                                  'group-hover:flex',
                                  selecionado === c.id && 'flex',
                                )}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
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
        />
      )}
    </div>
  )
}
