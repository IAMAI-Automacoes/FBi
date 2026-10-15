import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Copy, Loader2, Percent, RotateCcw, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DEFINICOES, type Area } from '@/lib/areas'
import { codigoParaCopia, ROTULO_PREMIO_ADMIN, textoDaPorcentagem, type StatusPremio } from '@/lib/indicacoes'
import { lerPorcentagem } from '@/lib/pagamentos'
import { buscarAfiliados, buscarCodigosDeAfiliado, criarAfiliado, type Afiliado } from '@/lib/queries/admin'
import { mudarPremioDaIndicacao, salvarPorcentagemPadrao, type NumerosDoAfiliado } from '@/lib/queries/indicacoes'
import { cn } from '@/lib/utils'

/* Admin → Afiliados, por software (decisões do Raver, 15/10/2026): a
   porcentagem padrão de cada software (vem em todo afiliado novo), trazer
   afiliados do outro software e, para quem é conta EasyFeed indicando, os
   descontos já liberados para aplicar à mão. */

const COR: Record<StatusPremio, string> = {
  pendente: 'bg-amber-50 text-amber-700',
  aplicado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

/** A porcentagem que já vem em todo afiliado novo deste software. */
export function PorcentagemPadrao({ area, valor, aoSalvar }: { area: Area; valor: number | null; aoSalvar: (n: number) => void }) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (valor != null) setTexto(String(valor).replace('.', ',')) }, [valor])
  const lida = lerPorcentagem(texto)
  const mudou = valor != null && lida !== null && lida !== valor

  const salvar = async () => {
    if (lida === null) return
    setSalvando(true)
    try {
      await salvarPorcentagemPadrao(area, lida)
      aoSalvar(lida)
      toast.success(`Porcentagem padrão do ${DEFINICOES[area].nome}: ${textoDaPorcentagem(lida)}.`)
    } catch {
      toast.error('Não foi possível salvar a porcentagem padrão.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <Percent className="h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">Porcentagem padrão</p>
        <p className="text-[12px] leading-snug text-gray-500">
          Já vem em todo afiliado novo (dá para mudar em cada um). Para quem é conta EasyFeed, é o desconto na própria mensalidade por indicado.
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" aria-label="Porcentagem padrão"
            className={cn('h-9 w-20 pr-6 text-right tabular-nums', lida === null && 'border-rose-400')} disabled={valor == null} />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
        </div>
        {mudou && (
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Salvar
          </Button>
        )}
      </div>
    </div>
  )
}

/** Copia afiliados (de fora) do outro software para este, com código novo. */
export function TrazerDoOutroSoftware({ area, aoTrazer }: { area: Area; aoTrazer: () => void }) {
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
      // Só os de fora: a conta EasyFeed que indica é do software da conta dela.
      setLista((await buscarAfiliados(outra)).filter((a) => a.restaurante_id == null))
    } catch {
      toast.error('Não foi possível carregar os afiliados do outro software.')
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
          // A conta do Stripe Connect não vem junto: o afiliado conecta de novo neste software.
          stripe_account_id: null, cpf_cnpj: a.cpf_cnpj, chave_pix: a.chave_pix, codigo_banco: a.codigo_banco, banco: a.banco,
          agencia: a.agencia, conta: a.conta, tipo_conta: a.tipo_conta, observacoes: a.observacoes, ativo: a.ativo,
        })
      }
      toast.success(marcados.size === 1 ? '1 afiliado trazido, com código novo.' : `${marcados.size} afiliados trazidos, com código novo.`)
      setAberto(false)
      aoTrazer()
    } catch {
      toast.error('Não foi possível trazer todos. Confira a lista e tente de novo.')
      aoTrazer()
    } finally {
      setTrazendo(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} className="shrink-0"><Copy className="mr-1 h-4 w-4" /> Trazer do {DEFINICOES[outra].nome}</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>Trazer afiliados do {DEFINICOES[outra].nome}</DialogTitle></DialogHeader>
          <p className="text-[13px] text-gray-600">
            A cópia ganha um código novo (o código é único em todos os softwares) e fica separada: mudar uma não muda a outra.
          </p>
          {!lista ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : lista.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">O {DEFINICOES[outra].nome} não tem afiliados de fora.</p>
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
                        <span className="block truncate text-[12px] text-gray-500">{a.codigo} · {a.comissao_tipo === 'porcentagem' ? textoDaPorcentagem(a.comissao_valor) : `R$ ${Number(a.comissao_valor).toFixed(2)}`}</span>
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

/** Quem é conta EasyFeed indicando: o que trouxe e os descontos para aplicar à mão. */
export function DescontosDeQuemIndica({ afiliado, numeros, aoFechar, aoMudar }: {
  afiliado: Afiliado | null
  numeros: NumerosDoAfiliado | undefined
  aoFechar: () => void
  aoMudar: () => void
}) {
  const [mexendo, setMexendo] = useState<string | null>(null)
  const quando = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })

  const mudar = async (id: string, status: StatusPremio) => {
    setMexendo(id)
    try {
      await mudarPremioDaIndicacao(id, status)
      aoMudar()
    } catch {
      toast.error('Não foi possível mudar a situação do desconto.')
    } finally {
      setMexendo(null)
    }
  }

  return (
    <Dialog open={!!afiliado} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>{afiliado?.nome}</DialogTitle></DialogHeader>
        {afiliado && (
          <div className="space-y-4">
            <p className="text-[13px] text-gray-600">
              Conta EasyFeed que indica. Ganha {textoDaPorcentagem(afiliado.comissao_valor)} de desconto na própria mensalidade por indicado que pagar o 2º mês.
              Código <span className="font-mono font-semibold">{afiliado.codigo}</span>.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['criaram a conta', numeros?.entraram ?? 0], ['assinaram', numeros?.assinaram ?? 0], ['usam hoje', numeros?.usam ?? 0]].map(([t, v]) => (
                <div key={String(t)} className="rounded-lg border border-gray-200 px-2 py-2">
                  <p className="text-xl font-bold tabular-nums text-gray-900">{v}</p>
                  <p className="text-[11.5px] text-gray-500">{t}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-gray-700">Descontos liberados</p>
              {!numeros?.premios.length ? (
                <p className="rounded-lg bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">Nenhum ainda: sai quando um indicado pagar o 2º mês.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {numeros.premios.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{p.beneficio}</p>
                        <p className="text-[11.5px] text-gray-500">Por {p.indicado} · liberado em {quando(p.criado_em)}{p.aplicado_em ? ` · aplicado em ${quando(p.aplicado_em)}` : ''}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', COR[p.status])}>{ROTULO_PREMIO_ADMIN[p.status]}</span>
                      {mexendo === p.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : p.status === 'pendente' ? (
                        <>
                          <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => mudar(p.id, 'aplicado')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aplicado</Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-500" onClick={() => mudar(p.id, 'cancelado')} aria-label="Cancelar este desconto"><X className="h-4 w-4" /></Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => mudar(p.id, 'pendente')}><RotateCcw className="mr-1 h-3.5 w-3.5" /> {p.status === 'aplicado' ? 'Desfazer' : 'Reabrir'}</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11.5px] text-gray-500">Até o pagamento novo (Asaas), o desconto é dado à mão na cobrança e marcado aqui.</p>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={aoFechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
