/**
 * As duas peças prontas, lado a lado, cada uma com o seu "editar".
 *
 * É o que a tela mostra depois que o dono já passou pelos dois passos. Na
 * primeira vez ela o leva em sequência — cartaz impresso, depois página do
 * cliente —, porque ninguém sabe que a segunda existe antes de ver. Dali em
 * diante o caminho sequencial atrapalha: quem volta aqui quer mexer numa coisa
 * específica, e ter que atravessar a outra pra chegar nela é trabalho à toa.
 *
 * As duas prévias aparecem juntas por um motivo além da conveniência: são as
 * duas metades da mesma experiência do cliente — a mesa e o celular —, e vê-las
 * lado a lado é o que deixa perceber quando uma destoa da outra.
 */
import { Pencil } from 'lucide-react'
import { LandingView, type TextosDaPagina } from '@/components/LandingView'
import { POSTER_H, POSTER_W } from '@/lib/qr-poster'
import type { ElementoCartaz, EstilosDosTextos } from '@/lib/cartaz-elementos'

/**
 * A altura que as DUAS peças têm, do topo ao pé.
 *
 * Elas mostram coisas de formatos muito diferentes — um cartaz em pé de
 * 720×1080 e um telefone 9:19,5 —, e cada uma no seu tamanho fazia os dois
 * cards ficarem tortos, um sobrando espaço embaixo do outro. Fixando a altura
 * e derivando a largura de cada uma da sua própria proporção, as duas ocupam a
 * mesma faixa e o olho compara uma com a outra em vez de tropeçar no
 * desalinhamento.
 */
const ALTURA_PECA = 560

// ── Celular: a moldura come 10px de cada lado ──
const BORDA_CELULAR = 10
const TELA_ALTURA = ALTURA_PECA - BORDA_CELULAR * 2
const TELA_LARGURA = Math.round(TELA_ALTURA * (9 / 19.5))

// ── Cartaz: base de madeira embaixo, e a chapa fica com o resto ──
const BASE_MADEIRA = 24
const CHAPA_TOPO = 8
const CHAPA_PE = 30
const CHAPA_ALTURA = ALTURA_PECA - BASE_MADEIRA
const CANVAS_ALTURA = CHAPA_ALTURA - CHAPA_TOPO - CHAPA_PE
const CANVAS_LARGURA = Math.round((CANVAS_ALTURA * POSTER_W) / POSTER_H)
const CHAPA_LARGURA = CANVAS_LARGURA + CHAPA_TOPO * 2

interface Props {
  /** O canvas do cartaz continua sendo o da página: é dele que sai o download. */
  canvasRef: React.RefObject<HTMLCanvasElement>
  onEditarCartaz: () => void
  onEditarCliente: () => void
  // ── o que a página do cliente precisa pra se desenhar ──
  restauranteNome: string
  mensagem: string | null
  whatsapp: string | null
  modo: 'upload' | 'estilo'
  imagem: string | null
  estilo: string
  elementos: ElementoCartaz[]
  textos: TextosDaPagina
  estilosDosTextos: EstilosDosTextos
}

function Peca({
  titulo, descricao, onEditar, children,
}: {
  titulo: string
  descricao: string
  onEditar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-[15px] font-semibold text-gray-900">{titulo}</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{descricao}</p>
      </div>

      <div
        className="flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-5 py-6"
        style={{ minHeight: ALTURA_PECA + 48 }}
      >
        {children}
      </div>

      {/* O editar fica EMBAIXO, depois da peça.
          Em cima ele competia com o título por atenção e ficava longe do que
          descreve; aqui ele é a última coisa que se lê — vê o resultado, e
          então decide mexer. Largura cheia porque é a única ação do card. */}
      <div className="border-t border-gray-100 p-4">
        <button
          type="button"
          onClick={onEditar}
          className={
            'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14.5px] font-semibold text-white ' +
            // Mesma construção dos botões de peso do app: luz na quina de
            // cima, degradê curto e sombra baixa — some tudo ao apertar, que é
            // a leitura de afundar. Terracota porque é a cor de quem edita o
            // material do cliente, e o azul do app já é a cor de tudo que é
            // clicável.
            'bg-[#C2622C] bg-gradient-to-b from-[#CE7038] to-[#A9531F] ' +
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(16,24,40,0.20)] ' +
            'transition-all hover:from-[#D67B44] hover:to-[#B85B24] ' +
            'active:shadow-none active:from-[#A9531F] active:to-[#A9531F] active:scale-[0.99]'
          }
        >
          <Pencil className="h-4 w-4" /> Editar
        </button>
      </div>
    </div>
  )
}

export function ResumoDaPersonalizacao({
  canvasRef, onEditarCartaz, onEditarCliente,
  restauranteNome, mensagem, whatsapp, modo, imagem, estilo, elementos, textos, estilosDosTextos,
}: Props) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Peca
        titulo="QR Code impresso"
        descricao="O display que fica na mesa do restaurante."
        onEditar={onEditarCartaz}
      >
        {/* O mesmo display de acrílico do editor, sem a camada de arraste — e o
            MESMO canvas, porque é dele que saem o PNG e o PDF. */}
        <div style={{ width: CHAPA_LARGURA }}>
          <div
            className="relative rounded-[6px] ring-1 ring-white/60 shadow-[0_16px_30px_-12px_rgba(0,0,0,0.4)]"
            style={{
              padding: `${CHAPA_TOPO}px ${CHAPA_TOPO}px ${CHAPA_PE}px`,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.30), rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.24))',
            }}
          >
            <canvas
              ref={canvasRef}
              width={POSTER_W}
              height={POSTER_H}
              className="block w-full rounded-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
              style={{ height: CANVAS_ALTURA }}
            />
          </div>
          <div className="relative mx-auto -mt-[2px] w-[104%] -translate-x-[2%]" style={{ height: BASE_MADEIRA }}>
            <div className="absolute inset-0 rounded-[5px] bg-gradient-to-b from-[#EEDAB8] via-[#D8B98D] to-[#AC8757] shadow-[0_12px_18px_-9px_rgba(0,0,0,0.5)]" />
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[5px] bg-white/40" />
          </div>
        </div>
      </Peca>

      <Peca
        titulo="Página do cliente"
        descricao="O que abre no celular de quem escaneia o QR."
        onEditar={onEditarCliente}
      >
        <div style={{ width: TELA_LARGURA + BORDA_CELULAR * 2 }}>
          <div
            className="relative overflow-hidden bg-gray-900 shadow-[0_16px_36px_-14px_rgba(16,24,40,0.5)]"
            style={{ borderRadius: 36, padding: BORDA_CELULAR }}
          >
            <div className="relative overflow-hidden bg-white" style={{ height: TELA_ALTURA, borderRadius: 27 }}>
              <LandingView
                preview
                restauranteNome={restauranteNome}
                modo={modo}
                imagem={imagem}
                estilo={estilo}
                mensagem={mensagem}
                whatsapp={whatsapp}
                elementos={elementos}
                textos={textos}
                estilosDosTextos={estilosDosTextos}
              />
            </div>
          </div>
        </div>
      </Peca>
    </div>
  )
}
