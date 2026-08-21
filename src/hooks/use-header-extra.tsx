import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface HeaderExtraContextValue {
  extra: ReactNode
  setExtra: (node: ReactNode) => void
}

const HeaderExtraContext = createContext<HeaderExtraContextValue | null>(null)

/**
 * Slot de conteúdo extra dentro do cabeçalho fixo do topo (`TopHeader`).
 *
 * Existe pra evitar ter DOIS blocos fixos empilhados (o cabeçalho + uma barra
 * de filtros grudada logo abaixo, cada um `sticky` por conta própria) — isso
 * deixava uma emenda entre os dois onde o conteúdo que rola por trás vazava.
 * Com o slot, a página injeta os filtros DENTRO do mesmo `<header>` (que
 * cresce pra acomodar), então é um bloco fixo só, sem costura.
 */
export function HeaderExtraProvider({ children }: { children: ReactNode }) {
  const [extra, setExtra] = useState<ReactNode>(null)
  // Sem isso, o objeto do value nasceria de novo a cada render do provider,
  // forçando TODO consumidor (inclusive quem chamou `setExtra`) a
  // re-renderizar mesmo quando nada relevante mudou.
  const value = useMemo(() => ({ extra, setExtra }), [extra])
  return <HeaderExtraContext.Provider value={value}>{children}</HeaderExtraContext.Provider>
}

export function useHeaderExtra() {
  const ctx = useContext(HeaderExtraContext)
  if (!ctx) throw new Error('useHeaderExtra precisa estar dentro de <HeaderExtraProvider>')
  return ctx
}
