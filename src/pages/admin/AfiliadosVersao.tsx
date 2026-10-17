import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Copy, Gift, Loader2, Percent, Plus, RotateCcw, Trash2, X } from 'lucide-react'
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
import {
  buscarNiveis, mudarPremioDaIndicacao, removerNivel, salvarNivel, salvarPorcentagemPadrao, type NivelDaEscada, type NumerosDoAfiliado,
} from '@/lib/queries/indicacoes'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { cn } from '@/lib/utils'

/* Admin → Afiliados, por software (decisões do Raver, 15 e 17/10/2026): a
   porcentagem padrão de cada software (a comissão do afiliado de fora), trazer
   afiliados do outro software, a escada de benefícios de quem é conta EasyFeed
   indicando e, para cada uma, os benefícios já liberados para aplicar à mão. */

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
          Já vem em todo afiliado novo (dá para mudar em cada um): é a comissão do afiliado de fora. Conta EasyFeed que indica ganha pela escada de benefícios.
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

/** Um nível da escada: quantas indicações e o benefício. Salva ao sair do campo. */
function NivelEditavel({ area, n, ocupados, aoSalvar, aoRemover }: {
  area: Area
  n: NivelDaEscada
  /** Os números já usados por outros níveis. */
  ocupados: ReadonlySet<number>
  aoSalvar: () => void
  aoRemover: () => void
}) {
  const [qtd, setQtd] = useState(String(n.indicacoes))
  const [texto, setTexto] = useState(n.beneficio)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setQtd(String(n.indicacoes)); setTexto(n.beneficio) }, [n.indicacoes, n.beneficio])

  const salvar = async () => {
    const q = Number.parseInt(qtd, 10)
    if (!Number.isInteger(q) || q < 1 || q > 1000) {
      setQtd(String(n.indicacoes))
      toast.error('O número de indicações vai de 1 a 1000.')
      return
    }
    if (!texto.trim()) { setTexto(n.beneficio); return }
    if (q === n.indicacoes && texto.trim() === n.beneficio) return
    if (q !== n.indicacoes && ocupados.has(q)) {
      setQtd(String(n.indicacoes))
      toast.error(`Já existe um nível com ${q} indicações.`)
      return
    }
    setSalvando(true)
    try {
      await salvarNivel(area, { indicacoes: q, beneficio: texto }, n.indicacoes)
      aoSalvar()
    } catch {
      toast.error('Não foi possível salvar o nível.')
    } finally {
      setSalvando(false)
    }
  }
  const aoSair = () => { void salvar() }
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }

  return (
    // No celular o texto do benefício desce para uma linha própria.
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-0 sm:flex-nowrap">
      <Input value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} onBlur={aoSair} onKeyDown={enter} inputMode="numeric"
        aria-label="Quantas indicações" className="h-9 w-16 text-right tabular-nums" disabled={salvando} />
      <span className="w-[4.5rem] shrink-0 text-[12px] text-gray-500">{Number(qtd) === 1 ? 'indicação' : 'indicações'}</span>
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={aoSair} onKeyDown={enter} maxLength={200}
        aria-label="O benefício" className="order-last h-9 min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1" disabled={salvando} />
      {salvando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" /> : (
        <button
          type="button"
          onClick={aoRemover}
          aria-label={`Tirar o nível de ${n.indicacoes} indicações`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/**
 * A escada de benefícios de quem é conta EasyFeed indicando (por software):
 * "com N indicações, tal benefício". A indicação conta quando o indicado paga
 * o 2º mês; ao alcançar um nível, o benefício nasce para aplicar à mão.
 */
export function EscadaDeIndicacao({ area, aoMudar }: { area: Area; aoMudar?: () => void }) {
  const { confirmar, dialogo } = useConfirmacao()
  const [niveis, setNiveis] = useState<NivelDaEscada[] | null>(null)
  const carregar = useCallback(async () => {
    try {
      setNiveis(await buscarNiveis(area))
    } catch {
      setNiveis([])
      toast.error('Não foi possível carregar a escada de benefícios.')
    }
  }, [area])
  useEffect(() => { void carregar() }, [carregar])

  const depois = async () => { await carregar(); aoMudar?.() }
  const adicionar = async () => {
    const usados = new Set((niveis ?? []).map((n) => n.indicacoes))
    let proximo = (niveis?.at(-1)?.indicacoes ?? 0) + 1
    while (usados.has(proximo)) proximo++
    try {
      await salvarNivel(area, { indicacoes: proximo, beneficio: 'Novo benefício (edite o texto)' })
      await depois()
    } catch {
      toast.error('Não foi possível criar o nível.')
    }
  }
  const remover = async (n: NivelDaEscada) => {
    const ok = await confirmar({
      titulo: `Tirar o nível de ${n.indicacoes} indicações?`,
      descricao: 'Quem já ganhou esse benefício continua com ele. Daqui para frente, ninguém mais ganha.',
      confirmar: 'Tirar nível',
      destrutivo: true,
    })
    if (!ok) return
    try {
      await removerNivel(area, n.indicacoes)
      await depois()
    } catch {
      toast.error('Não foi possível tirar o nível.')
    }
  }

  const ocupados = (n: NivelDaEscada) => new Set((niveis ?? []).filter((x) => x.indicacoes !== n.indicacoes).map((x) => x.indicacoes))

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {dialogo}
      <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">Benefícios de quem indica</p>
          <p className="text-[12px] leading-snug text-gray-500">
            Para conta EasyFeed que indica. A indicação conta quando o indicado paga o 2º mês. Ao chegar no número, o benefício aparece para aplicar à mão (em cada conta, abaixo). Mudar o texto não muda o que já foi ganho.
          </p>
        </div>
      </div>
      {niveis === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : niveis.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-gray-500">Nenhum nível ainda.</p>
      ) : (
        niveis.map((n) => (
          <NivelEditavel key={n.indicacoes} area={area} n={n} ocupados={ocupados(n)} aoSalvar={() => { void depois() }} aoRemover={() => { void remover(n) }} />
        ))
      )}
      <div className="border-t border-gray-100 px-4 py-2.5">
        <button type="button" onClick={() => { void adicionar() }} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1D4ED8] hover:underline">
          <Plus className="h-3.5 w-3.5" /> Nível
        </button>
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
          cpf_cnpj: a.cpf_cnpj, chave_pix: a.chave_pix, codigo_banco: a.codigo_banco, banco: a.banco,
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
              Conta EasyFeed que indica: ganha pela escada de benefícios do software. Código <span className="font-mono font-semibold">{afiliado.codigo}</span>.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['criaram a conta', numeros?.entraram ?? 0], ['assinaram', numeros?.assinaram ?? 0], ['já contam (2 meses)', numeros?.contam ?? 0]].map(([t, v]) => (
                <div key={String(t)} className="rounded-lg border border-gray-200 px-2 py-2">
                  <p className="text-xl font-bold tabular-nums text-gray-900">{v}</p>
                  <p className="text-[11.5px] text-gray-500">{t}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-gray-700">Benefícios liberados</p>
              {!numeros?.premios.length ? (
                <p className="rounded-lg bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">Nenhum ainda: sai quando a conta alcança um nível da escada.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {numeros.premios.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{p.beneficio}</p>
                        <p className="text-[11.5px] text-gray-500">
                          {p.nivel != null ? `Ao chegar a ${p.nivel} indicaç${p.nivel === 1 ? 'ão' : 'ões'}` : `Por ${p.indicado ?? 'indicado'}`} · liberado em {quando(p.criado_em)}{p.aplicado_em ? ` · aplicado em ${quando(p.aplicado_em)}` : ''}
                        </p>
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
              <p className="mt-1.5 text-[11.5px] text-gray-500">Por enquanto o benefício é dado à mão na cobrança e marcado aqui.</p>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={aoFechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
