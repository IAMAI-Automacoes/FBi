import { supabase } from '@/lib/supabase/client'

/**
 * Exclusão reversível da própria conta (soft-delete). Feita numa edge function
 * com service_role porque o usuário não pode alterar o próprio `excluida_em`
 * (um trigger no banco bloqueia). A pessoa perde o acesso na hora; os dados
 * ficam guardados e só o admin da plataforma pode restaurar.
 */
export async function excluirMinhaConta(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('excluir-minha-conta', { body: {} })
  if (error) {
    // invoke() só devolve "non-2xx"; a mensagem real vem no corpo.
    let detalhe = error.message
    try {
      const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
      if (corpo?.error) detalhe = corpo.error
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(detalhe)
  }
  if (data?.error) throw new Error(data.error)
}
