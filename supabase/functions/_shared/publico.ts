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
 *   4. passar o prompt por `promptDoPublico`, que avisa a IA quando é a equipe.
 *
 * O treinamento é o mesmo dos clientes: a nota da equipe só diz o que muda.
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

/**
 * O que muda quando quem escreveu é da equipe. Vai NA FRENTE do prompt de
 * sempre: a IA lê o resto já sabendo de quem é o feedback.
 */
export const NOTA_EQUIPE = `## ANTES DE TUDO: estes feedbacks são da EQUIPE
Quem escreveu é um FUNCIONÁRIO do restaurante, contando como é trabalhar lá. Não é um cliente. Siga tudo o que vem abaixo, com estas diferenças:
- Onde estiver escrito "cliente", leia "funcionário" (ou "a equipe"). Ex.: "3 clientes reclamaram" vira "3 funcionários reclamaram".
- As categorias são SOMENTE estas, escritas exatamente assim: ${CATEGORIAS_EQUIPE.map((c) => `"${c}"`).join(', ')}. Esqueça a lista de categorias de cliente (Comida, Bebidas, Atendimento…).
- O dono quer que a equipe trabalhe melhor e não vá embora. O que se propõe é sobre gestão de pessoas (escala, salário, treinamento, comunicação, liderança, condições de trabalho), não sobre o atendimento ao cliente.
- Nunca escreva nome, apelido, cargo, turno, setor nem detalhe que mostre quem falou. Fale de "a equipe" ou "um funcionário".
- Nada do que você escrever é enviado para quem deu o feedback.
- Relato de assédio, discriminação, ameaça, agressão ou risco à segurança é sempre grave, mesmo vindo de uma pessoa só.

`

/** O prompt de sempre, com a nota da equipe na frente quando for o caso. */
export const promptDoPublico = (prompt: string, publico: Publico): string => (publico === 'equipe' ? NOTA_EQUIPE + prompt : prompt)

/** A coluna de `restaurantes` que marca a última geração de insights daquele público. */
export const colunaDaUltimaAnalise = (publico: Publico) => (publico === 'equipe' ? 'ultima_analise_insights_equipe' : 'ultima_analise_insights')

/** Como chamar quem escreveu, para textos montados no código. */
export const quemEscreve = (publico: Publico) => (publico === 'equipe' ? { um: 'funcionário', varios: 'funcionários' } : { um: 'cliente', varios: 'clientes' })
