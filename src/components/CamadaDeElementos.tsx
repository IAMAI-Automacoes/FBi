/**
 * Os textos e imagens que o dono posicionou sobre a página do cliente.
 *
 * Em HTML, e não em canvas como no cartaz — e a diferença não é de gosto: esta
 * página é servida por um bundle leve para o celular de quem escaneia o QR, e
 * um canvas ali significaria carregar o desenhista inteiro, esperar as fontes
 * e só então ver alguma coisa. Aqui o navegador já sabe desenhar texto e
 * imagem; o trabalho é só traduzir as medidas.
 *
 * As MEDIDAS são as mesmas do cartaz de propósito (`ElementoCartaz`): posição
 * em fração, corpo de fonte em pixels de uma base fixa, escala em fração da
 * largura. É o que permite o mesmo editor, as mesmas alças e a mesma conta de
 * redimensionar servirem aos dois lugares.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fonteCss, garantirCssDestasFontes, type ElementoCartaz } from '@/lib/cartaz-elementos'

/**
 * Largura de referência do corpo da fonte, em pixels.
 *
 * Um texto de 32 aqui sai com 32px num celular comum — foi escolhida assim
 * (390px, a largura de um telefone de tamanho médio) para o número na barra de
 * propriedades significar o que a pessoa espera. Em telas mais largas tudo
 * cresce junto, e o desenho que ela aprovou não se desfaz.
 */
export const BASE_CLIENTE = 390

export interface CaixaDoElemento {
  id: string
  /** Em pixels do CONTAINER, já com o giro desfeito (a caixa deitada). */
  x: number
  y: number
  w: number
  h: number
  rotacao: number
}

interface Props {
  elementos: ElementoCartaz[]
  /** Cor de reserva de um texto que não escolheu a sua. */
  tinta: string
  /** Some com este texto do desenho: quem o mostra é o campo de edição. */
  editandoId?: string | null
  /** Chamado quando as caixas mudam de tamanho ou lugar. Só o editor usa. */
  onCaixas?: (caixas: CaixaDoElemento[]) => void
}

export function CamadaDeElementos({ elementos, tinta, editandoId, onCaixas }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const [medida, setMedida] = useState({ w: 0, h: 0 })

  // A conversão de fração para pixel precisa do tamanho real do container, e
  // ele muda: a prévia tem um tamanho, o celular do cliente tem outro, e girar
  // o aparelho muda de novo.
  useLayoutEffect(() => {
    const no = caixaRef.current
    if (!no) return
    const ler = () => setMedida({ w: no.clientWidth, h: no.clientHeight })
    ler()
    const observador = new ResizeObserver(ler)
    observador.observe(no)
    return () => observador.disconnect()
  }, [])

  // Só as famílias que este cartaz usa. Ver `garantirCssDestasFontes`.
  useEffect(() => {
    const fontes = elementos.filter((e) => e.tipo === 'texto' && e.texto.trim()).map((e) => e.fonte)
    if (fontes.length) void garantirCssDestasFontes(fontes)
  }, [elementos])

  // As caixas são medidas do DOM depois de pintar: aqui o elemento já É a
  // caixa, então não há uma segunda conta para sair de registro com a primeira
  // — que é o risco que existe no cartaz, onde o desenho e o alvo de clique
  // são calculados separadamente.
  useLayoutEffect(() => {
    if (!onCaixas) return
    const raiz = caixaRef.current
    if (!raiz) return
    const base = raiz.getBoundingClientRect()
    const caixas: CaixaDoElemento[] = []
    for (const el of elementos) {
      const no = raiz.querySelector<HTMLElement>(`[data-elemento="${el.id}"] > [data-medida]`)
      if (!no) continue
      const r = no.getBoundingClientRect()
      // `getBoundingClientRect` de um nó girado devolve a envolvente, que
      // cresce com o ângulo. A largura/altura vêm do layout (sem giro), e só a
      // POSIÇÃO vem do rect — é ela que já traz o centro certo.
      caixas.push({
        id: el.id,
        x: r.x - base.x + r.width / 2 - no.offsetWidth / 2,
        y: r.y - base.y + r.height / 2 - no.offsetHeight / 2,
        w: no.offsetWidth,
        h: no.offsetHeight,
        rotacao: el.rotacao ?? 0,
      })
    }
    onCaixas(caixas)
  }, [elementos, medida, editandoId, onCaixas])

  const escala = medida.w / BASE_CLIENTE

  return (
    <div ref={caixaRef} style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      {medida.w > 0 && elementos.map((el) => {
        const giro = el.rotacao ? `rotate(${el.rotacao}deg)` : ''
        const comum: React.CSSProperties = {
          position: 'absolute',
          left: `${el.x * 100}%`,
          top: `${el.y * 100}%`,
          transform: `translate(-50%, -50%) ${giro}`,
          opacity: el.opacidade ?? 1,
        }

        if (el.tipo === 'logo') {
          if (!el.url) return null
          const rec = el.recorte ?? { x: 0, y: 0, w: 1, h: 1 }
          const w = el.escala * medida.w
          const h = el.escalaY != null ? el.escalaY * medida.h : undefined
          return (
            <div key={el.id} data-elemento={el.id} style={comum}>
              {/* O recorte é a janela; a imagem dentro dela é maior e deslocada,
                  que é o equivalente em HTML do `drawImage` de nove argumentos
                  usado no cartaz. */}
              <div data-medida style={{ width: w, height: h ?? 'auto', overflow: 'hidden', position: 'relative', lineHeight: 0 }}>
                <img
                  src={el.url}
                  alt=""
                  style={{
                    display: 'block',
                    width: `${100 / rec.w}%`,
                    height: h != null ? `${100 / rec.h}%` : 'auto',
                    marginLeft: `${-(rec.x / rec.w) * 100}%`,
                    marginTop: h != null ? `${-(rec.y / rec.h) * 100}%` : 0,
                  }}
                />
              </div>
            </div>
          )
        }

        if (!el.texto.trim() || el.id === editandoId) {
          // Em edição o texto não é pintado aqui — o campo sobreposto o mostra.
          // A caixa continua existindo, e é ela que posiciona o campo.
          return (
            <div key={el.id} data-elemento={el.id} style={comum}>
              <div
                data-medida
                style={{
                  fontFamily: fonteCss(el.fonte),
                  fontSize: el.tamanho * escala,
                  fontWeight: el.negrito ? 700 : 400,
                  fontStyle: el.italico ? 'italic' : 'normal',
                  lineHeight: 1.2,
                  whiteSpace: 'pre',
                  visibility: 'hidden',
                }}
              >
                {el.texto || ' '}
              </div>
            </div>
          )
        }

        return (
          <div key={el.id} data-elemento={el.id} style={comum}>
            <div
              data-medida
              style={{
                fontFamily: fonteCss(el.fonte),
                fontSize: el.tamanho * escala,
                fontWeight: el.negrito ? 700 : 400,
                fontStyle: el.italico ? 'italic' : 'normal',
                color: el.cor ?? tinta,
                lineHeight: 1.2,
                // `pre` porque o Enter do dono é uma quebra de verdade, e as
                // linhas alinham pela esquerda — igual ao cartaz.
                whiteSpace: 'pre',
                textAlign: 'left',
                transform: (el.esticarX ?? 1) !== 1 || (el.esticarY ?? 1) !== 1
                  ? `scale(${el.esticarX ?? 1}, ${el.esticarY ?? 1})`
                  : undefined,
              }}
            >
              {el.texto}
            </div>
          </div>
        )
      })}
    </div>
  )
}
