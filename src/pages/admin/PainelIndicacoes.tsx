import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Gift, Loader2, RotateCcw, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  BENEFICIO_MAX, limparBeneficio, premiosPendentes, problemaDoBeneficio, ROTULO_PREMIO_ADMIN,
  type IndicacaoAdmin, type PremioAdmin, type StatusPremio,
} from '@/lib/indicacoes'
import { buscarIndicacaoAdmin, mudarPremioDaIndicacao, salvarIndicacaoAdmin } from '@/lib/queries/indicacoes'
import { CrudTable, Td, Th } from './tabela'

/* Admin → Afiliados, parte de cima: a indicação ENTRE RESTAURANTES.
   O admin liga/desliga, escreve o benefício (um texto: ainda não é aplicado
   sozinho na cobrança) e marca os benefícios que já deu. Os afiliados de fora,
   que ganham comissão em dinheiro, continuam na lista logo abaixo (Admin.tsx). */

const quando = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })

const COR: Record<StatusPremio, string> = {
  pendente: 'bg-amber-50 text-amber-700',
  aplicado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

const MOTIVO: Record<string, string> = {
  beneficio_vazio: 'Escreva o benefício antes de ligar as indicações.',
  beneficio_longo: `O benefício pode ter até ${BENEFICIO_MAX} letras.`,
}

export function PainelIndicacoes() {
  const [dados, setDados] = useState<IndicacaoAdmin | null>(null)
  const [erro, setErro] = useState(false)
  const [ativo, setAtivo] = useState(false)
  const [beneficio, setBeneficio] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mexendo, setMexendo] = useState<string | null>(null)

  const carregar = useCallback(async (manterForm = false) => {
    try {
      const d = await buscarIndicacaoAdmin()
      setDados(d)
      setErro(false)
      if (!manterForm) {
        setAtivo(d.ativo)
        setBeneficio(d.beneficio)
      }
    } catch {
      setErro(true)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const limpo = limparBeneficio(beneficio)
  const problema = problemaDoBeneficio(beneficio, ativo)
  const mudou = !!dados && (ativo !== dados.ativo || limpo !== dados.beneficio)

  const salvar = async () => {
    if (problema) return
    setSalvando(true)
    try {
      const r = await salvarIndicacaoAdmin(ativo, limpo)
      if (!r.ok) {
        toast.error(MOTIVO[r.motivo ?? ''] ?? 'Não foi possível salvar.')
        return
      }
      toast.success(ativo ? 'Indicações ligadas.' : 'Indicações desligadas.')
      await carregar()
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const mudarPremio = async (p: PremioAdmin, status: StatusPremio) => {
    setMexendo(p.id)
    try {
      await mudarPremioDaIndicacao(p.id, status)
      await carregar(true)
    } catch {
      toast.error('Não foi possível mudar a situação do benefício.')
    } finally {
      setMexendo(null)
    }
  }

  const pendentes = dados ? premiosPendentes(dados.premios) : 0

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-start gap-2">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
        <div>
          <h2 className="text-base font-semibold text-gray-800">Indicação entre restaurantes</h2>
          <p className="mt-1 text-[12px] text-gray-500">
            O restaurante pega o link dele em Descontos → Indicações. Quando o indicado paga a primeira mensalidade, ele ganha o benefício abaixo.
          </p>
        </div>
      </div>

      {erro ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center">
          <p className="text-[13px] text-gray-600">Não foi possível carregar as indicações.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => carregar()}>Tentar de novo</Button>
        </div>
      ) : !dados ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold text-gray-800">Indicações ligadas</span>
                <span className="block text-[12px] text-gray-500">Desligado, o link continua abrindo o site, mas quem assinar não gera benefício.</span>
              </span>
              <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Ligar as indicações entre restaurantes" />
            </label>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="beneficio-indicacao" className="text-[12px] font-semibold text-gray-600">Benefício por restaurante indicado que assinar</label>
                <span className={cn('text-[11px] tabular-nums', limpo.length > BENEFICIO_MAX ? 'text-rose-600' : 'text-gray-400')}>{limpo.length}/{BENEFICIO_MAX}</span>
              </div>
              <Textarea
                id="beneficio-indicacao"
                value={beneficio}
                onChange={(e) => setBeneficio(e.target.value)}
                rows={2}
                placeholder="Ex.: 1 mês grátis, ou 20% de desconto nas 3 próximas mensalidades"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12px] text-gray-500">
                É o texto que o restaurante lê. Ainda não é aplicado sozinho na cobrança: dê o benefício e marque como aplicado aqui embaixo. Mudar o texto vale para as próximas indicações.
              </p>
              {problema && mudou && <p className="mt-1 text-[12px] text-rose-600">{problema}</p>}
            </div>
            {mudou && (
              <div className="flex justify-end">
                <Button size="sm" onClick={salvar} disabled={salvando || !!problema}>
                  {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Salvar
                </Button>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-gray-700">Benefícios ganhos{pendentes ? ` (${pendentes} para dar)` : ''}</h3>
            {dados.premios.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-[13px] text-gray-500">Nenhum benefício ganho ainda.</p>
            ) : (
              <CrudTable>
                <thead><tr><Th>Quem indicou</Th><Th>Quem assinou</Th><Th>Benefício</Th><Th>Ganho em</Th><Th>Situação</Th><Th className="text-right" /></tr></thead>
                <tbody>
                  {dados.premios.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <Td className="min-w-[140px] font-medium text-gray-800">{p.quem_indicou}</Td>
                      <Td className="min-w-[130px] text-gray-700">{p.indicado ?? <span className="text-gray-400">conta apagada</span>}</Td>
                      <Td className="min-w-[180px] text-gray-700">{p.beneficio}</Td>
                      <Td className="whitespace-nowrap text-[12px] text-gray-500">{quando(p.criado_em)}</Td>
                      <Td>
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', COR[p.status])}>{ROTULO_PREMIO_ADMIN[p.status]}</span>
                        {p.status === 'aplicado' && p.aplicado_em && <span className="ml-1.5 text-[11px] text-gray-400">{quando(p.aplicado_em)}</span>}
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {mexendo === p.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : p.status === 'pendente' ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => mudarPremio(p, 'aplicado')} className="h-8 text-[12px]">
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar como aplicado
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => mudarPremio(p, 'cancelado')} title="Cancelar este benefício" aria-label="Cancelar este benefício" className="h-8 w-8 p-0 text-gray-500">
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => mudarPremio(p, 'pendente')} className="h-8 text-[12px]">
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {p.status === 'aplicado' ? 'Desfazer' : 'Reabrir'}
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </CrudTable>
            )}
          </div>

          {dados.indicadores.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-gray-700">Restaurantes que já pegaram o link</h3>
              <CrudTable>
                <thead><tr><Th>Restaurante</Th><Th>Código</Th><Th className="text-right">Entraram pelo link</Th><Th className="text-right">Assinaram</Th></tr></thead>
                <tbody>
                  {dados.indicadores.map((i) => (
                    <tr key={i.codigo} className="border-b border-gray-100 last:border-0">
                      <Td className="font-medium text-gray-800">{i.restaurante}</Td>
                      <Td><span className="rounded bg-violet-50 px-2 py-0.5 font-mono text-[12px] font-semibold text-violet-700">{i.codigo}</span></Td>
                      <Td className="text-right tabular-nums text-gray-700">{i.indicados}</Td>
                      <Td className="text-right tabular-nums text-gray-700">{i.assinaram}</Td>
                    </tr>
                  ))}
                </tbody>
              </CrudTable>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
