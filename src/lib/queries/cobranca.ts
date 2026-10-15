import { supabase } from '@/lib/supabase/client'
import type { Ciclo } from '@/components/vendas/ciclos-plano'

/* Cobrança — camada que as telas de compra usam.

   O pagamento online ainda não existe: o Stripe foi removido e o Asaas entra
   em seguida. Até lá, `criarCheckout` recusa com uma mensagem honesta (as
   telas mostram o WhatsApp) e os preços vêm da tabela `planos_precos`. Quando
   o Asaas entrar, só o corpo de `criarCheckout` muda. */

const MESES: Record<Ciclo, number> = { mensal: 1, semestral: 6, anual: 12 }

export interface PrecoPublico {
  ciclo: Ciclo
  /** Total cobrado a cada ciclo, em centavos. */
  total_centavos: number
  /** Total ÷ meses do ciclo, arredondado. */
  mensal_equivalente_centavos: number
  /** Economia sobre o mensal (inteiro), ou null no mensal / sem economia. */
  desconto_percentual: number | null
}

/** Converte as linhas de `planos_precos` no formato da tela. O desconto é
    calculado dos valores reais — nenhum número fixo. */
export function montarPrecosPublicos(linhas: { ciclo: string; total_centavos: number }[]): PrecoPublico[] {
  const total = (c: Ciclo) => linhas.find((l) => l.ciclo === c)?.total_centavos
  const baseMensal = total('mensal') ?? null
  const saida: PrecoPublico[] = []
  for (const ciclo of ['mensal', 'semestral', 'anual'] as Ciclo[]) {
    const t = total(ciclo)
    if (typeof t !== 'number') continue
    const mensalEq = Math.round(t / MESES[ciclo])
    let desconto: number | null = null
    if (ciclo !== 'mensal' && baseMensal && baseMensal > 0) {
      desconto = Math.round((1 - mensalEq / baseMensal) * 100)
      if (desconto <= 0) desconto = null
    }
    saida.push({ ciclo, total_centavos: t, mensal_equivalente_centavos: mensalEq, desconto_percentual: desconto })
  }
  return saida
}

/** Preços atuais do software (`restaurante` na landing; a área da conta logada). */
export async function buscarPrecos(area: 'restaurante' | 'rh' = 'restaurante'): Promise<PrecoPublico[]> {
  const { data, error } = await supabase
    .from('planos_precos')
    .select('ciclo, total_centavos')
    .eq('area', area)
    .eq('ativo', true)
  if (error) throw new Error('Não foi possível carregar os preços.')
  return montarPrecosPublicos((data ?? []) as { ciclo: string; total_centavos: number }[])
}

/** Erro tipado da cobrança: carrega o corpo para a tela decidir o que fazer. */
export class ErroCobranca extends Error {
  constructor(
    mensagem: string,
    public readonly corpo: Record<string, unknown> | null = null,
  ) {
    super(mensagem)
    this.name = 'ErroCobranca'
  }
}

export const MENSAGEM_PAGAMENTO_INDISPONIVEL =
  'O pagamento online está sendo configurado. Fale com a gente pelo WhatsApp para assinar agora.'

/** Abre o pagamento do plano. Hoje sempre recusa: não há meio de pagamento.
    TODO(asaas): criar o checkout no Asaas e devolver a URL. */
export async function criarCheckout(
  _ciclo: Ciclo,
  _opcoes: { codigoAfiliado?: string } = {},
): Promise<string> {
  throw new ErroCobranca(MENSAGEM_PAGAMENTO_INDISPONIVEL, { pagamento_indisponivel: true })
}
