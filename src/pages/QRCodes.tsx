import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { jsPDF } from 'jspdf'
import { QrCode, Download, Loader2, ChevronDown, FileImage, FileText, ImageUp, Check, X, Type, ImagePlus, Plus, RotateCw, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QR_CORES, QR_TEXTURAS, ehCorPersonalizada, fundoCss, getTema } from '@/lib/qr-temas'
import { landingUrl, desenharPoster, baixarBlob, canvasToBlob, POSTER_W, POSTER_H, ID_ROTULO, ID_TITULO, ID_MENSAGEM, MENSAGEM_PADRAO, type CaixaElemento, type PosterOpts } from '@/lib/qr-poster'
import { FONTES, fonteCss, forcarForaDaMarca, lerElementos, lerEstiloDosTextos, novaLogo, novoTexto, type ElementoCartaz, type EstilosDosTextos } from '@/lib/cartaz-elementos'
import { redimensionar as calcularRedimensionamento, type Ancora } from '@/lib/redimensionar-cartaz'
import { Alcas } from '@/components/AlcasElemento'
import { FundoDaPaginaDoCliente, type FundoDoCliente } from '@/components/FundoDaPaginaDoCliente'
import type { TextosDaPagina } from '@/components/LandingView'
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

/**
 * Abre um campo de edição com o foco nele e TUDO selecionado.
 *
 * Duas armadilhas, e por isso não é só um `autoFocus`:
 *
 * - o segundo clique de um duplo clique cai dentro do campo recém-criado, e o
 *   navegador seleciona só a palavra sob o cursor — desfazendo um `select()`
 *   imediato. Daí esperar o quadro seguinte.
 * - o cartaz é redesenhado enquanto se digita, e o React remonta o campo; com
 *   `autoFocus` (que só age na montagem original) ele perdia o foco no meio do
 *   caminho. O callback de ref roda a cada montagem e devolve o foco.
 *
 * Selecionar tudo é o que faz o gesto valer a pena: quem deu dois cliques quer
 * trocar a frase, e digitar já substitui. O clique seguinte, já dentro do
 * campo, põe o cursor na letra em que se clicou.
 */
function abrirSelecionandoTudo(campo: HTMLTextAreaElement | null) {
  if (!campo || document.activeElement === campo) return
  campo.focus()
  requestAnimationFrame(() => {
    if (document.activeElement === campo) campo.select()
  })
}

/**
 * Onde a moldura de seleção fica na prévia, em porcentagem do cartaz.
 *
 * Vive fora do componente porque é usada de dois jeitos: pelo JSX, no render
 * normal, e escrita direto no `style` do nó durante um arrasto — quando o
 * React fica de fora (ver `gestoRef`). Ter uma conta só garante que os dois
 * caminhos põem a moldura exatamente no mesmo lugar.
 *
 * Texto ganha 6px de folga (linha fina é alvo difícil de pegar com o dedo);
 * imagem não ganha nada, senão parece que sobra imagem onde não tem.
 */
function estiloDaMoldura(c: CaixaElemento, folga: number) {
  return {
    left: `${((c.x - folga) / POSTER_W) * 100}%`,
    top: `${((c.y - folga) / POSTER_H) * 100}%`,
    width: `${((c.w + folga * 2) / POSTER_W) * 100}%`,
    height: `${((c.h + folga * 2) / POSTER_H) * 100}%`,
    // O quadro vira junto com a figura, no mesmo eixo e no mesmo centro do
    // canvas. Sem isto ele ficava deitado enquanto a imagem girava dentro.
    transform: c.rotacao ? `rotate(${c.rotacao}deg)` : '',
  }
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
  /**
   * Em que passo da personalização a pessoa está.
   *
   * 1 = o cartaz impresso (A), 2 = o fundo da página do cliente (B). São duas
   * decisões sem nada em comum além de saírem do mesmo QR, e numa tela só a
   * segunda ficava enterrada abaixo da dobra — ninguém a encontrava.
   */
  const [passo, setPasso] = useState<1 | 2>(1)
  const [fundoCliente, setFundoCliente] = useState<FundoDoCliente>({ modo: 'estilo', imagem: null, estilo: 'branco' })
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  /** Textos e imagens livres sobre a página do cliente (passo B). */
  const [elementosCliente, setElementosCliente] = useState<ElementoCartaz[]>([])
  /** O que o dono reescreveu nos textos da página do cliente, e a tipografia. */
  const [textosCliente, setTextosCliente] = useState<TextosDaPagina>({})
  const [estilosCliente, setEstilosCliente] = useState<EstilosDosTextos>({})
  const [whatsappDono, setWhatsappDono] = useState<string | null>(null)

  /** Editando agora: a plaquinha fica reta. Ver o efeito do descanso abaixo. */
  const [editandoAgora, setEditandoAgora] = useState(false)
  const camadaRef = useRef<HTMLDivElement>(null)

  // Agendamento do desenho do cartaz. O porquê de cada um está em `desenhar`.
  const opcoesRef = useRef<PosterOpts | null>(null)
  const quadroRef = useRef<number | null>(null)
  const desenhandoRef = useRef(false)
  const pendenteRef = useRef(false)

  /**
   * O arrasto em voo — e a razão de ele existir é o "delay" que se sentia ao
   * mover, girar ou redimensionar.
   *
   * Cada movimento do dedo mudava o estado do React, e um `setState` aqui
   * renderiza a PÁGINA inteira: as abas, as métricas, os quarenta seletores
   * de cor e textura, a lista de fontes. Depois o canvas era redesenhado e o
   * resultado voltava por outro `setState`, com mais um render. Dois renders
   * da página cheia por movimento, e o dedo já estava adiante quando a figura
   * chegava — exatamente o que não acontece ao arrastar uma ação entre
   * colunas, onde o navegador só move um nó que já existe.
   *
   * Enquanto um gesto está em voo, o React fica FORA do caminho: o movimento
   * escreve aqui, o canvas é redesenhado e a moldura é reposicionada direto
   * no `style` do nó. O estado só recebe o valor final, no soltar — um render
   * por gesto, em vez de um por pixel.
   */
  const gestoRef = useRef<{
    elementos: ElementoCartaz[]
    estilos: EstilosDosTextos
    caixas: CaixaElemento[]
  } | null>(null)
  /** Os nós das molduras, por id, pra alcançá-los sem passar pelo React. */
  const molduraRefs = useRef(new Map<string, HTMLDivElement>())

  const cfgSalvoRef = useRef({ modo: 'upload', estilo: 'branco', imagem: null as string | null, mensagem: '' })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!qrData) return
    // Guarda o pedido mais recente e agenda UM desenho pro próximo quadro.
    // Ver `desenhar` logo abaixo pro porquê das duas coisas.
    opcoesRef.current = {
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
    }
    agendarQuadro()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrData, restaurantName, cfgEstilo, cfgMensagem, cfgRotulo, cfgTitulo, cfgEstilos, elementos, editandoId])

  useEffect(() => () => {
    if (quadroRef.current != null) cancelAnimationFrame(quadroRef.current)
  }, [])

  /** Um desenho por quadro, no máximo. Ver `desenhar`. */
  const agendarQuadro = () => {
    if (quadroRef.current != null) return
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = null
      void desenhar()
    })
  }

  /** Começa um gesto: daqui até soltar, nada passa pelo React. */
  const iniciarGesto = () => {
    gestoRef.current = { elementos, estilos: cfgEstilos, caixas }
  }

  /** O que o movimento do dedo produziu, sem tocar no estado do React. */
  const aoVivo = (mudanca: { elementos?: ElementoCartaz[]; estilos?: EstilosDosTextos }) => {
    const g = gestoRef.current
    const base = opcoesRef.current
    if (!g || !base) return
    if (mudanca.elementos) g.elementos = mudanca.elementos
    if (mudanca.estilos) g.estilos = mudanca.estilos
    opcoesRef.current = { ...base, elementos: g.elementos, estilos: g.estilos }
    agendarQuadro()
  }

  /** Soltou: um render só, com o valor final. */
  const terminarGesto = () => {
    const g = gestoRef.current
    gestoRef.current = null
    if (!g) return
    // Quando a referência não mudou, o React nem re-renderiza — é o caso de
    // pegar o elemento e soltar sem arrastar.
    setElementos(g.elementos)
    setCfgEstilos(g.estilos)
    setCaixas(g.caixas)
  }

  /**
   * Guarda o nó da moldura pra alcançá-lo durante um gesto.
   *
   * A função é memorizada por id: um `ref` inline novo a cada render faria o
   * React desmontar e remontar o callback toda vez, tirando e repondo a
   * entrada do mapa sem necessidade.
   */
  const guardarMolduraRef = useRef(new Map<string, (n: HTMLDivElement | null) => void>())
  const guardarMoldura = (id: string) => {
    const pronta = guardarMolduraRef.current.get(id)
    if (pronta) return pronta
    const fn = (n: HTMLDivElement | null) => {
      if (n) molduraRefs.current.set(id, n)
      else molduraRefs.current.delete(id)
    }
    guardarMolduraRef.current.set(id, fn)
    return fn
  }

  /**
   * Reposiciona as molduras direto no DOM, sem `setState`.
   *
   * Só o elemento que está sendo mexido muda de caixa, mas passar por todas
   * custa nada e evita ter que descobrir quais mudaram.
   */
  const aplicarCaixasNoDom = (novas: CaixaElemento[], els: ElementoCartaz[]) => {
    for (const c of novas) {
      const no = molduraRefs.current.get(c.id)
      if (!no) continue
      Object.assign(no.style, estiloDaMoldura(c, els.find((e) => e.id === c.id)?.tipo === 'logo' ? 0 : 6))
    }
  }

  /**
   * Enquanto se edita, a plaquinha fica RETA; ela só volta a se inclinar
   * depois de 20 segundos parados.
   *
   * O motivo é medido, não estético: com a inclinação em 3D, o retângulo que
   * o navegador reporta é a caixa alinhada aos eixos, não o trapézio que se
   * vê, e o arrasto sai deslocado. Endireitar só no clique resolvia isso mas
   * fazia a plaquinha pular a cada seleção — e ela voltava a inclinar no
   * instante em que se soltava, no meio de uma sequência de ajustes. Vinte
   * segundos é tempo de sobra entre um ajuste e o seguinte, e curto o
   * bastante pra devolver o objeto sobre a mesa quando o trabalho acabou.
   *
   * O relógio reinicia sozinho porque as dependências são o próprio conteúdo
   * do cartaz: qualquer mudança dispara o efeito de novo, e o `clearTimeout`
   * da limpeza cancela a contagem anterior.
   */
  /**
   * Endireita a plaquinha e reinicia a contagem dos 20 segundos.
   *
   * Um relógio próprio, e não um `setTimeout` dentro de um efeito: quem
   * acorda a plaquinha não é só a edição do conteúdo — o mouse chegando perto
   * também acorda (ver `onPointerEnter` na prévia), e isso não muda nenhuma
   * dependência que um efeito pudesse observar.
   */
  const relogioDaPlaquinha = useRef<number | null>(null)
  const acordarPlaquinha = () => {
    setEditandoAgora(true)
    if (relogioDaPlaquinha.current) clearTimeout(relogioDaPlaquinha.current)
    relogioDaPlaquinha.current = window.setTimeout(() => {
      // Num arrasto que passe dos 20s, inclinar no meio do gesto deslocaria o
      // alvo debaixo do dedo — e o `setState` renderizaria a página bem quando
      // ela precisa ficar fora do caminho. Ao soltar, o conteúdo muda e a
      // contagem recomeça.
      if (gestoRef.current) return
      setEditandoAgora(false)
    }, 20_000)
  }

  const primeiroDesenho = useRef(true)
  useEffect(() => {
    // Sem isto a plaquinha nasceria reta e só inclinaria 20s depois de abrir
    // a página, sem ninguém ter tocado em nada.
    if (primeiroDesenho.current) {
      primeiroDesenho.current = false
      return
    }
    acordarPlaquinha()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgEstilo, cfgMensagem, cfgRotulo, cfgTitulo, cfgEstilos, elementos, editandoId, selecionado])

  useEffect(() => () => {
    if (relogioDaPlaquinha.current) clearTimeout(relogioDaPlaquinha.current)
  }, [])

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
          .select('id, nome_restaurante, numero_whatsapp, qr_bg_modo, qr_estilo, qr_bg_imagem, qr_mensagem, qr_rotulo, qr_titulo, qr_textos_estilo, qr_elementos, cliente_bg_modo, cliente_bg_imagem, cliente_estilo, cliente_elementos, cliente_textos, cliente_textos_estilo')
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
        // Fundo da página do cliente (passo B). Quem nunca passou por lá cai
        // no que a migração copiou do cartaz — o mesmo que o cliente já via.
        const cfgCliente = config as unknown as {
          cliente_bg_modo?: string | null
          cliente_bg_imagem?: string | null
          cliente_estilo?: string | null
          numero_whatsapp?: string | null
        } | null
        setWhatsappDono(cfgCliente?.numero_whatsapp ?? null)
        const extras = config as unknown as { cliente_elementos?: unknown; cliente_textos?: unknown; cliente_textos_estilo?: unknown }
        setElementosCliente(lerElementos(extras?.cliente_elementos))
        setTextosCliente((extras?.cliente_textos ?? {}) as TextosDaPagina)
        setEstilosCliente(lerEstiloDosTextos(extras?.cliente_textos_estilo))
        setFundoCliente({
          modo: cfgCliente?.cliente_bg_modo === 'upload' ? 'upload' : 'estilo',
          imagem: cfgCliente?.cliente_bg_imagem ?? null,
          estilo: getTema(cfgCliente?.cliente_estilo ?? config?.qr_estilo).id,
        })
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

  /**
   * Grava o passo B. Separado do `salvarCfg` porque são gravações de coisas
   * diferentes: uma fecha o cartaz impresso, a outra a página do cliente.
   * Juntar as duas faria "Salvar Alterações" na prévia do celular regravar
   * também a tipografia do cartaz — sem ninguém ter pedido.
   */
  const salvarFundoDoCliente = async () => {
    if (!restauranteId) return
    setSavingCfg(true)
    try {
      const { error } = await supabase
        .from('restaurantes')
        .update({
          cliente_bg_modo: fundoCliente.modo,
          cliente_bg_imagem: fundoCliente.imagem,
          cliente_estilo: fundoCliente.estilo,
          cliente_elementos: elementosCliente as unknown as Json,
          cliente_textos: textosCliente as unknown as Json,
          cliente_textos_estilo: estilosCliente as unknown as Json,
        } as never)
        .eq('id', restauranteId)
      if (error) throw error
      toast.success('Página do cliente salva!')
    } catch (err: any) {
      toast.error('Erro ao salvar', { description: err.message })
    } finally {
      setSavingCfg(false)
    }
  }

  /** Imagem de um ELEMENTO da página do cliente — devolve a URL pra quem pediu. */
  const subirImagemDoCliente = async (arquivo: File): Promise<string | null> => {
    if (!restauranteId) return null
    setEnviandoFoto(true)
    try {
      const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase()
      const path = `${restauranteId}/cliente/el-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('qr-fundos')
        .upload(path, arquivo, { upsert: true, contentType: arquivo.type || 'image/png' })
      if (error) throw error
      return supabase.storage.from('qr-fundos').getPublicUrl(path).data.publicUrl
    } catch (err: any) {
      toast.error('Erro no upload', { description: err.message })
      return null
    } finally {
      setEnviandoFoto(false)
    }
  }

  /**
   * Foto de fundo da página do cliente.
   *
   * Vai pro mesmo balde das artes do cartaz, mas numa pasta própria: são
   * imagens com vidas separadas, e apagar a arte do cartaz não pode levar
   * junto a foto que o cliente vê. Sobe direto, sem passar pelo recorte — a
   * `LandingView` já cobre a tela com `object-fit: cover`, e obrigar a
   * recortar antes de ver o resultado é uma etapa a mais pra nada.
   */
  const enviarFotoDoCliente = async (arquivo: File) => {
    if (!restauranteId) return
    setEnviandoFoto(true)
    try {
      const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${restauranteId}/cliente/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('qr-fundos')
        .upload(path, arquivo, { upsert: true, contentType: arquivo.type || 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('qr-fundos').getPublicUrl(path)
      setFundoCliente((f) => ({ ...f, modo: 'upload', imagem: data.publicUrl }))
      toast.success('Foto enviada!')
    } catch (err: any) {
      toast.error('Erro no upload', { description: err.message })
    } finally {
      setEnviandoFoto(false)
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
    if (!camada) return

    // Texto fixo também se arrasta. A posição de onde ele parte é a que já
    // estiver salva; na primeira vez, é o lugar padrão dele no desenho —
    // medido da própria caixa devolvida por `desenharPoster`, e não chutado.
    const fixo = textosFixos[id]
    const el = elementos.find((x) => x.id === id)
    if (!fixo && !el) return
    const caixa = caixas.find((c) => c.id === id)
    const partida = el
      ? { x: el.x, y: el.y }
      : {
          x: cfgEstilos[id]?.x ?? (caixa ? (caixa.x + caixa.w / 2) / POSTER_W : 0.5),
          y: cfgEstilos[id]?.y ?? (caixa ? (caixa.y + caixa.h) / POSTER_H : 0.5),
        }

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    alvo.setPointerCapture(e.pointerId)
    const inicio = { px: e.clientX, py: e.clientY, x: partida.x, y: partida.y }
    iniciarGesto()

    const mover = (ev: PointerEvent) => {
      const nx = Math.min(1, Math.max(0, inicio.x + (ev.clientX - inicio.px) / area.width))
      const ny = forcarForaDaMarca(inicio.y + (ev.clientY - inicio.py) / area.height)
      const g = gestoRef.current
      if (!g) return
      if (fixo) {
        aoVivo({ estilos: { ...g.estilos, [id]: { ...(g.estilos[id] ?? {}), x: nx, y: ny } } })
        return
      }
      aoVivo({ elementos: g.elementos.map((el) => (el.id === id ? { ...el, x: nx, y: ny } : el)) })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      terminarGesto()
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
      esticarX: e.esticarX ?? 1,
      esticarY: e.esticarY ?? 1,
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
    /** Entrelinha do DESENHO, em múltiplo do corpo. Ver o campo de edição. */
    entrelinha: number
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
      entrelinha: 1.2,
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
      // `wrapText` desenha o título com entrelinha de corpo + 10.
      entrelinha: (tituloVisivel.length > 22 ? 48 : tituloVisivel.length > 15 ? 56 : 62)
        / (tituloVisivel.length > 22 ? 38 : tituloVisivel.length > 15 ? 46 : 52),
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
      // A mensagem é desenhada com entrelinha de corpo + 8.
      entrelinha: 33 / 25,
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
      esticarX: f.estilo.esticarX,
      esticarY: f.estilo.esticarY,
      url: null,
      escala: 0.3,
      escalaY: null,
      recorte: { x: 0, y: 0, w: 1, h: 1 },
      rotacao: 0,
      opacidade: 1,
    }
  }

  /** Aplica no estilo guardado o que a barra de propriedades mudou. */
  /**
   * O estilo de um texto do cartaz depois de aplicar o que mudou.
   *
   * Separado do `setState` porque o mesmo cálculo serve aos dois caminhos: a
   * barra de propriedades, que muda o estado, e o arrasto, que escreve no ref
   * em voo sem acionar o React (ver `gestoRef`).
   */
  const estiloComCampos = (atual: EstilosDosTextos[string] | undefined, campos: Partial<ElementoCartaz>) => {
    const estilo: Record<string, unknown> = { ...(atual ?? {}) }
    if (campos.fonte !== undefined) estilo.fonte = campos.fonte
    if (campos.tamanho !== undefined) estilo.tamanho = campos.tamanho
    if (campos.negrito !== undefined) estilo.negrito = campos.negrito
    if (campos.italico !== undefined) estilo.italico = campos.italico
    if ('cor' in campos) estilo.cor = campos.cor
    if (campos.esticarX !== undefined) estilo.esticarX = campos.esticarX
    if (campos.esticarY !== undefined) estilo.esticarY = campos.esticarY
    // Posição: o redimensionar mexe nela pra segurar a borda oposta. A barra
    // de propriedades nunca manda x/y, então isto só entra por ali.
    if (campos.x !== undefined) estilo.x = campos.x
    if (campos.y !== undefined) estilo.y = campos.y
    return estilo as EstilosDosTextos[string]
  }

  const alterarTextoFixo = (id: string, campos: Partial<ElementoCartaz>) => {
    if ('texto' in campos && typeof campos.texto === 'string') textosFixos[id]?.alterar(campos.texto)
    setCfgEstilos((p) => ({ ...p, [id]: estiloComCampos(p[id], campos) }))
  }

  /**
   * Puxar as bordas de um elemento na plaquinha.
   *
   * Canto = proporcional (o elemento inteiro cresce). Lado = só naquele
   * sentido: texto estica, e imagem CORTA quando puxada pra dentro e estica
   * quando puxada pra fora — é o que se espera de uma ferramenta de imagem, e
   * espremer a foto pra caber seria o resultado errado.
   */
  const redimensionar = (id: string, ancora: Ancora) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setSelecionado(id)

    const camada = camadaRef.current
    const caixa = caixas.find((c) => c.id === id)
    if (!camada || !caixa) return

    const fixo = textosFixos[id]
    const el = elementos.find((x) => x.id === id)
    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    alvo.setPointerCapture(e.pointerId)

    // Tudo em pixels do CARTAZ: a prévia é menor que ele, e misturar as duas
    // réguas faz o elemento crescer numa velocidade e a alça em outra.
    const porPixelX = POSTER_W / area.width
    const porPixelY = POSTER_H / area.height

    // Onde está o ponto que o desenho usa como origem deste elemento, em
    // pixels do cartaz. Nos elementos livres é o miolo; nos textos do cartaz
    // é a linha de base, quase no pé da caixa — e quem nunca foi arrastado
    // não tem posição guardada, então ela é lida da própria caixa medida.
    const posX = el
      ? el.x * POSTER_W
      : (cfgEstilos[id]?.x ?? (caixa.x + caixa.w / 2) / POSTER_W) * POSTER_W
    const posY = el
      ? el.y * POSTER_H
      : (cfgEstilos[id]?.y ?? (caixa.y + caixa.h) / POSTER_H) * POSTER_H

    const inicio = {
      px: e.clientX,
      py: e.clientY,
      w: caixa.w,
      h: caixa.h,
      tamanho: fixo ? fixo.estilo.tamanho : (el?.tamanho ?? 40),
      esticarX: el?.esticarX ?? 1,
      esticarY: el?.esticarY ?? 1,
      escala: el?.escala ?? 0.3,
      escalaY: el?.escalaY ?? null,
      recorte: el?.recorte ?? { x: 0, y: 0, w: 1, h: 1 },
    }

    // Que fatia da caixa fica antes da origem, em cada eixo. É o que traduz
    // "cresceu tanto" em "a origem tem que andar tanto" — e é medido, não
    // chutado em 0,5, porque no texto do cartaz a origem não é o miolo.
    const fracX = caixa.w > 0 ? (posX - caixa.x) / caixa.w : 0.5
    const fracY = caixa.h > 0 ? (posY - caixa.y) / caixa.h : 0.5

    const oeste = ancora.includes('o')
    const norte = ancora.includes('n')
    const leste = ancora === 'l' || ancora.includes('e')
    const sul = ancora.includes('s')

    const ehTexto = Boolean(fixo) || el?.tipo === 'texto'
    iniciarGesto()

    // Com a figura virada, "pra direita na tela" não é mais "pra direita da
    // imagem". O movimento do dedo é projetado nos eixos do elemento antes
    // de virar largura e altura — sem isso, puxar a alça de um lado numa
    // imagem girada mexia no outro.
    const giro = ((el?.rotacao ?? 0) * Math.PI) / 180
    const cos = Math.cos(giro)
    const sen = Math.sin(giro)

    const mover = (ev: PointerEvent) => {
      const telaX = (ev.clientX - inicio.px) * porPixelX
      const telaY = (ev.clientY - inicio.py) * porPixelY
      // Sinal já corrigido pelo lado pego: daqui pra frente, positivo é
      // sempre "crescer" — as regras em si moram em `redimensionar-cartaz`,
      // testadas fora da tela.
      const dx = (telaX * cos + telaY * sen) * (oeste ? -1 : 1)
      const dy = (-telaX * sen + telaY * cos) * (norte ? -1 : 1)
      const { fatorW, fatorH, ...campos } = calcularRedimensionamento(
        ehTexto ? 'texto' : 'imagem', ancora as Ancora, inicio, dx, dy,
      )

      // A BORDA OPOSTA FICA PARADA.
      //
      // O elemento é desenhado a partir da origem dele, então mudar só o
      // tamanho o faz crescer pros dois lados: puxando a direita, a esquerda
      // vinha junto e a figura parecia se recentralizar sozinha a cada
      // movimento. Andando com a origem na mesma medida em que a caixa
      // cresceu, o lado que ninguém pegou não sai do lugar — e os outros três
      // ficam parados quando se puxa um lado só, porque aí um dos fatores é 1.
      const desX = leste ? fracX * inicio.w * (fatorW - 1)
        : oeste ? -(1 - fracX) * inicio.w * (fatorW - 1) : 0
      const desY = sul ? fracY * inicio.h * (fatorH - 1)
        : norte ? -(1 - fracY) * inicio.h * (fatorH - 1) : 0

      // O deslocamento nasce nos eixos do elemento; a posição vive nos eixos
      // do cartaz. Numa figura virada, os dois não são a mesma coisa.
      const x = (posX + (desX * cos - desY * sen)) / POSTER_W
      const y = (posY + (desX * sen + desY * cos)) / POSTER_H

      const g = gestoRef.current
      if (!g) return
      if (fixo) {
        aoVivo({ estilos: { ...g.estilos, [id]: estiloComCampos(g.estilos[id], { ...campos, x, y }) } })
      } else {
        aoVivo({ elementos: g.elementos.map((z) => (z.id === id ? { ...z, ...campos, x, y } : z)) })
      }
    }

    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      terminarGesto()
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /** As 8 alças em volta do elemento selecionado. */
  /**
   * Girar arrastando a argola pendurada embaixo do elemento.
   *
   * O ângulo é medido do CENTRO do elemento até o dedo, e o que entra no
   * estado é a diferença desde onde o arrasto começou — assim a figura
   * acompanha a mão em vez de dar um salto no primeiro movimento.
   */
  const girarElemento = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setSelecionado(id)

    const camada = camadaRef.current
    const caixa = caixas.find((c) => c.id === id)
    const el = elementos.find((x) => x.id === id)
    if (!camada || !caixa || !el) return

    const area = camada.getBoundingClientRect()
    const centro = {
      x: area.left + ((caixa.x + caixa.w / 2) / POSTER_W) * area.width,
      y: area.top + ((caixa.y + caixa.h / 2) / POSTER_H) * area.height,
    }
    const anguloDe = (px: number, py: number) => (Math.atan2(py - centro.y, px - centro.x) * 180) / Math.PI
    const inicial = anguloDe(e.clientX, e.clientY)
    const rotacaoInicial = el.rotacao ?? 0

    const alvo = e.currentTarget
    alvo.setPointerCapture(e.pointerId)
    iniciarGesto()

    // Quanto o dedo já andou em volta do centro, acumulado. Só a DIFERENÇA
    // entre uma leitura e a seguinte entra na conta: o ângulo cru salta de
    // +180 pra -180 ao cruzar a esquerda, e somar esse salto era o que fazia
    // a figura dar meia-volta sozinha no meio do arrasto.
    let anterior = inicial
    let voltas = 0

    const mover = (ev: PointerEvent) => {
      const agora = anguloDe(ev.clientX, ev.clientY)
      let passo = agora - anterior
      if (passo > 180) passo -= 360
      if (passo < -180) passo += 360
      voltas += passo
      anterior = agora

      let nova = rotacaoInicial + voltas
      // Segurando Shift, trava de 15 em 15 graus — é como se endireita uma
      // foto torta sem ficar caçando o zero.
      if (ev.shiftKey) nova = Math.round(nova / 15) * 15
      // Sem teto: dá pra rodar quantas voltas quiser, e o desenho só usa o
      // seno e o cosseno — 400° e 40° pintam igual.
      const g = gestoRef.current
      if (!g) return
      aoVivo({ elementos: g.elementos.map((z) => (z.id === id ? { ...z, rotacao: nova } : z)) })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      terminarGesto()
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /**
   * Redesenha o cartaz — no máximo um por vez, e sempre com o estado mais
   * novo.
   *
   * Arrastando, o estado muda a cada movimento do dedo: dezenas de vezes por
   * segundo. Antes cada mudança disparava o próprio desenho, e vários ficavam
   * no ar ao mesmo tempo — daí o movimento aos trancos e a imagem repetida
   * atrás da atual. São duas defesas, e as duas são necessárias:
   *
   * - o `requestAnimationFrame` de quem chama junta todas as mudanças de um
   *   quadro num pedido só (não adianta desenhar mais vezes do que a tela
   *   mostra);
   * - a trava daqui garante que um desenho só comece quando o anterior tiver
   *   terminado. Sem ela, dois desenhos concorrentes terminariam fora de
   *   ordem e o cartaz podia parar num estado velho.
   *
   * Quando chega pedido novo no meio de um desenho, ele não vira outra
   * chamada: marca `pendente`, e o laço aqui embaixo repete lendo as opções
   * atualizadas. Pedidos acumulados no meio do caminho colapsam num só, que é
   * o que se quer — só o último interessa.
   */
  const desenhar = async () => {
    if (desenhandoRef.current) {
      pendenteRef.current = true
      return
    }
    desenhandoRef.current = true
    try {
      for (;;) {
        pendenteRef.current = false
        const canvas = canvasRef.current
        const opcoes = opcoesRef.current
        if (!canvas || !opcoes) break
        const novas = await desenharPoster(canvas, opcoes)
        const gesto = gestoRef.current
        if (gesto) {
          // Em pleno arrasto: guardar a caixa e mover a moldura no DOM. Um
          // `setCaixas` aqui renderizaria a página inteira a cada movimento
          // do dedo, que é o atraso que se via.
          gesto.caixas = novas
          aplicarCaixasNoDom(novas, gesto.elementos)
        } else {
          setCaixas(novas)
        }
        if (!pendenteRef.current) break
      }
    } catch (err) {
      // Antes uma falha aqui deixava o canvas em branco sem avisar nada —
      // nenhum try/catch, então a promise rejeitada só sumia no console
      // (ou nem isso). Logar de verdade é o que permite achar a causa real.
      console.error('Falha ao desenhar o QR impresso:', err)
      toast.error('Não foi possível gerar a visualização do QR impresso.')
    } finally {
      desenhandoRef.current = false
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

  return (
    <div className="flex-1">
      <Tabs value={aba} onValueChange={setAba} className="w-full">
        {/* As mesmas abas da página dos garçons, sem ícone: são duas seções
            do mesmo assunto, e cada tela ter o seu desenho de aba fazia o
            app parecer montado por pedaços. */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <TabsList>
            <TabsTrigger value="config">Personalizar</TabsTrigger>
            <TabsTrigger value="info">Informações</TabsTrigger>
          </TabsList>
          {aba === 'config' && passo === 1 && (
            /* Mesmo botão dividido do "Baixar QRCodes" dos garçons: a ação
               principal no corpo, o formato atrás da seta. Um menu inteiro só
               pra escolher entre dois formatos obrigava dois cliques pra
               tarefa mais comum da tela. */
            <div className="flex items-stretch">
              <Button
                variant="baixar"
                onClick={downloadPDF}
                className="h-9 gap-1.5 rounded-l-full rounded-r-none border-r border-white/10 pl-3 pr-2.5"
              >
                <Download className="h-4 w-4" /> Baixar QRCode
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="baixar"
                    aria-label="Escolher o formato"
                    className="h-9 rounded-l-none rounded-r-full px-2.5"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={downloadPDF} className="gap-2 cursor-pointer">
                    <FileText className="h-4 w-4" /> PDF para impressão
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadPNG} className="gap-2 cursor-pointer">
                    <FileImage className="h-4 w-4" /> PNG (imagem)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
          {passo === 2 ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setPasso(1)}
                className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para o cartaz impresso
              </button>
              <FundoDaPaginaDoCliente
                valor={fundoCliente}
                onChange={setFundoCliente}
                onEscolherFoto={enviarFotoDoCliente}
                enviando={enviandoFoto}
                salvando={savingCfg}
                onSalvar={salvarFundoDoCliente}
                onCancelar={() => setPasso(1)}
                restauranteNome={cfgTitulo.trim() || restaurantName}
                mensagem={cfgMensagem}
                whatsapp={whatsappDono}
                elementos={elementosCliente}
                onElementosChange={setElementosCliente}
                onSubirImagem={subirImagemDoCliente}
                textos={textosCliente}
                onTextosChange={setTextosCliente}
                estilosDosTextos={estilosCliente}
                onEstilosChange={setEstilosCliente}
              />
            </div>
          ) : (
          /* A coluna da prévia é dimensionada pelo CONTEÚDO (`auto`), não por
             metade da tela: a plaquinha tem largura fixa, então numa grade
             50/50 sobrava uma faixa vazia grande dos dois lados dela — espaço
             que a configuração, essa sim cheia de controles, aproveita melhor. */
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            {/* ───────── Tema do display impresso ───────── */}
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
                    {/* O MESMO retângulo de um card de textura, só que deitado:
                        largura de 1,25 coluna (a altura de um card lá de cima) e
                        altura de 1 coluna (a largura dele). A coluna da grade
                        vale (100% - 3 vãos) / 4, então dá pra escrever a medida
                        exata em vez de chutar pixel. */}
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {cfgImagem ? (
                        <div
                          className="relative col-span-2 overflow-hidden rounded-lg border-2 border-[#C2622C] bg-white shadow-sm"
                          style={{ width: 'calc(((100% - 1.5rem) / 4) * 1.25)' }}
                        >
                          <span className="relative block aspect-[5/4] w-full">
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
                        <label
                          className="group col-span-2 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-white transition-colors hover:border-[#C2622C]/60"
                          style={{ width: 'calc(((100% - 1.5rem) / 4) * 1.25)' }}
                        >
                          <span className="flex aspect-[5/4] w-full items-center justify-center bg-[#C2622C]/5">
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

                {/* Frase impressa no cartaz e repetida na página do cliente.
                    Usa o `Textarea` do sistema — este campo tinha borda, raio
                    e cor de foco próprios, e era o único da tela que não
                    reagia igual aos outros. Sem contador nem teto apertado:
                    quem escreve vê a frase crescendo no cartaz ao lado, que
                    diz mais sobre o tamanho certo do que um "26/120". */}
                <div>
                  <label htmlFor="qr-mensagem" className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                    Mensagem para o cliente
                  </label>
                  <Textarea
                    id="qr-mensagem"
                    value={cfgMensagem}
                    onChange={(e) => setCfgMensagem(e.target.value)}
                    rows={3}
                    // Teto alto e silencioso: não atrapalha ninguém escrevendo,
                    // e evita que um texto colado sem querer tome o cartaz.
                    maxLength={400}
                    placeholder="Ex: É rapidinho! Conte como foi sua experiência."
                    className="min-h-0 resize-none py-2.5 leading-relaxed"
                  />
                </div>

                {/* Fim desta etapa, não "salvar": o cartaz fica pronto aqui e
                    o passo seguinte é escolher o que o QR abre. Por isso a
                    seta e o tamanho de botão de formulário, encostado à
                    direita — ação que conclui e leva adiante, não um botão de
                    barra ocupando a largura toda. Ele grava do mesmo jeito. */}
                <div className="flex justify-end">
                  <Button
                    onClick={async () => { await salvarCfg(); setPasso(2) }}
                    disabled={savingCfg}
                    variant="primario"
                    size="forma"
                  >
                    {savingCfg && <Loader2 className="h-4 w-4 animate-spin" />}
                    {savingCfg ? 'Salvando…' : 'Continuar'}
                    {!savingCfg && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ───────── Prévia: o display de mesa ───────── */}
            <div className="flex w-[452px] max-w-full flex-col">
              {/* Adicionar fica no CABEÇALHO, longe da plaquinha: é uma ação
                  que se faz uma vez, e ocupando o espaço logo acima do cartaz
                  empurrava pra baixo a barra de propriedades — que é o
                  controle usado o tempo todo, e por isso é ela que merece
                  estar colada na prévia. */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-gray-800">QR Code impresso</h2>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={adicionarTexto}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <Type className="h-3.5 w-3.5" /> Texto
                  </button>
                  {/* Sem limite de quantidade: logo, selo de prêmio e foto do
                      prato são coisas diferentes, e cabiam todas. */}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50">
                    {enviandoLogo
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Plus className="h-3.5 w-3.5" /><ImagePlus className="h-3.5 w-3.5" /></>}
                    {enviandoLogo ? 'Enviando…' : 'Imagem'}
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = '' }}
                    />
                  </label>
                </div>
              </div>

              {/* A barra de propriedades fica colada na prévia: é nela que o
                  elemento é posicionado e digitado, e ter o controle no outro
                  lado da tela obrigava a ir e voltar com o olho a cada
                  ajuste.

                  O ESPAÇO DELA É SEMPRE RESERVADO, com ou sem seleção. Ela
                  aparecia do nada e empurrava a plaquinha 54px pra baixo — o
                  primeiro clique selecionava o texto, a barra nascia, o cartaz
                  descia, e o segundo clique dos dois-cliques caía 54px acima
                  do que a pessoa mirou: clicar na mensagem abria o nome do
                  restaurante. Reservando a faixa, o cartaz não sai do lugar. */}
              <div className="min-h-[50px]">
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
                <div className="w-[408px] max-w-full" style={{ perspective: '1300px' }}>
                  {/* Reta enquanto se edita, inclinada quando descansa — a
                      contagem dos 20 segundos está no efeito lá em cima, com
                      o porquê. A volta é lenta de propósito: é o objeto se
                      acomodando na mesa, não um salto. */}
                  <div
                    className="relative transition-transform duration-700 ease-out"
                    style={{
                      transform: selecionado || editandoAgora ? 'none' : 'rotateY(-10deg) rotateX(2deg)',
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
                      {/* O ponteiro chegando perto já endireita a plaquinha.
                          O arrasto converte pixels de tela em pixels do cartaz
                          pela largura MEDIDA da prévia, e inclinada essa
                          largura é a da caixa projetada, não a do cartaz: o
                          elemento andaria mais devagar que o dedo. Endireitar
                          na aproximação faz o gesto sempre começar reto, sem
                          precisar corrigir a conta. */}
                      <div ref={camadaRef} className="relative" onPointerEnter={acordarPlaquinha}>
                        <canvas
                          ref={canvasRef}
                          width={POSTER_W}
                          height={POSTER_H}
                          className="block h-auto w-full rounded-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                          onPointerDown={() => setSelecionado(null)}
                        />
                        {/* Durante um gesto o que vale é o valor em voo, não o
                            do estado. Um render que caia no meio do arrasto —
                            o da própria seleção, por exemplo — reaplicaria a
                            caixa antiga por cima do que já foi escrito no DOM,
                            e a moldura saltaria pra trás por um quadro. */}
                        {(gestoRef.current?.caixas ?? caixas).map((c) => {
                          const fixo = textosFixos[c.id]
                          const el = (gestoRef.current?.elementos ?? elementos).find((e) => e.id === c.id)
                          if (!fixo && !el) return null
                          const emEdicao = editandoId === c.id
                          // Margem de 6px do cartaz: alvo de texto fino ainda
                          // precisa dar pra pegar com o dedo.
                          // Em edição sem folga: o campo preenche a moldura,
                          // e os 6px de sobra em cima faziam a letra começar
                          // acima de onde ela estava desenhada.
                          const molduraFixa = estiloDaMoldura(c, emEdicao ? 0 : 6)
                          const selecionadoAqui = selecionado === c.id
                          // As alças têm tamanho fixo em pixels de TELA, e a
                          // prévia é bem menor que o cartaz. Decidir o que
                          // cabe pela medida do cartaz erraria por essa razão
                          // inteira — um texto "largo" no cartaz pode ser
                          // estreito aqui.
                          const paraTela = larguraPreview / POSTER_W

                          /* Rótulo, nome e mensagem: editam clicando no
                             próprio cartaz, mas não se arrastam (o lugar
                             deles é parte do desenho) e só a mensagem pode
                             ser excluída — cartaz sem nome não existe. */
                          if (fixo) {
                            return (
                              <div
                                key={c.id}
                                /* Selecionado já mostra a borda, não só em
                                   edição: as alças aparecem no clique, e alça
                                   solta no ar, sem o quadro em volta, não diz
                                   até onde vai o texto que elas esticam. */
                                className={cn(
                                  'group absolute rounded-[2px] transition-colors',
                                  selecionadoAqui || emEdicao
                                    ? 'ring-1 ring-[#8B3DFF] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]'
                                    : 'hover:ring-1 hover:ring-[#8B3DFF]/70',
                                )}
                                style={molduraFixa}
                                ref={guardarMoldura(c.id)}
                              >
                                {emEdicao ? (
                                  <textarea
                                    value={fixo.valor}
                                    onChange={(e) => fixo.alterar(e.target.value)}
                                    ref={abrirSelecionandoTudo}
                                    onBlur={() => setEditandoId(null)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setEditandoId(null) }}
                                    className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-left outline-none"
                                    style={{
                                      fontFamily: fixo.estilo.familia,
                                      fontSize: (fixo.estilo.tamanho * larguraPreview) / POSTER_W || 12,
                                      fontWeight: fixo.estilo.negrito ? 700 : 400,
                                      fontStyle: fixo.estilo.italico ? 'italic' : 'normal',
                                      letterSpacing: fixo.espacado ? `${(6 * larguraPreview) / POSTER_W}px` : undefined,
                                      textTransform: fixo.maiuscula ? 'uppercase' : undefined,
                                      color: fixo.estilo.cor,
                                      // Entrelinha e esticar copiados do desenho: com a
                                      // entrelinha genérica de 1,2 e sem o esticar, a letra
                                      // mudava de tamanho e de lugar dentro da caixa assim
                                      // que se entrava pra editar.
                                      lineHeight: fixo.entrelinha,
                                      transform: fixo.estilo.esticarX !== 1 || fixo.estilo.esticarY !== 1
                                        ? `scale(${fixo.estilo.esticarX}, ${fixo.estilo.esticarY})`
                                        : undefined,
                                    }}
                                  />
                                ) : (
                                  /* Um clique só: seleciona (a barra de
                                     propriedades aparece) e já abre pra
                                     digitar. Eram dois gestos diferentes pro
                                     mesmo texto, e ninguém adivinha qual é
                                     qual num cartaz. */
                                  /* Um clique seleciona (e já permite
                                     arrastar); dois cliques entram no texto.
                                     Mesmo gesto dos elementos livres — um
                                     texto do cartaz não pode responder ao
                                     clique de um jeito e outro de outro. */
                                  <div
                                    onPointerDown={arrastarElemento(c.id)}
                                    onDoubleClick={() => setEditandoId(c.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setEditandoId(c.id) }}
                                    aria-label={`Mover ${fixo.rotuloAcessivel} (dois cliques para editar)`}
                                    title={`Arraste para mover, dois cliques para editar: ${fixo.rotuloAcessivel}`}
                                    className="h-full w-full cursor-move touch-none"
                                  />
                                )}

                                {selecionadoAqui && !emEdicao && (
                                  <Alcas
                                    id={c.id}
                                    aoPegar={redimensionar}
                                    larguraTela={(c.w + 12) * paraTela}
                                    alturaTela={(c.h + 12) * paraTela}
                                  />
                                )}

                                {/* Só fora da seleção: selecionado, a lixeira
                                    está na barra de propriedades, e este "×"
                                    caía bem em cima da alça do canto. */}
                                {fixo.podeExcluir && !selecionadoAqui && (
                                  <button
                                    type="button"
                                    onClick={() => { fixo.alterar(''); setEditandoId(null) }}
                                    aria-label="Tirar do cartaz"
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
                          // Texto ganha 6px de folga: linha fina é alvo
                          // difícil de pegar com o dedo. Imagem NÃO ganha —
                          // ali a borda é a medida da figura, e um vão em
                          // volta faz parecer que sobra imagem onde não tem.
                          const folga = el.tipo === 'logo' || emEdicao ? 0 : 6
                          const moldura = estiloDaMoldura(c, folga)

                          return (
                            <div
                              key={c.id}
                              className={cn(
                                'group absolute rounded-[2px] transition-colors',
                                selecionadoAqui
                                  ? 'ring-1 ring-[#8B3DFF] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]'
                                  : 'hover:ring-1 hover:ring-[#8B3DFF]/70',
                              )}
                              style={moldura}
                              ref={guardarMoldura(c.id)}
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
                                  value={el.texto}
                                  onChange={(e) => alterarElemento(el.id, { texto: e.target.value })}
                                  ref={abrirSelecionandoTudo}
                                  onBlur={() => setEditandoId(null)}
                                  onKeyDown={(e) => { if (e.key === 'Escape') setEditandoId(null) }}
                                  className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-left leading-[1.2] outline-none"
                                  style={{
                                    fontFamily: fonteCss(el.fonte),
                                    fontSize: (el.tamanho * larguraPreview) / POSTER_W || 12,
                                    fontWeight: el.negrito ? 700 : 400,
                                    fontStyle: el.italico ? 'italic' : 'normal',
                                    color: el.cor ?? tema.tinta,
                                    transform: (el.esticarX ?? 1) !== 1 || (el.esticarY ?? 1) !== 1
                                      ? `scale(${el.esticarX ?? 1}, ${el.esticarY ?? 1})`
                                      : undefined,
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

                              {/* Excluir no hover, e SÓ fora da seleção: com o
                                  elemento selecionado este "×" caía em cima
                                  da alça do canto, e a lixeira já está na
                                  barra de propriedades logo acima. */}
                              {!selecionadoAqui && (
                                <button
                                  type="button"
                                  onClick={() => removerElemento(c.id)}
                                  aria-label="Excluir o elemento"
                                  title="Excluir"
                                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-2 ring-white group-hover:flex"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}

                              {/* Cantos crescem proporcional; lados esticam o
                                  texto e cortam/esticam a imagem. */}
                              {selecionadoAqui && !emEdicao && (
                                <Alcas
                                  id={c.id}
                                  aoPegar={redimensionar}
                                  larguraTela={(c.w + folga * 2) * paraTela}
                                  alturaTela={(c.h + folga * 2) * paraTela}
                                />
                              )}

                              {/* Argola de girar, pendurada embaixo — só na
                                  imagem, porque é o único elemento que o
                                  desenho sabe girar. Pôr no texto seria um
                                  controle que não faz nada. */}
                              {selecionado === c.id && el.tipo === 'logo' && (
                                <div
                                  onPointerDown={girarElemento(c.id)}
                                  role="button"
                                  tabIndex={-1}
                                  aria-label="Girar a imagem (segure Shift para travar de 15 em 15 graus)"
                                  title="Girar (Shift trava de 15 em 15)"
                                  className="absolute left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border border-gray-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                                  style={{ bottom: -34 }}
                                >
                                  <RotateCw className="h-3 w-3 text-gray-600" />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {/* Reflexo diagonal e aresta viva da chapa.
                          O reflexo é uma FAIXA estreita, não um véu: com 35%
                          de branco espalhado no meio da chapa, a arte por
                          baixo saía lavada — a imagem no máximo de opacidade
                          parecia desbotada, e a cor escolhida nunca era a que
                          aparecia. Acrílico se enxerga pela aresta e por um
                          risco de luz, e é isso que ficou. */}
                      <div
                        className="pointer-events-none absolute inset-0 rounded-[6px]"
                        style={{
                          background:
                            'linear-gradient(118deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.10) 41%, rgba(255,255,255,0.16) 45%, rgba(255,255,255,0.10) 49%, rgba(255,255,255,0) 60%)',
                        }}
                      />
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
          )}
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
