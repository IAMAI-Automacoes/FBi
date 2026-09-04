import { useEffect, useState, useCallback } from 'react'
import { addDays, addMonths, format, startOfMonth } from 'date-fns'
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
  ListChecks, Pencil, X, Tag, Target, CalendarClock, Gift,
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

function avancarPeriodo(inicio: Date, frequencia: Frequencia): Date {
  if (frequencia === 'semanal') return addDays(inicio, 7)
  if (frequencia === 'trimestral') return addMonths(inicio, 3)
  return addMonths(inicio, 1)
}

/**
 * Compara dois timestamps ISO como instantes de verdade (`Date.getTime()`),
 * nunca como string. `periodo_inicio` sai de `new Date().toISOString()` no
 * JS (sempre 3 dígitos de milissegundo + "Z"), mas `scanned_at` vem do
 * Postgres via PostgREST — que manda `timestamptz` como "+00:00" e às vezes
 * com 6 dígitos. Comparar essas duas strings com `<` colocava escaneamentos
 * de ANTES da regra existir como se fossem depois em alguns instantes (a
 * causa do "criei a regra e ela já contou escaneamento antigo").
 */
function antesDe(a: string, b: string): boolean {
  return new Date(a).getTime() < new Date(b).getTime()
}

/** Cor do avatar pela POSIÇÃO na lista, não pelo hash do nome — com poucos
 *  garçons (o caso comum aqui) o hash colide com frequência e duas pessoas
 *  acabam com a mesma cor. Por posição, ninguém repete enquanto a lista
 *  couber na paleta. */
function corPorIndice(i: number) {
  return CORES_AVATAR[i % CORES_AVATAR.length]
}

/** Altura e cor do bloco de cada posição do pódio — ouro, prata e bronze
 *  (aproximados: o Tailwind não tem essas cores prontas). A altura decrescente
 *  é o que faz o conjunto ler como pódio mesmo sem escrever "1º/2º/3º" em
 *  lugar nenhum: o número já mora dentro do próprio bloco. */
const PODIO_CONFIG: Record<1 | 2 | 3, { altura: string; bloco: string; numero: string }> = {
  1: { altura: 'h-28', bloco: 'bg-amber-400', numero: 'text-amber-900' },
  2: { altura: 'h-20', bloco: 'bg-slate-300', numero: 'text-slate-700' },
  3: { altura: 'h-16', bloco: 'bg-orange-400', numero: 'text-orange-900' },
}

/** Cor única da barrinha de progresso de uma regra — o texto ao lado (quantos
 *  já foi, quantos falta, se já foi pago) já diz o estado; a barra só mostra
 *  o quanto andou. */
const COR_BARRA_REGRA = 'bg-blue-500'

/** A mesma pílula escura em degradê do botão de "Baixar" de Relatórios —
 *  compartilhada entre o botão normal (dividido, com dropdown) e o "Baixar
 *  (N)" do modo de seleção, pra nunca mais os dois divergirem de formato
 *  (só o arredondamento/padding muda conforme o contexto). */
const CLASSE_BOTAO_BAIXAR =
  'gap-1.5 bg-slate-900 bg-gradient-to-b from-slate-800 to-slate-950 text-sm font-medium text-white ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.20)] ' +
  'hover:from-slate-700 hover:to-slate-900 active:shadow-none active:from-slate-900 active:to-slate-900 ' +
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
  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  const [restaurantName, setRestaurantName] = useState('Restaurante')
  const [garcons, setGarcons] = useState<Garcom[]>([])
  const [qrs, setQrs] = useState<Record<number, QrInfo>>({})
  const [posterTema, setPosterTema] = useState('classico')
  const [posterMsg, setPosterMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [baixando, setBaixando] = useState(false)

  // "Baixar só os selecionados": enquanto true, os cards viram checáveis em
  // vez de abrirem o painel de detalhes.
  const [selecionando, setSelecionando] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  // Criar/editar garçom — um popup só, reaproveitado pelos dois fluxos.
  const [formAberto, setFormAberto] = useState<'criar' | 'editar' | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formTelefone, setFormTelefone] = useState('')
  const [salvandoForm, setSalvandoForm] = useState(false)

  // Painel de detalhes — guarda só o id (não o objeto) pra nunca ficar com
  // uma cópia desatualizada depois de salvar; `garcomAtual` é derivado toda
  // renderização a partir da lista viva.
  const [detalheId, setDetalheId] = useState<number | null>(null)

  const [regras, setRegras] = useState<RegraBonificacao[]>([])
  /** Painel de regras aberto? */
  const [regrasAbertas, setRegrasAbertas] = useState(false)
  /** null = mostrando a lista de regras; objeto = editando/criando uma. */
  const [regraForm, setRegraForm] = useState<RegraBonificacao | null>(null)
  const [salvandoRegra, setSalvandoRegra] = useState(false)
  /** scansPorRegra[regraId][garcomId] = escaneamentos DESDE o início do
   *  período atual daquela regra (não o total acumulado). */
  const [scansPorRegra, setScansPorRegra] = useState<Record<string, Record<number, number>>>({})
  /** Escaneamentos de cada garçom só no mês calendário atual — independente
   *  de qualquer regra, é só pra dar contexto ao lado do total geral. */
  const [scansEsteMes, setScansEsteMes] = useState<Record<number, number>>({})
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

    // Uma busca só de qr_scans cobre tanto o progresso de cada regra quanto
    // "aberturas neste mês" (que não depende de regra nenhuma) — o início
    // mais antigo entre os dois é até onde precisa voltar.
    const idsQr = Object.keys(qrCodeIdParaGarcom).map(Number)
    const inicioMes = startOfMonth(new Date()).toISOString()
    const regrasComPeriodo = listaRegras.filter((reg) => reg.periodo_inicio && reg.meta_escaneamentos > 0)
    if (idsQr.length > 0) {
      const desde = regrasComPeriodo.reduce(
        (min, reg) => (reg.periodo_inicio! < min ? reg.periodo_inicio! : min),
        inicioMes,
      )
      const { data: scans } = await supabase
        .from('qr_scans')
        .select('qr_code_id, scanned_at')
        .in('qr_code_id', idsQr)
        .gte('scanned_at', desde)

      const porRegra: Record<string, Record<number, number>> = {}
      for (const reg of regrasComPeriodo) {
        const porGarcom: Record<number, number> = {}
        for (const s of scans ?? []) {
          if (antesDe(s.scanned_at, reg.periodo_inicio!)) continue
          const gId = qrCodeIdParaGarcom[s.qr_code_id]
          if (gId) porGarcom[gId] = (porGarcom[gId] ?? 0) + 1
        }
        porRegra[reg.id] = porGarcom
      }
      setScansPorRegra(porRegra)

      const porMes: Record<number, number> = {}
      for (const s of scans ?? []) {
        if (antesDe(s.scanned_at, inicioMes)) continue
        const gId = qrCodeIdParaGarcom[s.qr_code_id]
        if (gId) porMes[gId] = (porMes[gId] ?? 0) + 1
      }
      setScansEsteMes(porMes)
    } else {
      setScansPorRegra({})
      setScansEsteMes({})
    }

    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const garcomAtual = garcons.find((g) => g.id === detalheId) ?? null

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

  const abrirCriar = () => { setFormAberto('criar'); setFormNome(''); setFormTelefone('') }
  const abrirEditar = (g: Garcom) => { setFormAberto('editar'); setFormNome(g.nome_garcon); setFormTelefone(g.telefone ?? '') }

  const salvarForm = async () => {
    const nome = formNome.trim()
    if (!nome) return
    setSalvandoForm(true)
    try {
      const telefone = formTelefone.trim() || null
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
  const maiorScans = ranking.length ? qrs[ranking[0].id]?.total_scans ?? 0 : 0
  const temAberturas = maiorScans > 0
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
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        {/* Ranking */}
        <TabsContent value="ranking" className="mt-0 space-y-4">
          {ranking.length === 0 ? (
            <Card><CardContent className="p-5 sm:p-6">
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum garçom cadastrado ainda.</p>
            </CardContent></Card>
          ) : !temAberturas ? (
            <Card><CardContent className="p-5 sm:p-6">
              <p className="py-12 text-center text-sm text-muted-foreground">
                Ainda não há aberturas registradas. Baixe os QR Codes na aba <b>Equipe</b> e distribua.
              </p>
            </CardContent></Card>
          ) : (
            <>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <p className="mb-6 text-sm text-muted-foreground">
                    Quem mais fez os clientes escanearem o QR Code.
                  </p>
                  <div className="flex items-end justify-center gap-3 sm:gap-6">
                    {[1, 0, 2].map((idx) => {
                      const g = ranking[idx]
                      if (!g) return null
                      const posicao = (idx + 1) as 1 | 2 | 3
                      const scans = qrs[g.id]?.total_scans ?? 0
                      const cor = corPorIndice(idx)
                      const config = PODIO_CONFIG[posicao]
                      return (
                        <div key={g.id} className="flex flex-col items-center">
                          <span
                            className={cn(
                              'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold',
                              cor.bg, cor.text,
                            )}
                          >
                            {getIniciais(g.nome_garcon)}
                          </span>
                          <p className="mt-2 max-w-[92px] truncate text-center text-sm font-semibold text-gray-900">
                            {g.nome_garcon}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {scans} abertura{scans === 1 ? '' : 's'}
                          </p>
                          <div className={cn('mt-2 w-20 rounded-t-lg', config.altura, config.bloco)}>
                            <div className={cn('flex h-8 items-center justify-center text-lg font-bold', config.numero)}>
                              {posicao}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Do 4º em diante é só lista — o pódio já contou a história de
                  quem chegou na frente; daqui pra baixo o que importa é achar
                  o nome, e a colocação é só o número mesmo. */}
              {ranking.length > 3 && (
                <Card>
                  <CardContent className="p-2">
                    <ul className="divide-y divide-border">
                      {ranking.slice(3).map((g, i) => {
                        const posicao = i + 4
                        const scans = qrs[g.id]?.total_scans ?? 0
                        const pct = maiorScans > 0 ? Math.round((scans / maiorScans) * 100) : 0
                        const cor = corPorIndice(posicao - 1)
                        return (
                          <li key={g.id} className="flex items-center gap-3 px-4 py-3.5">
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
                          </li>
                        )
                      })}
                    </ul>
                  </CardContent>
                </Card>
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
                  {garcons.map((g, i) => {
                    const cor = corPorIndice(i)
                    const total = qrs[g.id]?.total_scans ?? 0
                    const marcado = selecionados.has(g.id)
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => (selecionando ? alternarSelecionado(g.id) : setDetalheId(g.id))}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
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
                            {regrasAtivas.length > 0 && (
                              <div className="mt-2.5 space-y-2.5">
                                {regrasAtivas.map((regra) => {
                                  const scans = scansPorRegra[regra.id]?.[g.id] ?? 0
                                  const meta = regra.meta_escaneamentos
                                  const pct = Math.min(100, Math.round((scans / meta) * 100))
                                  const atingiu = scans >= meta
                                  const falta = Math.max(0, meta - scans)
                                  const pagoEm = g.bonus_pagamentos[regra.id]
                                  const pago = !!(pagoEm && regra.periodo_inicio && pagoEm >= regra.periodo_inicio)
                                  return (
                                    <div key={regra.id} title={rotuloRegra(regra)} className="w-2/3">
                                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                        <span>{scans} de {meta} feitos</span>
                                        <span>{pago ? 'pago' : atingiu ? 'meta batida' : `faltam ${falta}`}</span>
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
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Novo / editar garçom — o mesmo popup atende os dois fluxos */}
      <Dialog open={!!formAberto} onOpenChange={(open) => !open && setFormAberto(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{formAberto === 'editar' ? 'Editar garçom' : 'Novo garçom'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="form-nome">Nome</Label>
              <Input
                id="form-nome"
                autoFocus
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarForm() }}
                placeholder="Nome do garçom"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="form-telefone">Telefone (opcional)</Label>
              <Input
                id="form-telefone"
                type="tel"
                inputMode="numeric"
                value={formTelefone}
                onChange={(e) => setFormTelefone(formatarTelefone(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarForm() }}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAberto(null)}>Cancelar</Button>
            <Button onClick={salvarForm} disabled={salvandoForm || !formNome.trim()}>
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
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
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

              <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-6">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Telefone</p>
                  <p className="text-sm text-gray-800">
                    {garcomAtual.telefone || <span className="text-gray-400 italic">Sem telefone cadastrado</span>}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Aberturas do QR</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{qrs[garcomAtual.id]?.total_scans ?? 0}</p>
                      <p className="text-xs text-muted-foreground">no total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{scansEsteMes[garcomAtual.id] ?? 0}</p>
                      <p className="text-xs text-muted-foreground">este mês</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Bonificação</p>
                  {regrasAtivas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma regra ativa. Configure em "Bonificação", na tela de Equipe.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {regrasAtivas.map((regra) => {
                        const scans = scansPorRegra[regra.id]?.[garcomAtual.id] ?? 0
                        const meta = regra.meta_escaneamentos
                        const pct = Math.min(100, Math.round((scans / meta) * 100))
                        const atingiu = scans >= meta
                        const pagoEm = garcomAtual.bonus_pagamentos[regra.id]
                        const pago = !!(pagoEm && regra.periodo_inicio && pagoEm >= regra.periodo_inicio)
                        const chave = `${garcomAtual.id}:${regra.id}`

                        return (
                          <div key={regra.id}>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                              <p className="text-sm font-semibold text-gray-800">
                                {rotuloRegra(regra)}
                                {atingiu && pago && (
                                  <span className="ml-1.5 font-normal text-gray-400">
                                    · pago{pagoEm ? ` em ${format(new Date(pagoEm), 'dd/MM')}` : ''}
                                  </span>
                                )}
                              </p>
                              {atingiu && !pago && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
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

                {/* Baixar o QR de um garçom só agora é feito escolhendo-o em
                    "Baixar só os selecionados" (na tela de Equipe) — editar e
                    excluir continuam aqui como ícones, sem rodapé próprio só
                    pra eles. */}
                <div className="flex items-center justify-end gap-1 border-t pt-4">
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
        onOpenChange={(open) => { setRegrasAbertas(open); if (!open) setRegraForm(null) }}
      >
        <DialogContent
          classNameOverlay="bg-black/25 backdrop-blur-[1px]"
          className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]"
        >
          {!regraForm ? (
            <>
              <DialogHeader className="shrink-0 px-5 pb-1 pt-5 text-left">
                <DialogTitle className="text-base font-semibold leading-snug">
                  Bonificação por escaneamentos
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
                {regras.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma regra criada ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {regras.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 py-3">
                        <button
                          type="button"
                          onClick={() => setRegraForm({ ...r })}
                          className="min-w-0 flex-1 text-left"
                        >
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

                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
                    <label htmlFor="regra-renovar" className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-sm text-gray-700">Renovar automaticamente ao fim do período</span>
                      <Switch
                        id="regra-renovar"
                        checked={regraForm.renovar_automatico}
                        onCheckedChange={(v) => setRegraForm({ ...regraForm, renovar_automatico: v })}
                      />
                    </label>
                    <label htmlFor="regra-ativa" className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-sm text-gray-700">Regra ativa</span>
                      <Switch
                        id="regra-ativa"
                        checked={regraForm.ativa}
                        onCheckedChange={(v) => setRegraForm({ ...regraForm, ativa: v })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 gap-1 border-t bg-white p-4 sm:justify-between sm:space-x-0">
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
                    disabled={salvandoRegra || regraForm.meta_escaneamentos <= 0}
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
    </div>
  )
}
