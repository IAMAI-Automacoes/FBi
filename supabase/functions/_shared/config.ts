/**
 * Configuração NÃO secreta das integrações (URL do site e afins).
 *
 * Segue o padrão da casa: `integracao_config` (chave/valor) é onde o projeto
 * já guarda URLs e ids de integração (uazapi, push). Lê de lá primeiro e cai
 * na variável de ambiente se a chave não existir ou estiver vazia — assim
 * dá para trocar a URL do site pelo painel/SQL, sem deploy.
 *
 * Segredos NÃO passam por aqui: ficam só em `supabase secrets`.
 */

// deno-lint-ignore no-explicit-any
type Db = any

export type ChaveConfig = 'SITE_URL'

export async function configuracao(db: Db, chave: ChaveConfig): Promise<string | null> {
  try {
    const { data } = await db.from('integracao_config').select('valor').eq('chave', chave).maybeSingle()
    const valor = String(data?.valor ?? '').trim()
    if (valor) return valor
  } catch (e) {
    console.warn(`[config] integracao_config.${chave} indisponível:`, (e as Error).message)
  }
  const env = Deno.env.get(chave)?.trim()
  return env || null
}

/** URL pública do site, sem barra no fim. Lança se não houver: sem ela não
    há link de volta (e-mails, OAuth, recuperação de senha). */
export async function siteUrl(db: Db): Promise<string> {
  const url = (await configuracao(db, 'SITE_URL'))?.replace(/\/+$/, '')
  if (!url || !/^https?:\/\//.test(url)) throw new Error('SITE_URL não configurada (integracao_config ou secret)')
  return url
}
