import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Download, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { useArea } from '@/lib/area'
import { DEFINICOES } from '@/lib/areas'
import {
  codigoDoBanco, lerPorcentagem, nomeDoBanco, oQueFalta, situacaoDaSoma, type ParteDaDivisao, type Recebedor,
} from '@/lib/pagamentos'
import { buscarDivisao, buscarRecebedores, nomeDaContaPorEmail, removerParte, salvarParte, salvarRecebedor } from '@/lib/queries/pagamentos'
import { cn } from '@/lib/utils'

/* Admin → Pagamentos. Pedido do Raver (15/10/2026): Caio, Raver e Guilherme
   são os donos de todos os softwares (40/40/20 de padrão). Os dados de cada
   pessoa (nome, conta bancária) valem para todos os softwares; a % é do
   software na tela. Dá para pôr mais gente. A lista de repasses saiu: o
   pagamento vai ser automático (a tabela continua no banco). */

const VAZIO: Omit<Recebedor, 'id'> = {
  nome: '', email: null, cpf_cnpj: null, chave_pix: null, codigo_banco: null, banco: null, agencia: null, conta: null, tipo_conta: 'corrente', observacoes: null,
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-gray-600">{rotulo}</Label>
      {children}
    </div>
  )
}

/** Os dados da pessoa: valem para todos os softwares. */
function EditorDaPessoa({ inicial, salvando, aoSalvar, aoFechar, porcentagem }: {
  inicial: Omit<Recebedor, 'id'> & { id?: string }
  salvando: boolean
  aoSalvar: (r: Omit<Recebedor, 'id'> & { id?: string }, porcentagem: number | null) => void
  aoFechar: () => void
  /** Só ao pôr alguém NOVO na divisão: a % neste software. */
  porcentagem?: boolean
}) {
  const [r, setR] = useState(inicial)
  const [pct, setPct] = useState('')
  const [puxando, setPuxando] = useState(false)
  const set = (m: Partial<Recebedor>) => setR((x) => ({ ...x, ...m }))
  const v = (s: string | null) => s ?? ''

  const puxarDaConta = async () => {
    if (!r.email) return
    setPuxando(true)
    try {
      const nome = await nomeDaContaPorEmail(r.email)
      if (nome) {
        set({ nome })
        toast.success(`Nome puxado da conta: ${nome}.`)
      } else {
        toast.error('Nenhuma conta do EasyFeed com esse e-mail.')
      }
    } finally {
      setPuxando(false)
    }
  }

  const pctLida = porcentagem ? lerPorcentagem(pct) : null
  const pode = !!r.nome.trim() && (!porcentagem || (pct.trim() !== '' && pctLida !== null))

  return (
    <>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="rec-nome" rotulo="Nome *">
            <Input id="rec-nome" value={r.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome completo" />
          </Campo>
          <Campo id="rec-email" rotulo="E-mail">
            <div className="flex gap-1.5">
              <Input id="rec-email" type="email" value={v(r.email)} onChange={(e) => set({ email: e.target.value })} placeholder="email@exemplo.com" />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={puxarDaConta} disabled={!r.email || puxando}
                title="Puxar o nome da conta do EasyFeed com este e-mail" aria-label="Puxar o nome da conta do EasyFeed com este e-mail">
                {puxando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
            </div>
          </Campo>
          <Campo id="rec-doc" rotulo="CPF ou CNPJ">
            <Input id="rec-doc" value={v(r.cpf_cnpj)} onChange={(e) => set({ cpf_cnpj: e.target.value })} placeholder="000.000.000-00" />
          </Campo>
          <Campo id="rec-pix" rotulo="Chave Pix">
            <Input id="rec-pix" value={v(r.chave_pix)} onChange={(e) => set({ chave_pix: e.target.value })} placeholder="CPF, e-mail, telefone…" />
          </Campo>
          <Campo id="rec-cod" rotulo="Código do banco">
            <Input id="rec-cod" value={v(r.codigo_banco)} inputMode="numeric" className="font-mono" placeholder="260"
              onChange={(e) => {
                const codigo = e.target.value
                // Código conhecido: o nome do banco vem sozinho.
                set({ codigo_banco: codigo, ...(nomeDoBanco(codigo) ? { banco: nomeDoBanco(codigo) } : {}) })
              }} />
          </Campo>
          <Campo id="rec-banco" rotulo="Banco">
            <Input id="rec-banco" value={v(r.banco)} placeholder="Nubank"
              onChange={(e) => {
                const banco = e.target.value
                const codigo = codigoDoBanco(banco)
                set({ banco, ...(codigo && !r.codigo_banco ? { codigo_banco: codigo } : {}) })
              }} />
          </Campo>
          <Campo id="rec-ag" rotulo="Agência">
            <Input id="rec-ag" value={v(r.agencia)} onChange={(e) => set({ agencia: e.target.value })} placeholder="0001" />
          </Campo>
          <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
            <Campo id="rec-conta" rotulo="Conta">
              <Input id="rec-conta" value={v(r.conta)} onChange={(e) => set({ conta: e.target.value })} placeholder="12345-6" />
            </Campo>
            <Campo id="rec-tipo" rotulo="Tipo">
              <Select value={r.tipo_conta ?? 'corrente'} onValueChange={(t) => set({ tipo_conta: t as 'corrente' | 'poupanca' })}>
                <SelectTrigger id="rec-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>
        </div>
        <Campo id="rec-obs" rotulo="Observações">
          <Input id="rec-obs" value={v(r.observacoes)} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Anotações internas" />
        </Campo>
        {porcentagem && (
          <Campo id="rec-pct" rotulo="Porcentagem neste software *">
            <Input id="rec-pct" value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" placeholder="10" className="max-w-[8rem]" />
          </Campo>
        )}
        <p className="text-[12px] text-gray-500">Os dados da pessoa valem para todos os softwares. A porcentagem é de cada um.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={aoFechar}>Cancelar</Button>
        <Button onClick={() => aoSalvar(r, pctLida)} disabled={!pode || salvando}>
          {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </>
  )
}

export function PainelPagamentos() {
  const { area } = useArea()
  const nomeDaVersao = DEFINICOES[area].nome
  const { confirmar, dialogo } = useConfirmacao()
  const [partes, setPartes] = useState<ParteDaDivisao[] | null>(null)
  const [pessoas, setPessoas] = useState<Recebedor[]>([])
  const [erro, setErro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  // A % digitada antes de salvar (por linha).
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  // Diálogos: editar uma pessoa, ou pôr alguém na divisão deste software.
  const [editando, setEditando] = useState<Recebedor | null>(null)
  const [adicionando, setAdicionando] = useState<'escolher' | 'nova' | null>(null)
  const [escolhida, setEscolhida] = useState('')
  const [pctEscolhida, setPctEscolhida] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([buscarDivisao(area), buscarRecebedores()])
      setPartes(d)
      setPessoas(p)
      setRascunho({})
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [area])
  useEffect(() => { carregar() }, [carregar])

  const pessoaDe = (id: string | null) => pessoas.find((p) => p.id === id) ?? null
  // A soma com o que está digitado, para a pessoa ver antes de salvar.
  const comRascunho = useMemo(() => (partes ?? []).map((p) => {
    const lida = rascunho[p.id] != null ? lerPorcentagem(rascunho[p.id]) : null
    return lida == null ? p : { ...p, valor: lida }
  }), [partes, rascunho])
  const soma = situacaoDaSoma(comRascunho)
  const foraDaDivisao = pessoas.filter((p) => !(partes ?? []).some((d) => d.recebedor_id === p.id))
  const mudou = Object.entries(rascunho).some(([id, t]) => {
    const p = partes?.find((x) => x.id === id)
    return p && lerPorcentagem(t) !== null && lerPorcentagem(t) !== p.valor
  })
  const rascunhoInvalido = Object.values(rascunho).some((t) => lerPorcentagem(t) === null)

  const fazer = async (acao: () => Promise<void>, sucesso: string) => {
    setSalvando(true)
    try {
      await acao()
      toast.success(sucesso)
      await carregar()
      return true
    } catch {
      toast.error('Não foi possível salvar.')
      return false
    } finally {
      setSalvando(false)
    }
  }

  const salvarPorcentagens = () => fazer(async () => {
    for (const p of partes ?? []) {
      const t = rascunho[p.id]
      if (t == null) continue
      const valor = lerPorcentagem(t)
      if (valor === null || valor === p.valor || !p.recebedor_id) continue
      await salvarParte(area, { id: p.id, recebedor_id: p.recebedor_id, nome: p.nome, valor, ativo: p.ativo })
    }
  }, 'Porcentagens salvas.')

  const ligar = (p: ParteDaDivisao, ativo: boolean) => p.recebedor_id && fazer(
    () => salvarParte(area, { id: p.id, recebedor_id: p.recebedor_id!, nome: p.nome, valor: p.valor, ativo }),
    ativo ? `${p.nome} volta a receber neste software.` : `${p.nome} parou de receber neste software.`,
  )

  const tirar = async (p: ParteDaDivisao) => {
    const ok = await confirmar({
      titulo: `Tirar ${p.nome} da divisão do ${nomeDaVersao}?`,
      descricao: 'Os dados da pessoa continuam salvos e ela segue nos outros softwares.',
      confirmar: 'Tirar',
      destrutivo: true,
    })
    if (ok) await fazer(() => removerParte(p.id), `${p.nome} saiu da divisão do ${nomeDaVersao}.`)
  }

  const salvarPessoa = async (r: Omit<Recebedor, 'id'> & { id?: string }, porcentagem: number | null) => {
    const deu = await fazer(async () => {
      const id = await salvarRecebedor(r)
      if (porcentagem !== null) await salvarParte(area, { recebedor_id: id, nome: r.nome.trim(), valor: porcentagem, ativo: true })
    }, porcentagem !== null ? `${r.nome.trim()} entrou na divisão do ${nomeDaVersao}.` : 'Dados salvos.')
    if (deu) {
      setEditando(null)
      setAdicionando(null)
    }
  }

  const adicionarExistente = async () => {
    const p = pessoaDe(escolhida)
    const valor = lerPorcentagem(pctEscolhida)
    if (!p || valor === null) return
    const deu = await fazer(() => salvarParte(area, { recebedor_id: p.id, nome: p.nome, valor, ativo: true }), `${p.nome} entrou na divisão do ${nomeDaVersao}.`)
    if (deu) {
      setAdicionando(null)
      setEscolhida('')
      setPctEscolhida('')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      {dialogo}
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Divisão de receita <span className="font-normal text-gray-400">· versão {nomeDaVersao}</span></h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Quanto da receita das contas {nomeDaVersao} vai para cada pessoa. Os dados de cada pessoa valem para todos os softwares; a porcentagem é deste.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdicionando(foraDaDivisao.length ? 'escolher' : 'nova')}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar pessoa
          </Button>
        </div>

        {erro ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-600">Não foi possível carregar a divisão.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        ) : !partes ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {partes.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">Ninguém recebe neste software ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {partes.map((p) => {
                  const pessoa = pessoaDe(p.recebedor_id)
                  const falta = pessoa ? oQueFalta(pessoa) : []
                  const texto = rascunho[p.id] ?? String(p.valor).replace('.', ',')
                  const invalida = lerPorcentagem(texto) === null
                  return (
                    <li key={p.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !p.ativo && 'bg-gray-50')}>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-semibold', p.ativo ? 'text-gray-900' : 'text-gray-400')}>{p.nome}</p>
                        <p className={cn('mt-0.5 flex items-center gap-1 text-[12px]', falta.length ? 'text-amber-700' : 'text-emerald-700')}>
                          {falta.length ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {falta.length ? `Falta: ${falta.join(' e ')}` : 'Dados para pagamento completos'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <Input
                            value={texto}
                            onChange={(e) => setRascunho((r) => ({ ...r, [p.id]: e.target.value }))}
                            inputMode="decimal"
                            aria-label={`Porcentagem de ${p.nome}`}
                            className={cn('h-9 w-20 pr-6 text-right tabular-nums', invalida && 'border-rose-400')}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                        <Switch checked={p.ativo} onCheckedChange={(v) => ligar(p, v)} disabled={salvando || !p.recebedor_id} aria-label={`${p.nome} recebe neste software`} />
                        {pessoa && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando(pessoa)} aria-label={`Dados de ${p.nome}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => tirar(p)} aria-label={`Tirar ${p.nome} deste software`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
              <p className={cn('text-[13px] font-medium', soma.ok ? 'text-emerald-700' : 'text-amber-700')}>{soma.texto}</p>
              {(mudou || rascunhoInvalido) && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRascunho({})} disabled={salvando}>Descartar</Button>
                  <Button size="sm" onClick={salvarPorcentagens} disabled={salvando || rascunhoInvalido}>
                    {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar porcentagens
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {foraDaDivisao.length > 0 && partes && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700"><Users className="h-4 w-4" /> Cadastradas, mas fora deste software</p>
            <p className="mt-1 text-[12.5px] text-gray-600">{foraDaDivisao.map((p) => p.nome).join(', ')}. Use "Adicionar pessoa" para pôr alguém na divisão do {nomeDaVersao}.</p>
          </div>
        )}
      </div>

      {/* Editar os dados de uma pessoa (valem para todos os softwares) */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle>Dados de {editando?.nome}</DialogTitle></DialogHeader>
          {editando && <EditorDaPessoa key={editando.id} inicial={editando} salvando={salvando} aoSalvar={salvarPessoa} aoFechar={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>

      {/* Pôr alguém na divisão deste software */}
      <Dialog open={!!adicionando} onOpenChange={(o) => !o && setAdicionando(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle>Adicionar pessoa ao {nomeDaVersao}</DialogTitle></DialogHeader>
          {adicionando === 'escolher' ? (
            <>
              <div className="space-y-3">
                <Campo id="ad-pessoa" rotulo="Pessoa já cadastrada">
                  <Select value={escolhida} onValueChange={setEscolhida}>
                    <SelectTrigger id="ad-pessoa"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      {foraDaDivisao.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo id="ad-pct" rotulo="Porcentagem neste software">
                  <Input id="ad-pct" value={pctEscolhida} onChange={(e) => setPctEscolhida(e.target.value)} inputMode="decimal" placeholder="10" className="max-w-[8rem]" />
                </Campo>
                <button type="button" className="text-[13px] font-medium text-[#1D4ED8] hover:underline" onClick={() => setAdicionando('nova')}>
                  Ou cadastrar uma pessoa nova
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdicionando(null)}>Cancelar</Button>
                <Button onClick={adicionarExistente} disabled={!escolhida || pctEscolhida.trim() === '' || lerPorcentagem(pctEscolhida) === null || salvando}>
                  {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Adicionar
                </Button>
              </DialogFooter>
            </>
          ) : adicionando === 'nova' ? (
            <EditorDaPessoa inicial={VAZIO} porcentagem salvando={salvando} aoSalvar={salvarPessoa} aoFechar={() => setAdicionando(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

