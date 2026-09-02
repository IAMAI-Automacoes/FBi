import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Archive } from 'lucide-react'
import { FiltroCategorias } from '@/components/FiltroCategorias'
import { CampoBusca } from '@/components/CampoBusca'
import { useFiltroPersistente } from '@/hooks/use-filtro-persistente'
import {
  FiltroPeriodo,
  type PeriodoPreset,
  type IntervaloDatas,
} from '@/components/FiltroPeriodo'
import { CATEGORIAS_FEEDBACK } from '@/lib/categorias-feedback'
import { isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCard } from '@/components/actions/TaskCard'
import { DetalhesAcaoPanel } from '@/components/actions/DetalhesAcaoPanel'
import { buscarAcoesArquivadas, desarquivarAcao, excluirAcao } from '@/lib/queries/acoes'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

/**
 * Ações concluídas que o dono decidiu guardar.
 *
 * Lista simples em vez de Kanban: são todas CONCLUIDO, então não há fluxo entre
 * colunas. Desarquivar devolve a ação ao quadro sem mexer no status.
 */
/** Quantos dias cada atalho do filtro cobre. 'all' não entra: não tem corte. */
const DIAS_DO_PRESET: Record<Exclude<PeriodoPreset, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export default function AcoesArquivadas() {
  const { usuario } = useAuth()
  const { toast } = useToast()
  // Linhas de `acoes_operacionais`; o TaskCard aceita o formato do quadro.
  const [acoes, setAcoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  /** Ação aberta no modal (somente leitura, com opção de excluir). */
  const [acaoAberta, setAcaoAberta] = useState<any>(null)

  // Mesmos três filtros de /feedbacks. A lista de arquivadas só cresce — é o
  // único lugar do app onde nada sai —, então em poucos meses ela é a maior
  // do sistema e rolar deixa de ser uma forma de achar coisa.
  const [busca, setBusca] = useFiltroPersistente('arquivadas:busca', '')
  const [categorias, setCategorias] = useFiltroPersistente<string[]>('arquivadas:categorias', [])
  // `periodo` é o atalho (7/30/90/tudo) e `datas` é o intervalo do calendário;
  // o intervalo tem precedência, igual a /feedbacks. Aqui o padrão é 'all' e
  // não '7d': o arquivo existe justamente para consultar coisa antiga, e abrir
  // filtrado em uma semana esconderia quase tudo que está lá.
  const [periodo, setPeriodo] = useFiltroPersistente<PeriodoPreset>('arquivadas:periodo', 'all')
  const [datas, setDatas] = useFiltroPersistente<IntervaloDatas | undefined>('arquivadas:datas', undefined)

  // Contagem por categoria SOBRE o que os outros filtros já deixaram passar,
  // e não sobre a lista inteira: o número ao lado de cada categoria tem que
  // dizer quantas eu veria clicando nela agora.
  const baseParaContagem = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return acoes.filter((a) => {
      const txt = !termo ||
        [a.titulo_acao, a.plano_detalhado, a.responsavel]
          .some((c: string | null) => (c ?? '').toLowerCase().includes(termo))
      // Conta a partir de quando a ação foi arquivada, não de quando nasceu:
      // é essa a data que a lista mostra e por onde ela é ordenada.
      const d = new Date(a.arquivada_em ?? a.created_at)
      const dt = datas
        ? isWithinInterval(d, {
            start: startOfDay(datas.from),
            end: endOfDay(datas.to ?? datas.from),
          })
        : periodo === 'all' || d >= startOfDay(subDays(new Date(), DIAS_DO_PRESET[periodo]))
      return txt && dt
    })
  }, [acoes, busca, periodo, datas])

  const contagemCategorias = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of baseParaContagem) {
      if (a.categoria && CATEGORIAS_FEEDBACK.includes(a.categoria)) {
        c[a.categoria] = (c[a.categoria] ?? 0) + 1
      }
    }
    return c
  }, [baseParaContagem])

  const acoesFiltradas = useMemo(
    () => baseParaContagem.filter(
      (a) => categorias.length === 0 || categorias.includes(a.categoria ?? ''),
    ),
    [baseParaContagem, categorias],
  )

  const temFiltro = !!busca.trim() || categorias.length > 0 || !!datas || periodo !== 'all'

  const carregar = useCallback(async () => {
    if (!usuario?.restaurante_id) return
    try {
      setLoading(true)
      const data = await buscarAcoesArquivadas(usuario.restaurante_id)
      setAcoes(
        (data || []).map((d) => ({
          ...d,
          id: d.id.toString(),
          date: new Date(d.created_at).toLocaleDateString(),
        })),
      )
    } catch {
      toast({ title: 'Não foi possível carregar as ações arquivadas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [usuario?.restaurante_id, toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const handleDesarquivar = async (id: string) => {
    try {
      await desarquivarAcao(parseInt(id))
      setAcoes((prev) => prev.filter((a) => a.id !== id))
      toast({ title: 'Ação desarquivada', description: 'Ela voltou para o quadro de Ações.' })
    } catch {
      toast({ title: 'Falha ao desarquivar a ação', variant: 'destructive' })
    }
  }

  const handleExcluir = async (id: string) => {
    try {
      await excluirAcao(parseInt(id))
      setAcoes((prev) => prev.filter((a) => a.id !== id))
      setAcaoAberta(null)
      toast({ title: 'Ação excluída' })
    } catch {
      toast({ title: 'Falha ao excluir a ação', variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col h-full max-w-[1600px] w-full mx-auto space-y-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ações Arquivadas</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Ações já concluídas que você guardou para consulta.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/acoes">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Ações
          </Link>
        </Button>
      </div>

      {/* Só aparece quando há o que filtrar: a barra numa lista vazia é um
          controle que não muda nada. */}
      {!loading && acoes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <FiltroPeriodo
            periodo={periodo}
            datas={datas}
            onPeriodo={setPeriodo}
            onDatas={setDatas}
          />

          <FiltroCategorias
            contagens={contagemCategorias}
            rotuloItens="ações"
            selecionadas={categorias}
            onChange={setCategorias}
          />

          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar nas ações" />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : acoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50/50 rounded-xl border border-dashed border-border min-h-[300px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-5">
            <Archive className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma ação arquivada</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Ao concluir uma ação, use o botão "Arquivar" no cartão para guardá-la aqui.
          </p>
        </div>
      ) : acoesFiltradas.length === 0 ? (
        // Filtro que não encontra nada precisa dizer isso e oferecer a saída;
        // sem esta linha a grade some e parece que as ações foram embora.
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm text-gray-500">Nenhuma ação com esses filtros.</p>
          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 text-xs"
              onClick={() => {
                setBusca('')
                setCategorias([])
                setDatas(undefined)
                setPeriodo('all')
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {acoesFiltradas.map((acao) => (
            <TaskCard
              key={acao.id}
              task={acao}
              somenteLeitura
              onClick={() => setAcaoAberta(acao)}
              onDesarquivar={() => handleDesarquivar(acao.id)}
            />
          ))}
        </div>
      )}

      {/* Abre no clique do card: mostra os dados travados e oferece Excluir. */}
      {acaoAberta && (
        <DetalhesAcaoPanel
          task={acaoAberta}
          onClose={() => setAcaoAberta(null)}
          onExcluir={() => {
            const id = acaoAberta.id
            setAcaoAberta(null)
            handleExcluir(String(id))
          }}
        />
      )}
    </div>
  )
}
