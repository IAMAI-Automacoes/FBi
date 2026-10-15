import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Gift } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { WhatsAppIcon } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  linkDeIndicacao, linkDoWhatsapp, mensagemDeIndicacao, ROTULO_PREMIO, textoDaPorcentagem, type MinhaIndicacao, type NumerosDaIndicacao, type StatusPremio,
} from '@/lib/indicacoes'
import { buscarMinhaIndicacao } from '@/lib/queries/indicacoes'

/* Descontos → Indicações, nos dois softwares (pedido do Raver, 15/10/2026):
   o link de CRIAÇÃO DE CONTA com o código de quem indica, para copiar ou mandar
   pelo WhatsApp, e o que aconteceu com quem entrou por ele. Quem indica ganha a
   % dele como desconto na própria mensalidade, por indicado, depois que o
   indicado paga o 2º mês. A página NÃO mostra quem foi indicado, só os números.
   Por enquanto só o admin da plataforma vê (menu, rota e indicacao_liberada). */

const COR_PREMIO: Record<StatusPremio, string> = {
  pendente: 'bg-amber-50 text-amber-700',
  aplicado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

const dia = (iso: string) => format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR })

function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6', className)}>{children}</div>
}

/** O endereço público do site: é para lá que o link de indicação aponta. */
function siteDoEasyFeed(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
}

/** Os números, na ordem em que a pessoa percorre: entrou, assinou, segue ou parou. */
function Numeros({ n, rh }: { n: NumerosDaIndicacao; rh: boolean }) {
  const quem = (k: number) => (rh ? (k === 1 ? 'empresa' : 'empresas') : (k === 1 ? 'restaurante' : 'restaurantes'))
  const itens: { valor: number; texto: string; destaque?: string }[] = [
    { valor: n.entraram, texto: `${n.entraram === 1 ? `${quem(1)} criou a conta` : `${quem(2)} criaram a conta`} pelo seu link` },
    { valor: n.usam, texto: n.usam === 1 ? 'usa até hoje' : 'usam até hoje', destaque: 'text-emerald-700' },
    { valor: n.pararam, texto: n.pararam === 1 ? 'usou e parou' : 'usaram e pararam' },
    { valor: n.aguardando, texto: n.aguardando === 1 ? 'usa, mas o benefício ainda não saiu' : 'usam, mas o benefício ainda não saiu', destaque: 'text-amber-700' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map((i) => (
        <div key={i.texto} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className={cn('text-2xl font-bold tabular-nums text-gray-900', i.valor > 0 && i.destaque)}>{i.valor}</p>
          <p className="text-sm leading-snug text-gray-500">{i.texto}</p>
        </div>
      ))}
    </div>
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
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{rh ? 'Indique uma empresa' : 'Indique um restaurante'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mande o seu link. Quem criar a conta por ele e assinar fica marcado como indicação sua.
        </p>
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
          <Cartao className="flex items-start gap-4 border-[#BFDBFE] bg-[#EFF6FF]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#1D4ED8]"><Gift className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">O que você ganha</p>
              <p className="mt-1 text-lg font-semibold leading-snug text-gray-900">
                {textoDaPorcentagem(dados.porcentagem)} de desconto na sua mensalidade por {rh ? 'empresa' : 'restaurante'} que você indicar
              </p>
              <p className="mt-1.5 text-sm text-gray-600">O benefício sai depois que {rh ? 'a empresa indicada' : 'o restaurante indicado'} paga o 2º mês.</p>
            </div>
          </Cartao>

          {dados.codigo && dados.ativo ? (
            <Cartao className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Seu link de criação de conta</p>
                <p className="mt-0.5 text-sm text-gray-500">Ele já leva o seu código: é assim que o sistema sabe que a indicação veio de você.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
                <Button asChild variant="outline" className="shrink-0">
                  <a href={linkDoWhatsapp(mensagemDeIndicacao(link, dados.area))} target="_blank" rel="noopener noreferrer">
                    <span className="mr-1.5 inline-flex text-[#25D366]"><WhatsAppIcon size={16} /></span> Mandar pelo WhatsApp
                  </a>
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Seu código: <span className="font-mono font-semibold text-gray-700">{dados.codigo}</span>. Quem preferir pode digitar o código na hora de assinar, no campo "Código de indicação".
              </p>
            </Cartao>
          ) : (
            <Cartao>
              <p className="text-sm text-gray-600">O seu link está pausado no momento. Fale com a equipe do EasyFeed.</p>
            </Cartao>
          )}

          <Numeros n={dados.numeros} rh={rh} />
          {dados.numeros.nao_pagaram > 0 && (
            <p className="text-sm text-gray-500">
              {dados.numeros.nao_pagaram === 1 ? '1 criou a conta e ainda não assinou.' : `${dados.numeros.nao_pagaram} criaram a conta e ainda não assinaram.`}
            </p>
          )}

          <Cartao className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Seus benefícios{dados.numeros.liberados ? ` (${dados.numeros.liberados})` : ''}</p>
              <p className="mt-0.5 text-sm text-gray-500">O desconto ainda não entra sozinho na cobrança: a equipe do EasyFeed aplica e marca aqui como recebido.</p>
            </div>
            {dados.premios.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Nenhum benefício ainda. Ele aparece aqui quando {rh ? 'uma empresa indicada' : 'um restaurante indicado'} pagar o 2º mês.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {dados.premios.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium [overflow-wrap:anywhere]', p.status === 'cancelado' ? 'text-gray-400 line-through' : 'text-gray-900')}>{p.beneficio}</p>
                      <p className="text-xs text-gray-500">
                        Liberado em {dia(p.criado_em)}{p.status === 'aplicado' && p.aplicado_em ? ` · recebido em ${dia(p.aplicado_em)}` : ''}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', COR_PREMIO[p.status])}>{ROTULO_PREMIO[p.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </>
      )}
    </div>
  )
}
