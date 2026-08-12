/**
 * Sobrescritas de system prompt no servidor.
 *
 * Porta da lógica que já existia no navegador (src/lib/ia/prompt-store.ts) para
 * as edge functions, que até aqui tinham o prompt fixo no .ts e ignoravam o
 * painel de admin: o admin editava, salvava em prompts_editaveis, e a IA
 * continuava usando o texto do arquivo.
 *
 * A semântica é idêntica à do front, de propósito: SEM sobrescrita, devolve o
 * padrão do código intocado. Só a edição do admin ativa a substituição, então
 * quem nunca abrir o painel roda exatamente como antes.
 */
// deno-lint-ignore no-explicit-any
type Db = any

export type Prompts = Record<string, string>

/**
 * Carrega as sobrescritas. Nunca lança: se a tabela sumir ou a consulta falhar,
 * as funções seguem com os padrões do código em vez de quebrar a geração.
 *
 * Sem cache de módulo: cada invocação relê, de modo que a edição do admin passa
 * a valer na próxima execução (a instância do Deno é reaproveitada entre
 * requisições e um cache global serviria texto velho por tempo indefinido).
 */
export async function carregarPrompts(db: Db): Promise<Prompts> {
  try {
    const { data, error } = await db.from('prompts_editaveis').select('chave, conteudo')
    if (error) return {}
    const mapa: Prompts = {}
    for (const linha of data || []) mapa[linha.chave] = linha.conteudo
    return mapa
  } catch {
    return {}
  }
}

/** Devolve a sobrescrita da chave, ou null se não houver (usa-se o padrão). */
export function promptOverride(prompts: Prompts, chave: string): string | null {
  const v = prompts[chave]
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Monta o prompt de um agente: pega a sobrescrita (se houver) ou o padrão, e
 * substitui os placeholders {nome} pelos valores em `vars`. O admin edita o
 * texto ao redor, mas não pode remover os placeholders — a validação está no
 * painel (src/pages/admin/PainelAgentes.tsx).
 */
export function montarPrompt(
  prompts: Prompts,
  chave: string,
  padrao: string,
  vars: Record<string, string> = {},
): string {
  const ov = promptOverride(prompts, chave)
  if (ov == null) return padrao
  return ov.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}
