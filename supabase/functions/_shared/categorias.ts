/**
 * As categorias de uma conta para as funções do motor.
 *
 * Desde 15/10/2026 cada conta edita as suas (Configurações → Categorias,
 * tabela `categorias`). A lista vem de `categorias_da_conta` (banco), que já
 * devolve o padrão quando a conta não mexeu e garante "Outros". Falhar aqui
 * nunca para a IA: cai no padrão do público.
 *
 * Sem import de fora: dá para testar com `node --experimental-strip-types`.
 */
import { CATEGORIAS_CLIENTE, CATEGORIAS_EQUIPE, type Publico } from './publico.ts'

// deno-lint-ignore no-explicit-any
type Banco = any

export const categoriasPadrao = (publico: Publico): string[] => (publico === 'equipe' ? [...CATEGORIAS_EQUIPE] : [...CATEGORIAS_CLIENTE])

export async function categoriasDaConta(db: Banco, restauranteId: unknown, publico: Publico): Promise<string[]> {
  try {
    const id = Number(restauranteId)
    if (!Number.isFinite(id)) return categoriasPadrao(publico)
    const { data, error } = await db.rpc('categorias_da_conta', { p_restaurante_id: id, p_publico: publico })
    const nomes = (data as { nomes?: unknown } | null)?.nomes
    if (!error && Array.isArray(nomes) && nomes.length) return nomes.map((n) => String(n)).filter(Boolean)
  } catch { /* cai no padrão */ }
  return categoriasPadrao(publico)
}

/** A lista do público: a da conta, quando veio, ou o padrão. */
export const categoriasDe = (publico: Publico, daConta?: readonly string[] | null): string[] =>
  (daConta?.length ? [...daConta] : categoriasPadrao(publico))
