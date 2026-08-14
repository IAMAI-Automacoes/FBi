import { supabase } from '@/lib/supabase/client'
import { subDays, startOfDay, addDays } from 'date-fns'

export interface FiltrosFeedback {
  periodo: '7d' | '30d' | '90d' | 'all'
  sentimento: string
  categorias: string[]
  busca: string
  ordenacao: 'recent' | 'oldest'
  /** Dias específicos escolhidos no calendário. Quando preenchido, tem
      precedência sobre `periodo`: mostra só os feedbacks desses dias. */
  datas?: Date[]
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
  } else if (filtros.datas && filtros.datas.length > 0) {
    // OR de intervalos [início do dia, início do dia seguinte) — cada dia
    // escolhido vira uma janela; dias não contíguos são unidos com `or`.
    const janelas = filtros.datas.map((d) => {
      const ini = startOfDay(d)
      const fim = addDays(ini, 1)
      return `and(created_at.gte.${ini.toISOString()},created_at.lt.${fim.toISOString()})`
    })
    query = query.or(janelas.join(','))
  } else if (filtros.periodo !== 'all') {
    const days = filtros.periodo === '7d' ? 7 : filtros.periodo === '30d' ? 30 : 90
    const startDate = startOfDay(subDays(new Date(), days)).toISOString()
    query = query.gte('created_at', startDate)
  }

  if (filtros.sentimento && filtros.sentimento !== 'all') {
    // `ilike` sem curinga = igualdade sem diferenciar maiúsc./minúsc.; o banco
    // guarda o sentimento em minúsculo ('neutro'), então `eq` MAIÚSCULO não batia.
    query = query.ilike('sentimento', filtros.sentimento)
  }

  if (filtros.categorias.length > 0) {
    // A view tem `categorias` (array das categorias dos pontos daquela mensagem);
    // o original entra se tocar em qualquer categoria escolhida.
    query = query.overlaps('categorias', filtros.categorias)
  }

  if (filtros.busca) {
    query = query.ilike('texto_original', `%${filtros.busca}%`)
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

export async function buscarCategoriasAtivas(
  restauranteId?: number,
  periodo?: FiltrosFeedback['periodo'],
) {
  let query = supabase
    .from('feedbacks_restaurante')
    .select('categoria')
    .not('categoria', 'is', null)

  if (restauranteId) {
    query = query.eq('restaurante_id', restauranteId)
  }

  if (periodo && periodo !== 'all') {
    const days = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90
    const startDate = startOfDay(subDays(new Date(), days)).toISOString()
    query = query.gte('created_at', startDate)
  }

  const { data, error } = await query
  if (error) throw error
  return [...new Set(data?.map((d) => d.categoria).filter(Boolean) as string[])].sort()
}
