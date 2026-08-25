import { supabase } from '@/lib/supabase/client'

const CAMPOS_ACAO =
  'id, titulo_acao, plano_detalhado, status, prioridade, categoria, texto, feedback_id, restaurante_id, created_at, ordem, insight_id, arquivada_em, responsavel, prazo, fixado'

export async function buscarAcoes(restauranteId: number, apenasAprovadas = true) {
  const { data, error } = await supabase
    .from('acoes_operacionais')
    .select(CAMPOS_ACAO)
    .eq('restaurante_id', restauranteId)
    .in('status', apenasAprovadas ? ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'] : ['SUGERIDA'])
    // Arquivadas somem do quadro; elas vivem em /acoes/arquivadas.
    .is('arquivada_em', null)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/** Ações concluídas que o dono guardou. Sempre CONCLUIDO — arquivar não muda o status. */
export async function buscarAcoesArquivadas(restauranteId: number) {
  const { data, error } = await supabase
    .from('acoes_operacionais')
    .select(CAMPOS_ACAO)
    .eq('restaurante_id', restauranteId)
    .not('arquivada_em', 'is', null)
    .order('arquivada_em', { ascending: false })

  if (error) throw error
  return data
}

export async function arquivarAcao(acaoId: number) {
  return atualizarAcao(acaoId, { arquivada_em: new Date().toISOString() })
}

export async function desarquivarAcao(acaoId: number) {
  return atualizarAcao(acaoId, { arquivada_em: null })
}

export async function atualizarOrdemAcoes(acoes: { id: number; ordem: number }[]) {
  const promises = acoes.map((acao) =>
    supabase.from('acoes_operacionais').update({ ordem: acao.ordem }).eq('id', acao.id),
  )

  const results = await Promise.all(promises)
  const hasError = results.some((r) => r.error)
  if (hasError) {
    throw new Error('Falha ao atualizar ordem')
  }
  return true
}

export async function atualizarStatusAcao(acaoId: number, novoStatus: string) {
  const { data, error } = await supabase
    .from('acoes_operacionais')
    .update({ status: novoStatus })
    .eq('id', acaoId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function alternarFixadoAcao(acaoId: number, fixado: boolean) {
  return atualizarAcao(acaoId, { fixado })
}

export async function atualizarAcao(acaoId: number, dados: any) {
  const { data, error } = await supabase
    .from('acoes_operacionais')
    .update(dados)
    .eq('id', acaoId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function criarAcao(dados: any) {
  const { data, error } = await supabase
    .from('acoes_operacionais')
    .insert([dados])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function aprovarSugestao(acaoId: number) {
  return atualizarStatusAcao(acaoId, 'PENDENTE')
}

export async function rejeitarSugestao(acaoId: number) {
  const { error } = await supabase.from('acoes_operacionais').delete().eq('id', acaoId)

  if (error) throw error
  return true
}

export async function excluirAcao(acaoId: number) {
  const { error } = await supabase.from('acoes_operacionais').delete().eq('id', acaoId)

  if (error) throw error
  return true
}

/**
 * Pede sugestões de ação à IA.
 *
 * Com `insightId`, gera UMA ação para aquele insight específico (é o botão
 * "Criar Ação"); sem ele, roda o ciclo automático sobre os insights ativos.
 */
export async function sugerirAcoesManualmente(restauranteId: number, insightId?: string) {
  const { data, error } = await supabase.functions.invoke('sugerir-acoes', {
    body: { restaurante_id: restauranteId, insight_id: insightId },
  })
  if (error) throw error
  return data
}

/**
 * Gera (ou expande, se já houver texto) o plano de ação via IA. A edge
 * function retorna `{ status: 'sucesso', plano_detalhado }` ou, quando não há
 * contexto suficiente pra gerar algo específico, `{ status: 'contexto_insuficiente', motivo }`
 * — sem gravar nada no banco nesse segundo caso.
 */
export async function gerarPlanoAcao(acaoId: number) {
  const { data, error } = await supabase.functions.invoke('gerar-plano-acao', {
    body: { acao_id: acaoId },
  })
  if (error) throw error
  return data
}

/**
 * Quantos CLIENTES DISTINTOS serão avisados quando cada ação mudar de status.
 *
 * Existe para o quadro poder mostrar isso no card. Hoje o dono arrasta uma
 * tarefa e dispara um WhatsApp para pessoas reais sem ter ideia disso — o
 * número deixa o efeito visível antes do gesto.
 *
 * Conta contatos, não feedbacks: uma pessoa que mandou três reclamações sobre a
 * mesma ação recebe UMA mensagem, então o card diria "3 clientes" quando é um
 * só (é a mesma regra da invariante I4).
 */
export async function contarContatosPorAcao(acaoIds: number[]) {
  if (acaoIds.length === 0) return new Map<number, number>()

  const { data, error } = await supabase
    .from('feedback_acao')
    .select('acao_id, feedbacks_originais!inner(contato_id)')
    .in('acao_id', acaoIds)

  if (error) throw error

  const contatosPorAcao = new Map<number, Set<string>>()
  for (const linha of data ?? []) {
    // O join aninhado do PostgREST não é tipado pelo client; o shape é
    // { acao_id, feedbacks_originais: { contato_id } }.
    const fo = (linha as unknown as { feedbacks_originais?: { contato_id: string | null } })
      .feedbacks_originais
    if (!fo?.contato_id) continue

    const acaoId = (linha as unknown as { acao_id: number }).acao_id
    const conjunto = contatosPorAcao.get(acaoId) ?? new Set<string>()
    conjunto.add(fo.contato_id)
    contatosPorAcao.set(acaoId, conjunto)
  }

  return new Map([...contatosPorAcao].map(([acaoId, set]) => [acaoId, set.size]))
}
