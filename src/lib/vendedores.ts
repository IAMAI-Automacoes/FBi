/**
 * Admin → Vendedores (sem React, para os testes rodarem no Node).
 *
 * Pedido do Raver (21/10/2026): afiliado e vendedor são a mesma coisa. Cada
 * vendedor tem um código de venda e ganha comissão pela regra do software:
 *   - quando o indicado paga a 2ª mensalidade, o vendedor ganha X% de UMA
 *     mensalidade (padrão 100%: a mensalidade cheia);
 *   - depois, Y% de cada mensalidade paga pelo indicado, por Z meses (padrão
 *     15% por 12 meses);
 *   - se o indicado cancelar, a comissão acaba; depois dos Z meses, a
 *     mensalidade fica toda com a empresa.
 * A mensalidade da comissão é a LÍQUIDA (decisão do Caio, 21/10/2026): o que
 * o Asaas entrega (sem a taxa dele) menos os nossos custos (`comissao_custos`).
 * O servidor faz a mesma conta em supabase/functions/_shared/asaas/regras.ts.
 * No Restaurante, o vendedor também pode ter o acesso de demonstração (código
 * no Perfil, pula o WhatsApp), que é marcado pelo e-mail (tabela `vendedores`).
 */

export interface RegraDeComissao {
  /** % de UMA mensalidade, paga quando o indicado paga a 2ª mensalidade. */
  entradaPct: number
  /** % de cada mensalidade paga depois disso. */
  recorrentePct: number
  /** Por quantos meses vale a % recorrente. */
  recorrenteMeses: number
}

export const REGRA_PADRAO: RegraDeComissao = { entradaPct: 100, recorrentePct: 15, recorrenteMeses: 12 }

/** O que está errado na regra (null = pode salvar). */
export function problemaDaRegra(r: RegraDeComissao): string | null {
  const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100
  if (!pct(r.entradaPct)) return 'A comissão da 2ª mensalidade vai de 0% a 100%.'
  if (!pct(r.recorrentePct)) return 'A comissão das mensalidades seguintes vai de 0% a 100%.'
  if (!Number.isInteger(r.recorrenteMeses) || r.recorrenteMeses < 0 || r.recorrenteMeses > 120) return 'O prazo vai de 0 a 120 meses.'
  return null
}

const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}%`
export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

/** A regra em uma frase, para o card e para a lista. */
export function textoDaRegra(r: RegraDeComissao): string {
  const entrada = r.entradaPct === 100 ? 'a mensalidade líquida inteira' : `${pct(r.entradaPct)} da mensalidade líquida`
  if (!r.recorrentePct || !r.recorrenteMeses) return `${entrada.charAt(0).toUpperCase()}${entrada.slice(1)} quando o indicado paga a 2ª mensalidade.`
  const meses = r.recorrenteMeses === 1 ? '1 mês' : `${r.recorrenteMeses} meses`
  return `${entrada.charAt(0).toUpperCase()}${entrada.slice(1)} quando o indicado paga a 2ª mensalidade, depois ${pct(r.recorrentePct)} de cada mensalidade líquida por ${meses}.`
}

// ── Os nossos custos, que saem antes da comissão ───────────────────────────

export interface CustoDaComissao {
  id: string
  nome: string
  /** 'valor' = R$ por mês (em reais); 'porcentagem' = % do valor recebido. */
  tipo: 'valor' | 'porcentagem'
  valor: number
  ativo: boolean
}

/**
 * A mensalidade líquida da comissão: o valor recebido no mês menos os custos
 * de % (sobre ele) e depois os de R$. `recebidoCentavos` é o que o Asaas
 * entrega (no exemplo da tela, o preço — a taxa do Asaas ainda sai).
 */
export function mensalidadeLiquida(recebidoCentavos: number, custos: readonly Pick<CustoDaComissao, 'tipo' | 'valor' | 'ativo'>[]): number {
  const ativos = custos.filter((c) => c.ativo)
  const pctTotal = Math.min(100, ativos.filter((c) => c.tipo === 'porcentagem').reduce((s, c) => s + (Number(c.valor) || 0), 0))
  const fixo = ativos.filter((c) => c.tipo === 'valor').reduce((s, c) => s + Math.round((Number(c.valor) || 0) * 100), 0)
  return Math.max(0, Math.round(recebidoCentavos * (1 - pctTotal / 100) - fixo))
}

/** Quanto um indicado mensal que fica rende ao vendedor, com a mensalidade líquida dada (em centavos). */
export function exemploDaRegra(r: RegraDeComissao, mensalidadeCentavos: number): { entrada: number; porMes: number; total: number } {
  const entrada = Math.round(mensalidadeCentavos * r.entradaPct / 100)
  const porMes = Math.round(mensalidadeCentavos * r.recorrentePct / 100)
  return { entrada, porMes, total: entrada + porMes * r.recorrenteMeses }
}

// ── A lista: o cadastro de venda + a marca de demonstração ─────────────────

export interface CadastroDeVenda { id: string; nome: string; email: string | null; codigo: string; ativo: boolean; restaurante_id: number | null }
export interface MarcaDeDemo { email: string; temConta: boolean; nomeRestaurante: string | null; ultimaDemoEm: string | null }

export interface Vendedor<C extends CadastroDeVenda = CadastroDeVenda> {
  /** O cadastro de venda (código e comissão). Null = só tem a demonstração. */
  cadastro: C | null
  email: string | null
  /** A marca de demonstração (só no Restaurante). */
  demo: MarcaDeDemo | null
}

const chave = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

/**
 * Junta os cadastros de venda do software com as marcas de demonstração (pelo
 * e-mail). A conta EasyFeed que indica (padrinho) não é vendedor e fica de fora.
 * No RH não há demonstração: só os cadastros.
 */
export function juntarVendedores<C extends CadastroDeVenda>(cadastros: readonly C[], marcas: readonly MarcaDeDemo[], comDemo: boolean): Vendedor<C>[] {
  const deFora = cadastros.filter((c) => c.restaurante_id == null)
  const porEmail = new Map((comDemo ? marcas : []).map((m) => [chave(m.email), m]))
  const usadas = new Set<string>()
  const lista: Vendedor<C>[] = deFora.map((c) => {
    const k = chave(c.email)
    const demo = k ? porEmail.get(k) ?? null : null
    if (demo) usadas.add(k)
    return { cadastro: c, email: c.email, demo }
  })
  for (const m of comDemo ? marcas : []) {
    if (!usadas.has(chave(m.email))) lista.push({ cadastro: null, email: m.email, demo: m })
  }
  const nome = (v: Vendedor<C>) => (v.cadastro?.nome || v.email || '').toLowerCase()
  return lista.sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
}
