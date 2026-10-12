import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Gift, Info } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { WhatsAppIcon } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  linkDeIndicacao, linkDoWhatsapp, mensagemDeIndicacao, resumoDasIndicacoes, ROTULO_PREMIO, type MinhaIndicacao, type StatusPremio,
} from '@/lib/indicacoes'
import { buscarMinhaIndicacao } from '@/lib/queries/indicacoes'

/* Descontos → Indicações: o restaurante pega o link dele e manda para outro
   restaurante. Quando o indicado paga a primeira mensalidade, nasce o benefício
   que o admin escreveu (Admin → Afiliados), aplicado à mão por enquanto.
   A página NÃO mostra quem foi indicado: só quantos entraram e quantos assinaram.
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

  const link = dados?.codigo ? linkDeIndicacao(siteDoEasyFeed(), dados.codigo) : ''

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
        <h1 className="text-2xl font-bold text-gray-900">Indique um restaurante</h1>
        <p className="mt-1 text-sm text-gray-500">Mande o seu link para outro restaurante. Quando ele assinar o EasyFeed, você ganha um benefício.</p>
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
          {dados.ativo ? (
            <Cartao className="flex items-start gap-4 border-[#BFDBFE] bg-[#EFF6FF]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#1D4ED8]"><Gift className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">O que você ganha a cada restaurante que assinar</p>
                <p className="mt-1 text-lg font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere]">{dados.beneficio}</p>
                <p className="mt-1.5 text-sm text-gray-600">Vale quando o restaurante indicado paga a primeira mensalidade.</p>
              </div>
            </Cartao>
          ) : (
            <Cartao className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-800">As indicações estão desligadas no momento.</p>
                <p className="mt-0.5 text-sm text-gray-500">Quem assinar agora pelo seu link não gera benefício. Os que você já ganhou continuam aqui embaixo.</p>
              </div>
            </Cartao>
          )}

          {dados.ativo && dados.codigo && (
            <Cartao className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Seu link</p>
                <p className="mt-0.5 text-sm text-gray-500">Quem abrir este link e assinar fica marcado como indicação sua.</p>
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
                  <a href={linkDoWhatsapp(mensagemDeIndicacao(link))} target="_blank" rel="noopener noreferrer">
                    <span className="mr-1.5 inline-flex text-[#25D366]"><WhatsAppIcon size={16} /></span> Mandar pelo WhatsApp
                  </a>
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Seu código: <span className="font-mono font-semibold text-gray-700">{dados.codigo}</span>. Quem preferir pode digitar o código na hora de assinar, no campo "Código de indicação".
              </p>
            </Cartao>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-2xl font-bold tabular-nums text-gray-900">{dados.indicados}</p>
              <p className="text-sm text-gray-500">{dados.indicados === 1 ? 'restaurante entrou pelo seu link' : 'restaurantes entraram pelo seu link'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-2xl font-bold tabular-nums text-gray-900">{dados.assinaram}</p>
              <p className="text-sm text-gray-500">{dados.assinaram === 1 ? 'assinou' : 'assinaram'}</p>
            </div>
          </div>

          <Cartao className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Seus benefícios</p>
              <p className="mt-0.5 text-sm text-gray-500">O benefício ainda não entra sozinho na cobrança: a equipe do EasyFeed aplica e marca aqui como recebido.</p>
            </div>
            {dados.premios.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                {resumoDasIndicacoes(dados.indicados, dados.assinaram)} O benefício aparece aqui quando um restaurante indicado paga a primeira mensalidade.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {dados.premios.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium [overflow-wrap:anywhere]', p.status === 'cancelado' ? 'text-gray-400 line-through' : 'text-gray-900')}>{p.beneficio}</p>
                      <p className="text-xs text-gray-500">
                        Ganho em {dia(p.criado_em)}{p.status === 'aplicado' && p.aplicado_em ? ` · recebido em ${dia(p.aplicado_em)}` : ''}
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
