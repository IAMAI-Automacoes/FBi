import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Copy, Landmark, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { useArea } from '@/lib/area'
import { DEFINICOES } from '@/lib/areas'
import {
  CAMPOS_DA_CONTA, codigoDoBanco, contaPreenchida, nomeDoBanco, oQueFalta, trazerConta, type ContaDaReceita,
} from '@/lib/pagamentos'
import { buscarContaDaReceita, salvarContaDaReceita } from '@/lib/queries/pagamentos'
import { cn } from '@/lib/utils'

/* Admin → Receita (pedido do Raver, 21/10/2026): sem divisão entre pessoas.
   Cada software tem uma conta onde cai o dinheiro da empresa, e dá para trazer
   a do outro software. */

function Campo({ id, rotulo, children, className }: { id: string; rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className="text-[12px] text-gray-600">{rotulo}</Label>
      {children}
    </div>
  )
}

const igual = (a: ContaDaReceita, b: ContaDaReceita) => CAMPOS_DA_CONTA.every((c) => (a[c] ?? '') === (b[c] ?? ''))

export function PainelReceita() {
  const { area } = useArea()
  const outra = area === 'rh' ? 'restaurante' : 'rh'
  const nome = DEFINICOES[area].nome
  const { confirmar, dialogo } = useConfirmacao()
  const [salva, setSalva] = useState<ContaDaReceita | null>(null)
  const [conta, setConta] = useState<ContaDaReceita | null>(null)
  const [erro, setErro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [trazendo, setTrazendo] = useState(false)

  const carregar = useCallback(async () => {
    setSalva(null)
    setConta(null)
    try {
      const c = await buscarContaDaReceita(area)
      setSalva(c)
      setConta(c)
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [area])
  useEffect(() => { carregar() }, [carregar])

  const set = (m: Partial<ContaDaReceita>) => setConta((c) => (c ? { ...c, ...m } : c))
  const v = (s: string | null) => s ?? ''
  const mudou = !!conta && !!salva && !igual(conta, salva)
  const falta = conta ? oQueFalta(conta) : []

  const salvar = async () => {
    if (!conta) return
    setSalvando(true)
    try {
      await salvarContaDaReceita(conta)
      setSalva(conta)
      toast.success(`Conta do ${nome} salva.`)
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const trazer = async () => {
    setTrazendo(true)
    try {
      const daOutra = await buscarContaDaReceita(outra)
      if (!contaPreenchida(daOutra)) {
        toast.error(`O ${DEFINICOES[outra].nome} ainda não tem conta cadastrada.`)
        return
      }
      if (contaPreenchida(conta) && !(await confirmar({
        titulo: `Trazer a conta do ${DEFINICOES[outra].nome}?`,
        descricao: `Os dados de agora do ${nome} são trocados pelos do ${DEFINICOES[outra].nome}. Nada muda até você salvar.`,
        confirmar: 'Trazer',
      }))) return
      setConta(trazerConta(daOutra, area))
      toast.success(`Dados do ${DEFINICOES[outra].nome} trazidos. Confira e salve.`)
    } catch {
      toast.error(`Não foi possível ler a conta do ${DEFINICOES[outra].nome}.`)
    } finally {
      setTrazendo(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      {dialogo}
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Receita <span className="font-normal text-gray-400">· versão {nome}</span></h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">A conta da empresa onde cai o dinheiro das assinaturas do {nome}.</p>
          </div>
          <Button size="sm" variant="outline" onClick={trazer} disabled={!conta || trazendo}>
            {trazendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
            Trazer do {DEFINICOES[outra].nome}
          </Button>
        </div>

        {erro ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-gray-600">Não foi possível carregar a conta.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        ) : !conta ? (
          <Skeleton className="h-80 w-full rounded-xl" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className={cn('flex items-center gap-2 border-b px-4 py-3 text-[13px] font-medium', falta.length ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800')}>
              {falta.length ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {falta.length ? `Falta ${falta.join(' e ')}.` : 'Dados completos para receber.'}
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="rec-titular" rotulo="Titular da conta" className="sm:col-span-2">
                  <Input id="rec-titular" value={v(conta.titular)} onChange={(e) => set({ titular: e.target.value })} placeholder="Razão social ou nome" />
                </Campo>
                <Campo id="rec-doc" rotulo="CPF ou CNPJ">
                  <Input id="rec-doc" value={v(conta.cpf_cnpj)} onChange={(e) => set({ cpf_cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </Campo>
                <Campo id="rec-pix" rotulo="Chave Pix">
                  <Input id="rec-pix" value={v(conta.chave_pix)} onChange={(e) => set({ chave_pix: e.target.value })} placeholder="CNPJ, e-mail, telefone…" />
                </Campo>
                <Campo id="rec-cod" rotulo="Código do banco">
                  <Input id="rec-cod" value={v(conta.codigo_banco)} inputMode="numeric" className="font-mono" placeholder="260"
                    onChange={(e) => {
                      const codigo = e.target.value
                      // Código conhecido: o nome do banco vem sozinho.
                      set({ codigo_banco: codigo, ...(nomeDoBanco(codigo) ? { banco: nomeDoBanco(codigo) } : {}) })
                    }} />
                </Campo>
                <Campo id="rec-banco" rotulo="Banco">
                  <Input id="rec-banco" value={v(conta.banco)} placeholder="Nubank"
                    onChange={(e) => {
                      const banco = e.target.value
                      const codigo = codigoDoBanco(banco)
                      set({ banco, ...(codigo && !conta.codigo_banco ? { codigo_banco: codigo } : {}) })
                    }} />
                </Campo>
                <Campo id="rec-ag" rotulo="Agência">
                  <Input id="rec-ag" value={v(conta.agencia)} onChange={(e) => set({ agencia: e.target.value })} placeholder="0001" />
                </Campo>
                <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                  <Campo id="rec-conta" rotulo="Conta">
                    <Input id="rec-conta" value={v(conta.conta)} onChange={(e) => set({ conta: e.target.value })} placeholder="12345-6" />
                  </Campo>
                  <Campo id="rec-tipo" rotulo="Tipo">
                    <Select value={conta.tipo_conta ?? 'corrente'} onValueChange={(t) => set({ tipo_conta: t as 'corrente' | 'poupanca' })}>
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
                <Input id="rec-obs" value={v(conta.observacoes)} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Anotações internas" />
              </Campo>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[12px] text-gray-500"><Landmark className="h-3.5 w-3.5" /> Vale só para o {nome}.</p>
              <div className="flex gap-2">
                {mudou && <Button variant="ghost" size="sm" onClick={() => setConta(salva)} disabled={salvando}>Descartar</Button>}
                <Button size="sm" onClick={salvar} disabled={!mudou || salvando}>
                  {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
