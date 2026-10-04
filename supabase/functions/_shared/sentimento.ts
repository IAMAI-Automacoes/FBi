// Como o sistema lê o sentimento de um feedback — uma regra só, para todas as
// funções (insights, vínculos, ações, gravidade).
//
// Valores gravados pelo n8n (workflow "Feedback Restaurante"):
//   ponto    (feedbacks_restaurante.sentimento): Positivo | Negativo | Neutro | Sugestão
//   mensagem (feedbacks_originais.sentimento):   Positivo | Negativo | Positivo e Negativo | Neutro | Sugestão
// Linhas antigas têm minúscula ('positivo') e variações ('Positivo e Neutro'):
// por isso a leitura é por pedaço da palavra, sem acento e sem diferença de
// maiúscula.
//
// Insights (decisão do Raver, 04/10/2026):
//   - Neutro NÃO gera insight. Aparece como feedback, mas não é lido.
//   - Sugestão gera insight como PONTO A MELHORAR: entra no mesmo balde da
//     queixa ('neg'), com gravidade de melhoria (nível 1).

export type Polaridade = 'pos' | 'neg' | 'neutro'

function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Tem parte negativa (inclui o misto "Positivo e Negativo"). */
export function ehNegativo(s: string | null | undefined): boolean {
  return normalizar(s).includes('negativ')
}

export function ehPositivo(s: string | null | undefined): boolean {
  return normalizar(s).includes('positiv')
}

export function ehSugestao(s: string | null | undefined): boolean {
  return normalizar(s).includes('sugest')
}

/**
 * O balde do ponto nos insights: queixa ou sugestão = 'neg' (ponto a melhorar);
 * elogio = 'pos'; neutro (ou vazio/desconhecido) = 'neutro', fora dos insights.
 */
export function polaridade(s: string | null | undefined): Polaridade {
  if (ehNegativo(s) || ehSugestao(s)) return 'neg'
  if (ehPositivo(s)) return 'pos'
  return 'neutro'
}

/** O ponto é lido para gerar insight? (Neutro não é.) */
export function entraEmInsight(s: string | null | undefined): boolean {
  return polaridade(s) !== 'neutro'
}
