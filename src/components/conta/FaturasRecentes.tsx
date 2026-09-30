import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Receipt } from 'lucide-react'
import { buscarMinhasFaturas, type FaturaResumo } from '@/lib/queries/stripe'
import { formatarReais } from '@/components/vendas/ciclos-plano'

/* Cobranças do restaurante (histórico em `stripe_faturas`, RLS: só as dele).
   Só aparece para quem tem assinatura pelo Stripe — cupom/liberação manual
   não geram fatura. Os links abrem a página hospedada pelo Stripe (pagar,
   ver, baixar PDF); nada é servido daqui. */

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  paid: { rotulo: 'Paga', classe: 'bg-emerald-50 text-emerald-700' },
  open: { rotulo: 'Em aberto', classe: 'bg-amber-50 text-amber-700' },
  draft: { rotulo: 'Rascunho', classe: 'bg-gray-100 text-gray-600' },
  uncollectible: { rotulo: 'Não paga', classe: 'bg-red-50 text-red-700' },
  void: { rotulo: 'Cancelada', classe: 'bg-gray-100 text-gray-500' },
}

function dataCurta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

export function FaturasRecentes() {
  const [faturas, setFaturas] = useState<FaturaResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    buscarMinhasFaturas()
      .then((f) => vivo && setFaturas(f))
      .catch((e: Error) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [])

  if (erro) return null
  if (faturas === null || faturas.length === 0) return null

  return (
    <div className="mt-6 rounded-2xl border border-gray-200/75 bg-white p-5 sm:p-6 shadow-subtle">
      <div className="flex items-start gap-3">
        <Receipt className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Cobranças</h3>
          <p className="text-[13px] text-gray-600 mt-1">
            Suas últimas faturas. Abra a fatura para ver detalhes ou baixar o PDF.
          </p>
          <ul className="mt-4 divide-y divide-gray-100">
            {faturas.map((f) => {
              const st = STATUS[f.status] ?? { rotulo: f.status, classe: 'bg-gray-100 text-gray-600' }
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="text-[13px] text-gray-500 w-24 shrink-0">
                    {dataCurta(f.pago_em ?? f.created_at)}
                  </span>
                  <span className="text-[13px] font-medium text-gray-800 flex-1 min-w-[120px]">
                    {f.numero ?? 'Fatura'}
                    {f.periodo_inicio && f.periodo_fim && (
                      <span className="text-gray-400 font-normal">
                        {' '}
                        · {dataCurta(f.periodo_inicio)} a {dataCurta(f.periodo_fim)}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-gray-800">
                    R$ {formatarReais(f.status === 'paid' ? f.pago_centavos : f.total_centavos)}
                  </span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${st.classe}`}>
                    {st.rotulo}
                  </span>
                  <span className="flex items-center gap-2">
                    {f.hosted_invoice_url && (
                      <a
                        href={f.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1D4ED8] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver
                      </a>
                    )}
                    {f.invoice_pdf && (
                      <a
                        href={f.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:underline"
                      >
                        <FileText className="h-3 w-3" /> PDF
                      </a>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
