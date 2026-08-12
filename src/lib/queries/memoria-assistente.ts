import { supabase } from '@/lib/supabase/client'
import { enviarMensagem } from '@/lib/openrouter'
import { construirSystemPromptMemoria } from '@/lib/prompts-sistema'
import { paramsDoAgente } from '@/lib/ia/params'

export interface FatoMemoria {
  id: string
  fato: string
  categoria: string
}

const LIMITE_MEMORIA = 60

/** Fatos que o assistente já aprendeu sobre este restaurante. */
export async function buscarMemoria(restauranteId: number | null): Promise<FatoMemoria[]> {
  if (!restauranteId) return []
  const { data, error } = await supabase
    .from('memoria_assistente')
    .select('id, fato, categoria')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(LIMITE_MEMORIA)
  if (error) return []
  return (data || []) as FatoMemoria[]
}

/**
 * Lê a última troca de mensagens e guarda o que for duradouro.
 * Roda em segundo plano — falhar aqui nunca pode quebrar o chat.
 */
export async function memorizarDaConversa(
  restauranteId: number | null,
  pergunta: string,
  resposta: string,
  memoriaAtual: FatoMemoria[],
): Promise<void> {
  if (!restauranteId || !pergunta.trim()) return

  try {
    const conversa = `Usuário: ${pergunta}\nAssistente: ${resposta}`.slice(0, 4000)
    const bruto = await enviarMensagem(
      [
        { role: 'system', content: construirSystemPromptMemoria(conversa, memoriaAtual.map((m) => m.fato)) },
        { role: 'user', content: 'Extraia os fatos no formato JSON pedido.' },
      ],
      paramsDoAgente('memoria_longo_prazo', { response_format: { type: 'json_object' } }),
      'memoria_longo_prazo',
    )

    const parsed =
      typeof bruto === 'string'
        ? JSON.parse(bruto.replace(/^```(?:json)?|```$/g, '').trim())
        : (bruto as any)

    const fatos: any[] = Array.isArray(parsed?.fatos) ? parsed.fatos.slice(0, 3) : []
    const jaConhecidos = new Set(memoriaAtual.map((m) => m.fato.trim().toLowerCase()))

    const novos = fatos
      .map((f) => ({
        restaurante_id: restauranteId,
        fato: String(f?.fato ?? '').trim(),
        categoria: String(f?.categoria ?? 'geral').trim() || 'geral',
      }))
      .filter((f) => f.fato.length > 3 && f.fato.length <= 300)
      .filter((f) => !jaConhecidos.has(f.fato.toLowerCase()))

    if (!novos.length) return

    // Insere um a um: o índice único é sobre lower(fato) (expressão), que o
    // upsert do PostgREST não consegue usar como alvo de conflito.
    for (const novo of novos) {
      const { error } = await supabase.from('memoria_assistente').insert(novo)
      if (error && error.code !== '23505') {
        console.warn('Falha ao gravar fato na memória:', error.message)
      }
    }
  } catch (err) {
    console.warn('Não foi possível atualizar a memória do assistente:', err)
  }
}

export async function esquecerFato(id: string): Promise<void> {
  await supabase.from('memoria_assistente').delete().eq('id', id)
}
