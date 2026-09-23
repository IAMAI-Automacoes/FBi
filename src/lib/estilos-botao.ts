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
  'h-9 shrink-0 rounded-full border border-blue-700 bg-white px-4 text-sm font-medium text-blue-700 [&_svg]:text-blue-700 shadow-[0_1px_2px_rgba(16,24,40,0.20)] hover:bg-blue-50 hover:text-blue-700 active:shadow-none'

/**
 * O gatilho de select quando ele é um FILTRO, e não um campo de formulário —
 * os "Todos sentimentos" e "Mais recentes" da barra de /feedbacks.
 *
 * Pílula cinza: a forma acompanha o resto do site, mas a cor não. Os dois
 * vizinhos de barra ("Últimos 7 dias" e "Categoria") são azuis, e quatro
 * controles azuis em fila deixavam de distinguir o que é filtro escolhido do
 * que é filtro em branco.
 *
 * `w-auto` + `whitespace-nowrap`, e nenhuma largura fixa: com `w-[168px]` a
 * opção mais longa ("Positivo e negativo") não cabia e o `line-clamp-1` do
 * gatilho a cortava em "Todos..." — o texto sumia justo quando havia uma
 * escolha feita para mostrar.
 */
export const SELECT_PILULA_FILTRO =
  'h-10 w-auto shrink-0 gap-2 whitespace-nowrap border-gray-300 bg-white text-gray-700 shadow-[0_1px_2px_rgba(16,24,40,0.10)] hover:bg-gray-50 data-[placeholder]:text-gray-500 ' +
  // O anel de foco do `SelectTrigger` base é azul (`focus:ring-ring`) e
  // sobrava um halo azul em volta da pílula cinza enquanto ela estivesse
  // escolhida — o gatilho segue com foco depois de fechar a lista. Aqui o
  // aviso de foco vira a própria borda, escurecida: continua visível para quem
  // navega por teclado, sem trazer a cor de volta.
  'focus:ring-0 focus:ring-offset-0 focus:border-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 ' +
  '[&>span]:line-clamp-none [&>span]:overflow-visible [&>svg]:text-gray-400 [&>svg]:opacity-100'

/**
 * A pílula vazada em vermelho — para a ação destrutiva que não é a principal
 * da tela: o "Excluir" de cada linha da tabela do painel admin.
 *
 * Vazada e não cheia porque são dezenas numa coluna só: uma fileira de pílulas
 * vermelhas sólidas faria a tabela inteira parecer um alerta. O contorno
 * mantém a cor do aviso sem virar o assunto da página.
 */
export const BOTAO_PILULA_VERMELHA_VAZADA =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-red-600 bg-white px-3.5 text-sm font-medium text-red-600 shadow-[0_1px_2px_rgba(16,24,40,0.20)] transition-colors hover:bg-red-50 active:shadow-none disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none'

/**
 * O par do anterior, em verde: desfazer a exclusão. Mesma forma, mesma altura
 * — o que muda é só a cor, porque a ação é a oposta.
 */
export const BOTAO_PILULA_VERDE_VAZADA =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-600 bg-white px-3.5 text-sm font-medium text-emerald-700 shadow-[0_1px_2px_rgba(16,24,40,0.20)] transition-colors hover:bg-emerald-50 active:shadow-none disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none'
