/**
 * As duas peças prontas, lado a lado, cada uma com o seu "personalizar".
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
import type { ElementoCartaz, EstilosDosTextos } from '@/lib/cartaz-elementos'

/** Mesmas medidas do editor, pra peça não mudar de tamanho ao abrir. */
const ALTURA_TELA = 638
const LARGURA_TELA = Math.round(ALTURA_TELA * (9 / 19.5))

interface Props {
  /** O canvas do cartaz continua sendo o da página: é dele que sai o download. */
  canvasRef: React.RefObject<HTMLCanvasElement>
  larguraCartaz: number
  alturaCartaz: number
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
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">{titulo}</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{descricao}</p>
        </div>
        <Button variant="outline" size="forma" className="shrink-0 gap-1.5" onClick={onEditar}>
          <Pencil className="h-3.5 w-3.5" /> Personalizar
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 p-5">
        {children}
      </div>
    </div>
  )
}

export function ResumoDaPersonalizacao({
  canvasRef, larguraCartaz, alturaCartaz, onEditarCartaz, onEditarCliente,
  restauranteNome, mensagem, whatsapp, modo, imagem, estilo, elementos, textos, estilosDosTextos,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Peca
        titulo="QR Code impresso"
        descricao="O display que fica na mesa do restaurante."
        onEditar={onEditarCartaz}
      >
        {/* O mesmo display de acrílico do editor, sem a camada de arraste — e
            o MESMO canvas, porque é dele que saem o PNG e o PDF. */}
        <div className="w-[300px] max-w-full">
          <div className="relative rounded-[6px] px-[8px] pb-[34px] pt-[8px] shadow-[0_18px_34px_-12px_rgba(0,0,0,0.4)] ring-1 ring-white/60"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.30), rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.24))' }}
          >
            <canvas
              ref={canvasRef}
              width={larguraCartaz}
              height={alturaCartaz}
              className="block h-auto w-full rounded-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
            />
          </div>
          <div className="relative mx-auto -mt-[2px] h-[26px] w-[104%] -translate-x-[2%]">
            <div className="absolute inset-0 rounded-[5px] bg-gradient-to-b from-[#EEDAB8] via-[#D8B98D] to-[#AC8757] shadow-[0_12px_18px_-9px_rgba(0,0,0,0.5)]" />
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[5px] bg-white/40" />
          </div>
          <div className="mx-auto mt-3 h-2.5 w-[80%] rounded-[50%] bg-black/20 blur-[8px]" />
        </div>
      </Peca>

      <Peca
        titulo="Página do cliente"
        descricao="O que abre no celular de quem escaneia o QR."
        onEditar={onEditarCliente}
      >
        <div style={{ width: LARGURA_TELA + 20 }}>
          <div
            className="relative overflow-hidden bg-gray-900 shadow-[0_18px_40px_-14px_rgba(16,24,40,0.5)]"
            style={{ borderRadius: 40, padding: 10 }}
          >
            <div className="relative overflow-hidden bg-white" style={{ height: ALTURA_TELA, borderRadius: 30 }}>
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
