import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCard } from '@/components/actions/TaskCard'
import { TaskModal } from '@/components/insights/TaskModal'
import { buscarAcoesArquivadas, desarquivarAcao, excluirAcao } from '@/lib/queries/acoes'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

/**
 * Ações concluídas que o dono decidiu guardar.
 *
 * Lista simples em vez de Kanban: são todas CONCLUIDO, então não há fluxo entre
 * colunas. Desarquivar devolve a ação ao quadro sem mexer no status.
 */
export default function AcoesArquivadas() {
  const { usuario } = useAuth()
  const { toast } = useToast()
  // Linhas de `acoes_operacionais`; o TaskCard aceita o formato do quadro.
  const [acoes, setAcoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  /** Ação aberta no modal (somente leitura, com opção de excluir). */
  const [acaoAberta, setAcaoAberta] = useState<any>(null)

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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {acoes.map((acao) => (
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
        <TaskModal
          open={!!acaoAberta}
          onOpenChange={(aberto) => !aberto && setAcaoAberta(null)}
          somenteLeitura
          task={{
            id: acaoAberta.id,
            title: acaoAberta.titulo_acao,
            priority: acaoAberta.prioridade,
            source: acaoAberta.categoria,
            status: acaoAberta.status,
            insight_id: acaoAberta.insight_id,
            responsavel: acaoAberta.responsavel,
            prazo: acaoAberta.prazo,
            plano_detalhado: acaoAberta.plano_detalhado,
          }}
          onDelete={handleExcluir}
        />
      )}
    </div>
  )
}
