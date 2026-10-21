import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Gift, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  linkDeIndicacao, mesesNaFila, ROTULO_PREMIO, type BonusDaIndicacao, type MinhaIndicacao, type NumerosDaIndicacao,
} from '@/lib/indicacoes'
import { buscarMinhaIndicacao } from '@/lib/queries/indicacoes'

/* Descontos → Indicações, nos dois softwares: o link de criação de conta com o
   código de quem indica, os números de quem entrou por ele e os meses grátis
   (regra do Raver, 17/10/2026: cada indicado que paga o 2º mês dá 1
   mensalidade grátis, numa fila; a cobrança usa um por mês, só se aquele
   indicado segue assinando). A página não mostra quem foi indicado. Por
   enquanto só o admin vê (menu, rota e indicacao_liberada). Enxuta de
   propósito (pedido do Raver). */

function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

/** O endereço público do site: é para lá que o link de indicação aponta. */
function siteDoEasyFeed(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
}

const dia = (iso: string) => format(parseISO(iso), "d 'de' MMM", { locale: ptBR })
const mes = (iso: string) => format(parseISO(iso), "MMMM 'de' yyyy", { locale: ptBR })

/** Quem entrou pelo link, quem está a caminho e quem já conta para a escada. */
function Numeros({ n }: { n: NumerosDaIndicacao }) {
  const itens = [
    {
      rotulo: 'Criaram a conta', valor: n.entraram,
      detalhe: n.nao_pagaram > 0 ? `${n.nao_pagaram} ainda não ${n.nao_pagaram === 1 ? 'assinou' : 'assinaram'}` : 'pelo seu link',
    },
    { rotulo: 'A caminho', valor: n.a_caminho, detalhe: 'falta pagar o 2º mês' },
    { rotulo: 'Já contam', valor: n.contam, detalhe: 'pagaram 2 meses', destaque: true },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <p className="text-[13px] font-medium text-gray-500">{i.rotulo}</p>
          <p className={cn('mt-0.5 text-2xl font-bold tabular-nums text-gray-900', i.destaque && i.valor > 0 && 'text-emerald-700')}>{i.valor}</p>
          <p className="mt-0.5 text-xs leading-snug text-gray-400">{i.detalhe}</p>
        </div>
      ))}
    </div>
  )
}

/** Um mês grátis: na fila (verdinho), usado (✓) ou descartado (a indicação cancelou). */
function MesGratis({ b }: { b: BonusDaIndicacao }) {
  const naFila = b.status === 'pendente'
  const usado = b.status === 'aplicado'
  const detalhe = naFila
    ? (b.reservado ? 'Entra na sua próxima mensalidade' : `Na fila desde ${dia(b.criado_em)}`)
    : usado
      ? `Usado em ${mes(b.aplicado_em ?? b.criado_em)}`
      : (b.motivo === 'indicado_cancelou' ? 'A indicação cancelou a assinatura' : 'Cancelado')
  return (
    <li className={cn(
      'flex items-center gap-3 rounded-lg border px-3.5 py-3',
      naFila ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white',
    )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          naFila ? 'bg-emerald-500 text-white' : usado ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-400',
        )}
        aria-hidden="true"
      >
        {naFila ? <Gift className="h-4 w-4" /> : usado ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', naFila ? 'text-emerald-900' : usado ? 'text-gray-900' : 'text-gray-400 line-through')}>
          1 mês grátis
        </p>
        <p className={cn('text-xs', naFila ? 'text-emerald-700' : 'text-gray-500')}>{detalhe}</p>
      </div>
      <span className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        naFila ? 'bg-white text-emerald-700 ring-1 ring-emerald-200' : usado ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400',
      )}
      >
        {ROTULO_PREMIO[b.status]}
      </span>
    </li>
  )
}

export default function Indicacoes() {
  const [dados, setDados] = useState<MinhaIndicacao | null>(null)
  const [erro, setErro] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setDados(await buscarMinhaIndicacao())
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const rh = dados?.area === 'rh'
  const link = dados?.codigo ? linkDeIndicacao(siteDoEasyFeed(), dados.codigo, dados.area) : ''

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      toast.success('Link copiado.')
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie à mão.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{rh ? 'Indique uma empresa' : 'Indique um restaurante'}</h1>
        <p className="mt-1 text-sm text-gray-500">Quem assinar pelo seu link conta para os seus benefícios.</p>
      </div>

      {erro ? (
        <Cartao className="text-center">
          <p className="text-sm text-gray-600">Não foi possível carregar as suas indicações.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
        </Cartao>
      ) : !dados ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : !dados.liberado || dados.sem_restaurante ? (
        <Cartao className="text-center">
          <p className="text-sm text-gray-600">As indicações ainda não estão disponíveis para esta conta.</p>
        </Cartao>
      ) : (
        <>
          {dados.codigo && dados.ativo ? (
            <Cartao>
              <p className="text-sm font-semibold text-gray-900">Seu link</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={link}
                  aria-label="Seu link de indicação"
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/30"
                />
                <Button onClick={copiar} className="shrink-0 bg-[#1D4ED8] hover:bg-[#1E40AF]">
                  {copiado ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />} {copiado ? 'Copiado' : 'Copiar link'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Ou passe o código <span className="font-mono font-semibold text-gray-700">{dados.codigo}</span>, para digitar na hora de assinar.
              </p>
            </Cartao>
          ) : (
            <Cartao>
              <p className="text-sm text-gray-600">O seu link está pausado. Fale com a equipe do EasyFeed.</p>
            </Cartao>
          )}

          <Numeros n={dados.numeros} />

          <Cartao>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">Seus meses grátis</p>
              {mesesNaFila(dados.bonus) > 0 && (
                <span className="text-xs font-semibold text-emerald-700">{mesesNaFila(dados.bonus)} na fila</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Cada indicação que pagar o 2º mês vale 1 mensalidade grátis. Um por mês, enquanto ela seguir assinando.
            </p>
            {dados.bonus.length === 0 ? (
              <p className="mt-3 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">Nenhum mês grátis ainda.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {dados.bonus.map((b) => <MesGratis key={b.id} b={b} />)}
              </ul>
            )}
          </Cartao>
        </>
      )}
    </div>
  )
}
