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
 *
 * ## O bug que esta função teve, e por que ele era invisível
 *
 * Até 2026-08-26 o corpo era:
 *
 *     const ov = promptOverride(prompts, chave)
 *     if (ov == null) return padrao            // <-- sem substituir!
 *     return ov.replace(...)
 *
 * A substituição só acontecia no caminho da SOBRESCRITA. Sem sobrescrita — que
 * é o caso de produção, onde `prompts_editaveis` está vazia — a função devolvia
 * o template cru, com `{feedbacks}`, `{perfil}` e `{pontos}` como texto
 * literal. A IA nunca recebia os dados.
 *
 * E não dava erro nenhum: o modelo recebia um template plausível pedindo
 * "analise estes feedbacks: {feedbacks}" e simplesmente INVENTAVA insights
 * genéricos de restaurante. O resultado parecia legítimo o suficiente para
 * ninguém desconfiar, e a única pista visível era que os IDs de feedback
 * citados nunca batiam com nada — o que por muito tempo foi lido como "o
 * modelo não consegue copiar UUID", quando na verdade não havia feedback
 * algum no prompt para ele citar.
 *
 * Afetava TODA chamada de IA do servidor que passa por aqui: gerar-insights,
 * sugerir-acoes, categorizar-acao e o redator de mensagem do motor de resposta.
 *
 * A regex `\{(\w+)\}` não toca em exemplos de JSON dentro do prompt: `{` seguido
 * de espaço ou de aspas não casa, e `{}` também não (exige ao menos um \w).
 */
export function montarPrompt(
  prompts: Prompts,
  chave: string,
  padrao: string,
  vars: Record<string, string> = {},
): string {
  const base = promptOverride(prompts, chave) ?? padrao
  return base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}
