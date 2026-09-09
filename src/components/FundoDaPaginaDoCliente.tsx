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
import { useState } from 'react'
import { Eye, Info, Loader2, Upload, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
 * Moldura de celular em volta da prévia.
 *
 * A página do cliente é vista SEMPRE num telefone, e num retângulo solto no
 * meio do monitor não dá pra julgar se a foto escolhida funciona — some a
 * noção de tamanho, e o que parece um plano bonito na tela grande vira uma
 * mancha marrom na mão de alguém.
 */
function Celular({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 260 }}>
      <div className="relative overflow-hidden rounded-[38px] border-[10px] border-gray-900 bg-gray-900 shadow-[0_22px_50px_-16px_rgba(16,24,40,0.55)]">
        <div className="relative overflow-hidden rounded-[28px] bg-white" style={{ height: 520 }}>
          {children}
          {/* Ilha da câmera, por cima do conteúdo como no aparelho */}
          <div className="pointer-events-none absolute left-1/2 top-2 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-gray-900" />
        </div>
      </div>
      {/* Barra de gesto */}
      <div className="mx-auto mt-2 h-[5px] w-[92px] rounded-full bg-gray-300" />
    </div>
  )
}

export function FundoDaPaginaDoCliente({
  valor, onChange, onEscolherFoto, enviando, salvando, onSalvar, onCancelar,
  restauranteNome, mensagem, whatsapp,
}: Props) {
  const [previa, setPrevia] = useState(false)
  const temFoto = valor.modo === 'upload' && !!valor.imagem

  return (
    <>
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
          <div className="grid gap-7 sm:grid-cols-2">
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

          {/* Ver antes de salvar é o ponto da tela: o dono escolhe uma foto que
              conhece de cor, e não tem como saber como ela fica com o texto por
              cima até olhar. */}
          <Button
            type="button"
            onClick={() => setPrevia(true)}
            className="h-11 w-full gap-2 bg-[#C2622C] text-[15px] font-semibold text-white hover:bg-[#A9531F] active:bg-[#8A431C]"
          >
            <Eye className="h-4 w-4" /> Visualizar Prévia do Cliente
          </Button>
        </CardContent>
      </Card>

      <Dialog open={previa} onOpenChange={setPrevia}>
        <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b bg-white px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold">
              Prévia: Página do Cliente (WhatsApp PWA)
            </DialogTitle>
          </DialogHeader>

          <div className="bg-[#FBF6EC] px-6 py-7">
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

          <DialogFooter className="gap-2 border-t bg-white px-5 py-4 sm:justify-end sm:space-x-0">
            <Button variant="neutro" size="forma" onClick={() => { setPrevia(false); onCancelar() }}>
              Cancelar
            </Button>
            <Button
              size="forma"
              disabled={salvando}
              onClick={() => { onSalvar(); setPrevia(false) }}
              className="gap-2 bg-[#C2622C] text-white hover:bg-[#A9531F] active:bg-[#8A431C]"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
