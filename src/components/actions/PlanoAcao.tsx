import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, Edit2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { atualizarAcao } from '@/lib/queries/acoes'

interface PlanoAcaoProps {
  /** Ausente enquanto a ação ainda não existe no banco (modo criação): o texto
   *  fica só no estado do pai até a linha ser inserida. */
  acaoId?: number
  planoInicial?: string
  isConcluido?: boolean
  onPlanoUpdate?: (novoPlano: string) => void
}

export function PlanoAcao({
  acaoId,
  planoInicial = '',
  isConcluido = false,
  onPlanoUpdate,
}: PlanoAcaoProps) {
  const [plano, setPlano] = useState(planoInicial)
  const [editando, setEditando] = useState(false)
  const [planoTemporario, setPlanoTemporario] = useState(plano)
  const [salvando, setSalvando] = useState(false)
  const [gerandoComIA, setGerandoComIA] = useState(false)

  useEffect(() => {
    setPlano(planoInicial)
    setPlanoTemporario(planoInicial)
  }, [planoInicial])

  const handleSalvar = async () => {
    if (planoTemporario.trim() === plano) {
      setEditando(false)
      return
    }

    try {
      setSalvando(true)
      // Sem acaoId a ação ainda não existe: o pai guarda o texto e grava junto
      // com o resto no insert.
      if (acaoId !== undefined) {
        await atualizarAcao(acaoId, {
          plano_detalhado: planoTemporario.trim(),
        })
      }
      setPlano(planoTemporario)
      setEditando(false)
      onPlanoUpdate?.(planoTemporario.trim())
      if (acaoId !== undefined) toast.success('Plano atualizado com sucesso!')
    } catch (err) {
      toast.error('Erro ao atualizar plano')
      console.error(err)
    } finally {
      setSalvando(false)
    }
  }

  const handleCancelar = () => {
    setPlanoTemporario(plano)
    setEditando(false)
  }

  const handleGerarComIA = async () => {
    // A edge function lê a ação no banco para montar o prompt, então só faz
    // sentido depois que a linha existe.
    if (acaoId === undefined) return
    try {
      setGerandoComIA(true)
      toast.info('Gerando plano com IA...')
      const { data, error } = await supabase.functions.invoke('gerar-plano-acao', {
        body: { acao_id: acaoId },
      })
      if (error) throw error
      if (data?.plano_detalhado) {
        setPlano(data.plano_detalhado)
        setPlanoTemporario(data.plano_detalhado)
        onPlanoUpdate?.(data.plano_detalhado)
        toast.success('Plano gerado com sucesso!')
      } else {
        toast.error('Não foi possível gerar o plano')
      }
    } catch (err: any) {
      toast.error('Erro ao gerar plano: ' + (err.message || 'tente novamente'))
    } finally {
      setGerandoComIA(false)
    }
  }

  if (editando) {
    return (
      <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
        <Textarea
          value={planoTemporario}
          onChange={(e) => setPlanoTemporario(e.target.value)}
          placeholder="Digite o plano de ação..."
          className="min-h-[120px] text-sm resize-none"
          disabled={isConcluido}
        />
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancelar}
            disabled={salvando}
            className="flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={salvando || planoTemporario.trim() === ''}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      {plano ? (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[100px]">
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{plano}</p>
        </div>
      ) : (
        <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-300 border-dashed">
          <p className="text-sm text-muted-foreground mb-3">Nenhum plano criado ainda.</p>
        </div>
      )}

      <div className="flex gap-2">
        {!isConcluido && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditando(true)
              }}
              className="flex-1 flex items-center justify-center gap-1"
            >
              <Edit2 className="w-4 h-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarComIA}
              disabled={gerandoComIA || acaoId === undefined}
              title={
                acaoId === undefined
                  ? 'Salve a ação primeiro para gerar o plano com IA'
                  : undefined
              }
              className="flex-1 flex items-center justify-center gap-1"
            >
              {gerandoComIA ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Gerar com IA
            </Button>
          </>
        )}
      </div>

      {isConcluido && (
        <div className="text-xs bg-slate-100 p-2 rounded-md text-slate-600 border border-slate-200">
          Ação concluída. O plano não pode ser editado.
        </div>
      )}
    </div>
  )
}
