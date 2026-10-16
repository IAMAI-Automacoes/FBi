import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BadgeCheck, Loader2, RefreshCw } from 'lucide-react'
import { versaoDaConta } from '@/lib/admin-versoes'
import {
  frasesDaBase, MIN_AVALIACOES, MIN_DIAS_DE_CASA, MIN_RESTAURANTES_BASE, podeNomear, resumirBase, resumirRestaurante,
  tempoDeCasa, type DiaMetricas, type ResumoRestaurante,
} from '@/lib/resultados'
import {
  atualizarMetricasAgora, buscarAutorizacoes, buscarMetricasDiarias, buscarRestaurantesResultados,
  type AutorizacaoRegistrada, type RestauranteResultados,
} from '@/lib/queries/resultados'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'
import { Cartao, FraseCopiavel, Ganho, hojeEmBrasilia, numero } from '@/pages/admin/resultados/comum'
import { DetalheRestaurante } from '@/pages/admin/resultados/DetalheRestaurante'

interface Linha {
  restaurante: RestauranteResultados
  resumo: ResumoRestaurante
  autorizacao: AutorizacaoRegistrada | null
}

/** Culinárias com 3+ restaurantes de verdade: só essas aparecem numa frase anônima. */
function culinariasSeguras(restaurantes: RestauranteResultados[]): Set<string> {
  const contagem = new Map<string, number>()
  for (const r of restaurantes) {
    if (r.eh_teste || !r.tipo_culinaria) continue
    contagem.set(r.tipo_culinaria, (contagem.get(r.tipo_culinaria) ?? 0) + 1)
  }
  return new Set([...contagem].filter(([, n]) => n >= 3).map(([c]) => c))
}

/**
 * Aba "Resultados": a evolução de cada restaurante desde que entrou no
 * EasyFeed, os números da base e as frases prontas para o marketing.
 * Regras das contas em `src/lib/resultados.ts`.
 */
export function PainelResultados() {
  const [restaurantes, setRestaurantes] = useState<RestauranteResultados[]>([])
  const [dias, setDias] = useState<DiaMetricas[]>([])
  const [autorizacoes, setAutorizacoes] = useState<AutorizacaoRegistrada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [incluirTestes, setIncluirTestes] = useState(false)
  const [soAutorizados, setSoAutorizados] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const hoje = hojeEmBrasilia()

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [r, d, a] = await Promise.all([buscarRestaurantesResultados(), buscarMetricasDiarias(), buscarAutorizacoes()])
      setRestaurantes(r.filter((x) => !x.excluida_em && versaoDaConta(x.area) === 'restaurante'))
      setDias(d)
      setAutorizacoes(a)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar agora.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const atualizar = async () => {
    setAtualizando(true)
    try {
      await atualizarMetricasAgora()
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar agora.')
    } finally {
      setAtualizando(false)
    }
  }

  const linhas = useMemo<Linha[]>(() => {
    const porRestaurante = new Map<number, DiaMetricas[]>()
    for (const d of dias) {
      if (!porRestaurante.has(d.restaurante_id)) porRestaurante.set(d.restaurante_id, [])
      porRestaurante.get(d.restaurante_id)!.push(d)
    }
    const aut = new Map(autorizacoes.map((a) => [a.restaurante_id, a]))
    return restaurantes.map((restaurante) => ({
      restaurante,
      resumo: resumirRestaurante(porRestaurante.get(restaurante.id) ?? [], hoje),
      autorizacao: aut.get(restaurante.id) ?? null,
    }))
  }, [restaurantes, dias, autorizacoes, hoje])

  const base = useMemo(
    () => resumirBase(linhas.map((l) => ({ resumo: l.resumo, ehTeste: l.restaurante.eh_teste }))),
    [linhas],
  )
  const seguras = useMemo(() => culinariasSeguras(restaurantes), [restaurantes])

  const visiveis = useMemo(
    () =>
      linhas
        .filter((l) => l.resumo.primeiroDia)
        .filter((l) => incluirTestes || !l.restaurante.eh_teste)
        .filter((l) => !soAutorizados || podeNomear(l.autorizacao))
        // Comparáveis primeiro, do maior ganho para o menor; depois por volume.
        .sort((a, b) =>
          Number(b.resumo.comparavel) - Number(a.resumo.comparavel)
          || (b.resumo.ganho ?? 0) - (a.resumo.ganho ?? 0)
          || b.resumo.total.mensagens - a.resumo.total.mensagens),
    [linhas, incluirTestes, soAutorizados],
  )

  const selecionada = linhas.find((l) => l.restaurante.id === aberto)
  if (selecionada) {
    return (
      <DetalheRestaurante
        restaurante={selecionada.restaurante}
        autorizacao={selecionada.autorizacao}
        culinariaSegura={!!selecionada.restaurante.tipo_culinaria && seguras.has(selecionada.restaurante.tipo_culinaria)}
        hoje={hoje}
        onVoltar={() => setAberto(null)}
        onAutorizacaoMudou={carregar}
      />
    )
  }

  const frasesBase = frasesDaBase(base)

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Resultados</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Como cada restaurante evoluiu desde o primeiro feedback no EasyFeed: os primeiros 30 dias contra os
              últimos 30. Só feedback de cliente. Atualiza sozinho todo dia de madrugada.
            </p>
          </div>
          <button
            onClick={atualizar}
            disabled={atualizando}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {atualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar agora
          </button>
        </div>

        {erro && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{erro}</p>}

        {carregando ? (
          <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
        ) : (
          <>
            {/* ── A base inteira (sem contas de teste) ── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Cartao titulo="Restaurantes" valor={numero(base.restaurantes)} detalhe="com algum feedback" />
              <Cartao titulo="Mensagens" valor={numero(base.mensagens)} detalhe={`${numero(base.avaliacoes)} avaliações`} />
              <Cartao titulo="Clientes ouvidos" valor={numero(base.clientes)} detalhe="telefones diferentes" />
              <Cartao titulo="Melhorias concluídas" valor={numero(base.acoesConcluidas)} detalhe="ações dos planos" />
              <Cartao
                titulo="Ganho mediano"
                valor={<Ganho valor={base.medianaGanho} className="text-xl" />}
                detalhe={
                  base.comparaveis
                    ? `${base.mediaInicio} → ${base.mediaAgora} em média · ${base.comparaveis} comparáve${base.comparaveis === 1 ? 'l' : 'is'}`
                    : 'nenhum comparável ainda'
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Frases da base</p>
              {!base.divulgavel && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Base pequena para divulgar o ganho médio: são {base.comparaveis} restaurante
                  {base.comparaveis === 1 ? '' : 's'} comparáve{base.comparaveis === 1 ? 'l' : 'is'} e o mínimo é{' '}
                  {MIN_RESTAURANTES_BASE}. Os números de volume podem ser usados.
                </p>
              )}
              {frasesBase.length === 0 ? (
                <p className="text-[12.5px] text-gray-400">Ainda não há números para uma frase.</p>
              ) : (
                frasesBase.map((f) => <FraseCopiavel key={f} texto={f} />)
              )}
            </div>

            {/* ── Por restaurante ── */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-[13px] font-semibold text-gray-700">Por restaurante</p>
                <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                  <input type="checkbox" checked={incluirTestes} onChange={(e) => setIncluirTestes(e.target.checked)} />
                  Incluir contas de teste
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                  <input type="checkbox" checked={soAutorizados} onChange={(e) => setSoAutorizados(e.target.checked)} />
                  Só os que autorizaram divulgar
                </label>
              </div>
              <CrudTable>
                <thead>
                  <tr>
                    <Th>Restaurante</Th>
                    <Th>Tempo de casa</Th>
                    <Th className="text-right">Mensagens</Th>
                    <Th>Satisfação início → agora</Th>
                    <Th className="text-right">Ganho</Th>
                    <Th className="text-right">Melhorias</Th>
                    <Th>Divulgação</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visiveis.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        Nenhum restaurante com feedback neste filtro.
                      </td>
                    </tr>
                  ) : visiveis.map(({ restaurante: r, resumo, autorizacao }) => (
                    <tr key={r.id} onClick={() => setAberto(r.id)} className="cursor-pointer transition-colors hover:bg-gray-50">
                      <Td>
                        <p className="font-medium text-gray-900">{r.nome || `#${r.id}`}</p>
                        <p className="text-[11.5px] text-gray-500">
                          {[r.tipo_culinaria, r.eh_teste ? 'conta de teste' : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </Td>
                      <Td className="text-gray-700">{tempoDeCasa(resumo.diasDeCasa)}</Td>
                      <Td className="text-right tabular-nums text-gray-700">{numero(resumo.total.mensagens)}</Td>
                      <Td className="tabular-nums text-gray-700">
                        {resumo.comparavel ? (
                          `${resumo.inicio.indice} → ${resumo.agora.indice}`
                        ) : (
                          <span className="text-[12px] text-gray-400">
                            {resumo.diasDeCasa < MIN_DIAS_DE_CASA
                              ? `faltam ${MIN_DIAS_DE_CASA - resumo.diasDeCasa} dias`
                              : `base pequena (mín. ${MIN_AVALIACOES})`}
                          </span>
                        )}
                      </Td>
                      <Td className="text-right"><Ganho valor={resumo.ganho} /></Td>
                      <Td className="text-right tabular-nums text-gray-700">{numero(resumo.total.acoesConcluidas)}</Td>
                      <Td>
                        {podeNomear(autorizacao) ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                            <BadgeCheck className="h-3.5 w-3.5" /> Autorizado
                          </span>
                        ) : (
                          <span className="text-[12px] text-gray-400">
                            {autorizacao?.status === 'revogado' ? 'Revogada' : 'Só anônimo'}
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </CrudTable>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
