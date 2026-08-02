/* Fonte única da verdade do fluxo de compra: Conta → Pagamento → Acesso.

   Sem JSX e sem imports de React de propósito — assim dá para consultar o mapa
   em lógica de rota sem arrastar a árvore de componentes junto. */

export type EtapaCompra = 1 | 2 | 3

export interface DefinicaoEtapa {
  numero: EtapaCompra
  /** CONTRATO: rótulos curtos. A trilha precisa caber nos 340px do AuthLayout
      com `nowrap`; um rótulo longo quebra o layout em silêncio. */
  rotulo: string
  /** Exibida abaixo da trilha quando esta é a etapa atual. */
  legenda: string
}

export const ETAPAS_COMPRA: readonly DefinicaoEtapa[] = [
  {
    numero: 1,
    rotulo: 'Conta',
    legenda: 'Falta pouco: sua conta é o primeiro passo para concluir a assinatura.',
  },
  {
    numero: 2,
    rotulo: 'Pagamento',
    legenda: 'Escolha o plano e confirme o pagamento para liberar seu acesso.',
  },
  {
    numero: 3,
    rotulo: 'Acesso',
    legenda: 'Pagamento confirmado. Agora é só configurar seu restaurante.',
  },
] as const

/* Escolher o ciclo (/assinatura) é parte de pagar, não uma quarta etapa: o
   número de bolinhas precisa ser o mesmo em todas as telas, senão a trilha
   deixa de ser contínua. `/onboarding` mora aqui como documentação — a tela
   não renderiza a trilha, porque já tem uma barra própria de 4 passos. */
const ETAPA_POR_ROTA: Record<string, EtapaCompra> = {
  '/login': 1,
  '/cadastro': 1,
  '/assinatura': 2,
  '/checkout': 2,
  '/checkout/sucesso': 3,
  '/onboarding': 3,
}

/** Etapa correspondente a um caminho. Use SEMPRE isto para decidir o número da
    etapa — nunca `startsWith`, que faria `/checkout/sucesso` cair como etapa 2. */
export function etapaDaRota(pathname: string): EtapaCompra | null {
  return ETAPA_POR_ROTA[pathname] ?? null
}

/** A pessoa está no meio de uma compra?
    Recebe o destino pós-auth, que chega com query string (`/checkout?ciclo=anual`)
    — daí o corte antes de consultar o mapa. As próprias telas de auth não contam:
    estar em /login não significa estar comprando. */
export function ehRotaDeCompra(destino: string): boolean {
  const caminho = destino.split('?')[0]
  if (caminho === '/login' || caminho === '/cadastro') return false
  return etapaDaRota(caminho) !== null
}
