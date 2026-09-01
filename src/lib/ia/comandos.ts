/**
 * Protocolo de comandos entre a IA principal e o sistema.
 *
 * A IA principal NUNCA altera nada diretamente: quando decide que o dono pediu
 * uma alteração ou uma busca, ela responde APENAS com um código no formato
 * [[comando:TIPO|CONTEÚDO]]. O sistema intercepta o código, chama o especialista
 * daquele tipo (cada um com seu prompt focado e só as memórias necessárias),
 * executa, e então devolve um RELATÓRIO para a IA narrar o que foi feito.
 *
 * ## O que o assistente NÃO faz
 *
 * Criar, editar e excluir ação e insight saíram do protocolo. Esses itens são
 * o registro do que o restaurante decidiu fazer sobre o que os clientes
 * disseram — quem decide isso é o dono, no quadro, onde ele vê o que já
 * existe antes de mexer. Um item nascido no meio de uma conversa entra sem
 * essa vista, e o chat vira uma segunda porta de escrita para os mesmos
 * dados, com regras próprias.
 *
 * O que sobrou são as alterações sobre o próprio assistente e o perfil do
 * restaurante (`mudar_config`, `anotar`) e as buscas de material. Sobre ação e
 * insight o assistente lê e conversa — e só.
 *
 * Módulo puro de propósito: sem imports, para o parser ser testável isolado.
 */

export type TipoComando =
  // alterações — um especialista para cada
  | 'mudar_config'
  | 'anotar'
  // buscas de material — um especialista para cada
  | 'pesquisar'
  | 'abrir'
  | 'conhecimento'

export interface Comando {
  tipo: TipoComando
  arg: string
}

const TIPOS: TipoComando[] = [
  'mudar_config', 'anotar',
  'pesquisar', 'abrir', 'conhecimento',
]

/** Comandos que buscam material para a resposta (rodam e a IA escreve depois). */
export function ehComandoMaterial(t: TipoComando): boolean {
  return t === 'pesquisar' || t === 'abrir' || t === 'conhecimento'
}

/** Comandos que alteram o sistema (especialista monta, dono confirma/desfaz). */
export function ehComandoOperacao(t: TipoComando): boolean {
  return !ehComandoMaterial(t)
}

/**
 * Extrai o primeiro comando válido do texto da IA. Tolera espaços e maiúsculas,
 * mas rejeita tipo desconhecido — comando inválido é tratado como texto comum.
 */
export function parsearComando(texto: string): Comando | null {
  const m = /\[\[\s*comando\s*:\s*([a-z_]+)\s*(?:\|\s*([^\]]*?))?\s*\]\]/i.exec(texto || '')
  if (!m) return null
  const tipo = m[1].toLowerCase() as TipoComando
  if (!TIPOS.includes(tipo)) return null
  return { tipo, arg: (m[2] || '').trim() }
}

/** Remove qualquer marcação [[comando:...]] do texto exibido ao dono. */
export function removerComandos(texto: string): string {
  return (texto || '').replace(/\[\[\s*comando\s*:[^\]]*\]\]/gi, '').trim()
}
