import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { gerarPlanoAcao } from '@/lib/queries/acoes'

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
  const [gerandoComIA, setGerandoComIA] = useState(false)
  // Baseline pra comparar (mostra "Desfazer" quando `plano` diverge) e pra
  // onde o "Desfazer" volta. `planoInicial` só muda de verdade quando uma
  // ação DIFERENTE é carregada (o TaskModal manda o snapshot fixo do que
  // abriu, não o estado ao vivo) — daí dar pra usar o próprio prop como
  // gatilho do efeito sem ele ficar perseguindo o que o usuário digita.
  const planoOriginalRef = useRef(planoInicial)

  useEffect(() => {
    setPlano(planoInicial)
    planoOriginalRef.current = planoInicial
  }, [planoInicial])

  const sujo = plano !== planoOriginalRef.current

  const handleDesfazer = () => {
    setPlano(planoOriginalRef.current)
    onPlanoUpdate?.(planoOriginalRef.current)
  }

  const handleGerarComIA = async () => {
    // A edge function lê a ação no banco para montar o prompt, então só faz
    // sentido depois que a linha existe.
    if (acaoId === undefined) return
    try {
      setGerandoComIA(true)
      toast.info('Gerando plano com IA...')
      const data = await gerarPlanoAcao(acaoId)
      if (data?.status === 'contexto_insuficiente') {
        toast.warning(
          'Não há informação suficiente para gerar um plano. ' +
            (data.motivo || 'Descreva melhor o título ou o plano antes de tentar de novo.'),
        )
      } else if (data?.plano_detalhado) {
        setPlano(data.plano_detalhado)
        onPlanoUpdate?.(data.plano_detalhado)
        // A edge function já grava direto no banco — a partir daqui este É
        // o texto "de referência", então "Desfazer" não deve oferecer voltar
        // pra um rascunho que nem existe mais salvo em lugar nenhum.
        planoOriginalRef.current = data.plano_detalhado
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

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      {!isConcluido && (
        <div className="flex items-center justify-end gap-2">
          {sujo && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDesfazer}
              className="flex items-center gap-1 text-slate-600"
            >
              <RotateCcw className="w-4 h-4" />
              Desfazer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGerarComIA}
            disabled={gerandoComIA || acaoId === undefined}
            title={acaoId === undefined ? 'Salve a ação primeiro para gerar o plano com IA' : undefined}
            className="flex items-center gap-1"
          >
            {gerandoComIA ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Gerar com IA
          </Button>
        </div>
      )}

      <Textarea
        value={plano}
        onChange={(e) => {
          setPlano(e.target.value)
          onPlanoUpdate?.(e.target.value)
        }}
        placeholder="Digite o plano de ação..."
        className="min-h-[120px] text-sm resize-none"
        disabled={isConcluido}
      />

      {isConcluido && (
        <div className="text-xs bg-slate-100 p-2 rounded-md text-slate-600 border border-slate-200">
          Ação concluída. O plano não pode ser editado.
        </div>
      )}
    </div>
  )
}
