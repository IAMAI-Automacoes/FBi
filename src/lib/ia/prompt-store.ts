import { supabase } from '@/lib/supabase/client'

// A tabela prompts_editaveis não está nos tipos gerados; acesso destipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Sobrescritas dos system prompts, editáveis pelo painel de admin.
 *
 * Os prompts padrão vivem no código (prompts-sistema.ts). Quando existe uma
 * sobrescrita no banco para uma chave, ela é usada NO LUGAR do padrão — assim o
 * admin muda o comportamento da IA sem mexer no código. Fica num cache de módulo,
 * carregado uma vez no início; os construtores de prompt leem daqui de forma
 * síncrona (com o padrão do código como reserva).
 */
let cache: Record<string, string> = {}
let carregado = false

/** Devolve a sobrescrita da chave, ou null se não houver (usa-se o padrão). */
export function promptOverride(chave: string): string | null {
  const v = cache[chave]
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Monta o prompt de um agente: pega a sobrescrita (se houver) ou o template
 * padrão, e substitui os placeholders {nome} pelos valores em `vars`. Os
 * placeholders são a parte dinâmica (dados da conversa) — o admin edita o texto
 * ao redor, mas não pode remover os placeholders (validado ao salvar).
 */
export function montarPrompt(
  chave: string,
  padrao: string,
  vars: Record<string, string>,
): string {
  const ov = promptOverride(chave)
  // Sem sobrescrita: devolve o padrão do código INTOCADO — comportamento idêntico
  // ao de antes (zero risco). Só a edição do admin ativa a substituição.
  if (ov == null) return padrao
  return ov.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

/** Placeholders {x} presentes num texto — usado para validar edições. */
export function placeholdersDe(texto: string): string[] {
  const achados = new Set<string>()
  for (const m of texto.matchAll(/\{(\w+)\}/g)) achados.add(m[1])
  return [...achados]
}

/** true quando as sobrescritas já foram buscadas do banco ao menos uma vez. */
export function promptsCarregados(): boolean {
  return carregado
}

/** Carrega todas as sobrescritas para o cache. Nunca lança. */
export async function carregarPromptsEditaveis(): Promise<void> {
  try {
    const { data, error } = await db
      .from('prompts_editaveis')
      .select('chave, conteudo')
    if (error) return
    const novo: Record<string, string> = {}
    for (const linha of data || []) {
      novo[(linha as any).chave] = (linha as any).conteudo
    }
    cache = novo
    carregado = true
  } catch {
    /* silencioso: sem sobrescritas, a IA usa os padrões do código */
  }
}

/** Salva (ou remove) uma sobrescrita e atualiza o cache. Só admin passa na RLS. */
export async function salvarPromptEditavel(chave: string, conteudo: string): Promise<void> {
  const texto = conteudo.trim()
  if (!texto) {
    const { error } = await db.from('prompts_editaveis').delete().eq('chave', chave)
    if (error) throw new Error(error.message)
    delete cache[chave]
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await db
    .from('prompts_editaveis')
    .upsert({ chave, conteudo: texto, updated_at: new Date().toISOString(), updated_by: user?.email ?? null })
    .select('chave')
  if (error) throw new Error(error.message)
  cache[chave] = texto
}
