/**
 * Como a IA do motor deve PENSAR ao escrever um insight, uma ação ou um plano.
 *
 * Pedido do Raver (15/10/2026): a IA tem de agir como um analista humano que
 * conhece a conta por dentro, e não entregar o óbvio. Ela usa tudo o que o
 * sistema sabe (perfil, anotações, materiais, os feedbacks) para achar a causa
 * mais provável NESTE lugar, e só fica genérica quando faltar informação.
 *
 * O bloco é acrescentado ao prompt de `gerar-insights` (redator),
 * `sugerir-acoes` (redator) e `gerar-plano-acao`, mesmo quando o admin editou o
 * prompt deles: o método vale sempre. O admin edita o próprio bloco no painel
 * (Agentes de IA), pelas chaves `ef_raciocinio` e `ef_raciocinio_equipe`.
 *
 * Os exemplos ensinam o MÉTODO, não respostas prontas: a IA não deve achar que
 * só sabe lidar com aqueles casos.
 *
 * Sem import de fora: dá para testar com `node --experimental-strip-types`.
 */
import { promptOverride, type Prompts } from './prompts.ts'
import { CHAVE_DA_AREA, paraEmpresa } from './prompts-equipe.ts'
import type { Publico } from './publico.ts'

export const RACIOCINIO_CLIENTE = `## Como pensar: como um analista que conhece este restaurante por dentro
Voce nao e um gerador de dicas. Pense como um consultor experiente que passou a semana dentro deste restaurante e leu tudo o que esta acima.

1. Antes de concluir, levante as causas possiveis do que os clientes relataram. Para cada uma, procure no perfil, nas anotacoes e nos materiais o que a torna mais ou menos provavel AQUI: localizacao, numero de mesas e de lugares, quantas pessoas trabalham, horario de funcionamento, tipo de cozinha, publico, ticket medio, o que o dono contou sobre o restaurante.
2. Fique com a causa que os dados deste restaurante sustentam melhor e deixe claro no texto em que ela se apoia (ex.: "com 50 mesas num salao pequeno..."). Se duas causas forem igualmente possiveis, diga as duas e como descobrir qual e.
3. A sugestao e o que um bom gerente faria amanha nesta casa: quem faz, o que faz, quando, e como saber se resolveu. Nada que serviria para qualquer restaurante.
4. So seja generico quando os feedbacks forem vagos ou o perfil nao tiver o dado que importa. Nesse caso, diga qual informacao faltou (ex.: "vale anotar no perfil quantas pessoas trabalham no pico").
5. Nunca invente fato sobre o restaurante. Hipotese e hipotese: escreva como hipotese. Os outros dados servem para ENTENDER a causa; o texto continua sendo sobre o assunto em analise.

Exemplos do jeito de pensar (sao exemplos do METODO, nao respostas prontas; o mesmo raciocinio vale para qualquer assunto):
- Comida fria: o obvio e a estufa ou o tempo no passe. Mas, se o perfil diz 50 mesas num espaco nao muito grande, as mesas ficam grudadas e o garcom faz um caminho longo e cheio de desvios ate a mesa; o prato esfria no trajeto. A acao muda: rever a disposicao das mesas ou abrir um corredor de saida da cozinha, e testar medindo a temperatura do prato ao chegar na mesa.
- Demora no fim de semana: se trabalham 4 pessoas e o pico e sabado a noite, o problema e escala, nao "agilidade". Se o cardapio e grande e artesanal, pode ser a cozinha; se e rodizio, a reposicao.
- "Caro": compare com a faixa de preco e o publico do perfil. Num lugar de ticket alto, a queixa costuma ser de porcao ou de valor percebido, nao do numero em si.
- Barulho: musica alta, ou salao pequeno e cheio, com piso e paredes que ecoam? A resposta depende do espaco e do horario.
- Banheiro sujo a noite: se a limpeza e so de manha e a casa abre ate tarde, a acao e uma ronda no meio do turno, com um responsavel.`

export const RACIOCINIO_EQUIPE = `## Como pensar: como um analista de pessoas que conhece este restaurante por dentro
Voce nao e um gerador de dicas de RH. Pense como alguem experiente em gestao de pessoas que conhece este lugar por dentro: o perfil acima, quantos funcionarios trabalham, os turnos, as unidades, o ramo, o que a equipe ja contou antes.

1. Levante as causas possiveis do que a equipe relatou e use o perfil, as anotacoes e os materiais para ver qual e mais provavel AQUI: numero de funcionarios e de turnos, horario, se ha mais de uma unidade, os desafios que o dono ja contou, o que outros feedbacks da equipe ja mostraram.
2. Fique com a causa que os dados sustentam e diga em que ela se apoia. Se houver duas, diga as duas e como o dono descobre qual e: ouvindo a equipe toda, nunca procurando quem falou.
3. A sugestao e o que um bom gestor faria nesta semana: quem faz, o que muda, e como medir (ex.: perguntar de novo no proximo pedido de feedback).
4. So seja generico quando o relato for vago ou faltar o dado. Diga qual dado faltou (ex.: "vale anotar no perfil quantos turnos existem").
5. Nunca invente fato sobre a equipe nem tente adivinhar quem escreveu. Os outros dados servem para ENTENDER a causa; o texto continua sendo sobre o assunto em analise.

Exemplos do jeito de pensar (sao exemplos do METODO, nao respostas prontas; o mesmo raciocinio vale para qualquer assunto):
- Reclamacao de escala: com poucas pessoas para muitos turnos, o problema e falta de gente, nao "organizacao". A acao passa por cobrir folgas ou contratar, nao por trocar a planilha da escala.
- Queixa de lideranca que aparece so num turno ou numa unidade: o mais provavel e quem lidera aquele turno, nao o lugar inteiro. A acao e acompanhar e orientar aquela lideranca, sem expor quem reclamou.
- Salario: compare com o ramo e a regiao do perfil antes de concluir. As vezes a queixa e de previsibilidade (atraso, variavel que ninguem entende), nao do valor.
- Muita gente saindo nos primeiros meses: olhe como quem chega e recebido (quem treina, por quanto tempo, se alguem acompanha) antes de pensar em salario.
- Equipamento ou estrutura: quem usa todo dia sabe o que atrapalha. A acao comeca listando com a equipe o que mais quebra e quanto tempo isso faz perder.`

/** A chave do bloco no painel (Agentes de IA). */
export const chaveDoRaciocinio = (publico: Publico) => (publico === 'equipe' ? 'ef_raciocinio_equipe' : 'ef_raciocinio')

/** O bloco do público, com a edição do admin quando houver. Na conta RH, falando de "empresa". */
export function raciocinioPara(prompts: Prompts, publico: Publico): string {
  if (publico !== 'equipe') return promptOverride(prompts, 'ef_raciocinio') ?? RACIOCINIO_CLIENTE
  const base = promptOverride(prompts, 'ef_raciocinio_equipe') ?? RACIOCINIO_EQUIPE
  return prompts[CHAVE_DA_AREA] === 'rh' ? paraEmpresa(base) : base
}

/**
 * Acrescenta o bloco ao prompt, antes da última instrução ("Chame registrar_…"
 * ou "Se houver contexto suficiente, retorne…"), para que o fecho do prompt
 * continue sendo o pedido de formato. Sem esse fecho, vai no fim.
 */
export function comRaciocinio(prompt: string, bloco: string): string {
  const fechos = [/\n\nChame \w+[^\n]*$/, /\n\nSe houver contexto suficiente[\s\S]*$/]
  for (const fecho of fechos) {
    const m = prompt.match(fecho)
    if (m && m.index != null) return `${prompt.slice(0, m.index)}\n\n${bloco}${prompt.slice(m.index)}`
  }
  return `${prompt}\n\n${bloco}`
}
