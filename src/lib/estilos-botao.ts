/**
 * O desenho do botão de ação do site: a pílula do "Baixar" de /relatorios —
 * degradê curto de cima para baixo, um risco de luz por dentro da quina de cima
 * (`inset`), sombra baixa por fora e 36px de altura.
 *
 * O degradê fecha em `blue-800`, não em `blue-950`: o fim quase preto empretecia
 * a metade de baixo e o botão perdia a cor. A diferença entre as duas pontas
 * continua existindo — é o que dá volume —, só que agora dentro da mesma faixa
 * de azul.
 *
 * Mora aqui, e não numa `variant` do `Button`, porque também é aplicado a
 * componentes que só aceitam `className` (o gatilho do `FiltroCategorias`, por
 * exemplo) e porque as páginas que ainda seguem o estilo antigo não devem mudar
 * de aparência sozinhas.
 */
export const BOTAO_PILULA_AZUL =
  'h-9 shrink-0 rounded-full border-0 bg-blue-700 bg-gradient-to-b from-blue-600 to-blue-800 px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(16,24,40,0.20)] hover:from-blue-500 hover:to-blue-700 hover:text-white active:shadow-none active:from-blue-700 active:to-blue-700 disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none'

/**
 * A mesma pílula, em vermelho — para o botão que leva ao problema (o "Ver
 * avaliações" do tema crítico em /relatorios). Um tom abaixo do vermelho de
 * alerta comum, para pesar igual ao azul ao lado sem gritar mais que o aviso.
 */
export const BOTAO_PILULA_VERMELHA =
  'h-9 shrink-0 rounded-full border-0 bg-red-700 bg-gradient-to-b from-red-600 to-red-800 px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(16,24,40,0.20)] hover:from-red-500 hover:to-red-700 hover:text-white active:shadow-none active:from-red-700 active:to-red-700 disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none'

/**
 * A versão vazada da pílula: fundo branco, contorno e letra azuis. Para o botão
 * secundário que fica ao lado de um `BOTAO_PILULA_AZUL` — mesma forma e mesma
 * altura, peso visual menor.
 */
export const BOTAO_PILULA_AZUL_VAZADO =
  'h-9 shrink-0 rounded-full border border-blue-700 bg-white px-4 text-sm font-medium text-blue-700 shadow-[0_1px_2px_rgba(16,24,40,0.20)] hover:bg-blue-50 hover:text-blue-700 active:shadow-none'
