/**
 * EasyFeed Influencers: área escondida (/influencers) para parceiros que fazem
 * conteúdo para donos de restaurante. Ver a migration 20261008000000_influencers.
 *
 * O LOGIN NÃO É COMPARTILHADO com o EasyFeed normal: a área usa outro cliente do
 * Supabase, com a sessão guardada em outra chave do navegador
 * (`cliente-influencers.ts`). Entrar ou sair de um lado não mexe no outro.
 */
export const PREFIXO_INFLUENCERS = '/influencers'

export function ehEnderecoInfluencers(pathname: string): boolean {
  return pathname === PREFIXO_INFLUENCERS || pathname.startsWith(`${PREFIXO_INFLUENCERS}/`)
}

/** Avaliado uma vez, no carregamento (não há link entre a área e o resto do site). */
export const NA_AREA_INFLUENCERS = typeof window !== 'undefined' && ehEnderecoInfluencers(window.location.pathname)
