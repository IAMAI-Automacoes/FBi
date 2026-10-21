import { useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { serializarCsv } from '@/lib/relatorio-csv'
import { nomeDeArquivoSeguro } from '@/lib/nome-arquivo'
import {
  frasesDoRestaurante, linhasCsvMensal, MIN_AVALIACOES, MIN_DIAS_DE_CASA, podeNomear, resumirRestaurante,
  sujeitoDaFrase, tempoDeCasa, type DiaMetricas, type Mes,
} from '@/lib/resultados'
import {
  buscarMetricasDiarias, revogarAutorizacao, salvarAutorizacao,
  type AutorizacaoInput, type AutorizacaoRegistrada, type RestauranteResultados,
} from '@/lib/queries/resultados'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'
import { baixarArquivo, Cartao, FraseCopiavel, Ganho, numero } from '@/pages/admin/resultados/comum'

const configGrafico = {
  indice: { label: 'Satisfação (0–100)', color: 'hsl(var(--chart-1))' },
  mensagens: { label: 'Mensagens', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

/** Nota do mês com a base dela: mês de 2 avaliações não pode parecer tão firme quanto um de 40. */
function TooltipMes({ active, payload }: { active?: boolean; payload?: { payload: Mes }[] }) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  return (
    <div className="rounded-lg bg-foreground/90 px-3 py-2 text-xs text-white shadow-md">
      <p className="font-semibold">{m.rotulo}</p>
      <p>Satisfação: {m.indice ?? 'sem avaliação'}</p>
      <p>{m.avaliacoes} avaliações · {m.mensagens} mensagens</p>
      {m.sugestoes > 0 && <p>{m.sugestoes} sugestões (fora da nota)</p>}
    </div>
  )
}

const dataCurta = (dia: string) => dia.split('-').reverse().join('/')

const CANAIS: { value: AutorizacaoInput['canal']; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'outro', label: 'Outro' },
]

const ESCOPOS: { chave: 'pode_nome' | 'pode_logo' | 'pode_numeros' | 'pode_depoimento'; label: string }[] = [
  { chave: 'pode_nome', label: 'Citar o nome do restaurante' },
  { chave: 'pode_numeros', label: 'Divulgar os números dele' },
  { chave: 'pode_logo', label: 'Usar a logo' },
  { chave: 'pode_depoimento', label: 'Publicar depoimento do dono' },
]

function formularioVazio(a: AutorizacaoRegistrada | null): AutorizacaoInput {
  return {
    pode_nome: a?.pode_nome ?? true,
    pode_numeros: a?.pode_numeros ?? true,
    pode_logo: a?.pode_logo ?? false,
    pode_depoimento: a?.pode_depoimento ?? false,
    autorizado_por: a?.autorizado_por ?? '',
    canal: a && a.canal !== 'painel' ? a.canal : 'whatsapp',
    observacao: a?.observacao ?? '',
  }
}

export function DetalheRestaurante({
  restaurante, autorizacao, culinariaSegura, hoje, onVoltar, onAutorizacaoMudou,
}: {
  restaurante: RestauranteResultados
  autorizacao: AutorizacaoRegistrada | null
  culinariaSegura: boolean
  hoje: string
  onVoltar: () => void
  onAutorizacaoMudou: () => Promise<void> | void
}) {
  const [dias, setDias] = useState<DiaMetricas[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState<AutorizacaoInput>(() => formularioVazio(autorizacao))
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    buscarMetricasDiarias(restaurante.id)
      .then((d) => { if (vivo) setDias(d) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [restaurante.id])

  useEffect(() => { setForm(formularioVazio(autorizacao)) }, [autorizacao])

  const resumo = useMemo(() => resumirRestaurante(dias, hoje), [dias, hoje])
  const sujeito = sujeitoDaFrase({
    nome: restaurante.nome,
    culinaria: restaurante.tipo_culinaria,
    culinariaSegura,
    autorizacao,
  })
  const frases = frasesDoRestaurante(resumo, sujeito.texto)
  const nome = restaurante.nome || `#${restaurante.id}`

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.autorizado_por.trim()) return setErro('Diga quem autorizou, do lado do restaurante.')
    if (!form.observacao?.trim()) return setErro('Diga onde está a prova (print, e-mail, cláusula do contrato).')
    setErro(null)
    setSalvando(true)
    try {
      await salvarAutorizacao(restaurante.id, { ...form, autorizado_por: form.autorizado_por.trim() })
      await onAutorizacaoMudou()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const revogar = async () => {
    setSalvando(true)
    try {
      await revogarAutorizacao(restaurante.id)
      await onAutorizacaoMudou()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível revogar.')
    } finally {
      setSalvando(false)
    }
  }

  const baixarCsv = () =>
    baixarArquivo(`${nomeDeArquivoSeguro(`acompanhamento-${nome}`, 'acompanhamento')}.csv`, serializarCsv(linhasCsvMensal(resumo)))

  const motivoSemComparacao =
    resumo.diasDeCasa < MIN_DIAS_DE_CASA
      ? `Com ${resumo.diasDeCasa} dias de casa, as duas janelas de 30 dias ainda se sobrepõem. Compara a partir de ${MIN_DIAS_DE_CASA} dias.`
      : !resumo.inicioConfiavel
        ? `Os primeiros 30 dias têm ${resumo.inicio.avaliacoes} avaliações; o mínimo para comparar é ${MIN_AVALIACOES}.`
        : `Os últimos 30 dias têm ${resumo.agora.avaliacoes} avaliações; o mínimo para comparar é ${MIN_AVALIACOES}.`

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-5">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Todos os restaurantes
        </button>

        <div className="flex items-center gap-3">
          {restaurante.logo_url && (
            <img src={restaurante.logo_url} alt="" className="h-10 w-10 rounded-lg border border-gray-200 object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-gray-800">{nome}</h2>
            <p className="text-[12px] text-gray-500">
              {[
                restaurante.tipo_culinaria,
                resumo.primeiroDia ? `primeiro feedback em ${dataCurta(resumo.primeiroDia)}` : 'sem feedback ainda',
                resumo.primeiroDia ? `${tempoDeCasa(resumo.diasDeCasa)} de casa` : null,
                restaurante.eh_teste ? 'conta de teste (fora dos números da base)' : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            onClick={baixarCsv}
            disabled={!resumo.mensal.length}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Planilha mês a mês
          </button>
        </div>

        {erro && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{erro}</p>}

        {carregando ? (
          <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
        ) : !resumo.primeiroDia ? (
          <p className="py-10 text-center text-sm text-gray-400">Este restaurante ainda não recebeu feedback de cliente.</p>
        ) : (
          <>
            {/* ── Antes e depois ── */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Antes e depois</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Cartao
                  titulo="Satisfação nos primeiros 30 dias"
                  valor={resumo.inicio.indice ?? '—'}
                  detalhe={`${numero(resumo.inicio.avaliacoes)} avaliações`}
                />
                <Cartao
                  titulo="Satisfação nos últimos 30 dias"
                  valor={resumo.agora.indice ?? '—'}
                  detalhe={`${numero(resumo.agora.avaliacoes)} avaliações`}
                />
                <Cartao titulo="Ganho" valor={<Ganho valor={resumo.ganho} className="text-xl" />} detalhe="escala de 0 a 100" />
                <Cartao
                  titulo="Avaliações negativas"
                  valor={
                    resumo.inicio.pctNegativos !== null && resumo.agora.pctNegativos !== null
                      ? `${resumo.inicio.pctNegativos}% → ${resumo.agora.pctNegativos}%`
                      : '—'
                  }
                  detalhe="primeiros 30 → últimos 30"
                />
              </div>
              {!resumo.comparavel && (
                <p className="text-[12px] text-amber-700">Ainda não dá para afirmar melhora. {motivoSemComparacao}</p>
              )}
            </div>

            {/* ── Mês a mês ── */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Mês a mês</p>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <ChartContainer config={configGrafico} className="h-64 w-full">
                  <ComposedChart data={resumo.mensal} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis yAxisId="indice" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis yAxisId="mensagens" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<TooltipMes />} />
                    <Bar yAxisId="mensagens" dataKey="mensagens" fill="var(--color-mensagens)" radius={[4, 4, 0, 0]} opacity={0.35} />
                    <Line
                      yAxisId="indice" dataKey="indice" stroke="var(--color-indice)" strokeWidth={2.5}
                      dot={{ r: 3.5 }} connectNulls type="monotone"
                    />
                  </ComposedChart>
                </ChartContainer>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  Linha: satisfação do mês (0–100). Barras: mensagens recebidas. Mês com poucas avaliações oscila muito.
                </p>
              </div>
            </div>

            {/* ── Categorias ── */}
            {resumo.categorias.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-gray-700">Por tema</p>
                <CrudTable>
                  <thead>
                    <tr>
                      <Th>Tema</Th>
                      <Th className="text-right">Primeiros 30 dias</Th>
                      <Th className="text-right">Últimos 30 dias</Th>
                      <Th className="text-right">Ganho</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resumo.categorias.map((c) => (
                      <tr key={c.nome}>
                        <Td className="font-medium text-gray-800">{c.nome}</Td>
                        <Td className="text-right tabular-nums text-gray-700">
                          {c.inicio ?? '—'} <span className="text-[11.5px] text-gray-400">({c.nInicio})</span>
                        </Td>
                        <Td className="text-right tabular-nums text-gray-700">
                          {c.agora ?? '—'} <span className="text-[11.5px] text-gray-400">({c.nAgora})</span>
                        </Td>
                        <Td className="text-right"><Ganho valor={c.ganho} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </CrudTable>
                <p className="text-[11.5px] text-gray-500">Entre parênteses, quantas avaliações. Tema com menos de 3 fica sem nota.</p>
              </div>
            )}

            {/* ── Tudo desde o começo ── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <Cartao titulo="Mensagens" valor={numero(resumo.total.mensagens)} />
              <Cartao titulo="Clientes novos" valor={numero(resumo.total.clientesNovos)} />
              <Cartao titulo="Retornos" valor={numero(resumo.total.retornos)} detalhe="dias em que alguém voltou" />
              <Cartao titulo="Aberturas do QR" valor={numero(resumo.total.aberturasQr)} />
              <Cartao titulo="Insights" valor={numero(resumo.total.insightsGerados)} />
              <Cartao
                titulo="Melhorias"
                valor={numero(resumo.total.acoesConcluidas)}
                detalhe={`de ${numero(resumo.total.acoesCriadas)} ações criadas`}
              />
            </div>

            {/* ── Material de marketing ── */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Frases para o marketing</p>
              <p className="text-[12px] text-gray-500">
                {sujeito.nomeado
                  ? 'Com o nome: a autorização cobre nome e números.'
                  : 'Anônimas: sem autorização para nome e números, o restaurante não é identificado.'}
                {' '}Só saem fatos a favor e com base suficiente.
              </p>
              {frases.length === 0 ? (
                <p className="text-[12.5px] text-gray-400">Ainda não há número que sustente uma frase.</p>
              ) : (
                frases.map((f) => <FraseCopiavel key={f} texto={f} />)
              )}
            </div>
          </>
        )}

        {/* ── Autorização ── */}
        <form onSubmit={salvar} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <p className="text-[13px] font-semibold text-gray-700">Autorização para divulgar</p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              {autorizacao
                ? autorizacao.status === 'autorizado'
                  ? autorizacao.origem === 'dono'
                    ? `Marcado pelo próprio dono (${autorizacao.autorizado_por}) em Configurações em ${new Date(autorizacao.autorizado_em).toLocaleString('pt-BR')}, texto de ${autorizacao.versao_texto}. É a prova mais forte: só mexa aqui se ele pedir.`
                    : `Autorizado por ${autorizacao.autorizado_por} (${autorizacao.canal}) em ${new Date(autorizacao.autorizado_em).toLocaleDateString('pt-BR')}, registrado por ${autorizacao.registrado_por}.`
                  : `Revogada em ${autorizacao.revogado_em ? new Date(autorizacao.revogado_em).toLocaleDateString('pt-BR') : '—'}. Antes valia desde ${new Date(autorizacao.autorizado_em).toLocaleDateString('pt-BR')}.`
                : 'Sem autorização: só números anônimos. O melhor é o dono marcar em Configurações → Divulgação; registre aqui só quando ele concordou por escrito por outro canal.'}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {ESCOPOS.map((e) => (
              <label key={e.chave} className="flex items-center gap-2 text-[12.5px] text-gray-700">
                <input
                  type="checkbox"
                  checked={form[e.chave]}
                  onChange={(ev) => setForm({ ...form, [e.chave]: ev.target.checked })}
                />
                {e.label}
              </label>
            ))}
          </div>
          {form.pode_nome !== form.pode_numeros && (
            <p className="text-[11.5px] text-amber-700">
              Frase com o nome só sai quando nome e números estão marcados juntos.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[12px] text-gray-600">
              Quem autorizou (do restaurante)
              <Input value={form.autorizado_por} onChange={(e) => setForm({ ...form, autorizado_por: e.target.value })} className="h-8 text-[13px]" />
            </label>
            <label className="space-y-1 text-[12px] text-gray-600">
              Por onde
              <select
                value={form.canal}
                onChange={(e) => setForm({ ...form, canal: e.target.value as AutorizacaoInput['canal'] })}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
              >
                {CANAIS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-[12px] text-gray-600">
            Onde está a prova
            <Textarea
              value={form.observacao ?? ''}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Ex.: print da conversa de 14/10 no Drive, pasta Autorizações"
              className="min-h-[60px] text-[13px]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {podeNomear(autorizacao) ? 'Atualizar autorização' : 'Registrar autorização'}
            </button>
            {autorizacao?.status === 'autorizado' && (
              <button
                type="button"
                onClick={revogar}
                disabled={salvando}
                className="inline-flex h-8 items-center rounded-lg border border-rose-200 px-3 text-[12.5px] font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
              >
                Revogar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
