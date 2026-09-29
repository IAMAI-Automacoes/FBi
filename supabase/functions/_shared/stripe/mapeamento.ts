/**
 * Regras puras da integração Stripe — sem I/O, sem SDK.
 *
 * Ficam separadas para serem testadas com `node --experimental-strip-types`
 * (ver `__testes__/stripe-mapeamento.teste.ts`) e para o script local de
 * troca de preço e as edge functions usarem exatamente a mesma leitura de
 * "qual ciclo é este price".
 */

export type Ciclo = 'mensal' | 'semestral' | 'anual'

export const LOOKUP_KEY_POR_CICLO: Record<Ciclo, string> = {
  mensal: 'easyfeed_mensal',
  semestral: 'easyfeed_semestral',
  anual: 'easyfeed_anual',
}

/** Forma mínima de um Price que estas regras precisam. Espelha o objeto do
    Stripe sem depender do tipo do SDK. */
export interface PriceMinimo {
  id: string
  lookup_key?: string | null
  unit_amount?: number | null
  currency?: string
  active?: boolean
  recurring?: { interval: string; interval_count: number } | null
  metadata?: Record<string, string> | null
}

/**
 * Descobre o ciclo de um price. Ordem: recorrência (a verdade estrutural) →
 * lookup_key → metadata.ciclo. A recorrência vem primeiro porque um price
 * antigo, que perdeu o lookup_key numa troca de preço, ainda precisa ser
 * reconhecido como "anual" na tela da conta.
 */
export function cicloDoPrice(p: PriceMinimo): Ciclo | null {
  const r = p.recurring
  if (r) {
    if (r.interval === 'month' && r.interval_count === 1) return 'mensal'
    if (r.interval === 'month' && r.interval_count === 6) return 'semestral'
    if (r.interval === 'year' && r.interval_count === 1) return 'anual'
    if (r.interval === 'month' && r.interval_count === 12) return 'anual'
  }
  const porLookup = (Object.keys(LOOKUP_KEY_POR_CICLO) as Ciclo[]).find(
    (c) => LOOKUP_KEY_POR_CICLO[c] === p.lookup_key,
  )
  if (porLookup) return porLookup
  const m = p.metadata?.ciclo
  if (m === 'mensal' || m === 'semestral' || m === 'anual') return m
  return null
}

/** Meses cobertos por cada renovação — para o "equivale a R$ X/mês". */
export const MESES_POR_CICLO: Record<Ciclo, number> = { mensal: 1, semestral: 6, anual: 12 }

export interface PrecoPublico {
  ciclo: Ciclo
  lookup_key: string
  moeda: string
  /** Total cobrado a cada renovação, em centavos. */
  total_centavos: number
  /** Total ÷ meses do ciclo, em centavos, arredondado. */
  mensal_equivalente_centavos: number
  intervalo: string
  intervalo_qtd: number
  /** Economia percentual em relação ao mensal (inteiro), ou null no mensal /
      quando não dá para calcular. */
  desconto_percentual: number | null
}

/**
 * Converte a lista de prices ativos do Stripe no formato que a landing lê.
 * O desconto é calculado aqui, no servidor, a partir dos valores reais —
 * a landing não sabe nem precisa saber quanto custa cada ciclo.
 */
export function montarPrecosPublicos(prices: PriceMinimo[]): PrecoPublico[] {
  const porCiclo = new Map<Ciclo, PriceMinimo>()
  for (const p of prices) {
    if (p.active === false) continue
    if (typeof p.unit_amount !== 'number') continue
    const c = cicloDoPrice(p)
    if (c && !porCiclo.has(c)) porCiclo.set(c, p)
  }

  const mensal = porCiclo.get('mensal')
  const baseMensal = mensal?.unit_amount ?? null

  const saida: PrecoPublico[] = []
  for (const ciclo of ['mensal', 'semestral', 'anual'] as Ciclo[]) {
    const p = porCiclo.get(ciclo)
    if (!p || typeof p.unit_amount !== 'number') continue
    const meses = MESES_POR_CICLO[ciclo]
    const mensalEq = Math.round(p.unit_amount / meses)
    let desconto: number | null = null
    if (ciclo !== 'mensal' && baseMensal && baseMensal > 0) {
      desconto = Math.round((1 - mensalEq / baseMensal) * 100)
      if (desconto <= 0) desconto = null
    }
    saida.push({
      ciclo,
      lookup_key: p.lookup_key ?? LOOKUP_KEY_POR_CICLO[ciclo],
      moeda: (p.currency ?? 'brl').toLowerCase(),
      total_centavos: p.unit_amount,
      mensal_equivalente_centavos: mensalEq,
      intervalo: p.recurring?.interval ?? 'month',
      intervalo_qtd: p.recurring?.interval_count ?? meses,
      desconto_percentual: desconto,
    })
  }
  return saida
}

export type StatusStripe =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export type StatusApp = 'sem_assinatura' | 'ativa' | 'inadimplente' | 'cancelada'

/** Mesma tabela da função SQL `aplicar_assinatura_stripe` — mantida em
    duplicidade de propósito, para o teste unitário e para logs legíveis. */
export function statusApp(s: string): StatusApp | null {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'ativa'
    case 'past_due':
    case 'unpaid':
      return 'inadimplente'
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return 'cancelada'
    case 'incomplete':
      return null
    default:
      return null
  }
}

/** Epoch em segundos (formato do Stripe) → ISO, ou null. */
export function isoDe(epoch: number | null | undefined): string | null {
  return typeof epoch === 'number' ? new Date(epoch * 1000).toISOString() : null
}

/**
 * Valida um descritor de fatura conforme as regras do Stripe para
 * `Product.statement_descriptor` / `Invoice.statement_descriptor`:
 * até 22 caracteres, ao menos uma letra, sem `< > \ " '`. Não-ASCII é
 * removido pelo Stripe (acentos somem), então o script já avisa.
 */
export function validarDescritor(d: string): { ok: true; normalizado: string } | { ok: false; motivo: string } {
  const normalizado = d.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').toUpperCase().trim()
  if (normalizado.length === 0) return { ok: false, motivo: 'vazio após remover caracteres não-ASCII' }
  if (normalizado.length > 22) return { ok: false, motivo: `tem ${normalizado.length} caracteres; máximo 22` }
  if (!/[A-Z]/.test(normalizado)) return { ok: false, motivo: 'precisa de ao menos uma letra' }
  if (/[<>\\"']/.test(normalizado)) return { ok: false, motivo: 'contém < > \\ " ou \'' }
  return { ok: true, normalizado }
}

/** Compara e-mails do jeito que o vínculo pagamento→conta exige. */
export function mesmoEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
