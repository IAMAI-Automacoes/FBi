/* Indicação entre restaurantes: as regras que a tela usa. Sem banco aqui.
 *
 * O restaurante pega o link dele em Descontos → Indicações. Quando o indicado
 * paga a primeira mensalidade, nasce um benefício (o texto que o admin escreveu
 * em Admin → Afiliados), que por enquanto é aplicado à mão.
 * Quem guarda e decide é o banco (migration 20261017010000_indicacoes.sql).
 */

export type StatusPremio = 'pendente' | 'aplicado' | 'cancelado'

export interface PremioIndicacao {
  id: string
  /** O texto do benefício na hora em que foi ganho. */
  beneficio: string
  status: StatusPremio
  criado_em: string
  aplicado_em: string | null
}

/** O que a subpágina Indicações recebe (função `indicacao_minha`). */
export interface MinhaIndicacao {
  /** Falso = a página ainda não foi aberta para esta conta. */
  liberado: boolean
  sem_restaurante?: boolean
  /** O admin ligou as indicações. */
  ativo: boolean
  beneficio: string
  /** Vazio enquanto as indicações nunca estiveram ligadas para esta conta. */
  codigo: string | null
  /** Restaurantes que entraram pelo link (não diz quais). */
  indicados: number
  assinaram: number
  premios: PremioIndicacao[]
}

/** O prêmio como o admin vê: com os dois nomes. */
export interface PremioAdmin extends PremioIndicacao {
  quem_indicou: string
  /** Vazio = a conta indicada foi apagada. */
  indicado: string | null
  aplicado_por: string | null
}

export interface IndicadorAdmin { restaurante: string; codigo: string; indicados: number; assinaram: number }

/** O que o painel do admin recebe (função `indicacao_admin`). */
export interface IndicacaoAdmin {
  ativo: boolean
  beneficio: string
  atualizado_em: string | null
  premios: PremioAdmin[]
  indicadores: IndicadorAdmin[]
}

// Os mesmos limites do banco (indicacao_config_beneficio_check).
export const BENEFICIO_MIN = 5
export const BENEFICIO_MAX = 300

/** O texto do benefício como o banco guarda: sem espaço sobrando. */
export function limparBeneficio(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

/** Por que não dá para salvar (null = pode). Desligado aceita texto vazio. */
export function problemaDoBeneficio(texto: string, ativo: boolean): string | null {
  const limpo = limparBeneficio(texto)
  if (limpo.length > BENEFICIO_MAX) return `O benefício pode ter até ${BENEFICIO_MAX} letras.`
  if (ativo && limpo.length < BENEFICIO_MIN) return 'Escreva o benefício antes de ligar as indicações.'
  return null
}

/** O código como o link e o checkout aceitam. */
export const CODIGO_VALIDO = /^[A-Z0-9_-]{2,30}$/

/** O link que o restaurante manda: abre a página de vendas já com o código dele. */
export function linkDeIndicacao(site: string, codigo: string): string {
  return `${site.replace(/\/+$/, '')}/vendas?ref=${encodeURIComponent(codigo)}`
}

/** A mensagem pronta para mandar junto com o link. */
export function mensagemDeIndicacao(link: string): string {
  return `Estou usando o EasyFeed para ouvir os clientes do meu restaurante pelo WhatsApp e recomendo. Dá uma olhada: ${link}`
}

/** Abre o WhatsApp com a mensagem escrita, para a pessoa escolher para quem mandar. */
export function linkDoWhatsapp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`
}

/** A situação do benefício, do jeito que o restaurante entende. */
export const ROTULO_PREMIO: Record<StatusPremio, string> = { pendente: 'A receber', aplicado: 'Recebido', cancelado: 'Cancelado' }
/** A mesma situação, do lado de quem aplica. */
export const ROTULO_PREMIO_ADMIN: Record<StatusPremio, string> = { pendente: 'Pendente', aplicado: 'Aplicado', cancelado: 'Cancelado' }

/** Quantos benefícios ainda faltam ser aplicados. */
export function premiosPendentes(premios: readonly { status: StatusPremio }[]): number {
  return premios.filter((p) => p.status === 'pendente').length
}

/** "Nenhum restaurante entrou pelo seu link ainda", "3 entraram pelo seu link, 1 assinou". */
export function resumoDasIndicacoes(indicados: number, assinaram: number): string {
  if (indicados <= 0) return 'Nenhum restaurante entrou pelo seu link ainda.'
  const entraram = indicados === 1 ? '1 restaurante entrou pelo seu link' : `${indicados} restaurantes entraram pelo seu link`
  const pagaram = assinaram <= 0 ? 'nenhum assinou ainda' : assinaram === 1 ? '1 assinou' : `${assinaram} assinaram`
  return `${entraram}, ${pagaram}.`
}

/**
 * O que dizer quando o banco não aceita o código de quem está assinando
 * (função `indicacao_registrar`). Só o próprio código trava a compra; o resto
 * é conferido de novo pelo checkout ou simplesmente não vale.
 */
export const RECUSA_QUE_TRAVA: Record<string, string> = {
  proprio_codigo: 'Este é o seu próprio código de indicação. Use o de quem indicou você ou deixe em branco.',
}
