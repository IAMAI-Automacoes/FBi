import { supabase } from '@/lib/supabase/client'
import type { AutorizacaoMarketing, DiaMetricas } from '@/lib/resultados'

// `metricas_diarias`, `autorizacoes_marketing` e as RPCs da aba Resultados não
// estão nos tipos gerados; acesso destipado (mesmo jeito de uso-ia.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface RestauranteResultados {
  id: number
  nome: string | null
  logo_url: string | null
  tipo_culinaria: string | null
  area: string | null
  created_at: string
  assinatura_status: string
  excluida_em: string | null
  /** Conta de admin da plataforma ou de vendedor (demonstração). */
  eh_teste: boolean
}

export interface AutorizacaoRegistrada extends AutorizacaoMarketing {
  restaurante_id: number
  autorizado_por: string
  /** 'painel' = o próprio dono marcou em Configurações → Divulgação. */
  canal: 'whatsapp' | 'email' | 'contrato' | 'outro' | 'painel'
  /** Quem registrou: o dono na tela dele, ou o admin com a prova obtida por fora. */
  origem: 'admin' | 'dono'
  /** Versão do texto aceito pelo dono (nula quando foi o admin). */
  versao_texto: string | null
  observacao: string | null
  autorizado_em: string
  revogado_em: string | null
  registrado_por: string
}

export type AutorizacaoInput = Pick<
  AutorizacaoRegistrada,
  'pode_nome' | 'pode_logo' | 'pode_numeros' | 'pode_depoimento' | 'autorizado_por' | 'observacao'
> & { canal: Exclude<AutorizacaoRegistrada['canal'], 'painel'> }

/** Só o admin passa (a função levanta erro para qualquer outro). */
export async function buscarRestaurantesResultados(): Promise<RestauranteResultados[]> {
  const { data, error } = await db.rpc('admin_resultados_restaurantes')
  if (error) throw new Error(error.message)
  return (data ?? []) as RestauranteResultados[]
}

const COLUNAS_LISTA =
  'restaurante_id, dia, mensagens, positivos, negativos, neutros, sugestoes, clientes_novos, retornos, aberturas_qr, acoes_criadas, acoes_concluidas, insights_gerados'

/**
 * Todas as linhas diárias, de todos os restaurantes (a lista) ou de um só com
 * as categorias (o detalhe).
 *
 * Em páginas de 1000: é o teto padrão de linhas por resposta do Supabase, e
 * sem paginar a lista cortaria o histórico calada quando a base crescer.
 */
export async function buscarMetricasDiarias(restauranteId?: number): Promise<DiaMetricas[]> {
  const PAGINA = 1000
  const linhas: DiaMetricas[] = []
  for (let de = 0; ; de += PAGINA) {
    let q = db
      .from('metricas_diarias')
      .select(restauranteId ? `${COLUNAS_LISTA}, por_categoria` : COLUNAS_LISTA)
      .order('restaurante_id')
      .order('dia')
      .range(de, de + PAGINA - 1)
    if (restauranteId) q = q.eq('restaurante_id', restauranteId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    linhas.push(...((data ?? []) as DiaMetricas[]))
    if (!data || data.length < PAGINA) break
  }
  return linhas
}

/** Recalcula os últimos 35 dias (de um restaurante ou de todos). Devolve quantos dias gravou. */
export async function atualizarMetricasAgora(restauranteId?: number): Promise<number> {
  const { data, error } = await db.rpc('admin_metricas_atualizar', { p_restaurante_id: restauranteId ?? null })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function buscarAutorizacoes(): Promise<AutorizacaoRegistrada[]> {
  const { data, error } = await db.from('autorizacoes_marketing').select('*')
  if (error) throw new Error(error.message)
  return (data ?? []) as AutorizacaoRegistrada[]
}

/** Registra (ou renova) a autorização. Renovar apaga a revogação anterior. */
export async function salvarAutorizacao(restauranteId: number, input: AutorizacaoInput): Promise<void> {
  const { data: sessao } = await supabase.auth.getUser()
  const { error } = await db.from('autorizacoes_marketing').upsert({
    restaurante_id: restauranteId,
    ...input,
    // Quem registrou ESTA versão (o default do banco só vale na primeira vez).
    ...(sessao.user?.email ? { registrado_por: sessao.user.email } : {}),
    observacao: input.observacao?.trim() || null,
    status: 'autorizado',
    // Registrada pelo admin: deixa de valer como o clique do dono.
    origem: 'admin',
    versao_texto: null,
    autorizado_em: new Date().toISOString(),
    revogado_em: null,
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

/** Revogar não apaga: o registro de quando valeu continua guardado. */
export async function revogarAutorizacao(restauranteId: number): Promise<void> {
  const agora = new Date().toISOString()
  const { error } = await db
    .from('autorizacoes_marketing')
    .update({ status: 'revogado', revogado_em: agora, atualizado_em: agora })
    .eq('restaurante_id', restauranteId)
  if (error) throw new Error(error.message)
}
