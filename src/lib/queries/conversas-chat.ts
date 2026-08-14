import { supabase } from '@/lib/supabase/client'

/**
 * Metadados das conversas do chat (nome, fixada, pasta).
 *
 * As MENSAGENS continuam em `mensagens_chat`, que não é tocada. Aqui ficam só
 * os dados que antes viviam no localStorage e por isso sumiam ao limpar o
 * cache e não acompanhavam o dono em outro aparelho.
 */

export interface PastaChat {
  id: string
  restaurante_id: number
  nome: string
  ordem: number
  created_at: string
}

export interface ConversaChat {
  id: string
  restaurante_id: number
  sessao_id: string
  titulo: string | null
  fixada: boolean
  pasta_id: string | null
  created_at: string
  atualizada_em: string
}

export async function buscarConversas(restauranteId: number): Promise<ConversaChat[]> {
  const { data, error } = await supabase
    .from('conversas_chat')
    .select('*')
    .eq('restaurante_id', restauranteId)

  if (error) throw error
  return (data || []) as ConversaChat[]
}

export async function buscarPastas(restauranteId: number): Promise<PastaChat[]> {
  const { data, error } = await supabase
    .from('pastas_chat')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []) as PastaChat[]
}

/**
 * Grava (ou atualiza) os metadados de uma conversa. O upsert usa a restrição
 * única (restaurante_id, sessao_id), então clicar duas vezes não duplica.
 */
async function upsertConversa(
  restauranteId: number,
  sessaoId: string,
  campos: Partial<Pick<ConversaChat, 'titulo' | 'fixada' | 'pasta_id'>>,
) {
  const { error } = await supabase.from('conversas_chat').upsert(
    {
      restaurante_id: restauranteId,
      sessao_id: sessaoId,
      ...campos,
      atualizada_em: new Date().toISOString(),
    },
    { onConflict: 'restaurante_id,sessao_id' },
  )

  if (error) throw error
}

export async function salvarNomeConversa(
  restauranteId: number,
  sessaoId: string,
  titulo: string,
) {
  return upsertConversa(restauranteId, sessaoId, { titulo })
}

export async function alternarFixada(restauranteId: number, sessaoId: string, fixada: boolean) {
  return upsertConversa(restauranteId, sessaoId, { fixada })
}

export async function moverConversaParaPasta(
  restauranteId: number,
  sessaoId: string,
  pastaId: string | null,
) {
  return upsertConversa(restauranteId, sessaoId, { pasta_id: pastaId })
}

/**
 * Apaga a conversa inteira: os metadados e as mensagens.
 *
 * Checa o `error` das duas chamadas. O `.delete()` do Supabase RETORNA o erro
 * em vez de lançar, e o código antigo não olhava — por isso o aviso de sucesso
 * aparecia mesmo quando a exclusão falhava.
 */
export async function excluirConversa(restauranteId: number, sessaoId: string) {
  const { error: erroMensagens } = await supabase
    .from('mensagens_chat')
    .delete()
    .eq('sessao_id', sessaoId)

  if (erroMensagens) throw erroMensagens

  const { error: erroConversa } = await supabase
    .from('conversas_chat')
    .delete()
    .eq('restaurante_id', restauranteId)
    .eq('sessao_id', sessaoId)

  if (erroConversa) throw erroConversa
}

export async function criarPasta(restauranteId: number, nome: string): Promise<PastaChat> {
  const { data, error } = await supabase
    .from('pastas_chat')
    .insert([{ restaurante_id: restauranteId, nome }])
    .select()
    .single()

  if (error) throw error
  return data as PastaChat
}

export async function renomearPasta(pastaId: string, nome: string) {
  const { error } = await supabase.from('pastas_chat').update({ nome }).eq('id', pastaId)
  if (error) throw error
}

/** As conversas da pasta não são apagadas: o FK usa `on delete set null`, então
 *  elas voltam para a raiz da lista. */
export async function excluirPasta(pastaId: string) {
  const { error } = await supabase.from('pastas_chat').delete().eq('id', pastaId)
  if (error) throw error
}

const LS_MIGRADO = 'chat_nomes_migrados_v1'
const LS_NOMES = 'chat_sessao_nomes'
const LS_FIXADAS = 'chat_sessao_fixadas'

/**
 * Sobe, uma única vez, os nomes e as fixações que estavam no localStorage.
 *
 * As chaves antigas NÃO são apagadas: ficam como rede de segurança por um
 * release, caso seja preciso voltar atrás.
 */
export async function migrarNomesLocaisParaBanco(restauranteId: number) {
  if (localStorage.getItem(LS_MIGRADO)) return

  try {
    const nomes: Record<string, string> = JSON.parse(localStorage.getItem(LS_NOMES) || '{}')
    const fixadas: string[] = JSON.parse(localStorage.getItem(LS_FIXADAS) || '[]')

    const sessoes = new Set([...Object.keys(nomes), ...fixadas])
    if (sessoes.size === 0) {
      localStorage.setItem(LS_MIGRADO, '1')
      return
    }

    const linhas = Array.from(sessoes).map((sessaoId) => ({
      restaurante_id: restauranteId,
      sessao_id: sessaoId,
      titulo: nomes[sessaoId] || null,
      fixada: fixadas.includes(sessaoId),
    }))

    const { error } = await supabase
      .from('conversas_chat')
      .upsert(linhas, { onConflict: 'restaurante_id,sessao_id' })

    if (error) throw error
    localStorage.setItem(LS_MIGRADO, '1')
  } catch (e) {
    // Falhar aqui não pode quebrar a abertura do chat: na próxima vez tenta de
    // novo, já que a marca de "migrado" só é gravada em caso de sucesso.
    console.error('Falha ao migrar nomes de conversa para o banco', e)
  }
}
