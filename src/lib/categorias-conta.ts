/**
 * As categorias editáveis de cada conta (Configurações → Categorias), sem React,
 * para os testes rodarem no Node.
 *
 * Pedido do Raver (15/10/2026): renomear, descrever, mudar a cor, desativar e
 * criar categorias, nos dois softwares. As regras são as mesmas do banco
 * (`salvar_categorias`, migration 20261025000000):
 *   - até 30 categorias, nome de 1 a 40 letras, sem repetir (sem ligar para
 *     maiúscula), descrição de até 200;
 *   - "Outros" existe sempre, ligada e no fim (é para onde vai o que não se
 *     encaixa em nenhuma).
 * Renomear vale daqui para frente: os feedbacks antigos ficam com o nome velho.
 */

export type PublicoDaCategoria = 'cliente' | 'equipe'

export interface CategoriaDaConta {
  nome: string
  /** O que entra nela. A IA que classifica lê esta descrição. */
  descricao: string
  /** A cor: o nome de uma categoria padrão (a cor oficial dela) ou uma cor da paleta extra ("extra:…"). */
  cor: string | null
  /** O ícone escolhido (chave de ICONES_DE_CATEGORIA); vazio = o da cor. */
  icone: string | null
  ativa: boolean
}

export const NOME_DA_CATEGORIA_MAX = 40
export const DESCRICAO_DA_CATEGORIA_MAX = 200
export const MAX_CATEGORIAS = 30
export const OUTROS = 'Outros'

/** O que a tela diz para cada recusa (as mesmas do banco). */
export const RECUSA_DAS_CATEGORIAS: Record<string, string> = {
  vazia: 'Deixe pelo menos uma categoria.',
  demais: `São no máximo ${MAX_CATEGORIAS} categorias.`,
  nome_vazio: 'Dê um nome a cada categoria para salvar.',
  nome_longo: `O nome pode ter até ${NOME_DA_CATEGORIA_MAX} letras.`,
  repetida: 'Duas categorias com o mesmo nome.',
  descricao_longa: `A descrição pode ter até ${DESCRICAO_DA_CATEGORIA_MAX} letras.`,
  sem_conta: 'Esta sessão não tem uma conta.',
}

/** O nome como o banco guarda: sem espaço sobrando. */
export const limparNomeDaCategoria = (nome: unknown) => String(nome ?? '').replace(/\s+/g, ' ').trim()

export const ehOutros = (nome: unknown) => limparNomeDaCategoria(nome).toLowerCase() === 'outros'

/** O primeiro problema da lista, ou null. */
export function problemaDasCategorias(itens: readonly CategoriaDaConta[]): { motivo: string; nome?: string } | null {
  if (!itens.length) return { motivo: 'vazia' }
  if (itens.length > MAX_CATEGORIAS) return { motivo: 'demais' }
  const vistos = new Set<string>()
  for (const c of itens) {
    const nome = limparNomeDaCategoria(c.nome)
    if (!nome) return { motivo: 'nome_vazio' }
    if (nome.length > NOME_DA_CATEGORIA_MAX) return { motivo: 'nome_longo', nome }
    if ((c.descricao ?? '').trim().length > DESCRICAO_DA_CATEGORIA_MAX) return { motivo: 'descricao_longa', nome }
    const chave = nome.toLowerCase()
    if (vistos.has(chave)) return { motivo: 'repetida', nome }
    vistos.add(chave)
  }
  return null
}

/** A lista como ela é gravada: nomes limpos, "Outros" ligada e no fim (entra se faltar). */
export function arrumarCategorias(itens: readonly CategoriaDaConta[]): CategoriaDaConta[] {
  const limpas = itens.map((c) => ({ ...c, nome: limparNomeDaCategoria(c.nome), descricao: (c.descricao ?? '').trim() }))
  const outros = limpas.find((c) => ehOutros(c.nome))
  return [
    ...limpas.filter((c) => !ehOutros(c.nome)),
    { nome: OUTROS, descricao: outros?.descricao || 'o que não se encaixa em nenhuma outra', cor: outros?.cor ?? OUTROS, icone: outros?.icone ?? null, ativa: true },
  ]
}

/** Os nomes que a IA usa e que aparecem nos filtros: só as ligadas. */
export const nomesAtivos = (itens: readonly CategoriaDaConta[]) => itens.filter((c) => c.ativa).map((c) => c.nome)

/** A lista mudou em relação à salva? */
export function categoriasMudaram(a: readonly CategoriaDaConta[], b: readonly CategoriaDaConta[]): boolean {
  const chave = (l: readonly CategoriaDaConta[]) => JSON.stringify(l.map((c) => [limparNomeDaCategoria(c.nome), (c.descricao ?? '').trim(), c.cor ?? '', c.icone ?? '', c.ativa]))
  return chave(a) !== chave(b)
}

/** Lê o que veio do banco (minhas_categorias), sem confiar no formato. */
export function lerCategorias(v: unknown): CategoriaDaConta[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      nome: limparNomeDaCategoria(x.nome),
      descricao: String(x.descricao ?? ''),
      cor: x.cor ? String(x.cor) : null,
      icone: x.icone ? String(x.icone) : null,
      ativa: x.ativa !== false,
    }))
    .filter((c) => c.nome)
}
