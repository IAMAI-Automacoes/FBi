import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Briefcase, Copy, Loader2, Plus, Presentation, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { useArea } from '@/lib/area'
import { DEFINICOES, type Area } from '@/lib/areas'
import { codigoParaCopia } from '@/lib/indicacoes'
import { codigoDoBanco, nomeDoBanco } from '@/lib/pagamentos'
import { buscarAfiliados, buscarCodigosDeAfiliado, atualizarAfiliado, criarAfiliado, excluirAfiliado, type Afiliado } from '@/lib/queries/admin'
import { buscarPrecos } from '@/lib/queries/cobranca'
import { buscarVendedores, definirVendedor } from '@/lib/queries/demo'
import { buscarNumerosDosAfiliados, buscarRegraDeComissao, salvarRegraDeComissao, type NumerosDoAfiliado } from '@/lib/queries/indicacoes'
import {
  exemploDaRegra, juntarVendedores, problemaDaRegra, reais, REGRA_PADRAO, textoDaRegra, type MarcaDeDemo, type RegraDeComissao, type Vendedor,
} from '@/lib/vendedores'
import { cn } from '@/lib/utils'

/* Admin → Vendedores, nos dois softwares (pedido do Raver, 21/10/2026).
   Afiliado e vendedor viraram uma coisa só: cada vendedor tem um código de
   venda e ganha comissão pela regra do software (no topo). No Restaurante,
   o vendedor também pode ter o acesso de demonstração (código no Perfil, pula
   o WhatsApp, paga com o VENDEDOR100), marcado pelo e-mail. A conta EasyFeed
   que indica outra (padrinho) não é vendedor: o desconto dela é em Descontos. */

const CORES = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500']
function cor(texto: string) {
  let h = 0
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % CORES.length
  return CORES[h]
}
function iniciais(texto: string) {
  const partes = texto.trim().split(/\s+/)
  return (partes.length >= 2 ? partes[0][0] + partes[1][0] : texto[0] ?? '?').toUpperCase()
}

// ── A regra de comissão do software ──────────────────────────────────────────

function CampoNumero({ id, valor, aoMudar, sufixo, largura = 'w-20' }: { id: string; valor: string; aoMudar: (v: string) => void; sufixo: string; largura?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input id={id} value={valor} onChange={(e) => aoMudar(e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" className={cn('h-9 text-right tabular-nums', largura)} />
      <span className="text-[13px] text-gray-500">{sufixo}</span>
    </span>
  )
}

function RegraDaComissao({ area }: { area: Area }) {
  const [salva, setSalva] = useState<RegraDeComissao | null>(null)
  const [texto, setTexto] = useState({ entrada: '', recorrente: '', meses: '' })
  const [mensalidade, setMensalidade] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setSalva(null)
    buscarRegraDeComissao(area).catch(() => ({ ...REGRA_PADRAO })).then((r) => {
      setSalva(r)
      setTexto({ entrada: String(r.entradaPct).replace('.', ','), recorrente: String(r.recorrentePct).replace('.', ','), meses: String(r.recorrenteMeses) })
    })
    buscarPrecos(area).then((p) => setMensalidade(p.find((x) => x.ciclo === 'mensal')?.total_centavos ?? null)).catch(() => setMensalidade(null))
  }, [area])

  const ler = (t: string) => (t.trim() === '' ? Number.NaN : Number(t.replace(',', '.')))
  const regra: RegraDeComissao = { entradaPct: ler(texto.entrada), recorrentePct: ler(texto.recorrente), recorrenteMeses: ler(texto.meses) }
  const problema = problemaDaRegra(regra)
  const mudou = !!salva && !problema && (regra.entradaPct !== salva.entradaPct || regra.recorrentePct !== salva.recorrentePct || regra.recorrenteMeses !== salva.recorrenteMeses)
  const exemplo = mensalidade && !problema ? exemploDaRegra(regra, mensalidade) : null

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarRegraDeComissao(area, regra)
      setSalva(regra)
      toast.success('Comissão salva.')
    } catch {
      toast.error('Não foi possível salvar a comissão.')
    } finally {
      setSalvando(false)
    }
  }

  if (!salva) return <Skeleton className="h-32 w-full rounded-xl" />
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">Comissão dos vendedores</h3>
        <p className="text-[12px] text-gray-500">Vale para todos os vendedores do {DEFINICOES[area].nome}. Se o indicado cancelar, a comissão acaba.</p>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Label htmlFor="com-entrada" className="w-52 text-[13px] text-gray-700">Na 2ª mensalidade paga</Label>
          <CampoNumero id="com-entrada" valor={texto.entrada} aoMudar={(v) => setTexto((t) => ({ ...t, entrada: v }))} sufixo="% de uma mensalidade" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Label htmlFor="com-recorrente" className="w-52 text-[13px] text-gray-700">Nas mensalidades seguintes</Label>
          <CampoNumero id="com-recorrente" valor={texto.recorrente} aoMudar={(v) => setTexto((t) => ({ ...t, recorrente: v }))} sufixo="% de cada uma, por" />
          <CampoNumero id="com-meses" valor={texto.meses} aoMudar={(v) => setTexto((t) => ({ ...t, meses: v.replace(/\D/g, '') }))} sufixo="meses" largura="w-16" />
        </div>
        {problema ? (
          <p className="text-[12px] text-rose-600">{problema}</p>
        ) : exemplo && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
            Com a mensalidade de {reais(mensalidade!)}: {reais(exemplo.entrada)} na 2ª mensalidade
            {regra.recorrentePct > 0 && regra.recorrenteMeses > 0 && <> + {reais(exemplo.porMes)} por mês nos {regra.recorrenteMeses} meses seguintes</>}
            {' '}= até <b className="text-gray-800">{reais(exemplo.total)}</b> por indicado. Depois disso, a mensalidade fica toda com a empresa.
          </p>
        )}
      </div>
      {mudou && (
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-2.5">
          <Button variant="ghost" size="sm" disabled={salvando}
            onClick={() => setTexto({ entrada: String(salva.entradaPct).replace('.', ','), recorrente: String(salva.recorrentePct).replace('.', ','), meses: String(salva.recorrenteMeses) })}>
            Descartar
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
        </div>
      )}
    </section>
  )
}

// ── Trazer vendedores do outro software ──────────────────────────────────────

function TrazerDoOutroSoftware({ area, aoTrazer }: { area: Area; aoTrazer: () => void }) {
  const outra: Area = area === 'rh' ? 'restaurante' : 'rh'
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<Afiliado[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [trazendo, setTrazendo] = useState(false)

  const abrir = async () => {
    setAberto(true)
    setLista(null)
    setMarcados(new Set())
    try {
      setLista((await buscarAfiliados(outra)).filter((a) => a.restaurante_id == null))
    } catch {
      toast.error('Não foi possível carregar os vendedores do outro software.')
      setLista([])
    }
  }
  const alternar = (id: string) => setMarcados((m) => {
    const n = new Set(m)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const trazer = async () => {
    if (!lista || !marcados.size) return
    setTrazendo(true)
    try {
      const ocupados = await buscarCodigosDeAfiliado()
      for (const a of lista.filter((x) => marcados.has(x.id))) {
        const codigo = codigoParaCopia(a.codigo, area, ocupados)
        ocupados.add(codigo)
        await criarAfiliado({
          area, codigo, nome: a.nome, email: a.email, telefone: a.telefone, comissao_tipo: a.comissao_tipo, comissao_valor: a.comissao_valor,
          cpf_cnpj: a.cpf_cnpj, chave_pix: a.chave_pix, codigo_banco: a.codigo_banco, banco: a.banco,
          agencia: a.agencia, conta: a.conta, tipo_conta: a.tipo_conta, observacoes: a.observacoes, ativo: a.ativo,
        })
      }
      toast.success(marcados.size === 1 ? '1 vendedor trazido, com código novo.' : `${marcados.size} vendedores trazidos, com código novo.`)
      setAberto(false)
    } catch {
      toast.error('Não foi possível trazer todos. Confira a lista e tente de novo.')
    } finally {
      setTrazendo(false)
      aoTrazer()
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} className="shrink-0"><Copy className="mr-1 h-4 w-4" /> Trazer do {DEFINICOES[outra].nome}</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>Trazer vendedores do {DEFINICOES[outra].nome}</DialogTitle></DialogHeader>
          <p className="text-[13px] text-gray-600">A cópia ganha um código novo (o código não se repete entre os softwares) e fica separada da original.</p>
          {!lista ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : lista.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">O {DEFINICOES[outra].nome} não tem vendedores.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button type="button" className="text-[12.5px] font-medium text-[#1D4ED8] hover:underline"
                  onClick={() => setMarcados(marcados.size === lista.length ? new Set() : new Set(lista.map((a) => a.id)))}>
                  {marcados.size === lista.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {lista.map((a) => (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                      <Checkbox checked={marcados.has(a.id)} onCheckedChange={() => alternar(a.id)} aria-label={`Trazer ${a.nome}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{a.nome}</span>
                        <span className="block truncate text-[12px] text-gray-500">{a.codigo}{a.email ? ` · ${a.email}` : ''}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={trazer} disabled={!marcados.size || trazendo}>
              {trazendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Trazer {marcados.size || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── O cadastro de um vendedor ────────────────────────────────────────────────

interface Formulario {
  nome: string; codigo: string; email: string; telefone: string; ativo: boolean; demo: boolean
  cpf_cnpj: string; chave_pix: string; codigo_banco: string; banco: string; agencia: string; conta: string
  tipo_conta: 'corrente' | 'poupanca'; observacoes: string
}
const FORM_VAZIO: Formulario = {
  nome: '', codigo: '', email: '', telefone: '', ativo: true, demo: false,
  cpf_cnpj: '', chave_pix: '', codigo_banco: '', banco: '', agencia: '', conta: '', tipo_conta: 'corrente', observacoes: '',
}
function formDe(v: Vendedor<Afiliado> | null): Formulario {
  const a = v?.cadastro
  if (!a) return { ...FORM_VAZIO, email: v?.email ?? '', demo: !!v?.demo }
  return {
    nome: a.nome, codigo: a.codigo, email: a.email ?? '', telefone: a.telefone ?? '', ativo: a.ativo, demo: !!v.demo,
    cpf_cnpj: a.cpf_cnpj ?? '', chave_pix: a.chave_pix ?? '', codigo_banco: a.codigo_banco ?? '', banco: a.banco ?? '',
    agencia: a.agencia ?? '', conta: a.conta ?? '', tipo_conta: a.tipo_conta === 'poupanca' ? 'poupanca' : 'corrente', observacoes: a.observacoes ?? '',
  }
}

function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-[12px] text-gray-600">{rotulo}</span>
      {children}
    </label>
  )
}

function CadastroDoVendedor({ vendedor, area, regra, aoVoltar, aoSalvar }: {
  vendedor: Vendedor<Afiliado> | null
  area: Area
  regra: string
  aoVoltar: () => void
  aoSalvar: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [f, setF] = useState<Formulario>(() => formDe(vendedor))
  const [salvando, setSalvando] = useState(false)
  const set = (m: Partial<Formulario>) => setF((x) => ({ ...x, ...m }))
  const comDemo = area === 'restaurante'
  const novo = !vendedor?.cadastro
  const emailLimpo = f.email.trim().toLowerCase()
  const problema = !f.nome.trim() ? 'Ponha o nome.' : !f.codigo.trim() ? 'Ponha o código de venda.' : f.demo && !emailLimpo ? 'A demonstração precisa do e-mail.' : null

  const salvar = async () => {
    if (problema) return
    setSalvando(true)
    try {
      const vazio = (t: string) => t.trim() || null
      const dados = {
        nome: f.nome.trim(), codigo: f.codigo.trim().toUpperCase(), email: vazio(f.email)?.toLowerCase() ?? null, telefone: vazio(f.telefone),
        cpf_cnpj: vazio(f.cpf_cnpj), chave_pix: vazio(f.chave_pix), codigo_banco: vazio(f.codigo_banco), banco: vazio(f.banco),
        agencia: vazio(f.agencia), conta: vazio(f.conta), tipo_conta: f.tipo_conta, observacoes: vazio(f.observacoes), ativo: f.ativo,
      }
      if (vendedor?.cadastro) await atualizarAfiliado(vendedor.cadastro.id, dados)
      else await criarAfiliado({ ...dados, area, comissao_tipo: 'porcentagem', comissao_valor: 0 })
      // A demonstração é pelo e-mail: tira do e-mail antigo e põe no novo.
      if (comDemo) {
        const antigo = (vendedor?.demo?.email ?? '').toLowerCase()
        if (antigo && (!f.demo || antigo !== emailLimpo)) await definirVendedor(antigo, false)
        if (f.demo && emailLimpo && antigo !== emailLimpo) await definirVendedor(emailLimpo, true)
      }
      toast.success(novo ? 'Vendedor criado.' : 'Vendedor salvo.')
      aoSalvar()
    } catch (e) {
      toast.error(e instanceof Error && /duplicate|unique/i.test(e.message) ? 'Esse código já existe. Escolha outro.' : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!vendedor) return
    const nome = vendedor.cadastro?.nome || vendedor.email || 'vendedor'
    if (!(await confirmar({
      titulo: `Excluir ${nome}?`,
      descricao: 'O código de venda para de valer' + (vendedor.demo ? ' e o acesso de demonstração sai na hora' : '') + '. Quem já entrou pelo código continua com a conta.',
      confirmar: 'Excluir',
      destrutivo: true,
    }))) return
    setSalvando(true)
    try {
      if (vendedor.cadastro) await excluirAfiliado(vendedor.cadastro.id)
      if (vendedor.demo) await definirVendedor(vendedor.demo.email, false)
      toast.success(`${nome} excluído.`)
      aoSalvar()
    } catch {
      toast.error('Não foi possível excluir.')
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {dialogo}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={aoVoltar} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Vendedores</button>
        {vendedor && <Button variant="destrutivoVazado" size="sm" onClick={excluir} disabled={salvando}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button>}
      </div>
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800">{novo ? (vendedor?.email ? 'Criar o código de venda' : 'Novo vendedor') : f.nome || 'Vendedor'}</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome *"><Input value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="João Silva" /></Campo>
          <Campo rotulo="Código de venda *"><Input value={f.codigo} onChange={(e) => set({ codigo: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="JOAO10" className="font-mono" /></Campo>
          <Campo rotulo="E-mail"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="joao@email.com" /></Campo>
          <Campo rotulo="Telefone"><Input value={f.telefone} onChange={(e) => set({ telefone: e.target.value })} placeholder="(11) 90000-0000" /></Campo>
        </div>
        <div className="space-y-2.5">
          <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
            <span>Ativo <span className="block text-[11.5px] text-gray-500">Desligado, o código para de valer.</span></span>
            <Switch checked={f.ativo} onCheckedChange={(v) => set({ ativo: v })} />
          </label>
          {comDemo && (
            <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
              <span>Acesso de demonstração <span className="block text-[11.5px] text-gray-500">Código da demonstração no Perfil, pula o WhatsApp e paga com o VENDEDOR100.</span></span>
              <Switch checked={f.demo} onCheckedChange={(v) => set({ demo: v })} />
            </label>
          )}
        </div>
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600"><b className="text-gray-700">Comissão:</b> {regra}</p>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-gray-400">Para receber a comissão</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="CPF ou CNPJ"><Input value={f.cpf_cnpj} onChange={(e) => set({ cpf_cnpj: e.target.value })} placeholder="000.000.000-00" /></Campo>
            <Campo rotulo="Chave Pix"><Input value={f.chave_pix} onChange={(e) => set({ chave_pix: e.target.value })} placeholder="CPF, e-mail, telefone…" /></Campo>
            <Campo rotulo="Código do banco">
              <Input value={f.codigo_banco} inputMode="numeric" className="font-mono" placeholder="260"
                onChange={(e) => { const c = e.target.value; set({ codigo_banco: c, ...(nomeDoBanco(c) ? { banco: nomeDoBanco(c)! } : {}) }) }} />
            </Campo>
            <Campo rotulo="Banco">
              <Input value={f.banco} placeholder="Nubank"
                onChange={(e) => { const b = e.target.value; const c = codigoDoBanco(b); set({ banco: b, ...(c && !f.codigo_banco ? { codigo_banco: c } : {}) }) }} />
            </Campo>
            <Campo rotulo="Agência"><Input value={f.agencia} onChange={(e) => set({ agencia: e.target.value })} placeholder="0001" /></Campo>
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
              <Campo rotulo="Conta"><Input value={f.conta} onChange={(e) => set({ conta: e.target.value })} placeholder="12345-6" /></Campo>
              <Campo rotulo="Tipo">
                <Select value={f.tipo_conta} onValueChange={(t) => set({ tipo_conta: t as 'corrente' | 'poupanca' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </div>
        </div>
        <Campo rotulo="Observações"><Input value={f.observacoes} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Anotações internas" /></Campo>

        {problema && (f.nome || f.codigo) && <p className="text-[12px] text-rose-600">{problema}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={aoVoltar}>Cancelar</Button>
          <Button onClick={salvar} disabled={!!problema || salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
        </div>
      </div>
    </div>
  )
}

// ── A página ─────────────────────────────────────────────────────────────────

export function PainelVendedores() {
  const { area } = useArea()
  const comDemo = area === 'restaurante'
  const [cadastros, setCadastros] = useState<Afiliado[] | null>(null)
  const [marcas, setMarcas] = useState<MarcaDeDemo[]>([])
  const [numeros, setNumeros] = useState<Record<string, NumerosDoAfiliado>>({})
  const [regra, setRegra] = useState<RegraDeComissao>(REGRA_PADRAO)
  const [aberto, setAberto] = useState<Vendedor<Afiliado> | 'novo' | null>(null)
  const [erro, setErro] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [lista, demos, n, r] = await Promise.all([
        buscarAfiliados(area),
        comDemo ? buscarVendedores() : Promise.resolve([]),
        buscarNumerosDosAfiliados(area).catch(() => ({})),
        buscarRegraDeComissao(area).catch(() => REGRA_PADRAO),
      ])
      setCadastros(lista)
      setMarcas(demos)
      setNumeros(n)
      setRegra(r)
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [area, comDemo])
  useEffect(() => { setCadastros(null); setAberto(null); carregar() }, [carregar])

  const vendedores = useMemo(() => juntarVendedores(cadastros ?? [], marcas, comDemo), [cadastros, marcas, comDemo])

  if (aberto) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
        <CadastroDoVendedor
          vendedor={aberto === 'novo' ? null : aberto}
          area={area}
          regra={textoDaRegra(regra)}
          aoVoltar={() => setAberto(null)}
          aoSalvar={() => { setAberto(null); carregar() }}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Vendedores <span className="font-normal text-gray-400">· versão {DEFINICOES[area].nome}</span></h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Quem vende o {DEFINICOES[area].nome} com um código próprio e ganha comissão.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TrazerDoOutroSoftware area={area} aoTrazer={carregar} />
            <Button size="sm" onClick={() => setAberto('novo')}><Plus className="mr-1 h-4 w-4" /> Novo vendedor</Button>
          </div>
        </div>

        <RegraDaComissao key={area} area={area} />

        {erro ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-600">Não foi possível carregar os vendedores.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        ) : !cadastros ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : vendedores.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">
            <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum vendedor ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendedores.map((v) => {
              const nome = v.cadastro?.nome || v.email || 'Sem nome'
              const n = v.cadastro ? numeros[v.cadastro.id] : undefined
              return (
                <button
                  key={v.cadastro?.id ?? `demo-${v.email}`}
                  onClick={() => setAberto(v)}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-[#1D4ED8]/40 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white', cor(nome))}>{iniciais(nome)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-800">{nome}</p>
                      <p className="truncate text-[12px] text-gray-500">{v.cadastro ? v.email ?? v.cadastro.telefone ?? '—' : 'Ainda sem código de venda'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    {v.cadastro && <span className="rounded bg-violet-50 px-1.5 py-0.5 font-mono font-semibold text-violet-700">{v.cadastro.codigo}</span>}
                    {v.cadastro && !v.cadastro.ativo && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">Pausado</span>}
                    {v.demo && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700" title={v.demo.ultimaDemoEm ? `Última demonstração: ${format(new Date(v.demo.ultimaDemoEm), 'dd/MM/yyyy')}` : 'Ainda não fez demonstração'}>
                        <Presentation className="h-3 w-3" /> Demonstração
                      </span>
                    )}
                  </div>
                  {v.cadastro && (
                    <p className="mt-2 text-[12px] text-gray-500">
                      {n?.entraram ?? 0} criaram conta · {n?.usam ?? 0} {n?.usam === 1 ? 'assina' : 'assinam'} hoje
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
