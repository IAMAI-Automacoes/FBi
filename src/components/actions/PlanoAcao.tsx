import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { EditorTextoRico } from '@/components/EditorTextoRico'
import { Loader2, Sparkles } from 'lucide-react'
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

  const escrever = (texto: string) => {
    setPlano(texto)
    onPlanoUpdate?.(texto)
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
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleGerarComIA}
            disabled={gerandoComIA || acaoId === undefined}
            title={acaoId === undefined ? 'Salve a ação primeiro para gerar o plano com IA' : undefined}
            className="ml-auto h-7 gap-1.5 px-2 text-xs text-gray-500 hover:text-gray-900"
          >
            {gerandoComIA ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Gerar com IA
          </Button>
        </div>
      )}

      <EditorTextoRico
        valor={plano}
        onChange={escrever}
        placeholder="Descreva os passos do plano…"
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
