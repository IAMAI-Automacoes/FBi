/**
 * Tira do plano de ação as marcas de formatação antes de ele entrar num prompt.
 *
 * O plano é escrito num editor com negrito, itálico e tamanho de letra (ver
 * `src/lib/texto-rico.ts`), e é guardado como HTML de três tags. No banco isso
 * está certo — é o que a tela precisa para desenhar o destaque. Num prompt, não:
 * a IA gastaria atenção decidindo o que `<span style="font-size:16px">`
 * significa, e o que ela deve ler é a frase, não o tamanho em que alguém a
 * escreveu.
 *
 * Planos antigos são texto puro e atravessam sem mudança: sem tag, não há o
 * que tirar.
 *
 * Feito com expressão regular e não com um parser de HTML de propósito. Aqui o
 * objetivo é o inverso do que se pede a um parser: não interessa entender a
 * estrutura, só apagá-la. E a edge function roda no Deno, sem DOM.
 */
export function planoParaPrompt(html: string | null | undefined): string {
  if (!html) return ''

  return (
    html
      // Quebra de linha primeiro, senão as tags somem e as linhas grudam.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      // As três entidades que `montar()` escreve, na ordem inversa: `&amp;`
      // por último causaria dupla decodificação de um `&amp;lt;` literal.
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      // O editor pode deixar linhas vazias no fim ao apagar texto.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
