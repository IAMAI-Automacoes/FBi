import { useEffect, useState, useCallback } from 'react'
import {
  differenceInCalendarDays, format,
  startOfMonth, startOfWeek, startOfQuarter,
} from 'date-fns'
import { supabase } from '@/lib/supabase/client'
import { FiltroPeriodo, type IntervaloDatas } from '@/components/FiltroPeriodo'
import { useFiltroPersistente } from '@/hooks/use-filtro-persistente'
import {
  antesDe, avancarPeriodo, garcomParticipaDaRegra, pagamentoDeRegra, regraEstaPaga,
  type PagamentoRegra,
} from '@/lib/queries/bonificacao-garcons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataSegmentada } from '@/components/DataSegmentada'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Trash2, Download, FileDown, Loader2, Settings2, Check, ChevronLeft, ChevronRight, ChevronDown,
  ListChecks, Pencil, X, Tag, Target, CalendarClock, Gift, User, Users, Phone, Archive,
} from 'lucide-react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { desenharPoster, landingUrl, baixarBlob, POSTER_W, POSTER_H } from '@/lib/qr-poster'
import { getIniciais, CORES_AVATAR } from '@/lib/iniciais'
import { cn } from '@/lib/utils'

interface Garcom {
  id: number
  nome_garcon: string
  ativo: boolean
  telefone: string | null
  /** regra.id -> pagamento daquele bônus (quando e com qual meta). */
  bonus_pagamentos: Record<string, string | PagamentoRegra>
}
interface QrInfo { slug: string; total_scans: number }

type Frequencia = 'semanal' | 'mensal' | 'trimestral' | 'personalizado'

interface RegraBonificacao {
  id: string
  nome: string
  meta_escaneamentos: number
  frequencia: Frequencia
  /** Só usado quando frequencia === 'personalizado' e tipo_personalizado
   *  === 'dias': a cada quantos dias o período se renova. */
  dias_personalizados: number
  /** Só usado quando frequencia === 'personalizado': como esse período é
   *  definido — 'dias' = "a cada N dias, renovando sozinho"; 'data' = uma
   *  janela fixa "de tal data até tal outra" (a data de início mora em
   *  `periodo_inicio`, a final aqui embaixo). */
  tipo_personalizado: 'dias' | 'data'
  /** Só usado com tipo_personalizado === 'data' — guardada separada só pra
   *  repopular os dois campos de data ao reabrir a regra pra editar; o
   *  cálculo em si (avançar o período) reaproveita `dias_personalizados`,
   *  convertido a partir dessa data no momento de salvar. */
  data_fim_personalizado: string | null
  /** Só vale pra frequencia semanal/mensal/trimestral (personalizado já
   *  define o próprio início): true = o período sempre começa no início
   *  "de calendário" da unidade (segunda-feira, dia 1, início do trimestre);
   *  false = começa no dia em que a regra foi criada e renova sempre nesse
   *  mesmo dia. Só afeta regras NOVAS — mudar isso numa regra que já está
   *  rodando não pula o período em andamento. */
  alinhar_calendario: boolean
  premio: string
  renovar_automatico: boolean
  ativa: boolean
  /** null = regra recém-criada, ainda sem período rodando. */
  periodo_inicio: string | null
  /** ids dos garçons que essa regra vale — null/vazio = todos. */
  garcons_participantes: number[] | null
  /** "Excluir" não apaga de verdade — só marca isto e a regra some das
   *  listas normais. O histórico de pagamento de quem já ganhou bônus com
   *  ela precisa continuar existindo em algum lugar pra aparecer em
   *  "Arquivadas" no painel do garçom; apagar o registro de verdade
   *  perderia esse histórico junto. */
  apagada: boolean
}

const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  personalizado: 'Período personalizado',
}
const FREQUENCIA_CURTA: Record<Frequencia, string> = {
  semanal: 'semana',
  mensal: 'mês',
  trimestral: 'trimestre',
  personalizado: 'período',
}

function novaRegraVazia(): RegraBonificacao {
  return {
    id: '', nome: '', meta_escaneamentos: 50, frequencia: 'mensal', dias_personalizados: 15,
    tipo_personalizado: 'dias', data_fim_personalizado: null, alinhar_calendario: false,
    premio: '', renovar_automatico: true, ativa: true, periodo_inicio: null,
    garcons_participantes: null, apagada: false,
  }
}

/** Só o pedaço "qual é o período" — usado dentro de `rotuloRegra` (junto
 *  com a meta, ex.: "50 QRs a cada 15 dias") e sozinho no painel de
 *  detalhes (onde a meta já é campo próprio, não precisa repetir). */
function rotuloPeriodoRegra(r: RegraBonificacao): string {
  if (r.frequencia !== 'personalizado') return FREQUENCIA_LABEL[r.frequencia]
  if (r.tipo_personalizado === 'data' && r.periodo_inicio && r.data_fim_personalizado) {
    const de = format(new Date(r.periodo_inicio), 'dd/MM')
    const ate = format(new Date(r.data_fim_personalizado), 'dd/MM')
    return `De ${de} até ${ate}`
  }
  return `A cada ${r.dias_personalizados} dias`
}

function rotuloRegra(r: RegraBonificacao): string {
  if (r.nome.trim()) return r.nome.trim()
  if (r.frequencia === 'personalizado') {
    if (r.tipo_personalizado === 'data' && r.periodo_inicio && r.data_fim_personalizado) {
      const de = format(new Date(r.periodo_inicio), 'dd/MM')
      const ate = format(new Date(r.data_fim_personalizado), 'dd/MM')
      return `${r.meta_escaneamentos} QRs de ${de} até ${ate}`
    }
    return `${r.meta_escaneamentos} QRs a cada ${r.dias_personalizados} dias`
  }
  return `${r.meta_escaneamentos} QRs por ${FREQUENCIA_CURTA[r.frequencia]}`
}

/** Início do período de uma regra recém-criada — só entra em jogo na
 *  primeira vez que ela é salva (`periodo_inicio` ainda null). Frequência
 *  personalizada já define o próprio início (a data escolhida, no modo
 *  'data'; ou "agora", no modo 'dias' — sem noção de calendário). Nas
 *  outras três, `alinhar_calendario` decide entre "agora" (o padrão de
 *  sempre) ou o início "de calendário" da unidade — dali em diante o
 *  avanço por `avancarPeriodo` mantém o alinhamento sozinho, porque somar
 *  um múltiplo fixo (7 dias / 1 mês / 3 meses) a uma âncora já alinhada
 *  sempre cai no próximo início alinhado. */
function calcularInicioRegra(r: RegraBonificacao): string {
  const agora = new Date()
  if (r.frequencia === 'personalizado' || !r.alinhar_calendario) return agora.toISOString()
  if (r.frequencia === 'semanal') return startOfWeek(agora, { weekStartsOn: 0 }).toISOString()
  if (r.frequencia === 'trimestral') return startOfQuarter(agora).toISOString()
  return startOfMonth(agora).toISOString()
}

/** Rótulo de campo do formulário de regra — mesmo desenho do popup de ação
 *  (`RotuloCampo` em `TaskModal.tsx`): caixa alta pequena com um ícone à
 *  frente, em vez de um `<Label>` pelado. */
function RotuloCampo({
  children, icone: Icone, htmlFor,
}: { children: React.ReactNode; icone: React.ElementType; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[12px] font-medium text-gray-700">
      <Icone className="h-3.5 w-3.5 text-gray-400" />
      {children}
    </Label>
  )
}

/** Cor do avatar pela POSIÇÃO na lista, não pelo hash do nome — com poucos
 *  garçons (o caso comum aqui) o hash colide com frequência e duas pessoas
 *  acabam com a mesma cor. Por posição, ninguém repete enquanto a lista
 *  couber na paleta. */
function corPorIndice(i: number) {
  return CORES_AVATAR[i % CORES_AVATAR.length]
}

/** Altura e degradê metálico de cada posição do pódio — ouro, prata e bronze.
 *
 *  Uma cor chapada (`bg-amber-400`) lê como plástico, não metal. O efeito de
 *  metal polido é sempre a mesma receita (pesquisada, não inventada): uma
 *  faixa clara-escura-clara em diagonal, imitando o brilho batendo numa
 *  superfície curva — por isso o degradê tem 7 pontos (escuro/claro/médio/
 *  claro/médio/claro/escuro), não 2. A base de cada metal:
 *  ouro #D4AF37, prata #C0C0C0, bronze #CD7F32 — as referências hex mais
 *  citadas pra essas cores — com uma faixa bem mais clara (quase branca) no
 *  meio simulando o reflexo. */
/** Valor do item "sem regra" do filtro do Ranking — o Select do Radix não
 *  aceita item com value="" (colide com o estado "nada selecionado"). */
const SEM_REGRA = '__todas__'

/** Atalhos do filtro de período do Ranking — semana/mês/trimestre "de
 *  calendário" em vez de dias corridos (7d/30d/90d, do `FiltroPeriodo`
 *  usado em Feedbacks): aqui o que importa é comparar com os mesmos
 *  períodos que uma regra de bonificação usa, não uma janela relativa a
 *  hoje sem relação com nada. */
type RankingPeriodo = 'semana' | 'mes' | 'trimestre' | 'all'
const PRESETS_RANKING: { value: RankingPeriodo; label: string }[] = [
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Este trimestre' },
  { value: 'all', label: 'Todo o período' },
]

const PODIO_CONFIG: Record<1 | 2 | 3, { altura: string; gradiente: string; numero: string }> = {
  1: {
    altura: 'h-24',
    gradiente: 'linear-gradient(135deg, #8a6407 6%, #fff6da 16%, #d4af37 34%, #fbe491 50%, #d4af37 66%, #fff6da 84%, #8a6407 94%)',
    numero: '#5c3f04',
  },
  2: {
    altura: 'h-16',
    gradiente: 'linear-gradient(135deg, #86888c 6%, #ffffff 16%, #c0c0c0 34%, #f1f2f3 50%, #c0c0c0 66%, #ffffff 84%, #86888c 94%)',
    numero: '#45474a',
  },
  3: {
    altura: 'h-12',
    gradiente: 'linear-gradient(135deg, #703f16 6%, #f3cda3 16%, #cd7f32 34%, #eab276 50%, #cd7f32 66%, #f3cda3 84%, #703f16 94%)',
    numero: '#4a280c',
  },
}

/** Cor única da barrinha de progresso de uma regra — o texto ao lado (quantos
 *  já foi, quantos falta, se já foi pago) já diz o estado; a barra só mostra
 *  o quanto andou. */
const COR_BARRA_REGRA = 'bg-blue-500'

/** Verde nos toggles de regra ("ativa", "renovar automaticamente") em vez
 *  do azul padrão do Switch — azul já é o "ligado" de todo o resto da tela
 *  (barra de progresso, checkbox de seleção); aqui a cor também marca "vale
 *  dinheiro de verdade", então emerald (o mesmo tom do "meta batida") lê
 *  melhor como "regra rendendo" do que mais um azul genérico. */
const CLASSE_SWITCH_REGRA = 'data-[state=checked]:bg-emerald-600'

/** Mesmo verde dos switches, agora nos checkboxes de "quem participa" —
 *  o padrão (`bg-primary`, azul) ia introduzir uma segunda cor de "marcado"
 *  na mesma regra, sem motivo. */
const CLASSE_CHECKBOX_REGRA =
  'border-gray-300 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600'

/** Botão de "marcar como pago" — verde clarinho com check, tanto dentro do
 *  painel do garçom quanto direto na lista da Equipe. Um `outline` cinza
 *  não dizia "isso é dinheiro, é bom clicar aqui"; verde com check é a
 *  mesma linguagem do resto do app pra "meta batida"/"tudo certo". */
const CLASSE_BOTAO_PAGAR =
  'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-800'

/** A mesma pílula escura em degradê do botão de "Baixar" de Relatórios —
 *  compartilhada entre o botão normal (dividido, com dropdown) e o "Baixar
 *  (N)" do modo de seleção, pra nunca mais os dois divergirem de formato
 *  (só o arredondamento/padding muda conforme o contexto).
 *
 *  `slate` é cinza-azulado de BAIXA saturação — perto de preto, o olho lê
 *  só "preto", o azul quase some. `blue-800`/`blue-950` são a cor azul de
 *  verdade (bem mais saturada) só que escura o bastante pra continuar lendo
 *  como "preto" — assim o "azulado" fica óbvio sem precisar comparar lado a
 *  lado ou passar o mouse. */
const CLASSE_BOTAO_BAIXAR =
  'gap-1.5 bg-blue-900 bg-gradient-to-b from-blue-800 to-blue-950 text-sm font-medium text-white ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.20)] ' +
  'hover:from-blue-700 hover:to-blue-900 active:shadow-none active:from-blue-900 active:to-blue-900 ' +
  'disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none'

/** Mesma construção do "baixar" (degradê + luz no topo + sombra baixa, pra
 *  ter volume de botão de verdade em vez de um retângulo de cor chapada) —
 *  só que em azul, porque o preto azulado ali em cima já significa "baixar";
 *  usar a mesma cor pra "criar" faria as duas ações parecerem uma coisa só
 *  lado a lado na barra. */
const CLASSE_BOTAO_NOVO =
  'bg-blue-600 bg-gradient-to-b from-blue-500 to-blue-700 text-white ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(16,24,40,0.20)] ' +
  'hover:from-blue-400 hover:to-blue-600 active:shadow-none active:from-blue-600 active:to-blue-600'

/** Só dígitos, formatado como telefone BR enquanto a pessoa digita — nunca
 *  deixa passar letra nem símbolo que não seja da própria formatação. Fixo
 *  no DDD (2) + 4 dígitos até completar telefone fixo (10) e vira 9 dígitos
 *  (celular) daí em diante, até o limite de 11. */
function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11)
  if (!digitos) return ''
  if (digitos.length <= 2) return `(${digitos}`
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
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
  /** Controlada (não `defaultValue`) pra poder trocar de aba pelo código —
   *  clicar num garçom no Ranking leva pra Equipe com o painel dele aberto. */
  const [aba, setAba] = useState<'ranking' | 'equipe'>('ranking')

  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  const [restaurantName, setRestaurantName] = useState('Restaurante')
  const [garcons, setGarcons] = useState<Garcom[]>([])
  const [qrs, setQrs] = useState<Record<number, QrInfo>>({})
  /** qr_code.id -> garcom.id — precisa sobreviver fora de `carregar()` pra
   *  alimentar a busca de escaneamentos filtrada por período do Ranking. */
  const [qrCodeIdParaGarcomState, setQrCodeIdParaGarcomState] = useState<Record<number, number>>({})
  const [posterTema, setPosterTema] = useState('classico')
  const [posterMsg, setPosterMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [baixando, setBaixando] = useState(false)

  // Filtro do Ranking — mesmo componente usado em /feedbacks, ou uma regra
  // específica (que dispensa o filtro de data: usa o período dela mesma).
  const [rankingPeriodo, setRankingPeriodo] = useFiltroPersistente<RankingPeriodo>('garcons:ranking-periodo', 'all')
  const [rankingDatas, setRankingDatas] = useFiltroPersistente<IntervaloDatas | undefined>('garcons:ranking-datas', undefined)
  const [rankingRegraId, setRankingRegraId] = useFiltroPersistente('garcons:ranking-regra', '')
  /** Escaneamentos de cada garçom dentro do filtro de data do Ranking — só
   *  calculado quando o filtro não é "todo o período" (nesse caso o total
   *  acumulado de `qrs` já serve, sem precisar de outra busca). */
  const [scansRanking, setScansRanking] = useState<Record<number, number>>({})

  // "Baixar só os selecionados": enquanto true, os cards viram checáveis em
  // vez de abrirem o painel de detalhes.
  const [selecionando, setSelecionando] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  // Criar/editar garçom — um popup só, reaproveitado pelos dois fluxos.
  const [formAberto, setFormAberto] = useState<'criar' | 'editar' | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formTelefone, setFormTelefone] = useState('')
  const [salvandoForm, setSalvandoForm] = useState(false)
  /** Só marca os campos vazios em vermelho depois da primeira tentativa de
   *  salvar — igual ao popup de ação (TaskModal.tsx). */
  const [tentouSalvarForm, setTentouSalvarForm] = useState(false)

  // Painel de detalhes — guarda só o id (não o objeto) pra nunca ficar com
  // uma cópia desatualizada depois de salvar; `garcomAtual` é derivado toda
  // renderização a partir da lista viva.
  const [detalheId, setDetalheId] = useState<number | null>(null)
  /** Painel do garçom mostrando a lista de arquivadas em vez do conteúdo
   *  normal — reseta sozinho quando o painel muda de garçom ou fecha, senão
   *  reabrir noutro garçom (ou o mesmo, depois) reaproveitaria o estado de
   *  navegação de antes. */
  const [mostrandoArquivadas, setMostrandoArquivadas] = useState(false)
  /** Qual fatia do histórico a lista de arquivadas mostra — só as regras
   *  que ainda existem (o caso comum), tudo que ele já ganhou (existentes +
   *  apagadas) ou só as que foram apagadas desde então. */
  const [filtroArquivadas, setFiltroArquivadas] = useState<'existentes' | 'todas' | 'apagadas'>('existentes')
  useEffect(() => { setMostrandoArquivadas(false); setFiltroArquivadas('existentes') }, [detalheId])

  const [regras, setRegras] = useState<RegraBonificacao[]>([])
  /** Painel de regras aberto? */
  const [regrasAbertas, setRegrasAbertas] = useState(false)
  /** null = mostrando a lista de regras; objeto = editando/criando uma. */
  const [regraForm, setRegraForm] = useState<RegraBonificacao | null>(null)
  const [salvandoRegra, setSalvandoRegra] = useState(false)
  /** Regra aberta no painel de detalhes (lateral direita) — clicar numa
   *  regra da lista abre isto, não o formulário de edição direto; editar
   *  fica um clique depois, a partir daqui. Mesmo fluxo já usado pra
   *  garçom (lista → painel de detalhes → editar). */
  const [detalheRegraId, setDetalheRegraId] = useState<string | null>(null)
  /** scansPorRegra[regraId][garcomId] = escaneamentos DESDE o início do
   *  período atual daquela regra (não o total acumulado). */
  const [scansPorRegra, setScansPorRegra] = useState<Record<string, Record<number, number>>>({})
  /** Escaneamentos de cada garçom nos períodos-padrão do calendário atual
   *  (semana/mês/trimestre) — independente de qualquer regra, é o que
   *  aparece em destaque no painel do garçom (mais fácil de olhar do que
   *  só o total acumulado, que nunca zera). */
  const [scansEstaSemana, setScansEstaSemana] = useState<Record<number, number>>({})
  const [scansEsteMes, setScansEsteMes] = useState<Record<number, number>>({})
  const [scansEsteTrimestre, setScansEsteTrimestre] = useState<Record<number, number>>({})
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
      if (!regra.periodo_inicio || regra.apagada || !regra.renovar_automatico) return regra
      let inicio = new Date(regra.periodo_inicio)
      let fim = avancarPeriodo(inicio, regra)
      while (fim.getTime() <= Date.now()) {
        inicio = fim
        fim = avancarPeriodo(inicio, regra)
        mudou = true
      }
      return mudou ? { ...regra, periodo_inicio: inicio.toISOString() } : regra
    })
    if (mudou) await supabase.from('restaurantes').update({ config_bonificacao: listaRegras as any }).eq('id', r.id)
    setRegras(listaRegras)

    const { data: gs } = await supabase
      .from('garcons')
      .select('id, nome_garcon, ativo, telefone, bonus_pagamentos')
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
    setQrCodeIdParaGarcomState(qrCodeIdParaGarcom)

    // Uma busca só de qr_scans cobre o progresso de cada regra e os três
    // períodos-padrão (semana/mês/trimestre) — o início mais antigo entre
    // todos eles é até onde precisa voltar.
    const idsQr = Object.keys(qrCodeIdParaGarcom).map(Number)
    const inicioSemana = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
    const inicioMes = startOfMonth(new Date()).toISOString()
    const inicioTrimestre = startOfQuarter(new Date()).toISOString()
    const regrasComPeriodo = listaRegras.filter((reg) => reg.periodo_inicio && reg.meta_escaneamentos > 0)
    if (idsQr.length > 0) {
      const desde = regrasComPeriodo.reduce(
        (min, reg) => (reg.periodo_inicio! < min ? reg.periodo_inicio! : min),
        inicioTrimestre,
      )
      const { data: scans } = await supabase
        .from('qr_scans')
        .select('qr_code_id, scanned_at')
        .in('qr_code_id', idsQr)
        .gte('scanned_at', desde)

      const porRegra: Record<string, Record<number, number>> = {}
      for (const reg of regrasComPeriodo) {
        const porGarcom: Record<number, number> = {}
        // Regra que NÃO renova sozinha tem um fim de verdade (o período que
        // ela definiu) — sem esse teto, um escaneamento de meses depois do
        // prazo continuaria contando pra sempre, porque `periodo_inicio`
        // nunca avança pra "fechar a porta". Regra que renova não precisa
        // disso: o próprio avanço do período já empurra `periodo_inicio`
        // pra frente e escaneamentos do ciclo antigo saem de cena sozinhos.
        const fimReg = reg.renovar_automatico
          ? null
          : avancarPeriodo(new Date(reg.periodo_inicio!), reg).toISOString()
        for (const s of scans ?? []) {
          if (antesDe(s.scanned_at, reg.periodo_inicio!)) continue
          if (fimReg && !antesDe(s.scanned_at, fimReg)) continue
          const gId = qrCodeIdParaGarcom[s.qr_code_id]
          if (gId && garcomParticipaDaRegra(reg, gId)) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
        }
        porRegra[reg.id] = porGarcom
      }
      setScansPorRegra(porRegra)

      // Mesma varredura, três contadores — cada um só soma o que está
      // dentro do próprio início.
      const contarDesde = (inicio: string) => {
        const porGarcom: Record<number, number> = {}
        for (const s of scans ?? []) {
          if (antesDe(s.scanned_at, inicio)) continue
          const gId = qrCodeIdParaGarcom[s.qr_code_id]
          if (gId) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
        }
        return porGarcom
      }
      setScansEstaSemana(contarDesde(inicioSemana))
      setScansEsteMes(contarDesde(inicioMes))
      setScansEsteTrimestre(contarDesde(inicioTrimestre))
    } else {
      setScansPorRegra({})
      setScansEstaSemana({})
      setScansEsteMes({})
      setScansEsteTrimestre({})
    }

    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Escaneamentos do Ranking dentro do filtro escolhido. Regra selecionada
  // dispensa a busca (reaproveita `scansPorRegra`, já calculado); "todo o
  // período" sem regra também dispensa (o total de `qrs` já é isso). Só um
  // recorte de data de verdade precisa buscar de novo.
  useEffect(() => {
    if (rankingRegraId) return
    if (rankingPeriodo === 'all' && !rankingDatas) return
    const idsQr = Object.keys(qrCodeIdParaGarcomState).map(Number)
    if (idsQr.length === 0) { setScansRanking({}); return }

    let cancelado = false
    ;(async () => {
      let consulta = supabase.from('qr_scans').select('qr_code_id, scanned_at').in('qr_code_id', idsQr)
      if (rankingDatas) {
        const inicioDoDia = new Date(rankingDatas.from)
        inicioDoDia.setHours(0, 0, 0, 0)
        consulta = consulta.gte('scanned_at', inicioDoDia.toISOString())
        if (rankingDatas.to) {
          const fimDoDia = new Date(rankingDatas.to)
          fimDoDia.setHours(23, 59, 59, 999)
          consulta = consulta.lte('scanned_at', fimDoDia.toISOString())
        }
      } else {
        const inicio = rankingPeriodo === 'semana' ? startOfWeek(new Date(), { weekStartsOn: 1 })
          : rankingPeriodo === 'trimestre' ? startOfQuarter(new Date())
          : startOfMonth(new Date())
        consulta = consulta.gte('scanned_at', inicio.toISOString())
      }
      const { data: scans } = await consulta
      if (cancelado) return
      const porGarcom: Record<number, number> = {}
      for (const s of scans ?? []) {
        const gId = qrCodeIdParaGarcomState[s.qr_code_id]
        if (gId) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
      }
      setScansRanking(porGarcom)
    })()
    return () => { cancelado = true }
  }, [rankingPeriodo, rankingDatas, rankingRegraId, qrCodeIdParaGarcomState])

  /** Quantos escaneamentos contam pro Ranking, respeitando o filtro atual
   *  (regra selecionada > recorte de data > total acumulado). */
  const scansParaRanking = (garcomId: number): number => {
    if (rankingRegraId) return scansPorRegra[rankingRegraId]?.[garcomId] ?? 0
    if (rankingPeriodo === 'all' && !rankingDatas) return qrs[garcomId]?.total_scans ?? 0
    return scansRanking[garcomId] ?? 0
  }

  /** Clicar num garçom no Ranking leva pra Equipe com o painel dele já
   *  aberto — ver a colocação e faltar um clique pra agir é a fricção que
   *  esse atalho tira. */
  const abrirDetalheDoRanking = (garcomId: number) => {
    setAba('equipe')
    setDetalheId(garcomId)
  }

  const garcomAtual = garcons.find((g) => g.id === detalheId) ?? null
  const regraDetalhe = regras.find((r) => r.id === detalheRegraId) ?? null

  /** Abre uma regra existente pra editar — usado só pelo painel de
   *  detalhes agora. Fecha o painel junto: o formulário (520px) é mais
   *  largo que o painel (448px) e os dois lado a lado no mesmo canto
   *  direito da tela deixavam o rodapé do formulário embaixo do painel,
   *  com o botão de Salvar cortado. O fallback defensivo é pra regras
   *  salvas antes dos campos de período personalizado existirem. */
  const abrirEditarRegra = (r: RegraBonificacao) => {
    setDetalheRegraId(null)
    setRegraForm({
      ...r,
      dias_personalizados: r.dias_personalizados ?? 15,
      tipo_personalizado: r.tipo_personalizado ?? 'dias',
      alinhar_calendario: r.alinhar_calendario ?? false,
      garcons_participantes: r.garcons_participantes ?? null,
      apagada: r.apagada ?? false,
    })
  }

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

  const abrirCriar = () => {
    setFormAberto('criar'); setFormNome(''); setFormTelefone(''); setTentouSalvarForm(false)
  }
  const abrirEditar = (g: Garcom) => {
    // Fecha o painel de detalhes junto — mesmo motivo do de regra: os dois
    // abertos ao mesmo tempo no canto direito da tela deixavam o formulário
    // com uma pontinha cortada atrás do painel.
    setDetalheId(null)
    setFormAberto('editar'); setFormNome(g.nome_garcon); setFormTelefone(g.telefone ?? ''); setTentouSalvarForm(false)
  }

  const salvarForm = async () => {
    setTentouSalvarForm(true)
    const nome = formNome.trim()
    const telefone = formTelefone.trim()
    if (!nome || !telefone) return
    setSalvandoForm(true)
    try {
      if (formAberto === 'criar') {
        if (!restauranteId) return
        const { data, error } = await supabase
          .from('garcons')
          .insert({ nome_garcon: nome, telefone, restaurante_id: restauranteId, ativo: true })
          .select('id, nome_garcon, ativo, telefone, bonus_pagamentos')
          .single()
        if (error) throw error
        setGarcons((p) => [...p, { ...(data as any), bonus_pagamentos: (data as any).bonus_pagamentos ?? {} }])
        toast.success('Garçom adicionado.')
      } else if (formAberto === 'editar' && garcomAtual) {
        const { error } = await supabase
          .from('garcons')
          .update({ nome_garcon: nome, telefone })
          .eq('id', garcomAtual.id)
        if (error) throw error
        setGarcons((p) => p.map((g) => (g.id === garcomAtual.id ? { ...g, nome_garcon: nome, telefone } : g)))
        toast.success('Dados salvos.')
      }
      setFormAberto(null)
    } catch (e: any) {
      toast.error('Erro ao salvar', { description: e.message })
    } finally {
      setSalvandoForm(false)
    }
  }

  const remover = async (id: number) => {
    try {
      await supabase.from('garcons').delete().eq('id', id)
      setGarcons((p) => p.filter((g) => g.id !== id))
      if (detalheId === id) setDetalheId(null)
    } catch {
      toast.error('Erro ao remover garçom')
    }
  }

  const baixarPdf = async (idsFiltro?: number[]) => {
    const ativos = garcons.filter((g) => g.ativo && (!idsFiltro || idsFiltro.includes(g.id)))
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

  const iniciarSelecao = () => { setSelecionando(true); setSelecionados(new Set()) }
  const cancelarSelecao = () => { setSelecionando(false); setSelecionados(new Set()) }
  const alternarSelecionado = (id: number) => {
    setSelecionados((p) => {
      const novo = new Set(p)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }
  const confirmarSelecao = async () => {
    await baixarPdf([...selecionados])
    cancelarSelecao()
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
      let regraFinal: RegraBonificacao = {
        ...regraForm,
        id: regraForm.id || crypto.randomUUID(),
        // Primeira vez que a regra é salva: define onde o período começa
        // (agora, ou alinhado ao calendário — ver `calcularInicioRegra`).
        periodo_inicio: regraForm.periodo_inicio ?? calcularInicioRegra(regraForm),
      }
      // Período personalizado "de uma data até outra": os dois campos de
      // data SÃO o período — a cada save, convertem pra dias e reaproveitam
      // o mesmo motor de avanço que a opção "a cada N dias" já usa, em vez
      // de precisar de uma lógica de fim separada só pra este modo.
      if (regraFinal.frequencia === 'personalizado' && regraFinal.tipo_personalizado === 'data' && regraFinal.data_fim_personalizado) {
        const dias = Math.max(
          1,
          differenceInCalendarDays(new Date(regraFinal.data_fim_personalizado), new Date(regraFinal.periodo_inicio!)) + 1,
        )
        regraFinal = { ...regraFinal, dias_personalizados: dias }
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

  // "Excluir" não tira a regra do array — só marca `apagada` e desliga
  // `ativa`. Tirar de verdade apagaria junto o nome/meta/prêmio que o
  // histórico de pagamento de cada garçom precisa pra continuar legível em
  // "Arquivadas" (o pagamento em si mora no garçom, não na regra — mas sem
  // a regra pra consultar, vira um ID sem nome nem meta pra mostrar).
  const excluirRegra = async (id: string) => {
    try {
      await gravarRegras(regras.map((r) => (r.id === id ? { ...r, apagada: true, ativa: false } : r)))
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
      // Guarda a meta junto com a data: se o dono aumentar a meta depois e o
      // garçom bater a nova, este registro (com a meta ANTIGA) não cobre
      // mais ela — `regraEstaPaga` volta a considerar pendente sozinho.
      const pagamento: PagamentoRegra = { pago_em: new Date().toISOString(), meta: regra.meta_escaneamentos }
      const pagamentos = { ...g.bonus_pagamentos, [regra.id]: pagamento }
      const { error } = await supabase.from('garcons').update({ bonus_pagamentos: pagamentos as any }).eq('id', g.id)
      if (error) throw error
      setGarcons((p) => p.map((x) => (x.id === g.id ? { ...x, bonus_pagamentos: pagamentos } : x)))
      toast.success(`Bônus de ${g.nome_garcon} marcado como pago.`)
    } catch (e: any) {
      toast.error('Erro ao marcar bônus como pago', { description: e.message })
    } finally {
      setPagando('')
    }
  }

  // Regra selecionada no filtro do Ranking só vale pra quem participa dela —
  // mostrar quem está de fora a zero no ranking sugeriria que ele está
  // disputando e perdendo, quando na verdade nem concorre.
  const regraRankingSelecionada = regras.find((r) => r.id === rankingRegraId)
  const candidatosRanking = regraRankingSelecionada
    ? garcons.filter((g) => garcomParticipaDaRegra(regraRankingSelecionada, g.id))
    : garcons
  const ranking = [...candidatosRanking].sort((a, b) => scansParaRanking(b.id) - scansParaRanking(a.id))
  const maiorScans = ranking.length ? scansParaRanking(ranking[0].id) : 0
  const temAberturas = maiorScans > 0
  const regrasAtivas = regras.filter((r) => !r.apagada && r.ativa && r.periodo_inicio && r.meta_escaneamentos > 0)

  /** Regras ativas que valem PRA ESTE garçom (respeita participantes). */
  const regrasDoGarcom = (garcomId: number) => regrasAtivas.filter((r) => garcomParticipaDaRegra(r, garcomId))

  /** Regra concluída e paga há mais de 24h — some da vista normal do painel
   *  do garçom e vai pro histórico de "Arquivadas". Só isso conta pro
   *  relógio: uma regra ainda pendente, ou batida mas não paga, nunca
   *  arquiva sozinha — fica visível até alguém resolver ela. */
  const foiArquivada = (regra: RegraBonificacao, g: Garcom): boolean => {
    const scans = scansPorRegra[regra.id]?.[g.id] ?? 0
    if (scans < regra.meta_escaneamentos) return false
    const pagamento = pagamentoDeRegra(g.bonus_pagamentos, regra.id)
    if (!pagamento || !regraEstaPaga(pagamento, regra)) return false
    return Date.now() - new Date(pagamento.pago_em).getTime() > 24 * 3600_000
  }

  /** Histórico completo de "Arquivadas", com filtro — 'existentes' é o
   *  comportamento padrão de sempre (só regra que ainda existe e já passou
   *  do prazo de 24h). 'apagadas'/'todas' também trazem regra que já foi
   *  excluída: uma regra apagada não tem mais "período em andamento" pra
   *  esperar, então entra direto, sem o prazo de 24h — o pagamento em si
   *  (guardado no garçom, não na regra) é o que prova que ela foi cumprida,
   *  a regra só empresta o nome/meta/prêmio pra mostrar. */
  const regrasArquivadasFiltradas = (g: Garcom, filtro: 'existentes' | 'todas' | 'apagadas'): RegraBonificacao[] =>
    regras.filter((r) => {
      if (!regraEstaPaga(pagamentoDeRegra(g.bonus_pagamentos, r.id), r)) return false
      if (filtro === 'apagadas') return r.apagada
      if (filtro === 'todas') return true
      return !r.apagada && foiArquivada(r, g)
    })

  /** Tem pelo menos uma regra batida e ainda não paga? Usado tanto pra
   *  ordenar a lista da Equipe (quem precisa pagar primeiro) quanto pro
   *  numerozinho da barra lateral. */
  const precisaPagar = (g: Garcom) => regrasDoGarcom(g.id).some((regra) => {
    const scans = scansPorRegra[regra.id]?.[g.id] ?? 0
    return scans >= regra.meta_escaneamentos && !regraEstaPaga(pagamentoDeRegra(g.bonus_pagamentos, regra.id), regra)
  })

  // Quem precisa pagar sobe pro topo da lista da Equipe — é a informação
  // mais acionável ali. O resto mantém a ordem de sempre (data de criação),
  // sem outro critério de ordenação claro que valesse a pena aplicar.
  const garconsEquipe = [...garcons].sort((a, b) => Number(precisaPagar(b)) - Number(precisaPagar(a)))

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1">
      <Tabs
        value={aba}
        onValueChange={(v) => {
          const nova = v as 'ranking' | 'equipe'
          setAba(nova)
          // Voltar pro Ranking com o painel de um garçom aberto (aberto pela
          // lista da Equipe) deixava ele preso atrás — some junto da troca.
          if (nova === 'ranking') setDetalheId(null)
        }}
        className="w-full"
      >
        <TabsList className="mb-6">
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        {/* Ranking */}
        <TabsContent value="ranking" className="mt-0 space-y-4">
          {ranking.length === 0 ? (
            <Card><CardContent className="p-5 sm:p-6">
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum garçom cadastrado ainda.</p>
            </CardContent></Card>
          ) : (
            <>
              {/* Mesmo filtro de período de /feedbacks — e, além dele, uma
                  regra específica: escolher uma troca o recorte de data pelo
                  período dela mesma (afinal a regra já TEM o próprio
                  período), então os dois filtros se excluem. */}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={rankingRegraId || SEM_REGRA}
                  onValueChange={(v) => setRankingRegraId(v === SEM_REGRA ? '' : v)}
                >
                  <SelectTrigger className="h-10 w-[220px] border-gray-200 bg-white">
                    <SelectValue placeholder="Todas as aberturas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_REGRA}>Todas as aberturas</SelectItem>
                    {regras.filter((r) => !r.apagada).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{rotuloRegra(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!rankingRegraId && (
                  <FiltroPeriodo
                    periodo={rankingPeriodo}
                    datas={rankingDatas}
                    onPeriodo={(p) => setRankingPeriodo(p)}
                    onDatas={(d) => setRankingDatas(d)}
                    presets={PRESETS_RANKING}
                  />
                )}
              </div>

              {!temAberturas ? (
                <Card><CardContent className="p-5 sm:p-6">
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {rankingRegraId || rankingPeriodo !== 'all' || rankingDatas ? (
                      'Nenhuma abertura nesse filtro.'
                    ) : (
                      <>Ainda não há aberturas registradas. Baixe os QR Codes na aba <b>Equipe</b> e distribua.</>
                    )}
                  </p>
                </CardContent></Card>
              ) : (
                <>
                  {/* `w-fit` + `mx-auto`: o card só é largo o quanto o pódio
                      precisa, não a tela inteira — sobrava muito vazio dos
                      dois lados quando tinha só 3 pessoas. */}
                  <Card className="w-fit mx-auto">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-end justify-center gap-3 sm:gap-6">
                        {[1, 0, 2].map((idx) => {
                          const g = ranking[idx]
                          if (!g) return null
                          const posicao = (idx + 1) as 1 | 2 | 3
                          const scans = scansParaRanking(g.id)
                          const cor = corPorIndice(idx)
                          const config = PODIO_CONFIG[posicao]
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => abrirDetalheDoRanking(g.id)}
                              className="flex flex-col items-center rounded-lg p-1 transition-colors hover:bg-gray-50"
                            >
                              <span
                                className={cn(
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                  cor.bg, cor.text,
                                )}
                              >
                                {getIniciais(g.nome_garcon)}
                              </span>
                              <p className="mt-1.5 max-w-[92px] truncate text-center text-sm font-semibold text-gray-900">
                                {g.nome_garcon}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {scans} abertura{scans === 1 ? '' : 's'}
                              </p>
                              <div
                                className={cn('mt-1.5 w-20 rounded-t-lg', config.altura)}
                                style={{
                                  background: config.gradiente,
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
                                  borderTop: '2px solid rgba(255,255,255,0.6)',
                                }}
                              >
                                <div
                                  className="flex h-8 items-center justify-center text-lg font-bold"
                                  style={{ color: config.numero, textShadow: '0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.25)' }}
                                >
                                  {posicao}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Do 4º em diante é só lista — o pódio já contou a história
                      de quem chegou na frente; daqui pra baixo o que importa é
                      achar o nome, e a colocação é só o número mesmo. */}
                  {ranking.length > 3 && (
                    <Card>
                      <CardContent className="p-2">
                        <ul className="divide-y divide-border">
                          {ranking.slice(3).map((g, i) => {
                            const posicao = i + 4
                            const scans = scansParaRanking(g.id)
                            const pct = maiorScans > 0 ? Math.round((scans / maiorScans) * 100) : 0
                            const cor = corPorIndice(posicao - 1)
                            return (
                              <li key={g.id}>
                                <button
                                  type="button"
                                  onClick={() => abrirDetalheDoRanking(g.id)}
                                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
                                >
                                  <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground">
                                    {posicao}
                                  </span>
                                  <span
                                    className={cn(
                                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                      cor.bg, cor.text,
                                    )}
                                  >
                                    {getIniciais(g.nome_garcon)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="truncate text-sm font-medium text-gray-900">{g.nome_garcon}</span>
                                      <span className="shrink-0 text-sm font-bold text-gray-900">
                                        {scans}
                                        <span className="ml-1 text-xs font-normal text-muted-foreground">aberturas</span>
                                      </span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* Equipe */}
        <TabsContent value="equipe" className="mt-0 space-y-4">
          {selecionando ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">
                {selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}
              </span>
              <div className="flex-1" />
              <Button variant="ghost" onClick={cancelarSelecao}>
                <X className="h-4 w-4 mr-1.5" /> Cancelar
              </Button>
              <Button
                onClick={confirmarSelecao}
                disabled={selecionados.size === 0 || baixando}
                className={cn('h-9 rounded-full px-4', CLASSE_BOTAO_BAIXAR)}
              >
                {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Baixar ({selecionados.size})
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={abrirCriar}
                className={cn('h-7 gap-1 rounded-full px-2.5 text-sm', CLASSE_BOTAO_NOVO)}
              >
                <Plus className="h-3.5 w-3.5" /> Novo garçom
              </Button>
              <div className="flex-1" />
              {garcons.length > 0 && (
                <div className="flex items-stretch">
                  <Button
                    onClick={() => baixarPdf()}
                    disabled={baixando}
                    className={cn(
                      'h-9 rounded-l-full rounded-r-none border-r border-white/10 pl-3 pr-2.5 disabled:border-transparent',
                      CLASSE_BOTAO_BAIXAR,
                    )}
                  >
                    {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Baixar QRCodes
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="Escolher garçons"
                        disabled={baixando}
                        className={cn('h-9 rounded-l-none rounded-r-full px-2.5', CLASSE_BOTAO_BAIXAR)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[260px]">
                      <DropdownMenuItem onClick={() => baixarPdf()} className="gap-3 py-2.5">
                        <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-700" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">Baixar todos de uma vez</p>
                          <p className="text-xs leading-snug text-gray-500">
                            Um PDF com o QR Code de cada garçom
                          </p>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={iniciarSelecao} className="gap-3 py-2.5">
                        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-gray-700" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">Baixar só os selecionados</p>
                          <p className="text-xs leading-snug text-gray-500">
                            Escolha quais garçons entram no PDF
                          </p>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Bonificação"
                    onClick={() => setRegrasAbertas(true)}
                    className="h-9 w-9"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Bonificação</TooltipContent>
              </Tooltip>
            </div>
          )}

          {garcons.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum garçom cadastrado. Clique em "Novo garçom" acima.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {garconsEquipe.map((g) => {
                    const i = garcons.findIndex((x) => x.id === g.id)
                    const cor = corPorIndice(i)
                    const total = qrs[g.id]?.total_scans ?? 0
                    const marcado = selecionados.has(g.id)
                    // Regra arquivada (paga há mais de 24h) some daqui também,
                    // não só de dentro do painel de detalhes — senão a barra de
                    // progresso "concluída" ficava pra sempre na lista principal.
                    const regrasDele = regrasDoGarcom(g.id).filter((r) => !foiArquivada(r, g))
                    return (
                      <li key={g.id}>
                        {/* `div` + `role="button"`, não um `<button>` — precisa
                            caber um `<button>` de verdade ("Marcar como
                            pago") lá dentro, e botão dentro de botão é HTML
                            inválido (o clique do de dentro nem chegaria). */}
                        <div
                          role="button"
                          tabIndex={0}
                          data-linha-garcom
                          onClick={() => (selecionando ? alternarSelecionado(g.id) : setDetalheId(g.id))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              selecionando ? alternarSelecionado(g.id) : setDetalheId(g.id)
                            }
                          }}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors',
                            marcado ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-50',
                          )}
                        >
                          {selecionando && (
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border',
                                marcado ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white',
                              )}
                            >
                              {marcado && <Check className="h-3.5 w-3.5" />}
                            </span>
                          )}
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              cor.bg, cor.text,
                            )}
                          >
                            {getIniciais(g.nome_garcon)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900">{g.nome_garcon}</p>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {total} abertura{total === 1 ? '' : 's'}
                              </span>
                            </div>
                            {regrasDele.length > 0 && (
                              <div className="mt-2.5 space-y-2.5">
                                {regrasDele.map((regra) => {
                                  const scans = scansPorRegra[regra.id]?.[g.id] ?? 0
                                  const meta = regra.meta_escaneamentos
                                  const pct = Math.min(100, Math.round((scans / meta) * 100))
                                  const atingiu = scans >= meta
                                  const falta = Math.max(0, meta - scans)
                                  const pago = regraEstaPaga(pagamentoDeRegra(g.bonus_pagamentos, regra.id), regra)
                                  const chave = `${g.id}:${regra.id}`
                                  return (
                                    <div key={regra.id} title={rotuloRegra(regra)} className="w-2/3">
                                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                        <span>{scans} de {meta} feitos</span>
                                        {atingiu && !pago ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className={cn('h-5 px-1.5 text-[10px]', CLASSE_BOTAO_PAGAR)}
                                            disabled={pagando === chave}
                                            onClick={(e) => { e.stopPropagation(); pagarBonus(g, regra) }}
                                          >
                                            {pagando === chave
                                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              : <Check className="h-3 w-3 mr-1" />}
                                            Marcar como pago
                                          </Button>
                                        ) : (
                                          <span>{pago ? 'pago' : `faltam ${falta}`}</span>
                                        )}
                                      </div>
                                      <div className="h-3 w-full overflow-hidden bg-gray-200">
                                        <div className={cn('h-full', COR_BARRA_REGRA)} style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          {!selecionando && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />}
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

      {/* Novo / editar garçom — o mesmo popup atende os dois fluxos. Mesmo
          desenho do popup de ação e do de regra de bonificação: fundo mais
          claro atrás, campo com ícone, erro só depois de tentar salvar, e os
          botões primario/neutro em vez de outline-e-azul-padrão. */}
      <Dialog open={!!formAberto} onOpenChange={(open) => !open && setFormAberto(null)}>
        <DialogContent
          classNameOverlay="bg-black/25 backdrop-blur-[1px]"
          className="gap-0 p-0 sm:max-w-[420px]"
          // Tem campo digitado (nome, telefone) — um clique de fora sem
          // querer não pode apagar o que a pessoa já escreveu. Fecha só
          // pelo X, Cancelar ou Esc.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-5 pb-1 pt-5 text-left">
            <DialogTitle className="text-base font-semibold leading-snug">
              {formAberto === 'editar' ? 'Editar garçom' : 'Novo garçom'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 px-5 pb-5 pt-3">
            <div className="space-y-2">
              <RotuloCampo icone={User} htmlFor="form-nome">Nome</RotuloCampo>
              <Input
                id="form-nome"
                autoFocus
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarForm() }}
                placeholder="Nome do garçom"
                className={cn(
                  'h-10',
                  tentouSalvarForm && !formNome.trim() && 'border-red-400 focus-visible:ring-red-400',
                )}
              />
            </div>
            <div className="space-y-2">
              <RotuloCampo icone={Phone} htmlFor="form-telefone">Telefone</RotuloCampo>
              <Input
                id="form-telefone"
                type="tel"
                inputMode="numeric"
                value={formTelefone}
                onChange={(e) => setFormTelefone(formatarTelefone(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarForm() }}
                placeholder="(11) 99999-9999"
                className={cn(
                  'h-10',
                  tentouSalvarForm && !formTelefone.trim() && 'border-red-400 focus-visible:ring-red-400',
                )}
              />
            </div>

            {tentouSalvarForm && (!formNome.trim() || !formTelefone.trim()) && (
              <p className="text-sm text-red-600">Preencha nome e telefone para continuar.</p>
            )}
          </div>

          <DialogFooter className="gap-1 border-t bg-white p-4 sm:justify-end sm:space-x-0">
            <Button variant="neutro" size="forma" onClick={() => setFormAberto(null)}>Cancelar</Button>
            <Button variant="primario" size="forma" onClick={salvarForm} disabled={salvandoForm}>
              {salvandoForm && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {formAberto === 'editar' ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhes do garçom — só leitura, abre ao clicar no card, na lateral
          direita. Mesmo estilo do painel de detalhes de uma ação: cabeçalho
          com avatar, seções rotuladas, e editar/excluir como ícones no fim. */}
      <Sheet open={!!garcomAtual} onOpenChange={(open) => { if (!open) setDetalheId(null) }} modal={false}>
        <SheetContent
          semOverlay
          className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]"
          // Só leitura — não tem o que perder clicando fora. Fecha normal,
          // igual a um popover: nenhum dado dele fica pendente de salvar.
          // Exceto clicar em OUTRA linha da lista: aí o painel deve trocar
          // pro garçom clicado, não só fechar (o fechamento "comeria" o
          // clique da linha, que dispara logo depois — sem isto, trocar de
          // garçom direto exigia dois cliques).
          onPointerDownOutside={(e) => {
            if ((e.target as HTMLElement).closest('[data-linha-garcom]')) e.preventDefault()
          }}
        >
          {garcomAtual && (
            <>
              <SheetHeader className="p-5 border-b bg-white shrink-0 text-left">
                <div className="flex items-center gap-3 pr-8">
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      corPorIndice(garcons.findIndex((g) => g.id === garcomAtual.id)).bg,
                      corPorIndice(garcons.findIndex((g) => g.id === garcomAtual.id)).text,
                    )}
                  >
                    {getIniciais(garcomAtual.nome_garcon)}
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-lg font-bold leading-snug">
                      {garcomAtual.nome_garcon}
                    </SheetTitle>
                    <SheetDescription className="sr-only">Detalhes do garçom</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {(() => {
                const regrasBonif = regrasDoGarcom(garcomAtual.id)
                const regrasVisiveisAqui = regrasBonif.filter((r) => !foiArquivada(r, garcomAtual))
                const regrasArquivadasAqui = regrasBonif.filter((r) => foiArquivada(r, garcomAtual))

                // Arquivadas troca o conteúdo do painel inteiro por só a
                // lista arquivada — pedido explícito ("some com as coisas
                // do popup e mostra só a lista"), não uma seção a mais
                // dentro do mesmo painel. O filtro escolhe QUAL histórico:
                // só o que ainda existe (padrão), tudo que ele já ganhou —
                // incluindo regra já apagada — ou só as apagadas.
                if (mostrandoArquivadas) {
                  const listaFiltrada = regrasArquivadasFiltradas(garcomAtual, filtroArquivadas)
                  return (
                    <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
                      <button
                        type="button"
                        onClick={() => setMostrandoArquivadas(false)}
                        className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Voltar
                      </button>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Regras arquivadas
                      </p>
                      <Tabs
                        value={filtroArquivadas}
                        onValueChange={(v) => setFiltroArquivadas(v as 'existentes' | 'todas' | 'apagadas')}
                      >
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="existentes" className="text-xs">Existentes</TabsTrigger>
                          <TabsTrigger value="todas" className="text-xs">Todas</TabsTrigger>
                          <TabsTrigger value="apagadas" className="text-xs">Apagadas</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {listaFiltrada.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {filtroArquivadas === 'apagadas'
                            ? 'Nenhuma regra apagada com bônus pago pra ele.'
                            : 'Nenhuma regra arquivada ainda.'}
                        </p>
                      ) : (
                        <ul className="mt-1 divide-y divide-border">
                          {listaFiltrada.map((regra) => {
                            const pagamento = pagamentoDeRegra(garcomAtual.bonus_pagamentos, regra.id)
                            return (
                              <li key={regra.id} className="py-3">
                                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                                  {rotuloRegra(regra)}
                                  {regra.apagada && (
                                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500">
                                      apagada
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {regra.premio ? `${regra.premio} · ` : ''}
                                  pago em {pagamento ? format(new Date(pagamento.pago_em), 'dd/MM/yyyy') : '—'}
                                </p>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                }

                return (
                  <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-6">
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Telefone</p>
                      <p className="text-sm text-gray-800">
                        {garcomAtual.telefone || <span className="text-gray-400 italic">Sem telefone cadastrado</span>}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Aberturas do QR</p>
                      {/* Os três períodos-padrão em destaque — são os mesmos que
                          uma regra de bonificação pode usar (semanal/mensal/
                          trimestral), então é a pergunta que o dono realmente
                          faz aqui: "como ele anda NESTE período". O total
                          acumulado nunca zera e não responde essa pergunta, por
                          isso vira uma linha pequena embaixo, não a primeira
                          coisa que se lê. */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-gray-50 px-2 py-2.5 text-center">
                          <p className="text-2xl font-bold text-gray-900">{scansEstaSemana[garcomAtual.id] ?? 0}</p>
                          <p className="text-[11px] text-muted-foreground">esta semana</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-2 py-2.5 text-center">
                          <p className="text-2xl font-bold text-gray-900">{scansEsteMes[garcomAtual.id] ?? 0}</p>
                          <p className="text-[11px] text-muted-foreground">este mês</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-2 py-2.5 text-center">
                          <p className="text-2xl font-bold text-gray-900">{scansEsteTrimestre[garcomAtual.id] ?? 0}</p>
                          <p className="text-[11px] text-muted-foreground">este trimestre</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {qrs[garcomAtual.id]?.total_scans ?? 0} no total, desde sempre
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Bonificação</p>
                        {/* Aparece se tiver QUALQUER histórico (mesmo que só
                            de uma regra já apagada) — senão o botão sumia
                            justo quando "Apagadas"/"Todas" teriam algo pra
                            mostrar, sem jeito de chegar lá. */}
                        {regrasArquivadasFiltradas(garcomAtual, 'todas').length > 0 && (
                          <button
                            type="button"
                            onClick={() => setMostrandoArquivadas(true)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gray-700"
                          >
                            <Archive className="h-3 w-3" /> Arquivadas ({regrasArquivadasAqui.length})
                          </button>
                        )}
                      </div>
                      {regrasVisiveisAqui.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma regra ativa pra ele. Configure em "Bonificação", na tela de Equipe.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {regrasVisiveisAqui.map((regra) => {
                            const scans = scansPorRegra[regra.id]?.[garcomAtual.id] ?? 0
                            const meta = regra.meta_escaneamentos
                            const pct = Math.min(100, Math.round((scans / meta) * 100))
                            const atingiu = scans >= meta
                            const pagamento = pagamentoDeRegra(garcomAtual.bonus_pagamentos, regra.id)
                            const pago = regraEstaPaga(pagamento, regra)
                            const chave = `${garcomAtual.id}:${regra.id}`

                            return (
                              <div key={regra.id}>
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                                  <p className="text-sm font-semibold text-gray-800">
                                    {rotuloRegra(regra)}
                                    {atingiu && pago && (
                                      <span className="ml-1.5 font-normal text-gray-400">
                                        · pago{pagamento ? ` em ${format(new Date(pagamento.pago_em), 'dd/MM')}` : ''}
                                      </span>
                                    )}
                                  </p>
                                  {atingiu && !pago && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={cn('h-6 px-2 text-[11px]', CLASSE_BOTAO_PAGAR)}
                                      disabled={pagando === chave}
                                      onClick={() => pagarBonus(garcomAtual, regra)}
                                    >
                                      {pagando === chave
                                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        : <Check className="h-3 w-3 mr-1" />}
                                      Marcar como pago
                                    </Button>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-gray-500">
                                  <span>{scans} de {meta} feitos</span>
                                  <span>
                                    {pago
                                      ? '100% concluído'
                                      : atingiu
                                        ? `meta batida${regra.premio ? ` — ${regra.premio}` : ''}`
                                        : `faltam ${meta - scans}`}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-3 w-full overflow-hidden bg-gray-200">
                                  <div className={cn('h-full', COR_BARRA_REGRA)} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Mesmo botão de "baixar" do resto da página — baixar só o
                        QR deste garçom sem precisar entrar no modo de seleção da
                        Equipe pra marcar um só. Editar/excluir continuam como
                        ícones, do outro lado. */}
                    <div className="flex items-center justify-between gap-2 border-t pt-4">
                      <Button
                        onClick={() => baixarPdf([garcomAtual.id])}
                        disabled={baixando}
                        className={cn('h-9 gap-1.5 rounded-full px-3.5 text-sm', CLASSE_BOTAO_BAIXAR)}
                      >
                        {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Baixar QR Code
                      </Button>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => abrirEditar(garcomAtual)}
                              variant="ghost"
                              size="icon"
                              aria-label="Editar garçom"
                              className="h-9 w-9 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                              <Pencil className="h-[18px] w-[18px]" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Editar</TooltipContent>
                        </Tooltip>

                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Excluir garçom"
                                  className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-[18px] w-[18px]" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Excluir</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir {garcomAtual.nome_garcon}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O QR Code dele sai junto. Não dá para desfazer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => remover(garcomAtual.id)}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Regras de bonificação — lista, ou o formulário de uma regra. Mesmo
          desenho do popup de ação (TaskModal.tsx): fundo mais claro atrás
          (o dono continua vendo a equipe por trás do popup, em vez do quadro
          inteiro apagado), cabeçalho fixo + miolo rolável + rodapé fixo, e
          os botões primario/neutro em vez de um azul-e-fantasma padrão. */}
      <Dialog
        open={regrasAbertas}
        onOpenChange={(open) => {
          setRegrasAbertas(open)
          if (!open) { setRegraForm(null); setDetalheRegraId(null) }
        }}
      >
        <DialogContent
          classNameOverlay="bg-black/25 backdrop-blur-[1px]"
          className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]"
          // O painel de detalhes da regra (Sheet logo abaixo) é portalado
          // como IRMÃO deste Dialog, não descendente — sem isto, o Radix
          // via o clique dentro do Sheet como "fora" do Dialog e fechava
          // ele (e o Sheet junto) sozinho ao clicar em "Editar" lá dentro.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {!regraForm ? (
            <>
              <DialogHeader className="shrink-0 px-5 pb-1 pt-5 text-left">
                <DialogTitle className="text-base font-semibold leading-snug">
                  Bonificação por escaneamentos
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
                {regras.filter((r) => !r.apagada).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma regra criada ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {regras.filter((r) => !r.apagada).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 py-3">
                        {/* Clicar na regra abre só o painel de detalhes (ver
                            <Sheet> abaixo) — editar é um passo a mais, a
                            partir de lá. Ativar/desativar continua aqui do
                            lado (é a única ação de 1 clique que faz sentido
                            direto na lista), e excluir agora também. */}
                        <button
                          type="button"
                          data-linha-regra
                          onClick={() => setDetalheRegraId(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className={cn('truncate text-sm font-medium', r.ativa ? 'text-gray-900' : 'text-muted-foreground')}>
                            {rotuloRegra(r)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {FREQUENCIA_LABEL[r.frequencia]}{r.premio ? ` · ${r.premio}` : ''}
                          </p>
                        </button>
                        <Switch
                          checked={r.ativa}
                          onCheckedChange={() => alternarAtivaRegra(r)}
                          className={CLASSE_SWITCH_REGRA}
                        />
                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Excluir regra"
                                  className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Excluir</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir "{rotuloRegra(r)}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ela sai da lista e para de valer daqui pra frente. O histórico de quem já foi pago
                                com ela continua guardado, em "Arquivadas", no painel de cada garçom.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => excluirRegra(r.id)}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <DialogFooter className="shrink-0 gap-1 border-t bg-white p-4 sm:justify-end sm:space-x-0">
                <Button variant="primario" size="forma" onClick={() => setRegraForm(novaRegraVazia())}>
                  <Plus className="h-4 w-4 mr-1.5" /> Nova regra
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader className="shrink-0 px-5 pb-1 pt-5 text-left">
                <button
                  type="button"
                  onClick={() => setRegraForm(null)}
                  className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Regras
                </button>
                <DialogTitle className="text-base font-semibold leading-snug">
                  {regraForm.id ? 'Editar regra' : 'Nova regra'}
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <RotuloCampo icone={Tag} htmlFor="regra-nome">Nome (opcional)</RotuloCampo>
                    <Input
                      id="regra-nome"
                      value={regraForm.nome}
                      onChange={(e) => setRegraForm({ ...regraForm, nome: e.target.value })}
                      placeholder="Ex.: Meta do mês"
                      className="h-10"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 min-w-0">
                      <RotuloCampo icone={Target} htmlFor="regra-meta">Meta de escaneamentos</RotuloCampo>
                      <div className="relative">
                        <Input
                          id="regra-meta"
                          type="number"
                          min={1}
                          value={regraForm.meta_escaneamentos}
                          onChange={(e) => setRegraForm({
                            ...regraForm, meta_escaneamentos: Math.max(0, Number(e.target.value) || 0),
                          })}
                          className="h-10 pr-10"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          QRs
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <RotuloCampo icone={CalendarClock}>Frequência</RotuloCampo>
                      <Select
                        value={regraForm.frequencia}
                        onValueChange={(v) => setRegraForm({ ...regraForm, frequencia: v as Frequencia })}
                      >
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FREQUENCIA_LABEL) as Frequencia[]).map((f) => (
                            <SelectItem key={f} value={f}>{FREQUENCIA_LABEL[f]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Só aparece pra frequência personalizada — as outras três
                      (semanal/mensal/trimestral) não precisam disto, e mostrar
                      um campo que não faz nada nelas só confundiria. Duas
                      formas de definir o período: uma quantidade de dias que
                      se repete sozinha, ou uma janela fixa (data até data),
                      tipo uma campanha de uma quinzena específica. */}
                  {regraForm.frequencia === 'personalizado' && (
                    <div className="space-y-3">
                      <Tabs
                        value={regraForm.tipo_personalizado}
                        onValueChange={(v) => setRegraForm({ ...regraForm, tipo_personalizado: v as 'dias' | 'data' })}
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="dias">Quantidade de dias</TabsTrigger>
                          <TabsTrigger value="data">De uma data até outra</TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {regraForm.tipo_personalizado === 'dias' ? (
                        <div className="space-y-2">
                          <RotuloCampo icone={CalendarClock} htmlFor="regra-dias">A cada quantos dias renova</RotuloCampo>
                          <div className="relative">
                            <Input
                              id="regra-dias"
                              type="number"
                              min={1}
                              value={regraForm.dias_personalizados}
                              onChange={(e) => setRegraForm({
                                ...regraForm, dias_personalizados: Math.max(1, Number(e.target.value) || 1),
                              })}
                              className="h-10 pr-14"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              dias
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <RotuloCampo icone={CalendarClock}>De / até</RotuloCampo>
                          <div className="flex w-fit items-center gap-2">
                            <DataSegmentada
                              value={regraForm.periodo_inicio ? new Date(regraForm.periodo_inicio) : undefined}
                              onChange={(d) => setRegraForm({ ...regraForm, periodo_inicio: d ? d.toISOString() : null })}
                            />
                            <span className="shrink-0 text-xs text-muted-foreground">até</span>
                            <DataSegmentada
                              value={regraForm.data_fim_personalizado ? new Date(regraForm.data_fim_personalizado) : undefined}
                              onChange={(d) => setRegraForm({ ...regraForm, data_fim_personalizado: d ? d.toISOString() : null })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <RotuloCampo icone={Gift} htmlFor="regra-premio">Prêmio</RotuloCampo>
                    <Input
                      id="regra-premio"
                      value={regraForm.premio}
                      onChange={(e) => setRegraForm({ ...regraForm, premio: e.target.value })}
                      placeholder="Ex.: R$ 100,00"
                      className="h-10"
                    />
                  </div>

                  {/* Quem participa — mesmo padrão de abas de "quantidade de
                      dias / de uma data até outra" acima: duas opções, a
                      segunda revela um controle extra. Sem isso, toda regra
                      valia igual pra equipe inteira, mesmo pensada só pra
                      um turno ou uma dupla específica. */}
                  <div className="space-y-2">
                    <RotuloCampo icone={Users}>Quem participa</RotuloCampo>
                    <Tabs
                      value={regraForm.garcons_participantes ? 'alguns' : 'todos'}
                      onValueChange={(v) => setRegraForm({
                        ...regraForm,
                        garcons_participantes: v === 'todos' ? null : (regraForm.garcons_participantes ?? []),
                      })}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="todos">Todos os garçons</TabsTrigger>
                        <TabsTrigger value="alguns">Só alguns</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {regraForm.garcons_participantes && (
                      garcons.length === 0 ? (
                        <p className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-muted-foreground">
                          Nenhum garçom cadastrado ainda.
                        </p>
                      ) : (
                        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
                          {garcons.map((g) => {
                            const marcado = regraForm.garcons_participantes!.includes(g.id)
                            return (
                              <label
                                key={g.id}
                                htmlFor={`regra-participante-${g.id}`}
                                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                              >
                                <Checkbox
                                  id={`regra-participante-${g.id}`}
                                  checked={marcado}
                                  className={CLASSE_CHECKBOX_REGRA}
                                  onCheckedChange={(v) => {
                                    const atual = regraForm.garcons_participantes!
                                    setRegraForm({
                                      ...regraForm,
                                      garcons_participantes: v ? [...atual, g.id] : atual.filter((id) => id !== g.id),
                                    })
                                  }}
                                />
                                <span className="text-sm text-gray-700">{g.nome_garcon}</span>
                              </label>
                            )
                          })}
                        </div>
                      )
                    )}
                  </div>

                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
                    {/* Só faz sentido pra semanal/mensal/trimestral — o
                        personalizado já define o próprio início (dias ou
                        data), não tem "início de calendário" pra alinhar. */}
                    {regraForm.frequencia !== 'personalizado' && (
                      <div>
                        <label htmlFor="regra-alinhar" className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="text-sm text-gray-700">
                            Sempre começar {regraForm.frequencia === 'semanal' ? 'no domingo'
                              : regraForm.frequencia === 'trimestral' ? 'no início do trimestre' : 'no dia 1'}
                          </span>
                          <Switch
                            id="regra-alinhar"
                            checked={regraForm.alinhar_calendario}
                            onCheckedChange={(v) => setRegraForm({ ...regraForm, alinhar_calendario: v })}
                            className={CLASSE_SWITCH_REGRA}
                          />
                        </label>
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          Desligado, o período começa a contar a partir de hoje e renova sempre nesse mesmo dia.
                        </p>
                      </div>
                    )}
                    <label htmlFor="regra-renovar" className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-sm text-gray-700">Renovar automaticamente ao fim do período</span>
                      <Switch
                        id="regra-renovar"
                        checked={regraForm.renovar_automatico}
                        onCheckedChange={(v) => setRegraForm({ ...regraForm, renovar_automatico: v })}
                        className={CLASSE_SWITCH_REGRA}
                      />
                    </label>
                    {/* Ativar/desativar mora só na lista de regras (o switch
                        ao lado de cada uma) — repetir aqui dava dois lugares
                        pra a mesma coisa, sem necessidade. */}
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 gap-1 border-t bg-white p-4 sm:justify-between sm:space-x-0">
                {regraForm.id ? (
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir regra"
                            className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-[18px] w-[18px]" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">Excluir</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{rotuloRegra(regraForm)}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ela sai da lista e para de valer daqui pra frente. O histórico de quem já foi pago
                          com ela continua guardado, em "Arquivadas", no painel de cada garçom.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => { excluirRegra(regraForm.id); setRegraForm(null); setDetalheRegraId(null) }}
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : <div />}
                <div className="flex gap-1">
                  <Button variant="neutro" size="forma" onClick={() => setRegraForm(null)}>Cancelar</Button>
                  <Button
                    variant="primario"
                    size="forma"
                    onClick={salvarRegraForm}
                    disabled={
                      salvandoRegra
                      || regraForm.meta_escaneamentos <= 0
                      || (regraForm.frequencia === 'personalizado' && regraForm.tipo_personalizado === 'data' && (
                        !regraForm.periodo_inicio
                        || !regraForm.data_fim_personalizado
                        || new Date(regraForm.data_fim_personalizado) < new Date(regraForm.periodo_inicio)
                      ))
                    }
                  >
                    {salvandoRegra && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhes da regra — só leitura, abre ao clicar numa regra da
          lista acima. Mesmo padrão do painel do garçom: painel na lateral
          direita da TELA (por isso é um Sheet, não outra vista dentro do
          Dialog de regras), com Editar/Excluir como ícones no fim; editar
          e ativar/desativar não vivem aqui — editar abre o formulário por
          cima, ativar/desativar é só na lista. `modal={false}` +
          `semOverlay` pra não empilhar um segundo fundo escurecido em cima
          do overlay do Dialog de regras, que já está aberto atrás. */}
      <Sheet open={!!regraDetalhe} onOpenChange={(open) => { if (!open) setDetalheRegraId(null) }} modal={false}>
        <SheetContent
          semOverlay
          className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden border-l-2 border-gray-300 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]"
          // Só leitura — clicar fora (na lista, ou no fundo do Dialog de
          // regras logo atrás) fecha normal e volta pra lista. O Dialog em
          // si continua protegido (não fecha sozinho por causa disto: ver
          // comentário no `onPointerDownOutside` dele, acima). Clicar numa
          // OUTRA regra da lista troca pra ela em vez de só fechar — mesmo
          // motivo do painel do garçom, ver comentário lá.
          onPointerDownOutside={(e) => {
            if ((e.target as HTMLElement).closest('[data-linha-regra]')) e.preventDefault()
          }}
        >
          {regraDetalhe && (
            <>
              <SheetHeader className="p-5 border-b bg-white shrink-0 text-left">
                <SheetTitle className="pr-8 text-lg font-bold leading-snug">{rotuloRegra(regraDetalhe)}</SheetTitle>
                <SheetDescription className="sr-only">Detalhes da regra de bonificação</SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-6">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Status</p>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                      regraDetalhe.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {regraDetalhe.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Meta</p>
                    <p className="text-sm text-gray-800">{regraDetalhe.meta_escaneamentos} QR Codes</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Frequência</p>
                    {/* Personalizada mostra o período de verdade (a cada N
                        dias, ou a data-a-data escolhida) — "Período
                        personalizado" sozinho não diz nada aqui. */}
                    <p className="text-sm text-gray-800">{rotuloPeriodoRegra(regraDetalhe)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Quem participa</p>
                  <p className="text-sm text-gray-800">
                    {!regraDetalhe.garcons_participantes || regraDetalhe.garcons_participantes.length === 0
                      ? 'Todos os garçons'
                      : garcons
                        .filter((g) => regraDetalhe.garcons_participantes!.includes(g.id))
                        .map((g) => g.nome_garcon)
                        .join(', ') || 'Nenhum garçom selecionado'}
                  </p>
                </div>

                {regraDetalhe.premio && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Prêmio</p>
                    <p className="text-sm text-gray-800">{regraDetalhe.premio}</p>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Renovação</p>
                  <p className="text-sm text-gray-800">
                    {regraDetalhe.renovar_automatico ? 'Renova automaticamente' : 'Não renova sozinha'}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-1 border-t pt-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => abrirEditarRegra(regraDetalhe)}
                        variant="ghost"
                        size="icon"
                        aria-label="Editar regra"
                        className="h-9 w-9 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      >
                        <Pencil className="h-[18px] w-[18px]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Editar</TooltipContent>
                  </Tooltip>

                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir regra"
                            className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-[18px] w-[18px]" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">Excluir</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{rotuloRegra(regraDetalhe)}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ela sai da lista e para de valer daqui pra frente. O histórico de quem já foi pago
                          com ela continua guardado, em "Arquivadas", no painel de cada garçom.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => { excluirRegra(regraDetalhe.id); setDetalheRegraId(null) }}
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
