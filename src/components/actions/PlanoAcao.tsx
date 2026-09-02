import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, Bold, Heading } from 'lucide-react'
import { toast } from 'sonner'
import { gerarPlanoAcao } from '@/lib/queries/acoes'
import { useAlturaAutomatica } from '@/hooks/use-altura-automatica'

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

  // O campo cresce com o texto: o plano é o conteúdo mais longo da tela e
  // rolar dentro de uma caixa de 120px enquanto o painel também rola põe dois
  // eixos de rolagem no mesmo gesto.
  const refTexto = useAlturaAutomatica<HTMLTextAreaElement>(plano)

  const escrever = (texto: string) => {
    setPlano(texto)
    onPlanoUpdate?.(texto)
  }

  /**
   * Formatação em marcadores de texto (`**negrito**`, `## Título`), e não num
   * editor de conteúdo rico.
   *
   * O plano vai para `acoes_operacionais.plano_detalhado`, que é `text` puro,
   * e esse mesmo texto é lido pela IA quando ela procura os feedbacks que a
   * ação resolve e quando gera o plano. HTML ali sujaria o prompt com tags e
   * quebraria a exibição em todo lugar que hoje mostra o campo direto.
   *
   * Com marcador, o texto continua legível como texto em qualquer lugar, e o
   * painel de detalhes renderiza o destaque (ver `TextoFormatado`).
   */
  const formatar = (marca: 'negrito' | 'titulo') => {
    const el = refTexto.current
    if (!el) return
    const ini = el.selectionStart
    const fim = el.selectionEnd

    let novo: string
    let cursor: number
    if (marca === 'negrito') {
      const sel = plano.slice(ini, fim) || 'texto'
      novo = plano.slice(0, ini) + '**' + sel + '**' + plano.slice(fim)
      cursor = ini + 2 + sel.length
    } else {
      // Título vale para a linha inteira: procura o começo dela e prefixa.
      const inicioLinha = plano.lastIndexOf('\n', ini - 1) + 1
      const jaTem = plano.slice(inicioLinha).startsWith('## ')
      novo = jaTem
        ? plano.slice(0, inicioLinha) + plano.slice(inicioLinha + 3)
        : plano.slice(0, inicioLinha) + '## ' + plano.slice(inicioLinha)
      cursor = ini + (jaTem ? -3 : 3)
    }

    escrever(novo)
    // O valor só chega ao DOM no próximo quadro; sem isto o cursor volta para
    // o fim do texto e a pessoa perde o lugar onde estava escrevendo.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
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
        <div className="flex items-center gap-1">
          {/* Ícone só, sem rótulo: são dois controles de formatação numa barra
              estreita, e "Negrito"/"Título" escritos por extenso pesariam mais
              que o campo que eles editam. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => formatar('negrito')}
            aria-label="Negrito"
            title="Negrito"
            className="h-7 w-7 text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => formatar('titulo')}
            aria-label="Título"
            title="Título da linha"
            className="h-7 w-7 text-gray-500 hover:bg-gray-200/70 hover:text-gray-900"
          >
            <Heading className="h-4 w-4" />
          </Button>

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

      {/* `overflow-hidden`: sem ele a barra de rolagem pisca no instante entre
          o texto crescer e o efeito remedir a altura. */}
      {/* `spellCheck={false}`: o corretor do navegador sublinhava de vermelho
          nome de prato, nome de funcionário e termo de cozinha — palavras
          certas que ele não conhece. Num plano operacional isso é quase toda
          linha, e o vermelho passa a significar nada.

          `overflow-hidden`: sem ele a barra de rolagem pisca no instante entre
          o texto crescer e o efeito remedir a altura. */}
      <Textarea
        ref={refTexto}
        value={plano}
        onChange={(e) => escrever(e.target.value)}
        spellCheck={false}
        placeholder="Digite o plano de ação…"
        className="min-h-[120px] resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
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
