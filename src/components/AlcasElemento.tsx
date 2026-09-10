import { cn } from '@/lib/utils'
import type { Ancora } from '@/lib/redimensionar-cartaz'

/** Bolinha de canto: cresce proporcional. */
const CANTOS: Ancora[] = ['no', 'ne', 'so', 'se']
/** Barrinha de lado: mexe só naquele sentido. */
const LADOS: Ancora[] = ['n', 's', 'l', 'o']

/**
 * Comprimento da barrinha (22px) mais as duas bolinhas de canto que ela
 * divide o lado com. Abaixo disto não cabe tudo sem encavalar.
 */
const LADO_MINIMO_PRA_BARRINHA = 40

/**
 * As alças em volta do elemento selecionado — mesmo desenho de um editor de
 * arte: bolinha nos cantos, barrinha nos lados.
 *
 * A borda INTEIRA redimensiona, não só a barrinha: sobre ela existe uma faixa
 * invisível com o cursor de duas pontas. É isso que faz o lado continuar
 * funcionando quando o elemento é fino demais pra barrinha aparecer — numa
 * linha de texto, a barrinha tem quase a altura da caixa toda, cobre as duas
 * bolinhas e vira um amontoado de pontos e traços. Nesse caso ela some e fica
 * só o cursor, que é o que anuncia a borda arrastável.
 *
 * Fica FORA do componente da página de propósito. Declarada lá dentro, cada
 * render criava um tipo de componente novo, o React descartava o nó da alça e
 * remontava outro — e o arrasto morria no primeiro movimento, porque o
 * `pointermove` tinha ficado preso no nó que acabara de ser destruído. Era
 * exatamente por isso que redimensionar "não funcionava".
 */
export function Alcas({
  id,
  aoPegar,
  larguraTela,
  alturaTela,
}: {
  id: string
  aoPegar: (id: string, ancora: Ancora) => (e: React.PointerEvent<HTMLDivElement>) => void
  /** Tamanho do elemento em pixels de TELA — não do cartaz. Ver abaixo. */
  larguraTela: number
  alturaTela: number
}) {
  return (
    <>
      {/* Os lados vêm primeiro no DOM pra ficarem ATRÁS das bolinhas: nos
          cantos as duas áreas se encostam, e ali quem manda é o canto. */}
      {LADOS.map((a) => {
        const vertical = a === 'l' || a === 'o'
        // Espessura da faixa de pegada. Limitada a um terço da medida do
        // outro eixo pra sempre sobrar miolo: sem isso, num elemento fino as
        // faixas das duas bordas se encontrariam no meio e não haveria mais
        // por onde ARRASTAR o elemento.
        const espessura = Math.max(4, Math.min(11, (vertical ? larguraTela : alturaTela) / 3))
        const cabeBarrinha = (vertical ? alturaTela : larguraTela) >= LADO_MINIMO_PRA_BARRINHA

        return (
          <div
            key={a}
            onPointerDown={aoPegar(id, a)}
            role="button"
            tabIndex={-1}
            aria-label="Redimensionar neste sentido"
            className="absolute touch-none"
            style={{
              left: a === 'l' ? undefined : a === 'o' ? -espessura / 2 : 0,
              right: a === 'l' ? -espessura / 2 : undefined,
              top: a === 's' ? undefined : a === 'n' ? -espessura / 2 : 0,
              bottom: a === 's' ? -espessura / 2 : undefined,
              width: vertical ? espessura : '100%',
              height: vertical ? '100%' : espessura,
              cursor: vertical ? 'ew-resize' : 'ns-resize',
            }}
          >
            {/* A barrinha é só o sinal visual — quem recebe o toque é a faixa
                inteira acima, então ela não intercepta o ponteiro. */}
            {cabeBarrinha && (
              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                  'rounded-full border border-gray-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
                  // Comprida no sentido do lado que ela puxa: é o que deixa
                  // claro, sem legenda, que ali só cresce naquele eixo.
                  vertical ? 'h-[22px] w-[7px]' : 'h-[7px] w-[22px]',
                )}
              />
            )}
          </div>
        )
      })}

      {CANTOS.map((a) => (
        <div
          key={a}
          onPointerDown={aoPegar(id, a)}
          role="button"
          tabIndex={-1}
          aria-label="Redimensionar proporcional"
          className="absolute h-[11px] w-[11px] touch-none rounded-full border border-gray-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
          style={{
            left: a.includes('o') ? -5 : undefined,
            right: a.includes('e') ? -5 : undefined,
            top: a.includes('n') ? -5 : undefined,
            bottom: a.includes('s') ? -5 : undefined,
            cursor: a === 'no' || a === 'se' ? 'nwse-resize' : 'nesw-resize',
          }}
        />
      ))}
    </>
  )
}
