import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { useArea } from '@/lib/area'
import { DEFINICOES } from '@/lib/areas'
import { descricaoDoCupom, MAX_USOS_ADMIN, problemaDoCupom, RECUSA_DO_CUPOM, ROTULO_TIPO_DE_CONTA, TIPOS_DE_CONTA, type TipoDeConta } from '@/lib/cupons'
import { atualizarCupon, buscarCupons, criarCupon, excluirCupon, type Cupon, type CuponInput } from '@/lib/queries/admin'
import { cn } from '@/lib/utils'
import { CrudTable, Td, Th } from './tabela'

/* Admin → Cupons, do software na tela (decisões do Raver, 15/10/2026): cada
   cupom é de um software; dá acesso (dias ou sem fim) e/ou um desconto em % ou
   R$ guardado para a cobrança (entra na 1ª cobrança do Asaas); e escolhe o tipo de
   conta que cria. O de admin sempre tem limite de usos e validade. */

type Desconto = 'nenhum' | 'porcentagem' | 'valor'
interface Formulario {
  cupom: string
  dias: string
  usos: string
  validade: string
  ativo: boolean
  somenteVendedores: boolean
  tipoConta: TipoDeConta
  desconto: Desconto
  valorDesconto: string
}
const VAZIO: Formulario = { cupom: '', dias: '', usos: '', validade: '', ativo: true, somenteVendedores: false, tipoConta: 'normal', desconto: 'nenhum', valorDesconto: '' }

const numeroOuNulo = (t: string) => (t.trim() === '' ? null : Number(t.trim().replace(',', '.')))

function paraFormulario(c: Cupon): Formulario {
  return {
    cupom: c.cupom,
    dias: c.dias_validade != null ? String(c.dias_validade) : '',
    usos: c.vezes_uso_maximo != null ? String(c.vezes_uso_maximo) : '',
    validade: c.data_expiracao ?? '',
    ativo: c.ativo,
    somenteVendedores: c.somente_vendedores,
    tipoConta: c.tipo_conta,
    desconto: c.porcentagem_desconto != null ? 'porcentagem' : c.valor_desconto != null ? 'valor' : 'nenhum',
    valorDesconto: String(c.porcentagem_desconto ?? c.valor_desconto ?? ''),
  }
}

function paraGravar(f: Formulario, area: 'restaurante' | 'rh'): CuponInput {
  const valor = numeroOuNulo(f.valorDesconto)
  return {
    cupom: f.cupom.trim().toUpperCase(),
    dias_validade: numeroOuNulo(f.dias),
    vezes_uso_maximo: numeroOuNulo(f.usos),
    ativo: f.ativo,
    data_expiracao: f.validade || null,
    somente_vendedores: f.somenteVendedores,
    area,
    tipo_conta: f.tipoConta,
    porcentagem_desconto: f.desconto === 'porcentagem' ? valor : null,
    valor_desconto: f.desconto === 'valor' ? valor : null,
  }
}

const COR_TIPO: Record<TipoDeConta, string> = {
  normal: 'bg-gray-100 text-gray-600',
  vendedor: 'bg-violet-100 text-violet-700',
  admin: 'bg-amber-100 text-amber-800',
}

function Escolha<T extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: T; opcoes: { v: T; texto: string }[]; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => aoMudar(o.v)}
          className={cn('rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
            valor === o.v ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function PainelCupons() {
  const { area } = useArea()
  const nomeDaVersao = DEFINICOES[area].nome
  const { confirmar, dialogo } = useConfirmacao()
  const [cupons, setCupons] = useState<Cupon[] | null>(null)
  const [erro, setErro] = useState(false)
  const [aberto, setAberto] = useState<{ id: number | null } | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setCupons(await buscarCupons(area))
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [area])
  useEffect(() => { carregar() }, [carregar])

  const set = (m: Partial<Formulario>) => setForm((f) => ({ ...f, ...m }))
  const gravar = paraGravar(form, area)
  const problema = problemaDoCupom({ ...gravar, cupom: gravar.cupom })

  const salvar = async () => {
    if (problema) return
    setSalvando(true)
    try {
      if (aberto?.id) await atualizarCupon(aberto.id, gravar)
      else await criarCupon(gravar)
      toast.success(aberto?.id ? 'Cupom salvo.' : 'Cupom criado.')
      setAberto(null)
      await carregar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      toast.error(/duplicate|unique/i.test(msg) ? 'Já existe um cupom com esse código (em algum dos softwares).' : 'Não foi possível salvar o cupom.')
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async (c: Cupon) => {
    const ok = await confirmar({ titulo: `Apagar o cupom ${c.cupom}?`, descricao: 'Quem já usou continua com o que ganhou.', confirmar: 'Apagar', destrutivo: true })
    if (!ok) return
    try {
      await excluirCupon(c.id)
      await carregar()
    } catch {
      toast.error('Não foi possível apagar o cupom.')
    }
  }

  const usos = (c: Cupon) => (c.vezes_uso_maximo == null ? `${c.vezes_usado} / ilimitado` : `${c.vezes_usado} / ${c.vezes_uso_maximo}`)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      {dialogo}
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 h-5 w-5 text-gray-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-800">Cupons <span className="font-normal text-gray-400">· versão {nomeDaVersao}</span></h2>
              <p className="mt-0.5 text-[12.5px] text-gray-500">Só contas {nomeDaVersao} resgatam estes cupons. O desconto fica guardado e entra na cobrança quando o novo pagamento chegar.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => { setForm(VAZIO); setAberto({ id: null }) }}><Plus className="mr-1 h-4 w-4" /> Novo cupom</Button>
        </div>

        {erro ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-600">Não foi possível carregar os cupons.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        ) : !cupons ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : cupons.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-14 text-center text-gray-400">
            <Tag className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhum cupom do {nomeDaVersao} ainda.</p>
          </div>
        ) : (
          <CrudTable>
            <thead><tr>{['Código', 'Dá', 'Conta', 'Resgatável até', 'Usos', 'Ativo', ''].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {cupons.map((c) => (
                <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <Td>
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-gray-800">{c.cupom}</span>
                    {c.somente_vendedores && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-violet-700">SÓ VENDEDORES</span>}
                  </Td>
                  <Td className="font-semibold text-emerald-700">{descricaoDoCupom(c)}</Td>
                  <Td><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_TIPO[c.tipo_conta])}>{ROTULO_TIPO_DE_CONTA[c.tipo_conta]}</span></Td>
                  <Td className="text-[13px] text-gray-600">{c.data_expiracao ? new Date(c.data_expiracao + 'T12:00:00').toLocaleDateString('pt-BR') : <span className="text-gray-400">Sem prazo</span>}</Td>
                  <Td className="whitespace-nowrap text-[13px] tabular-nums text-gray-600">{usos(c)}</Td>
                  <Td><span className={cn('text-[12px] font-medium', c.ativo ? 'text-emerald-700' : 'text-gray-400')}>{c.ativo ? 'Sim' : 'Não'}</span></Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setForm(paraFormulario(c)); setAberto({ id: c.id }) }} aria-label={`Editar ${c.cupom}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => apagar(c)} aria-label={`Apagar ${c.cupom}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CrudTable>
        )}
      </div>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>{aberto?.id ? 'Editar cupom' : 'Novo cupom'} · {nomeDaVersao}</DialogTitle></DialogHeader>
          <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label htmlFor="cp-codigo" className="text-[12px] text-gray-600">Código *</Label>
              <Input id="cp-codigo" value={form.cupom} onChange={(e) => set({ cupom: e.target.value.toUpperCase() })} placeholder="DESC20" className="font-mono" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cp-dias" className="text-[12px] text-gray-600">Dias de acesso grátis</Label>
              <Input id="cp-dias" value={form.dias} onChange={(e) => set({ dias: e.target.value })} inputMode="numeric" placeholder={form.desconto === 'nenhum' ? 'Vazio = sem fim' : 'Vazio = nenhum'} className="max-w-[12rem]" />
              <p className="text-[11.5px] text-gray-500">
                {form.desconto === 'nenhum'
                  ? 'Sem desconto, o cupom libera o acesso: pelos dias daqui, ou sem fim se ficar vazio.'
                  : 'Com desconto, o acesso só é liberado se houver dias aqui; senão, o cupom só guarda o desconto.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-gray-600">Desconto na mensalidade</p>
              <Escolha rotulo="Desconto" valor={form.desconto} aoMudar={(v) => set({ desconto: v })}
                opcoes={[{ v: 'nenhum', texto: 'Sem desconto' }, { v: 'porcentagem', texto: 'Em %' }, { v: 'valor', texto: 'Em R$' }]} />
              {form.desconto !== 'nenhum' && (
                <div className="flex items-center gap-2 pt-1">
                  <Input value={form.valorDesconto} onChange={(e) => set({ valorDesconto: e.target.value })} inputMode="decimal" aria-label="Valor do desconto"
                    placeholder={form.desconto === 'porcentagem' ? '20' : '50,00'} className="max-w-[8rem]" />
                  <span className="text-sm text-gray-500">{form.desconto === 'porcentagem' ? '%' : 'reais por mensalidade'}</span>
                </div>
              )}
              {form.desconto !== 'nenhum' && <p className="text-[11.5px] text-gray-500">Fica guardado na conta de quem usar e entra sozinho na 1ª cobrança do Asaas.</p>}
            </div>

            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-gray-600">A conta criada por este cupom</p>
              <Escolha rotulo="Tipo de conta" valor={form.tipoConta} aoMudar={(v) => set({ tipoConta: v })}
                opcoes={TIPOS_DE_CONTA.map((t) => ({ v: t, texto: t === 'normal' ? 'Normal' : t === 'vendedor' ? 'Vendedor' : 'Admin' }))} />
              {form.tipoConta === 'admin' && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Quem usar vira ADMIN da plataforma: vê todas as contas, os pagamentos e entra na conta de qualquer cliente. Por isso precisa de número de usos (até {MAX_USOS_ADMIN}) e data de validade.
                </p>
              )}
              {form.tipoConta === 'vendedor' && <p className="text-[11.5px] text-gray-500">Quem usar vira vendedor: ganha o código da demonstração e pode pular a conexão do WhatsApp.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cp-usos" className="text-[12px] text-gray-600">Usos máximos{form.tipoConta === 'admin' ? ' *' : ''}</Label>
                <Input id="cp-usos" value={form.usos} onChange={(e) => set({ usos: e.target.value })} inputMode="numeric" placeholder="Vazio = ilimitado" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-validade" className="text-[12px] text-gray-600">Resgatável até{form.tipoConta === 'admin' ? ' *' : ''}</Label>
                <Input id="cp-validade" type="date" value={form.validade} onChange={(e) => set({ validade: e.target.value })} />
              </div>
            </div>

            {/* O "só quem já é vendedor" saiu daqui (pedido do Raver, 21/10/2026):
                cupom novo nasce sem a trava, e o que já tinha continua igual. */}
            <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
              Ativo
              <Switch checked={form.ativo} onCheckedChange={(v) => set({ ativo: v })} />
            </label>

            {problema && form.cupom.trim() && <p className="text-[12.5px] text-rose-600">{RECUSA_DO_CUPOM[problema]}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!!problema || salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
