/* As palavras do relatório, por público. Sem React e sem banco aqui.
 *
 * A página de Relatórios é a mesma para os clientes e para a equipe (o endereço
 * /equipe decide de quem são os dados, ver publico-rota.ts). O que muda é o
 * vocabulário: cliente "avalia", funcionário "dá feedback"; o relatório do
 * cliente fala de satisfação com o restaurante, o da equipe fala de como é
 * trabalhar ali. A tela, o PDF, a planilha e a IA tiram as palavras daqui, para
 * os quatro nunca discordarem.
 *
 * Os textos de 'cliente' são os que o relatório sempre teve: mudar um deles
 * muda o arquivo que o dono já recebe.
 */

export type PublicoDoRelatorio = 'cliente' | 'equipe'

export interface TextosDoRelatorio {
  /** "avaliação" / "feedback". */
  um: string
  /** "avaliações" / "feedbacks". */
  varios: string
  /** Com maiúscula, para título de coluna. */
  Varios: string
  /** Quem escreve, no plural: "clientes" / "funcionários". */
  quem: string
  /** O título do documento (PDF e planilha). */
  tituloDoDocumento: string
  /** Começo do nome do arquivo baixado. */
  arquivo: string
  recebidas: string
  positivas: string
  neutras: string
  negativas: string
  comoSeDividem: string
  maisComentam: string
  /** Quantas pessoas escreveram (cartão da tela). */
  pessoas: string
  /** A mesma coisa, curta, para a caixa do PDF. */
  pessoasCurto: string
  /** Título da seção de pessoas no PDF. */
  secaoDePessoas: string
  pessoasDiferentes: string
  pessoasQueVoltaram: string
  mensagensPorPessoa: string
  quandoChegam: string
  mediaPorDia: string
  horarioComMais: string
  diaComMais: string
  verTodas: string
  escreveram: string
  todasDoPeriodo: string
  oQueDisse: string
  semDadosTitulo: string
  semDadosTexto: string
  /** Aba "Categorias" da planilha. */
  ondeVaiMelhorEPior: string
  glossarioMensagem: string
}

const CLIENTE: TextosDoRelatorio = {
  um: 'avaliação',
  varios: 'avaliações',
  Varios: 'Avaliações',
  quem: 'clientes',
  tituloDoDocumento: 'Relatório de Satisfação dos Clientes',
  arquivo: 'relatorio',
  recebidas: 'Avaliações recebidas',
  positivas: 'Avaliações positivas',
  neutras: 'Avaliações neutras',
  negativas: 'Avaliações negativas',
  comoSeDividem: 'Como as avaliações se dividem',
  maisComentam: 'O que os clientes mais comentam',
  pessoas: 'Clientes que avaliaram',
  pessoasCurto: 'Clientes',
  secaoDePessoas: 'Clientes',
  pessoasDiferentes: 'Clientes diferentes',
  pessoasQueVoltaram: 'Clientes que voltaram a avaliar',
  mensagensPorPessoa: 'Mensagens por cliente',
  quandoChegam: 'Comportamento das avaliações',
  mediaPorDia: 'Média de avaliações por dia',
  horarioComMais: 'Horário com mais avaliações',
  diaComMais: 'Dia com mais avaliações',
  verTodas: 'Ver avaliações',
  escreveram: 'O que os clientes escreveram',
  todasDoPeriodo: 'Todas as avaliações do período',
  oQueDisse: 'O que o cliente disse',
  semDadosTitulo: 'Nenhuma avaliação neste período',
  semDadosTexto: 'Assim que seus clientes começarem a responder, o relatório aparece aqui. Tente um período maior ou compartilhe o QR Code.',
  ondeVaiMelhorEPior: 'Onde o restaurante vai melhor e pior, da satisfação mais baixa para a mais alta. Sugestões ficam de fora: não são satisfação nem insatisfação.',
  glossarioMensagem: 'Uma vez que um cliente escreveu.',
}

const EQUIPE: TextosDoRelatorio = {
  um: 'feedback',
  varios: 'feedbacks',
  Varios: 'Feedbacks',
  quem: 'funcionários',
  tituloDoDocumento: 'Relatório da Equipe',
  arquivo: 'relatorio-equipe',
  recebidas: 'Feedbacks recebidos',
  positivas: 'Feedbacks positivos',
  neutras: 'Feedbacks neutros',
  negativas: 'Feedbacks negativos',
  comoSeDividem: 'Como os feedbacks se dividem',
  maisComentam: 'O que a equipe mais comenta',
  pessoas: 'Funcionários que falaram',
  pessoasCurto: 'Funcionários',
  secaoDePessoas: 'Participação da equipe',
  pessoasDiferentes: 'Funcionários diferentes',
  pessoasQueVoltaram: 'Funcionários que falaram mais de uma vez',
  mensagensPorPessoa: 'Mensagens por funcionário',
  quandoChegam: 'Quando a equipe fala',
  mediaPorDia: 'Média de feedbacks por dia',
  horarioComMais: 'Horário com mais feedbacks',
  diaComMais: 'Dia com mais feedbacks',
  verTodas: 'Ver feedbacks',
  escreveram: 'O que a equipe escreveu',
  todasDoPeriodo: 'Todos os feedbacks do período',
  oQueDisse: 'O que a pessoa disse',
  semDadosTitulo: 'Nenhum feedback da equipe neste período',
  semDadosTexto: 'Assim que a equipe começar a responder, o relatório aparece aqui. Tente um período maior ou peça feedback em Funcionários.',
  ondeVaiMelhorEPior: 'Onde o trabalho vai melhor e pior na visão da equipe, da satisfação mais baixa para a mais alta. Sugestões ficam de fora: não são satisfação nem insatisfação.',
  glossarioMensagem: 'Uma vez que um funcionário escreveu.',
}

export function textosDoRelatorio(publico: PublicoDoRelatorio = 'cliente'): TextosDoRelatorio {
  return publico === 'equipe' ? EQUIPE : CLIENTE
}

/** "1 avaliação", "3 avaliações", "1 feedback". */
export function contar(n: number, t: TextosDoRelatorio): string {
  return `${n} ${n === 1 ? t.um : t.varios}`
}

/** A frase do cartão vermelho ("categoria que mais precisa de atenção"). */
export function fraseDoTemaCritico(percentual: number, publico: PublicoDoRelatorio): string {
  return publico === 'equipe'
    ? `${percentual}% dos feedbacks sobre este tema foram negativos.`
    : `${percentual}% das avaliações relacionadas a este tema foram negativas.`
}

/** "Sem avaliações" / "Sem feedbacks" (ponto do gráfico sem nada no dia). */
export function semNada(t: TextosDoRelatorio): string {
  return `Sem ${t.varios}`
}

// ── Participação da equipe (função equipe_relatorio_participacao) ────────────

/** Só contagens: o relatório nunca sabe quem falou. */
export interface ParticipacaoDaEquipe {
  ativos: number
  /** Abaixo disto de funcionários ativos, não se diz quantas pessoas falaram. */
  minimo: number
  /** Nulo = equipe pequena demais para dizer (protege o anônimo). */
  falaram: number | null
  mais_de_uma_vez: number | null
  feedbacks: number
  identificados: number
  anonimos: number
  aguardando: number
  pedidos: number
  receberam: number
  responderam: number
}

export const PARTICIPACAO_VAZIA: ParticipacaoDaEquipe = {
  ativos: 0, minimo: 5, falaram: null, mais_de_uma_vez: null, feedbacks: 0,
  identificados: 0, anonimos: 0, aguardando: 0, pedidos: 0, receberam: 0, responderam: 0,
}

/** O que veio do banco, sempre com número onde a tela espera número. */
export function lerParticipacao(bruto: unknown): ParticipacaoDaEquipe {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const n = (v: unknown) => (Number.isFinite(Number(v)) && v != null ? Math.max(0, Math.trunc(Number(v))) : 0)
  const talvez = (v: unknown) => (v == null ? null : n(v))
  return {
    ativos: n(b.ativos), minimo: n(b.minimo) || PARTICIPACAO_VAZIA.minimo,
    falaram: talvez(b.falaram), mais_de_uma_vez: talvez(b.mais_de_uma_vez), feedbacks: n(b.feedbacks),
    identificados: n(b.identificados), anonimos: n(b.anonimos), aguardando: n(b.aguardando),
    pedidos: n(b.pedidos), receberam: n(b.receberam), responderam: n(b.responderam),
  }
}

/** O número do cartão "Funcionários que falaram": "7", ou "—" na equipe pequena. */
export function valorDeQuemFalou(p: ParticipacaoDaEquipe): string {
  return p.falaram == null ? '—' : String(p.falaram)
}

/** A linha de baixo do cartão. */
export function detalheDeQuemFalou(p: ParticipacaoDaEquipe): string {
  if (p.falaram == null) return `Aparece com ${p.minimo} funcionários ou mais, para ninguém ser identificado pela conta.`
  const de = `de ${p.ativos} ${p.ativos === 1 ? 'funcionário ativo' : 'funcionários ativos'}`
  if (!p.ativos) return 'nenhum funcionário ativo cadastrado'
  return `${de} (${Math.min(100, Math.round((p.falaram / p.ativos) * 100))}%)`
}

/** "3 de 8 responderam (38%)", ou por que não há taxa. */
export function fraseDosPedidos(p: ParticipacaoDaEquipe): string {
  if (!p.pedidos) return 'Nenhum pedido de feedback neste período.'
  const pedidos = p.pedidos === 1 ? '1 pedido de feedback' : `${p.pedidos} pedidos de feedback`
  if (!p.receberam) return `${pedidos}, e nenhum chegou a ser entregue.`
  return `${pedidos}: ${p.responderam} de ${p.receberam} ${p.responderam === 1 ? 'respondeu' : 'responderam'} (${Math.round((p.responderam / p.receberam) * 100)}%).`
}

/** A taxa de resposta dos pedidos, de 0 a 100; nulo quando ninguém recebeu. */
export function taxaDeResposta(p: ParticipacaoDaEquipe): number | null {
  return p.receberam ? Math.round((p.responderam / p.receberam) * 100) : null
}

/** Como as pessoas quiseram aparecer, para a barra dividida. Some quem é zero. */
export function divisaoDaIdentidade(p: ParticipacaoDaEquipe): { chave: 'identificados' | 'anonimos' | 'aguardando'; rotulo: string; n: number; percentual: number }[] {
  const total = p.identificados + p.anonimos + p.aguardando
  if (!total) return []
  const partes = [
    { chave: 'identificados' as const, rotulo: 'Com o nome', n: p.identificados },
    { chave: 'anonimos' as const, rotulo: 'Anônimos', n: p.anonimos },
    { chave: 'aguardando' as const, rotulo: 'Aguardando a escolha', n: p.aguardando },
  ]
  return partes.filter((x) => x.n > 0).map((x) => ({ ...x, percentual: Math.round((x.n / total) * 100) }))
}

/** As linhas da seção de participação no PDF e na planilha. */
export function linhasDaParticipacao(p: ParticipacaoDaEquipe): string[] {
  return [
    p.falaram == null
      ? `Funcionários ativos: ${p.ativos} (com menos de ${p.minimo}, o relatório não diz quantos falaram, para proteger quem pediu anonimato)`
      : `Funcionários que falaram: ${p.falaram} de ${p.ativos} ativos`,
    p.falaram != null ? `Funcionários que falaram mais de uma vez: ${p.mais_de_uma_vez ?? 0}` : '',
    fraseDosPedidos(p),
    p.feedbacks ? `Como quiseram aparecer: ${p.identificados} com o nome, ${p.anonimos} anônimos${p.aguardando ? `, ${p.aguardando} aguardando a escolha` : ''}` : '',
  ].filter(Boolean)
}
