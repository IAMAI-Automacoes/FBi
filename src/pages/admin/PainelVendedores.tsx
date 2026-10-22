import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Briefcase, Copy, Loader2, Percent, Plus, Presentation, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import {
  buscarAfiliados, buscarCodigosDeAfiliado, buscarComissoes, atualizarAfiliado, criarAfiliado, excluirAfiliado, marcarComissaoPaga, type Afiliado, type Comissao,
} from '@/lib/queries/admin'
import { buscarPrecos } from '@/lib/queries/cobranca'
import { buscarVendedores, definirVendedor } from '@/lib/queries/demo'
import {
  buscarCustosDaComissao, buscarNumerosDosAfiliados, buscarRegraDeComissao, criarCustoDaComissao, excluirCustoDaComissao, mudarCustoDaComissao,
  salvarRegraDeComissao, type NumerosDoAfiliado,
} from '@/lib/queries/indicacoes'
import {
  exemploDaRegra, juntarVendedores, mensalidadeLiquida, problemaDaRegra, reais, REGRA_PADRAO, textoDaRegra,
  type CustoDaComissao, type MarcaDeDemo, type RegraDeComissao, type Vendedor,
} from '@/lib/vendedores'
import { cn } from '@/lib/utils'

/* Admin → Vendedores, nos dois softwares (pedido do Raver, 21/10/2026).
   Afiliado e vendedor viraram uma coisa só: cada vendedor tem um código de
   venda e ganha comissão pela regra do software (botão Comissão). No Restaurante,
   o vendedor também pode ter o acesso de demonstração (código no Perfil, pula
   o WhatsApp, paga com o VENDEDOR100), marcado pelo e-mail. A conta EasyFeed
   que indica outra (padrinho) não é vendedor: o desconto dela é em Descontos.
   Fase 2 do Asaas (20/10/2026): a comissão vai por split para a conta Asaas
   do vendedor (walletId), e cada vendedor tem o desconto de quem compra com o
   código dele. A lista de comissões fica no fim da página. */

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

// ── Os nossos custos (saem antes da comissão) ────────────────────────────────

function CustosDaComissao({ area, custos, aoMudar }: { area: Area; custos: CustoDaComissao[]; aoMudar: () => void }) {
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<CustoDaComissao['tipo']>('valor')
  const [mexendo, setMexendo] = useState<string | null>(null)

  const lido = Number(valor.replace(',', '.'))
  const ok = nome.trim() !== '' && valor.trim() !== '' && Number.isFinite(lido) && lido >= 0 && (tipo === 'valor' || lido <= 100)
  const rotulo = (c: Pick<CustoDaComissao, 'tipo' | 'valor'>) =>
    c.tipo === 'porcentagem' ? `${String(c.valor).replace('.', ',')}% do recebido` : `${reais(Math.round(c.valor * 100))} por mês`

  const fazer = async (chave: string, acao: () => Promise<void>, erro: string) => {
    setMexendo(chave)
    try {
      await acao()
      aoMudar()
    } catch {
      toast.error(erro)
    } finally {
      setMexendo(null)
    }
  }
  const adicionar = () => {
    if (!ok) return
    fazer('novo', async () => {
      await criarCustoDaComissao(area, { nome: nome.trim(), tipo, valor: Math.round(lido * 100) / 100 })
      setNome('')
      setValor('')
    }, 'Não foi possível adicionar o custo.')
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <p className="text-[12.5px] font-medium text-gray-800">Nossos custos <span className="font-normal text-gray-500">· saem antes da comissão</span></p>
      {custos.length === 0 ? (
        <p className="text-[12px] text-gray-500">Nenhum custo: a comissão é sobre tudo o que o Asaas entrega.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {custos.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className={cn('min-w-0 flex-1 truncate', c.ativo ? 'text-gray-800' : 'text-gray-400 line-through')}>{c.nome}</span>
              <span className="whitespace-nowrap tabular-nums text-gray-600">{rotulo(c)}</span>
              <Switch checked={c.ativo} disabled={mexendo === c.id} aria-label={`Custo ${c.nome} ligado`}
                onCheckedChange={(v) => fazer(c.id, () => mudarCustoDaComissao(c.id, { ativo: v }), 'Não foi possível mudar o custo.')} />
              <button type="button" title="Excluir" disabled={mexendo === c.id}
                onClick={() => fazer(c.id, () => excluirCustoDaComissao(c.id), 'Não foi possível excluir o custo.')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Nome do custo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: servidor, WhatsApp, imposto" className="h-9 min-w-0 flex-1 basis-48" />
        <Input aria-label="Valor do custo" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" placeholder="0" className="h-9 w-24 text-right tabular-nums" />
        <div className="inline-flex rounded-lg bg-gray-100 p-1" role="group" aria-label="Tipo do custo">
          {([['valor', 'R$ por mês'], ['porcentagem', '% do recebido']] as const).map(([t, r]) => (
            <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
              className={cn('rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors', tipo === t ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
              {r}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={adicionar} disabled={!ok || mexendo === 'novo'}>
          {mexendo === 'novo' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Adicionar
        </Button>
      </div>
    </div>
  )
}

/** O popup do botão "Comissão": a regra do software e os nossos custos. */
function RegraDaComissao({ area, aberto, aoFechar, aoSalvar }: {
  area: Area
  aberto: boolean
  aoFechar: () => void
  aoSalvar: (r: RegraDeComissao) => void
}) {
  const [salva, setSalva] = useState<RegraDeComissao | null>(null)
  const [texto, setTexto] = useState({ entrada: '', recorrente: '', meses: '' })
  const [mensalidade, setMensalidade] = useState<number | null>(null)
  const [custos, setCustos] = useState<CustoDaComissao[]>([])
  const [salvando, setSalvando] = useState(false)

  // Lê de novo a cada abertura: o que foi digitado e não salvo some.
  useEffect(() => {
    if (!aberto) return
    setSalva(null)
    buscarRegraDeComissao(area).catch(() => ({ ...REGRA_PADRAO })).then((r) => {
      setSalva(r)
      setTexto({ entrada: String(r.entradaPct).replace('.', ','), recorrente: String(r.recorrentePct).replace('.', ','), meses: String(r.recorrenteMeses) })
    })
    buscarPrecos(area).then((p) => setMensalidade(p.find((x) => x.ciclo === 'mensal')?.total_centavos ?? null)).catch(() => setMensalidade(null))
    buscarCustosDaComissao(area).then(setCustos).catch(() => setCustos([]))
  }, [area, aberto])

  const ler = (t: string) => (t.trim() === '' ? Number.NaN : Number(t.replace(',', '.')))
  const regra: RegraDeComissao = { entradaPct: ler(texto.entrada), recorrentePct: ler(texto.recorrente), recorrenteMeses: ler(texto.meses) }
  const problema = problemaDaRegra(regra)
  const mudou = !!salva && !problema && (regra.entradaPct !== salva.entradaPct || regra.recorrentePct !== salva.recorrentePct || regra.recorrenteMeses !== salva.recorrenteMeses)
  // O exemplo usa o preço menos os custos; a taxa do Asaas ainda sai do valor de verdade.
  const liquida = mensalidade ? mensalidadeLiquida(mensalidade, custos) : null
  const exemplo = liquida != null && !problema ? exemploDaRegra(regra, liquida) : null

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarRegraDeComissao(area, regra)
      setSalva(regra)
      aoSalvar(regra)
      toast.success('Comissão salva.')
      aoFechar()
    } catch {
      toast.error('Não foi possível salvar a comissão.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !salvando && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Comissão dos vendedores</DialogTitle>
          <DialogDescription>
            Vale para todos os vendedores do {DEFINICOES[area].nome}. Sempre sobre a mensalidade líquida: o que o Asaas entrega (já sem a
            taxa dele) menos os nossos custos, abaixo. Se o indicado cancelar, a comissão acaba.
          </DialogDescription>
        </DialogHeader>
        {!salva ? <Skeleton className="h-40 w-full rounded-lg" /> : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Label htmlFor="com-entrada" className="w-52 text-[13px] text-gray-700">Na 2ª mensalidade paga</Label>
                <CampoNumero id="com-entrada" valor={texto.entrada} aoMudar={(v) => setTexto((t) => ({ ...t, entrada: v }))} sufixo="% da mensalidade líquida" />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Label htmlFor="com-recorrente" className="w-52 text-[13px] text-gray-700">Nas mensalidades seguintes</Label>
                <CampoNumero id="com-recorrente" valor={texto.recorrente} aoMudar={(v) => setTexto((t) => ({ ...t, recorrente: v }))} sufixo="% de cada líquida, por" />
                <CampoNumero id="com-meses" valor={texto.meses} aoMudar={(v) => setTexto((t) => ({ ...t, meses: v.replace(/\D/g, '') }))} sufixo="meses" largura="w-16" />
              </div>
              {problema ? (
                <p className="text-[12px] text-rose-600">{problema}</p>
              ) : exemplo && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
                  Com a mensalidade de {reais(mensalidade!)}{liquida !== mensalidade && <> menos os custos ({reais(liquida!)} líquida, antes da taxa do Asaas)</>}: {reais(exemplo.entrada)} na 2ª mensalidade
                  {regra.recorrentePct > 0 && regra.recorrenteMeses > 0 && <> + {reais(exemplo.porMes)} por mês nos {regra.recorrenteMeses} meses seguintes</>}
                  {' '}= até <b className="text-gray-800">{reais(exemplo.total)}</b> por indicado. Depois disso, a mensalidade fica toda com a empresa.
                </p>
              )}
            </div>
            <CustosDaComissao area={area} custos={custos} aoMudar={() => buscarCustosDaComissao(area).then(setCustos).catch(() => {})} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={salvando}>{mudou ? 'Cancelar' : 'Fechar'}</Button>
          {mudou && <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          asaas_wallet_id: a.asaas_wallet_id, desconto_pct: a.desconto_pct, desconto_cobrancas: a.desconto_cobrancas,
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
  wallet: string; descontoPct: string; descontoCobrancas: string
}
const FORM_VAZIO: Formulario = {
  nome: '', codigo: '', email: '', telefone: '', ativo: true, demo: false,
  cpf_cnpj: '', chave_pix: '', codigo_banco: '', banco: '', agencia: '', conta: '', tipo_conta: 'corrente', observacoes: '',
  wallet: '', descontoPct: '0', descontoCobrancas: '1',
}
const WALLET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function formDe(v: Vendedor<Afiliado> | null): Formulario {
  const a = v?.cadastro
  if (!a) return { ...FORM_VAZIO, email: v?.email ?? '', demo: !!v?.demo }
  return {
    nome: a.nome, codigo: a.codigo, email: a.email ?? '', telefone: a.telefone ?? '', ativo: a.ativo, demo: !!v.demo,
    cpf_cnpj: a.cpf_cnpj ?? '', chave_pix: a.chave_pix ?? '', codigo_banco: a.codigo_banco ?? '', banco: a.banco ?? '',
    agencia: a.agencia ?? '', conta: a.conta ?? '', tipo_conta: a.tipo_conta === 'poupanca' ? 'poupanca' : 'corrente', observacoes: a.observacoes ?? '',
    wallet: a.asaas_wallet_id ?? '', descontoPct: String(a.desconto_pct ?? 0).replace('.', ','), descontoCobrancas: String(a.desconto_cobrancas ?? 1),
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
  const walletLimpo = f.wallet.trim().toLowerCase()
  const descontoPct = Number(f.descontoPct.replace(',', '.'))
  const descontoCobrancas = Number(f.descontoCobrancas)
  const problema = !f.nome.trim() ? 'Ponha o nome.'
    : !f.codigo.trim() ? 'Ponha o código de venda.'
    : f.demo && !emailLimpo ? 'A demonstração precisa do e-mail.'
    : walletLimpo && !WALLET.test(walletLimpo) ? 'O walletId do Asaas tem o formato 00000000-0000-0000-0000-000000000000.'
    : !(f.descontoPct.trim() !== '' && descontoPct >= 0 && descontoPct <= 100) ? 'O desconto de quem compra vai de 0% a 100%.'
    : !(Number.isInteger(descontoCobrancas) && descontoCobrancas >= 1 && descontoCobrancas <= 24) ? 'O desconto vale de 1 a 24 cobranças.'
    : null

  const salvar = async () => {
    if (problema) return
    setSalvando(true)
    try {
      const vazio = (t: string) => t.trim() || null
      const dados = {
        nome: f.nome.trim(), codigo: f.codigo.trim().toUpperCase(), email: vazio(f.email)?.toLowerCase() ?? null, telefone: vazio(f.telefone),
        cpf_cnpj: vazio(f.cpf_cnpj), chave_pix: vazio(f.chave_pix), codigo_banco: vazio(f.codigo_banco), banco: vazio(f.banco),
        agencia: vazio(f.agencia), conta: vazio(f.conta), tipo_conta: f.tipo_conta, observacoes: vazio(f.observacoes), ativo: f.ativo,
        asaas_wallet_id: walletLimpo || null, desconto_pct: Math.round(descontoPct * 100) / 100, desconto_cobrancas: descontoCobrancas,
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
          <p className="mb-2 text-[11px] font-semibold uppercase text-gray-400">Desconto de quem compra com o código</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Input aria-label="Desconto (%)" value={f.descontoPct} onChange={(e) => set({ descontoPct: e.target.value.replace(/[^\d,]/g, '') })} inputMode="decimal" className="h-9 w-20 text-right tabular-nums" />
              % de desconto
            </span>
            <span className="inline-flex items-center gap-1.5">
              nas
              <Input aria-label="Quantas cobranças" value={f.descontoCobrancas} onChange={(e) => set({ descontoCobrancas: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="h-9 w-16 text-right tabular-nums" />
              {descontoCobrancas === 1 ? 'primeira cobrança' : 'primeiras cobranças'}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-gray-500">0% = sem desconto. Não soma com cupom: na compra vale o maior. No plano semestral ou anual, a cobrança é o período inteiro.</p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-gray-400">Para receber a comissão</p>
          <Campo rotulo="Carteira do Asaas (walletId)" className="mb-3">
            <Input value={f.wallet} onChange={(e) => set({ wallet: e.target.value.trim() })} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono" />
            <span className="block text-[11.5px] text-gray-500">
              Com a carteira, o Asaas manda a comissão sozinho para a conta Asaas do vendedor quando a mensalidade é paga. Peça ao vendedor o walletId da conta Asaas dele. Sem ela, a comissão fica na lista para pagar à mão.
            </span>
          </Campo>
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

// ── As comissões (split do Asaas) ────────────────────────────────────────────

const SITUACAO: Record<Comissao['status'], { rotulo: string; cor: string }> = {
  agendado: { rotulo: 'Agendada', cor: 'bg-blue-50 text-blue-700' },
  repassado: { rotulo: 'Repassada', cor: 'bg-emerald-50 text-emerald-700' },
  pago_manual: { rotulo: 'Paga à mão', cor: 'bg-emerald-50 text-emerald-700' },
  sem_carteira: { rotulo: 'Sem carteira: pagar à mão', cor: 'bg-amber-50 text-amber-700' },
  erro: { rotulo: 'Falhou: pagar à mão', cor: 'bg-rose-50 text-rose-700' },
  bloqueado: { rotulo: 'Travada no Asaas', cor: 'bg-rose-50 text-rose-700' },
  cancelado: { rotulo: 'Cancelada', cor: 'bg-gray-100 text-gray-500' },
  estornado: { rotulo: 'Estornada', cor: 'bg-gray-100 text-gray-500' },
}
const PAGAR_A_MAO = new Set<Comissao['status']>(['sem_carteira', 'erro', 'bloqueado', 'cancelado'])

function ListaDeComissoes({ area }: { area: Area }) {
  const { confirmar, dialogo } = useConfirmacao()
  const [lista, setLista] = useState<Comissao[] | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)

  const carregar = useCallback(() => {
    buscarComissoes(area).then(setLista).catch(() => setLista([]))
  }, [area])
  useEffect(() => { carregar() }, [carregar])

  const marcar = async (c: Comissao) => {
    if (!(await confirmar({
      titulo: `Marcar ${reais(c.valor_centavos)} como pago?`,
      descricao: `Use quando você já pagou ${c.vendedor} por fora (Pix ou transferência). Não manda dinheiro nenhum.`,
      confirmar: 'Marcar como paga',
    }))) return
    setMarcando(c.id)
    try {
      await marcarComissaoPaga(c.id)
      toast.success('Comissão marcada como paga.')
      carregar()
    } catch {
      toast.error('Não foi possível marcar.')
    } finally {
      setMarcando(null)
    }
  }

  const meses = (c: Comissao) => (c.mes_de == null ? '—' : c.mes_de === c.mes_ate ? `${c.mes_de}º mês` : `${c.mes_de}º a ${c.mes_ate}º mês`)
  const aPagar = (lista ?? []).filter((c) => c.status === 'sem_carteira' || c.status === 'erro' || c.status === 'bloqueado')

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      {dialogo}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><Wallet className="h-4 w-4 text-gray-400" /> Comissões</h3>
          <p className="text-[12px] text-gray-500">Cada mensalidade paga por um indicado de vendedor ou de influenciador. Com a carteira do Asaas, o repasse é automático.</p>
        </div>
        {aPagar.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-700">
            {aPagar.length} para pagar à mão · {reais(aPagar.reduce((s, c) => s + c.valor_centavos, 0))}
          </span>
        )}
      </div>
      {!lista ? (
        <div className="p-4"><Skeleton className="h-24 w-full rounded-lg" /></div>
      ) : lista.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-gray-500">Nenhuma comissão ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-gray-50 text-[11.5px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 font-medium">Indicado</th>
                <th className="px-4 py-2 font-medium">Cobre</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">{format(new Date(c.criado_em), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {c.vendedor}
                    {c.influenciador && <span className="ml-1.5 rounded bg-pink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-pink-700">Influenciador</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{c.indicado}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">{meses(c)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-gray-800">{reais(c.valor_centavos)}</td>
                  <td className="px-4 py-2">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', SITUACAO[c.status].cor)} title={c.erro ?? undefined}>
                      {SITUACAO[c.status].rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {PAGAR_A_MAO.has(c.status) && c.valor_centavos > 0 && (
                      <Button size="sm" variant="outline" disabled={marcando === c.id} onClick={() => marcar(c)}>
                        {marcando === c.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Paguei
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  const [comissaoAberta, setComissaoAberta] = useState(false)
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
  useEffect(() => { setCadastros(null); setAberto(null); setComissaoAberta(false); carregar() }, [carregar])

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
            <p className="mt-0.5 text-[12px] text-gray-400">Comissão: {textoDaRegra(regra)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setComissaoAberta(true)}><Percent className="mr-1 h-4 w-4" /> Comissão</Button>
            <TrazerDoOutroSoftware area={area} aoTrazer={carregar} />
            <Button size="sm" onClick={() => setAberto('novo')}><Plus className="mr-1 h-4 w-4" /> Novo vendedor</Button>
          </div>
        </div>

        <RegraDaComissao area={area} aberto={comissaoAberta} aoFechar={() => setComissaoAberta(false)} aoSalvar={setRegra} />

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

        <ListaDeComissoes key={`comissoes-${area}`} area={area} />
      </div>
    </div>
  )
}
