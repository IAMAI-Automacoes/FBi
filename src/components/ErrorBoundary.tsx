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
/** Quando esta aba tentou se recuperar pela última vez (ms desde a época). */
const CHAVE_RECARGA = 'ef:recarga-por-versao'

/**
 * Por quanto tempo uma tentativa de recarga bloqueia a seguinte.
 *
 * Antes a marca era um booleano apagado dentro do `render` — a ideia era
 * liberar a próxima visita, mas o efeito era desfazer a proteção no exato
 * instante em que ela precisava valer: a tela de erro aparecia, a marca sumia,
 * qualquer remontagem do boundary caía de novo em `componentDidCatch` sem
 * marca nenhuma, e recarregava. Dava o laço de "erro → branco → carregando →
 * erro" que não deixa nem ler a mensagem.
 *
 * Um carimbo de tempo resolve os dois lados: dentro da janela não recarrega
 * (a pessoa vê o erro e o botão), e uma visita depois dela pode tentar de novo
 * — que era a intenção original.
 */
const JANELA_SEM_RECARGA_MS = 60_000

/** Já houve uma tentativa recente nesta aba? */
function tentouAgoraPouco(): boolean {
  try {
    const marca = Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0)
    return Number.isFinite(marca) && Date.now() - marca < JANELA_SEM_RECARGA_MS
  } catch {
    // Sem armazenamento não há como saber; assume que sim, porque repetir a
    // recarga às cegas é justamente o que produz o laço.
    return true
  }
}

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

    // Uma recarga por janela de tempo: se o erro voltar logo em seguida, é bug
    // de verdade e a pessoa precisa VER a mensagem em vez de assistir a página
    // piscar em laço. `sessionStorage` (e não `localStorage`) porque a
    // permissão para tentar de novo vale para esta aba e esta visita.
    if (!pareceVersaoObsoleta(error)) return
    if (tentouAgoraPouco()) return
    try {
      sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()))
    } catch {
      // Aba anônima ou armazenamento bloqueado: sem como marcar a tentativa,
      // não recarrega — o risco de laço é pior que o de mostrar o erro.
      return
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      // A marca NÃO é apagada aqui. Era o que fazia a proteção evaporar assim
      // que a tela de erro aparecia — e o laço nascia disso. Ela expira
      // sozinha depois de `JANELA_SEM_RECARGA_MS`, que é o que libera uma
      // tentativa nova mais tarde sem abrir a porta para o laço agora.
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
