/**
 * De quem é o feedback: 'cliente' (quem foi atendido) ou 'equipe' (quem
 * trabalha no restaurante). Sem Deno nem banco; testado em
 * __testes__/publico.teste.ts.
 *
 * Os dois públicos usam o MESMO motor (temas, insights, ações) e as mesmas
 * tabelas, separados pela coluna `publico`. Nas telas quem separa é o banco
 * (cabeçalho `x-publico` + RLS, migration 20261014000000). As funções de IA
 * usam a chave de serviço, que passa por cima da RLS, então cada uma precisa:
 *   1. ler o `publico` da linha de onde partiu (o ponto, o insight, a ação);
 *   2. pôr `.eq('publico', publico)` em toda busca nas tabelas do motor;
 *   3. gravar `publico` em tudo o que criar;
 *   4. montar o prompt com `promptPara` (prompts-equipe.ts): a equipe tem o
 *      PRÓPRIO treinamento, irmão do dos clientes (mesma tarefa, regras e
 *      exemplos do mundo do trabalho);
 *   5. usar as regras da equipe onde a conta muda: gravidade (gravidade.ts),
 *      quantas pessoas viram insight (avaliacao.ts) e quem conta como pessoa.
 */

export type Publico = 'cliente' | 'equipe'
export const PUBLICOS: Publico[] = ['cliente', 'equipe']

/** Qualquer valor que não seja 'equipe' é 'cliente' (o que já existia antes da coluna). */
export const publicoDe = (v: unknown): Publico => (String(v ?? '').trim().toLowerCase() === 'equipe' ? 'equipe' : 'cliente')

/** O público pedido no corpo ou no cabeçalho `x-publico` de uma chamada da tela. */
export function publicoDoPedido(corpo: unknown, cabecalho?: string | null): Publico {
  // deno-lint-ignore no-explicit-any
  const doCorpo = (corpo as any)?.publico
  return publicoDe(doCorpo ?? cabecalho)
}

export const CATEGORIAS_EQUIPE = [
  'Liderança e gestão',
  'Salário e benefícios',
  'Escala e horários',
  'Carga de trabalho',
  'Clima e colegas',
  'Estrutura e equipamentos',
  'Treinamento e crescimento',
  'Reconhecimento',
  'Comunicação',
  'Segurança e saúde',
  'Clientes',
  'Outros',
] as const
export type CategoriaEquipe = (typeof CATEGORIAS_EQUIPE)[number]

const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** A categoria da equipe com a grafia certa; fora da lista vira 'Outros'. */
export const categoriaDaEquipe = (v: unknown): CategoriaEquipe =>
  CATEGORIAS_EQUIPE.find((c) => semAcento(c) === semAcento(v)) ?? 'Outros'

/** A coluna de `restaurantes` que marca a última geração de insights daquele público. */
export const colunaDaUltimaAnalise = (publico: Publico) => (publico === 'equipe' ? 'ultima_analise_insights_equipe' : 'ultima_analise_insights')

/** Como chamar quem escreveu, para textos montados no código. */
export const quemEscreve = (publico: Publico) => (publico === 'equipe' ? { um: 'funcionário', varios: 'funcionários' } : { um: 'cliente', varios: 'clientes' })
