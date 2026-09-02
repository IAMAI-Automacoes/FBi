import { Toaster as Sonner, toast } from 'sonner'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

/**
 * Notificações do canto inferior direito — o ÚNICO sistema de aviso do app.
 *
 * Havia dois montados ao mesmo tempo (o `<Toaster/>` do shadcn e este), com
 * visuais diferentes: a mesma ação podia produzir um card claro de um jeito ou
 * de outro dependendo de qual arquivo a disparou. Agora `use-toast` é um
 * adaptador que cai aqui, então existe um só desenho e um só tempo de tela.
 *
 * ## O desenho
 *
 * O padrão do shadcn era um retângulo com `bg-background` e borda, título e
 * descrição empilhados no mesmo peso — muito parecido com os cards da própria
 * página, e sem nada que dissesse de relance se deu certo ou errado.
 *
 * Aqui a informação vem na ordem em que se lê: um ícone colorido de 16px
 * responde "deu certo?" antes de qualquer palavra; o título responde "o quê"
 * em uma linha; a descrição, quando existe, é o detalhe e vem menor e mais
 * clara. Fundo branco sólido (não translúcido: sobre um quadro colorido o
 * texto perde contraste), borda de 1px e sombra em duas camadas — uma curta
 * para a borda, uma longa e difusa para descolar do fundo.
 *
 * ## O tempo
 *
 * `DURACAO` é única e vale para todos, inclusive erros. A recomendação usual é
 * dar mais tempo a erro, mas aqui todos os textos cabem em uma ou duas linhas
 * curtas, e um aviso que fica mais tempo que os outros vira o único elemento
 * em movimento na tela enquanto a pessoa já seguiu trabalhando.
 *
 * Antes nenhum deles sumia sozinho: o `use-toast` do shadcn só agendava a
 * remoção DEPOIS de alguém fechar, então o aviso ficava até o clique no X.
 */

/** Tempo em tela, igual para todos os tipos. */
export const DURACAO = 4500

const ICONES = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  error: <AlertCircle className="h-4 w-4 text-red-600" />,
  info: <Info className="h-4 w-4 text-blue-600" />,
}

const Toaster = () => (
  <Sonner
    position="bottom-right"
    duration={DURACAO}
    gap={10}
    offset={20}
    // O X só aparece no hover (CSS abaixo): um botão de fechar sempre visível
    // num aviso que some sozinho em 4,5s é peso visual para uma ação que quase
    // ninguém faz.
    closeButton
    icons={ICONES}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast:
          'group relative flex w-full items-start gap-2.5 rounded-lg border border-gray-200/90 bg-white px-3.5 py-3 ' +
          'shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_-6px_rgba(16,24,40,0.16)]',
        icon: 'shrink-0 mt-px',
        content: 'flex flex-col gap-0.5 min-w-0 flex-1',
        title: 'text-[13px] font-semibold leading-snug text-gray-900',
        description: 'text-[12.5px] leading-snug text-gray-500',
        closeButton:
          'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border-0 bg-transparent ' +
          'text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 ' +
          'group-hover:opacity-100 focus-visible:opacity-100',
      },
    }}
    style={{ ['--width' as string]: '360px' }}
  />
)

export { Toaster, toast, X }
