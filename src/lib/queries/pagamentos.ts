import { supabase } from '@/lib/supabase/client'
import { contaVazia, type ContaDaReceita, type Software } from '@/lib/pagamentos'

/* Admin → Receita: a conta onde cai o dinheiro de cada software
   (`receita_contas`, uma linha por software, só admin da plataforma). */

const COLUNAS = 'area, titular, cpf_cnpj, chave_pix, codigo_banco, banco, agencia, conta, tipo_conta, observacoes'

export async function buscarContaDaReceita(area: Software): Promise<ContaDaReceita> {
  const { data, error } = await supabase.from('receita_contas').select(COLUNAS).eq('area', area).maybeSingle()
  if (error) throw error
  return data ? { ...(data as ContaDaReceita), tipo_conta: data.tipo_conta === 'poupanca' ? 'poupanca' : 'corrente' } : contaVazia(area)
}

export async function salvarContaDaReceita(c: ContaDaReceita): Promise<void> {
  const limpo = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('receita_contas').upsert({
    area: c.area,
    titular: limpo(c.titular),
    cpf_cnpj: limpo(c.cpf_cnpj),
    chave_pix: limpo(c.chave_pix),
    codigo_banco: limpo(c.codigo_banco),
    banco: limpo(c.banco),
    agencia: limpo(c.agencia),
    conta: limpo(c.conta),
    tipo_conta: c.tipo_conta ?? 'corrente',
    observacoes: limpo(c.observacoes),
    atualizado_em: new Date().toISOString(),
    atualizado_por: u.user?.email ?? null,
  }, { onConflict: 'area' })
  if (error) throw error
}
