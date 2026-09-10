/**
 * Segundo passo: o fundo da página que o cliente abre ao ler o QR.
 *
 * É o irmão do primeiro (o tema do cartaz impresso) e mora numa tela separada
 * de propósito: são decisões diferentes. O cartaz é papel sob luz de
 * restaurante, escolhido pelo dono e visto de longe; esta é uma tela na mão de
 * alguém que acabou de comer, e o que importa nela é a foto puxar o
 * reconhecimento — "é aqui mesmo que eu estou".
 *
 * Até esta tela existir, os dois liam o MESMO campo no banco: trocar a madeira
 * do display mudava junto o que o cliente via no celular.
 */
import { Info, Loader2, Upload, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { QR_TEXTURAS, ehCorPersonalizada, fundoCss } from '@/lib/qr-temas'
import { SeletorCor } from '@/components/SeletorCor'
import { EditorDaPaginaDoCliente } from '@/components/EditorDaPaginaDoCliente'
import type { ElementoCartaz, EstilosDosTextos } from '@/lib/cartaz-elementos'
import type { TextosDaPagina } from '@/components/LandingView'

export interface FundoDoCliente {
  modo: 'upload' | 'estilo'
  imagem: string | null
  estilo: string
}

interface Props {
  valor: FundoDoCliente
  onChange: (v: FundoDoCliente) => void
  /** Recebe o arquivo escolhido; quem envia pro storage é a página. */
  onEscolherFoto: (arquivo: File) => void
  enviando?: boolean
  salvando?: boolean
  onSalvar: () => void
  onCancelar: () => void
  /** Para a prévia mostrar a página de verdade, e não um desenho dela. */
  restauranteNome: string
  mensagem: string | null
  whatsapp: string | null
  /** Os elementos livres da página do cliente e como subir imagem pra eles. */
  elementos: ElementoCartaz[]
  onElementosChange: (els: ElementoCartaz[]) => void
  onSubirImagem: (arquivo: File) => Promise<string | null>
  textos: TextosDaPagina
  onTextosChange: (t: TextosDaPagina) => void
  estilosDosTextos: EstilosDosTextos
  onEstilosChange: (e: EstilosDosTextos) => void
}

/** A tela do celular na prévia — ver o porquê das medidas no editor. */
export const ALTURA_TELA = 638
/**
 * A coluna é mais larga que o aparelho de propósito: a barra de propriedades
 * (fonte, corpo, negrito, itálico, cor, excluir) mora nela, e espremida na
 * largura de um celular ela quebrava em duas fileiras a cada seleção.
 */
export const LARGURA_COLUNA = 420

export function FundoDaPaginaDoCliente({
  valor, onChange, onEscolherFoto, enviando, salvando, onSalvar, onCancelar,
  restauranteNome, mensagem, whatsapp, elementos, onElementosChange, onSubirImagem,
  textos, onTextosChange, estilosDosTextos, onEstilosChange,
}: Props) {
  const temFoto = valor.modo === 'upload' && !!valor.imagem

  return (
    /* Mesma grade do passo A: os controles à esquerda e a prévia à direita,
       dimensionada pelo conteúdo. Trocar de passo não muda onde as coisas
       estão — o olho continua indo ao mesmo canto pra ver o resultado. */
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <Card className="border-gray-200">
        <CardHeader className="pb-5">
          <CardTitle className="text-[22px] leading-snug font-semibold tracking-tight">
            Fundo da Página do Cliente
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            É o que o cliente vê ao abrir o QR Code no celular.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Teto de largura nos controles: a coluna cresce até o que sobra da
              tela, e sem limite o quadro de subir foto virava um retângulo de
              meio metro e as amostras de textura ficavam maiores que a prévia
              que elas estão descrevendo. */}
          <div className="grid max-w-[600px] gap-7 sm:grid-cols-2">
            {/* ── A foto do lugar ── */}
            <div>
              {temFoto ? (
                <div className="relative w-[70.7%] overflow-hidden rounded-xl border-2 border-[#C2622C] bg-white shadow-sm">
                  <img src={valor.imagem!} alt="Foto do restaurante" className="block aspect-[4/3] w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onChange({ ...valor, imagem: null, modo: 'estilo' })}
                    title="Remover a foto"
                    aria-label="Remover a foto"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                /* Metade da área de antes, com a mesma proporção: a largura
                   cai por 1/raiz(2) (~70,7%), que é o que divide a área ao
                   meio sem achatar o quadro. */
                <label className="flex aspect-[4/3] w-[70.7%] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 text-center transition-colors hover:border-[#C2622C]/60 hover:bg-[#C2622C]/[0.03]">
                  {enviando ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[#C2622C]" />
                  ) : (
                    <Upload className="h-6 w-6 text-gray-400" />
                  )}
                  <span className="text-[12px] font-medium leading-snug text-gray-700">
                    + Subir Foto do Restaurante (PWA)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onEscolherFoto(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}

              <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                <Info className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                Use fotos reais do seu ambiente ou pratos para criar conexão.
              </p>

              {/* Cor livre, logo abaixo do subir foto: as três escolhas de
                  fundo ficam juntas — a foto, a cor e, ao lado, os materiais.
                  As oito texturas cobrem os materiais; isto cobre o resto, a
                  cor da marca do restaurante, que nenhuma lista de oito
                  adivinha. */}
              <div className="mt-4 flex items-center gap-2">
                <SeletorCor
                  compacto
                  valor={!temFoto && ehCorPersonalizada(valor.estilo) ? valor.estilo : null}
                  onChange={(hex) => onChange({ ...valor, modo: 'estilo', imagem: null, estilo: hex })}
                />
                <span className="text-[12px] text-muted-foreground">Ou uma cor sólida</span>
              </div>
            </div>

            {/* ── Ou um material neutro ── */}
            <div>
              <p className="mb-3 text-[13px] font-semibold text-gray-700">
                Texturas Neutras
              </p>
              {/* Quatro por linha: são oito materiais, então duas fileiras
                  cheias em vez de três com uma sobrando pela metade. */}
              <div className="grid grid-cols-4 gap-2">
                {QR_TEXTURAS.map((t) => {
                  const ativo = !temFoto && valor.estilo === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onChange({ ...valor, modo: 'estilo', estilo: t.id })}
                      aria-pressed={ativo}
                      title={t.nome}
                      className={cn(
                        'overflow-hidden rounded-lg border-2 bg-white transition-all',
                        ativo ? 'border-[#C2622C] shadow-sm' : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      <span className="relative block aspect-[4/5] w-full" style={{ background: fundoCss(t) }}>
                        {ativo && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#C2622C] shadow">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
              {temFoto && (
                <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                  A foto está valendo. Tire ela para voltar a usar um material.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-5">
            <Button variant="neutro" size="forma" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              size="forma"
              disabled={salvando}
              onClick={onSalvar}
              className="gap-2 bg-[#C2622C] text-white hover:bg-[#A9531F] active:bg-[#8A431C]"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Prévia: o celular do cliente, editável ───────── */}
      <EditorDaPaginaDoCliente
        elementos={elementos}
        onChange={onElementosChange}
        onSubirImagem={onSubirImagem}
        enviandoImagem={enviando}
        restauranteNome={restauranteNome}
        mensagem={mensagem}
        whatsapp={whatsapp}
        modo={valor.modo}
        imagem={valor.imagem}
        estilo={valor.estilo}
        largura={LARGURA_COLUNA}
        altura={ALTURA_TELA}
        textos={textos}
        onTextosChange={onTextosChange}
        estilosDosTextos={estilosDosTextos}
        onEstilosChange={onEstilosChange}
      />
    </div>
  )
}
