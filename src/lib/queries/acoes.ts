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
 * Preenche categoria e/ou prioridade de uma ação recém-criada manualmente,
 * só nos campos que ficaram em branco (nunca sobrescreve o que o dono já
 * escolheu). Categoria vem da IA lendo título+plano; prioridade vem da
 * contagem de feedbacks negativos recentes naquela categoria — ver
 * `supabase/functions/categorizar-acao/index.ts`.
 */
/**
 * Completa uma ação criada à mão: categoria, prioridade e vínculo com os
 * feedbacks livres que ela resolve.
 *
 * `apenasVinculo` é o botão "Buscar feedbacks relacionados": o dono já decidiu
 * categoria e prioridade, e a IA não deve mexer nelas — só procurar os
 * feedbacks que aquela ação resolve.
 */
export async function categorizarAcao(acaoId: number, apenasVinculo = false) {
  const { data, error } = await supabase.functions.invoke('categorizar-acao', {
    body: { acao_id: acaoId, apenas_vinculo: apenasVinculo },
  })
  if (error) throw error
  return data as {
    status?: string
    categoria?: string
    prioridade?: string
    feedbacks_vinculados?: number
    motivo_sem_vinculo?: string | null
  }
}
