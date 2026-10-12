/**
 * De que público é a tela aberta: 'cliente' (o sistema de sempre) ou 'equipe'
 * (as páginas /equipe/*, com o feedback dos funcionários).
 *
 * As páginas da equipe são as MESMAS de Feedbacks, Insights e Ações. O que
 * separa os dados é o banco: toda leitura e gravação feita a partir de uma
 * rota /equipe leva o cabeçalho `x-publico: equipe` (posto em
 * `supabase/client.ts`), e a política do banco só entrega e aceita linhas
 * daquele público (migration 20261014000000). Sem o cabeçalho vale 'cliente'.
 *
 * Fica separado de `publico.tsx` (o contexto do React) porque o cliente do
 * Supabase importa daqui, e ele não pode depender de componente.
 */
export type Publico = 'cliente' | 'equipe'

export const CABECALHO_PUBLICO = 'x-publico'

/**
 * As tabelas que têm a coluna `publico` (e a política que separa os dois).
 * As que só se ligam a elas (insight_feedback, feedback_acao) entram porque a
 * linha que elas apontam é que é da equipe.
 */
export const TABELAS_COM_PUBLICO: ReadonlySet<string> = new Set([
  'feedbacks_originais',
  'feedbacks_restaurante',
  'feedback_temas',
  'insights',
  'acoes_operacionais',
  'insight_feedback',
  'feedback_acao',
])

/** O caminho é de uma página da equipe? ("/equipe", "/equipe/feedbacks"…) */
export const ehRotaDaEquipe = (caminho: string) => /(^|\/)equipe(\/|$)/.test(caminho)

/** A página aberta agora é da equipe? */
export const naRotaDaEquipe = () => typeof window !== 'undefined' && ehRotaDaEquipe(window.location.pathname)

/** "/acoes" → "/equipe/acoes" quando o público é a equipe. */
export const caminhoDoPublico = (publico: Publico, caminho: string) => (publico === 'equipe' ? `/equipe${caminho}` : caminho)

/**
 * Só as chamadas ao banco (PostgREST) levam o público. Funções, login,
 * arquivos e tempo real não: as funções recebem `publico` no corpo.
 */
export const levaOPublico = (url: string) => url.includes('/rest/v1/')
