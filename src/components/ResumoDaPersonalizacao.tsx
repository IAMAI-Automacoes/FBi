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
import { Button } from '@/components/ui/button'
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
  titulo, onEditar, children,
}: {
  titulo: string
  onEditar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Só o nome da peça e o lápis, colados nela. A frase que explicava o
          que era cada uma existia pra quem nunca tinha visto — mas a essa
          altura o dono já montou as duas, e a própria imagem diz o que é. */}
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <h3 className="text-[15px] font-semibold text-gray-900">{titulo}</h3>
        {/* Só o ícone: o botão fica DENTRO do card da peça que ele edita, e
            ali não há a quem confundir — dizer "editar cartaz" seria repetir
            o título que está a dois centímetros dele. */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onEditar}
          aria-label={`Editar: ${titulo}`}
          title={`Editar: ${titulo}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div
        className="flex flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-5 pb-5 pt-2"
        style={{ minHeight: ALTURA_PECA + 24 }}
      >
        {children}
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
      <Peca titulo="QR Code impresso" onEditar={onEditarCartaz}>
        {/* O mesmo display de acrílico do editor, sem a camada de arraste — e o
            MESMO canvas, porque é dele que saem o PNG e o PDF. */}
        {/* Inclinada, como no editor: é a leve rotação em Y que faz ler como
            OBJETO em cima de uma mesa em vez de uma imagem colada na tela.
            Aqui ela pode ficar sempre assim — não há arrasto pra ela deformar
            o mapeamento, que é o motivo de o editor endireitá-la. */}
        <div style={{ width: CHAPA_LARGURA, perspective: '1300px' }}>
          <div
            className="relative rounded-[6px] ring-1 ring-white/60 shadow-[0_16px_30px_-12px_rgba(0,0,0,0.4)]"
            data-plaquinha
            style={{
              padding: `${CHAPA_TOPO}px ${CHAPA_TOPO}px ${CHAPA_PE}px`,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.30), rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.24))',
              transform: 'rotateY(-10deg) rotateX(2deg)',
              transformStyle: 'preserve-3d',
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

      <Peca titulo="Página do cliente" onEditar={onEditarCliente}>
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
