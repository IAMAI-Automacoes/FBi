import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Mensagem extra mostrada no topo do card de erro (ex.: qual seção quebrou). */
  contexto?: string
}

interface State {
  error: Error | null
}

/**
 * Rede de segurança contra tela branca: sem isto, um erro não tratado em
 * QUALQUER componente derruba a árvore inteira do React sem nada pra
 * mostrar — é exatamente o "muda de página e fica em branco" relatado.
 * `main.tsx` já tinha uma cicatriz de um incidente assim (comentário sobre
 * `__BUILD_TIME__`), corrigido só naquele ponto específico; isto cobre
 * qualquer outro caso, atual ou futuro, com uma tela recuperável em vez de
 * nada.
 *
 * Erro de renderização (o que isto pega) é diferente de erro em handler de
 * clique ou em código assíncrono solto — aqueles não sobem até aqui, mas
 * continuam noutro lugar (`toast`/`console.error` de cada tela).
 */
/** Marca que esta aba já tentou se recuperar, para não entrar em laço. */
const CHAVE_RECARGA = 'ef:recarga-por-versao'

/**
 * O erro parece ser de versão obsoleta da página, e não bug no código?
 *
 * O app é dividido em pedaços carregados sob demanda (cada página é um
 * arquivo). Quando sai uma versão nova, os pedaços ganham nomes novos — e uma
 * aba que já estava aberta continua com o índice antigo em mãos. Ao navegar
 * para uma página que ainda não tinha visitado, ela pede um pedaço que não
 * existe mais no servidor.
 *
 * O sintoma não é um erro de rede claro: o pedaço não carrega, e o código que
 * dependia dele quebra citando o nome de um componente que "não existe" —
 * exatamente o `FiltroPeriodo is not defined` que apareceu ao ir de Relatórios
 * para Feedbacks logo depois de um deploy.
 *
 * Nenhum desses padrões é prova, então a recuperação é uma tentativa só.
 */
function pareceVersaoObsoleta(error: Error): boolean {
  const m = `${error?.name ?? ''} ${error?.message ?? ''}`
  return (
    /ChunkLoadError/i.test(m) ||
    /Failed to fetch dynamically imported module/i.test(m) ||
    /Importing a module script failed/i.test(m) ||
    /error loading dynamically imported module/i.test(m) ||
    /is not defined/i.test(m)
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] erro não tratado:', error, info.componentStack)

    // Uma recarga, e só uma: se o erro voltar, é bug de verdade e a pessoa
    // precisa VER a mensagem em vez de assistir a página piscar em laço.
    // `sessionStorage` (e não `localStorage`) porque a permissão para tentar
    // de novo vale para esta aba e esta visita.
    if (!pareceVersaoObsoleta(error)) return
    try {
      if (sessionStorage.getItem(CHAVE_RECARGA)) return
      sessionStorage.setItem(CHAVE_RECARGA, '1')
    } catch {
      // Aba anônima ou armazenamento bloqueado: sem como marcar a tentativa,
      // não recarrega — o risco de laço é pior que o de mostrar o erro.
      return
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      // Chegou aqui com o erro de versão obsoleta = a recarga já foi tentada e
      // não resolveu. Some com a marca para que a PRÓXIMA visita possa tentar
      // de novo; do contrário, uma falha de rede momentânea gastaria a única
      // tentativa desta aba para sempre.
      if (pareceVersaoObsoleta(this.state.error)) {
        try { sessionStorage.removeItem(CHAVE_RECARGA) } catch { /* sem storage */ }
      }
      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">
              {this.props.contexto ? `${this.props.contexto} — algo deu errado` : 'Algo deu errado'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Recarregar a página geralmente resolve. Se continuar, avise o suporte com o texto abaixo.
            </p>
          </div>
          <pre className="max-w-lg overflow-auto rounded-lg bg-gray-100 px-3 py-2 text-left text-[11px] text-gray-600">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
