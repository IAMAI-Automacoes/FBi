/* A área Descontos (antes "Missões"): o que o restaurante faz para pagar menos.
   Hoje tem duas subpáginas: Vídeos (as missões de vídeo) e Indicações. */

export const ROTA_DESCONTOS = '/descontos'
export const ROTA_DESCONTOS_HISTORICO = '/descontos/historico'
export const ROTA_INDICACOES = '/descontos/indicacoes'

export function ehRotaDeDescontos(caminho: string): boolean {
  return caminho === ROTA_DESCONTOS || caminho.startsWith(`${ROTA_DESCONTOS}/`)
}
