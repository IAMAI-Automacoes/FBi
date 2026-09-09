/**
 * Passo B: o fundo da página que o cliente abre ao ler o QR.
 *
 * É o irmão do passo A (o tema do cartaz impresso) e mora numa tela separada
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
import { QR_TEXTURAS, fundoCss } from '@/lib/qr-temas'
import { LandingView } from '@/components/LandingView'

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
}

/**
 * A tela do celular na prévia.
 *
 * A altura é a mesma da plaquinha do passo A (a chapa de acrílico, sem a base
 * de madeira): as duas prévias ficam do mesmo tamanho ao trocar de passo, e a
 * página não pula. A largura sai da PROPORÇÃO de um telefone atual (9:19.5) —
 * escolher uma largura à toa daria um aparelho gordo, e o enquadramento da
 * foto na prévia deixaria de valer pro celular de verdade.
 */
const ALTURA_TELA = 638
const LARGURA_TELA = Math.round(ALTURA_TELA * (9 / 19.5))
const BORDA = 10

function Celular({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width: LARGURA_TELA + BORDA * 2 }}>
      <div
        className="relative overflow-hidden bg-gray-900 shadow-[0_22px_50px_-16px_rgba(16,24,40,0.55)]"
        style={{ borderRadius: 40, padding: BORDA }}
      >
        <div className="relative overflow-hidden bg-white" style={{ height: ALTURA_TELA, borderRadius: 30 }}>
          {children}
          {/* Ilha da câmera, por cima do conteúdo como no aparelho */}
          <div className="pointer-events-none absolute left-1/2 top-2 h-[22px] w-[80px] -translate-x-1/2 rounded-full bg-gray-900" />
          {/* Barra de gesto */}
          <div className="pointer-events-none absolute bottom-[7px] left-1/2 h-[4px] w-[96px] -translate-x-1/2 rounded-full bg-white/70 mix-blend-difference" />
        </div>
      </div>
    </div>
  )
}

export function FundoDaPaginaDoCliente({
  valor, onChange, onEscolherFoto, enviando, salvando, onSalvar, onCancelar,
  restauranteNome, mensagem, whatsapp,
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
            B. Fundo da Página do Cliente (Visual no WhatsApp)
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            Esta imagem ou padrão aparecerá atrás do feedback no celular do cliente.
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
                <div className="relative overflow-hidden rounded-xl border-2 border-[#C2622C] bg-white shadow-sm">
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
                <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 text-center transition-colors hover:border-[#C2622C]/60 hover:bg-[#C2622C]/[0.03]">
                  {enviando ? (
                    <Loader2 className="h-7 w-7 animate-spin text-[#C2622C]" />
                  ) : (
                    <Upload className="h-7 w-7 text-gray-400" />
                  )}
                  <span className="text-[13px] font-medium leading-snug text-gray-700">
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
            </div>

            {/* ── Ou um material neutro ── */}
            <div>
              <p className="mb-3 text-[13px] font-semibold text-gray-700">
                Texturas Neutras / Padrões Simples
              </p>
              <div className="grid grid-cols-3 gap-2">
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

      {/* ───────── Prévia: o celular do cliente ───────── */}
      <div className="flex w-[380px] max-w-full flex-col">
        <div className="mb-2 flex min-h-[50px] items-center">
          <div>
            <p className="text-[13px] font-semibold text-gray-700">Página do cliente</p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              É isto que abre no celular de quem escaneia o QR.
            </p>
          </div>
        </div>

        {/* A mesma bancada do passo A, pelo mesmo motivo: dá ao aparelho um
            chão em vez de deixá-lo flutuando no branco da página. */}
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-5">
          <Celular>
            {/* A página DE VERDADE, o mesmo componente que o cliente abre —
                não um desenho parecido. Uma prévia que não bate com o que
                chega no celular é pior do que não ter prévia. */}
            <LandingView
              preview
              restauranteNome={restauranteNome}
              modo={valor.modo}
              imagem={valor.imagem}
              estilo={valor.estilo}
              mensagem={mensagem}
              whatsapp={whatsapp}
            />
          </Celular>
        </div>

        {!whatsapp && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900">
            O WhatsApp do restaurante ainda não está conectado. Sem ele o botão não
            tem para onde levar, e o cliente abre a página sem conseguir mandar nada.
          </p>
        )}
      </div>
    </div>
  )
}
