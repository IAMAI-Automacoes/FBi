import { useLocation } from 'react-router-dom'
import { useCategoriasDaConta } from '@/hooks/use-categorias'
import { caminhoDoPublico, ehRotaDaEquipe, type Publico } from '@/lib/publico-rota'

export type { Publico }

const TEXTOS = {
  cliente: { um: 'cliente', varios: 'clientes', deQuem: 'de clientes', chaveFiltros: '' },
  equipe: { um: 'funcionário', varios: 'funcionários', deQuem: 'da equipe', chaveFiltros: 'equipe:' },
} as const

/**
 * O público da tela, para o que muda na interface entre cliente e equipe:
 * textos ("clientes" x "funcionários"), a lista de categorias, os links entre
 * as páginas e quem falou.
 *
 * Sai do ENDEREÇO da página, igual aos dados (ver `publico-rota.ts`), e não de
 * um contexto do React em volta dela: a barra de filtros é desenhada dentro do
 * cabeçalho e os popups em portais, fora da árvore da página. Com contexto,
 * esses pedaços voltavam a ser "cliente" no meio de uma página da equipe.
 */
export function usePublico() {
  const { pathname } = useLocation()
  const publico: Publico = ehRotaDaEquipe(pathname) ? 'equipe' : 'cliente'
  // As categorias da CONTA (Configurações → Categorias); o padrão enquanto não chegam.
  const { nomes } = useCategoriasDaConta(publico)
  return {
    publico,
    ehEquipe: publico === 'equipe',
    /** As categorias que a IA usa para este público nesta conta, na ordem dela. */
    categorias: nomes,
    /** "/acoes" → "/equipe/acoes" nas páginas da equipe. */
    caminho: (c: string) => caminhoDoPublico(publico, c),
    /** Prefixo das chaves de filtro guardadas: o filtro de uma página não vaza para a outra. */
    chave: (c: string) => TEXTOS[publico].chaveFiltros + c,
    ...TEXTOS[publico],
  }
}
