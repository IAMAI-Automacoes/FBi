import { supabase } from '@/lib/supabase/client'
import { subDays, startOfDay, addDays } from 'date-fns'

export interface FiltrosFeedback {
  periodo: '7d' | '30d' | '90d' | 'all'
  sentimento: string
  categorias: string[]
  busca: string
  ordenacao: 'recent' | 'oldest'
  /** Intervalo (início/fim) escolhido no calendário. Quando preenchido, tem
      precedência sobre `periodo`: mostra só os feedbacks desse intervalo.
      `to` ausente = só o dia de `from`. */
  datas?: { from: Date; to?: Date }
  /** IDs exatos de `feedbacks_originais`. Usado ao abrir os feedbacks que
      geraram um insight (/feedbacks?insight_id=...). Tem precedência sobre o
      período: sem isso o padrão de 7 dias esconderia os feedbacks mais antigos
      que originaram o insight. */
  ids?: string[]
}

export async function buscarFeedbacks(filtros: FiltrosFeedback, limit: number, offset: number) {
  // Insight sem nenhum feedback ligado: devolve vazio em vez de emitir um
  // `in('id', [])`, que o PostgREST rejeita.
  if (filtros.ids && filtros.ids.length === 0) {
    return { feedbacks: [], total: 0 }
  }

  // Mostra a MENSAGEM ORIGINAL do cliente (a view deriva sentimento geral +
  // categorias dos pedaços). Os pedaços em si só servem pra IA dos temas.
  let query = supabase.from('feedbacks_originais_view').select('*', { count: 'exact' })

  if (filtros.ids && filtros.ids.length > 0) {
    query = query.in('id', filtros.ids)
  } else if (filtros.datas) {
    // Intervalo contínuo [início do dia de `from`, início do dia seguinte a `to`).
    const ini = startOfDay(filtros.datas.from)
    const fim = addDays(startOfDay(filtros.datas.to ?? filtros.datas.from), 1)
    query = query.gte('created_at', ini.toISOString()).lt('created_at', fim.toISOString())
  } else if (filtros.periodo !== 'all') {
    const days = filtros.periodo === '7d' ? 7 : filtros.periodo === '30d' ? 30 : 90
    const startDate = startOfDay(subDays(new Date(), days)).toISOString()
    query = query.gte('created_at', startDate)
  }

  if (filtros.sentimento && filtros.sentimento !== 'all') {
    // O n8n às vezes grava o sentimento da mensagem original com variações
    // fora dos 4 valores documentados (ex.: "Positivo e Negativo e Neutro") —
    // filtra por substring (mesma lógica de `tipoSentimento()`, que também
    // detecta por substring) em vez de igualdade exata, senão essas
    // variações somem do filtro mesmo sendo exatamente o que ele pede.
    if (filtros.sentimento === 'positivo e negativo') {
      query = query.ilike('sentimento', '%positivo%').ilike('sentimento', '%negativo%')
    } else if (filtros.sentimento === 'positivo') {
      query = query.ilike('sentimento', '%positivo%').not('sentimento', 'ilike', '%negativo%')
    } else if (filtros.sentimento === 'negativo') {
      query = query.ilike('sentimento', '%negativo%').not('sentimento', 'ilike', '%positivo%')
    } else {
      query = query.ilike('sentimento', filtros.sentimento)
    }
  }

  if (filtros.categorias.length > 0) {
    // A view tem `categorias` (array das categorias dos pontos daquela mensagem);
    // o original entra se tocar em qualquer categoria escolhida.
    query = query.overlaps('categorias', filtros.categorias)
  }

  if (filtros.busca) {
    // Busca em `texto_exibicao`, nao em `texto_original`.
    //
    // A coluna computada da view ja cobre o caso de a mensagem inteira nao
    // ter sido gravada — ali ela devolve os pontos separados costurados.
    // Buscando so no original, esses feedbacks eram invisiveis para a busca
    // mesmo tendo o conteudo no banco (medido: "garcons" achava 5 de 7).
    query = query.ilike('texto_exibicao', `%${filtros.busca}%`)
  }

  if (filtros.ordenacao === 'oldest') {
    query = query.order('created_at', { ascending: true })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  return { feedbacks: data || [], total: count || 0 }
}

/**
 * Categorias que o restaurante JÁ TEVE em algum feedback, sem filtro de
 * período — se dependesse do período ativo, a lista encolheria/mudaria toda
 * vez que o dono trocasse o filtro (ex.: uma categoria só aparecer de novo se
 * teve movimento nos últimos 7 dias), o que parece bug pra quem só quer ver
 * todas as categorias que esse restaurante já usou.
 */
export async function buscarCategoriasAtivas(restauranteId?: number) {
  let query = supabase
    .from('feedbacks_restaurante')
    .select('categoria')
    .not('categoria', 'is', null)

  if (restauranteId) {
    query = query.eq('restaurante_id', restauranteId)
  }

  const { data, error } = await query
  if (error) throw error
  return [...new Set(data?.map((d) => d.categoria).filter(Boolean) as string[])].sort()
}

/**
 * Quantos feedbacks ORIGINAIS de cada categoria existem no período ativo.
 *
 * O número conta a MENSAGEM do cliente, não os pontos separados dela: uma
 * mensagem que reclama duas vezes de comida conta 1 em "Comida", e uma que fala
 * de comida e de ambiente conta 1 em cada. É o mesmo número de itens que a
 * lista da tela mostra quando aquela categoria é escolhida no filtro — se
 * contasse pontos, o filtro diria "48" e a lista traria 30 cards.
 *
 * Usa `feedbacks_originais_view`, que já traz em `categorias` o array das
 * categorias dos pontos daquela mensagem — a mesma coluna que o filtro usa para
 * decidir o que exibir (`overlaps`), então contagem e resultado não têm como
 * divergir.
 *
 * Ignora de propósito o filtro de CATEGORIA: os números precisam continuar
 * visíveis depois de o dono escolher uma, senão as outras zerariam na hora.
 */
export async function contarFeedbacksPorCategoria(
  filtros: FiltrosFeedback,
  restauranteId?: number,
): Promise<Record<string, number>> {
  let query = supabase.from('feedbacks_originais_view').select('categorias')

  if (restauranteId) query = query.eq('restaurante_id', restauranteId)

  if (filtros.ids && filtros.ids.length > 0) {
    query = query.in('id', filtros.ids)
  } else if (filtros.datas) {
    const ini = startOfDay(filtros.datas.from)
    const fim = addDays(startOfDay(filtros.datas.to ?? filtros.datas.from), 1)
    query = query.gte('created_at', ini.toISOString()).lt('created_at', fim.toISOString())
  } else if (filtros.periodo !== 'all') {
    const days = filtros.periodo === '7d' ? 7 : filtros.periodo === '30d' ? 30 : 90
    query = query.gte('created_at', startOfDay(subDays(new Date(), days)).toISOString())
  }

  if (filtros.sentimento && filtros.sentimento !== 'all') {
    query = query.ilike('sentimento', `%${filtros.sentimento}%`)
  }

  if (filtros.busca) {
    query = query.ilike('texto_exibicao', `%${filtros.busca}%`)
  }

  const { data, error } = await query
  if (error) throw error

  // Uma mensagem soma 1 em cada categoria distinta que ela toca.
  const contagem: Record<string, number> = {}
  for (const linha of data ?? []) {
    const cats = (linha as { categorias: string[] | null }).categorias ?? []
    for (const c of new Set(cats)) {
      if (c) contagem[c] = (contagem[c] ?? 0) + 1
    }
  }
  return contagem
}
