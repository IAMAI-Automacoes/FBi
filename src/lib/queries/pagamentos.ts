import { supabase } from '@/lib/supabase/client'
import type { Area } from '@/lib/areas'
import type { ParteDaDivisao, Recebedor } from '@/lib/pagamentos'

/* Admin → Pagamentos. Tudo sob RLS de admin da plataforma (recebedores e
   divisao_receita). A % é por software (area); a pessoa é a mesma em todos. */

const COLUNAS = 'id, nome, email, cpf_cnpj, chave_pix, codigo_banco, banco, agencia, conta, tipo_conta, observacoes'

export async function buscarRecebedores(): Promise<Recebedor[]> {
  const { data, error } = await supabase.from('recebedores').select(COLUNAS).order('criado_em')
  if (error) throw error
  return (data ?? []) as Recebedor[]
}

/** Cria (sem id) ou atualiza a pessoa. Devolve o id. */
export async function salvarRecebedor(r: Omit<Recebedor, 'id'> & { id?: string }): Promise<string> {
  const limpo = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  const linha = {
    nome: r.nome.trim(),
    email: limpo(r.email)?.toLowerCase() ?? null,
    cpf_cnpj: limpo(r.cpf_cnpj),
    chave_pix: limpo(r.chave_pix),
    codigo_banco: limpo(r.codigo_banco),
    banco: limpo(r.banco),
    agencia: limpo(r.agencia),
    conta: limpo(r.conta),
    tipo_conta: r.tipo_conta ?? null,
    observacoes: limpo(r.observacoes),
    atualizado_em: new Date().toISOString(),
  }
  if (r.id) {
    const { error } = await supabase.from('recebedores').update(linha).eq('id', r.id)
    if (error) throw error
    return r.id
  }
  const { data, error } = await supabase.from('recebedores').insert(linha).select('id').single()
  if (error) throw error
  return data.id
}

/** A divisão de um software. */
export async function buscarDivisao(area: Area): Promise<ParteDaDivisao[]> {
  const { data, error } = await supabase
    .from('divisao_receita')
    .select('id, recebedor_id, nome, valor, ativo, recebedores(nome)')
    .eq('area', area)
    .eq('tipo', 'porcentagem')
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    recebedor_id: d.recebedor_id,
    nome: (d.recebedores as { nome: string } | null)?.nome ?? d.nome,
    valor: Number(d.valor) || 0,
    ativo: d.ativo,
  }))
}

/** Põe a pessoa na divisão de um software, ou muda a parte dela. */
export async function salvarParte(area: Area, parte: { id?: string; recebedor_id: string; nome: string; valor: number; ativo: boolean }): Promise<void> {
  const linha = { area, recebedor_id: parte.recebedor_id, nome: parte.nome, tipo: 'porcentagem', valor: parte.valor, ativo: parte.ativo }
  const { error } = parte.id
    ? await supabase.from('divisao_receita').update(linha).eq('id', parte.id)
    : await supabase.from('divisao_receita').insert(linha)
  if (error) throw error
}

/** Tira a pessoa da divisão deste software (os dados dela ficam). */
export async function removerParte(id: string): Promise<void> {
  const { error } = await supabase.from('divisao_receita').delete().eq('id', id)
  if (error) throw error
}

/** O nome de quem tem conta no EasyFeed com este e-mail (para "puxar da conta"). */
export async function nomeDaContaPorEmail(email: string): Promise<string | null> {
  const alvo = email.trim().toLowerCase()
  if (!alvo) return null
  const { data } = await supabase.from('usuarios').select('nome').ilike('email', alvo.replace(/[%_]/g, '\\$&')).maybeSingle()
  return (data?.nome as string | undefined)?.trim() || null
}
