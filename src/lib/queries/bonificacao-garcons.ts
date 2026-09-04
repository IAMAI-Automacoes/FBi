import { addDays, addMonths } from 'date-fns'
import { supabase } from '@/lib/supabase/client'

/** Formato mínimo de regra que a lógica de período/pagamento precisa —
 *  qualquer objeto de regra "de verdade" (como o de `Garcons.tsx`) já
 *  satisfaz este formato, então as duas pontas reaproveitam as mesmas
 *  funções sem precisar do MESMO tipo nominal, e este arquivo não
 *  depende de importar uma página. */
export interface RegraMin {
  id: string
  ativa: boolean
  meta_escaneamentos: number
  frequencia: 'semanal' | 'mensal' | 'trimestral' | 'personalizado'
  dias_personalizados: number
  renovar_automatico: boolean
  periodo_inicio: string | null
  /** null/vazio = vale pra todos os garçons. */
  garcons_participantes: number[] | null
}

export interface PagamentoRegra {
  pago_em: string
  /** Meta que estava valendo quando esse pagamento foi feito. Se o dono
   *  depois aumenta a meta da regra, um pagamento com meta menor que a
   *  nova deixa de "cobrir" ela — reabre o bônus (bateu de novo, num
   *  número maior, é uma conquista nova). */
  meta: number
}

/**
 * Compara dois timestamps ISO como instantes de verdade (`Date.getTime()`),
 * nunca como string. `periodo_inicio` sai de `new Date().toISOString()` no
 * JS (sempre 3 dígitos de milissegundo + "Z"), mas `scanned_at` vem do
 * Postgres via PostgREST — que manda `timestamptz` como "+00:00" e às vezes
 * com 6 dígitos. Comparar essas duas strings com `<` dava resultado errado
 * em alguns instantes.
 */
export function antesDe(a: string, b: string): boolean {
  return new Date(a).getTime() < new Date(b).getTime()
}

export function avancarPeriodo(inicio: Date, regra: Pick<RegraMin, 'frequencia' | 'dias_personalizados'>): Date {
  if (regra.frequencia === 'semanal') return addDays(inicio, 7)
  if (regra.frequencia === 'trimestral') return addMonths(inicio, 3)
  if (regra.frequencia === 'personalizado') return addDays(inicio, Math.max(1, regra.dias_personalizados || 1))
  return addMonths(inicio, 1)
}

/** `bonus_pagamentos[regraId]` era só uma string (a data) antes de existir
 *  o conceito de "meta paga". Registro antigo vira `meta: Infinity` — cobre
 *  qualquer meta futura, então um pagamento de antes dessa lógica nunca
 *  reabre sozinho (ninguém quer cobrar de novo um bônus que já foi pago e
 *  resolvido antes dessa versão existir). */
export function pagamentoDeRegra(
  bonusPagamentos: Record<string, string | PagamentoRegra> | null | undefined,
  regraId: string,
): PagamentoRegra | null {
  const v = bonusPagamentos?.[regraId]
  if (!v) return null
  if (typeof v === 'string') return { pago_em: v, meta: Infinity }
  return v
}

/** Um bônus está de fato quitado só se o pagamento aconteceu DENTRO do
 *  período atual (senão o período renovou e o progresso zerou — precisa
 *  pagar de novo) E cobre a meta atual (senão o dono aumentou a meta
 *  depois desse pagamento, e bater a nova é uma conquista nova). */
export function regraEstaPaga(
  pagamento: PagamentoRegra | null,
  regra: Pick<RegraMin, 'periodo_inicio' | 'meta_escaneamentos'>,
): boolean {
  if (!pagamento || !regra.periodo_inicio) return false
  if (antesDe(pagamento.pago_em, regra.periodo_inicio)) return false
  return pagamento.meta >= regra.meta_escaneamentos
}

/** Uma regra vale pra um garçom específico? `null`/lista vazia = vale pra
 *  todos (o padrão de sempre, pra regras de antes dessa opção existir). */
export function garcomParticipaDaRegra(
  regra: Pick<RegraMin, 'garcons_participantes'>,
  garcomId: number,
): boolean {
  return !regra.garcons_participantes || regra.garcons_participantes.length === 0
    || regra.garcons_participantes.includes(garcomId)
}

/**
 * Quantos garçons têm pelo menos uma regra ativa batida e ainda não paga —
 * usado só pro numerozinho vermelho ao lado de "Garçons" na barra lateral
 * (mesmo padrão do badge de mensagens não lidas de Sugestões). Fica fora de
 * `Garcons.tsx` porque a barra lateral é global — aparece em toda página, não
 * só na de garçons — e não faz sentido uma página do menu importar outra.
 *
 * Reaproveita as mesmas contas de período/pagamento da tela de Garçons, só
 * que sem o estado de UI (sem seleção, sem popup) — é puro cálculo a partir
 * do banco.
 */
export async function contarGarconsPendentes(restauranteId: number): Promise<number> {
  const { data: r } = await supabase
    .from('restaurantes')
    .select('config_bonificacao')
    .eq('id', restauranteId)
    .single()
  if (!r) return 0
  const regras = (Array.isArray(r.config_bonificacao) ? r.config_bonificacao : []) as unknown as RegraMin[]
  const regrasAtivas = regras.filter((reg) => reg.ativa && reg.periodo_inicio && reg.meta_escaneamentos > 0)
  if (regrasAtivas.length === 0) return 0

  const { data: garcons } = await supabase
    .from('garcons')
    .select('id, bonus_pagamentos')
    .eq('restaurante_id', restauranteId)
    .eq('ativo', true)
  if (!garcons?.length) return 0

  const { data: qc } = await supabase
    .from('qr_codes')
    .select('id, garcom_id')
    .eq('restaurante_id', restauranteId)
    .not('garcom_id', 'is', null)
  const qrCodeIdParaGarcom: Record<number, number> = {}
  for (const q of qc ?? []) if (q.garcom_id) qrCodeIdParaGarcom[q.id] = q.garcom_id
  const idsQr = Object.keys(qrCodeIdParaGarcom).map(Number)
  if (idsQr.length === 0) return 0

  const desde = regrasAtivas.reduce(
    (min, reg) => (reg.periodo_inicio! < min ? reg.periodo_inicio! : min),
    regrasAtivas[0].periodo_inicio!,
  )
  const { data: scans } = await supabase
    .from('qr_scans')
    .select('qr_code_id, scanned_at')
    .in('qr_code_id', idsQr)
    .gte('scanned_at', desde)

  let pendentes = 0
  for (const g of garcons) {
    const bonusPagamentos = (g.bonus_pagamentos ?? {}) as Record<string, string | PagamentoRegra>
    const temPendencia = regrasAtivas.some((reg) => {
      if (!garcomParticipaDaRegra(reg, g.id)) return false
      const fimReg = reg.renovar_automatico ? null : avancarPeriodo(new Date(reg.periodo_inicio!), reg).toISOString()
      let scansGarcom = 0
      for (const s of scans ?? []) {
        if (qrCodeIdParaGarcom[s.qr_code_id] !== g.id) continue
        if (!s.scanned_at || antesDe(s.scanned_at, reg.periodo_inicio!)) continue
        if (fimReg && !antesDe(s.scanned_at, fimReg)) continue
        scansGarcom++
      }
      const atingiu = scansGarcom >= reg.meta_escaneamentos
      return atingiu && !regraEstaPaga(pagamentoDeRegra(bonusPagamentos, reg.id), reg)
    })
    if (temPendencia) pendentes++
  }
  return pendentes
}
