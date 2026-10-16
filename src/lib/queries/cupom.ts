import { supabase } from '@/lib/supabase/client'

export interface ResultadoCupom {
  ok: boolean
  /** O cupom liberou o acesso. Falso = só guardou um desconto para a cobrança. */
  acesso: boolean
  /** ISO da expiração do acesso, ou null quando o cupom não expira. */
  expira_em: string | null
  /** Dias de acesso liberados, ou null (sem expiração). */
  dias: number | null
  /** O desconto que ficou guardado (entra na 1ª cobrança do Asaas). */
  desconto: { tipo: 'porcentagem' | 'valor'; valor: number } | null
  tipo_conta: 'normal' | 'vendedor' | 'admin'
}

/**
 * Resgata um cupom de acesso. A liberação é feita no servidor (edge function
 * `resgatar-cupom`, com service_role) porque o usuário não pode alterar o
 * próprio `assinatura_status` — um trigger no banco bloqueia isso.
 */
export async function resgatarCupom(codigo: string): Promise<ResultadoCupom> {
  const { data, error } = await supabase.functions.invoke('resgatar-cupom', {
    body: { codigo },
  })
  if (error) {
    // invoke() só devolve "non-2xx"; a mensagem real vem no corpo da resposta
    let detalhe = error.message
    try {
      const corpo = await (error as any).context?.json?.()
      if (corpo?.error) detalhe = corpo.error
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(detalhe)
  }
  if (data?.error) throw new Error(data.error)
  // A versão antiga da função não mandava `acesso`: todo cupom liberava.
  return { acesso: true, desconto: null, tipo_conta: 'normal', ...data } as ResultadoCupom
}
