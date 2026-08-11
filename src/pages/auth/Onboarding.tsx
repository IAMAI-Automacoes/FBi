import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Store,
  MessageSquare,
  MessageCircle,
  Bot,
  Check,
  LogOut,
  Upload,
  X,
  ImagePlus,
} from 'lucide-react'
import { getIniciais } from '@/lib/iniciais'
import { WhatsAppTab } from '@/pages/settings/WhatsAppTab'

interface OnboardingData {
  restaurante_nome: string
  restaurante_culinaria: string
  restaurante_mesas: string
  como_coleta_feedbacks: string
  frequencia_relatorios: string
  ia_nome: string
  ia_tom: string
  ia_focos: string[]
}

export default function Onboarding() {
  const { usuario, logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [whatsappConectado, setWhatsappConectado] = useState(false)
  const [loadingSubmit, setLoadingSubmit] = useState(false)
  // Passo 5 conclui sozinho se a pessoa não clicar nem voltar (o botão "preenche").
  const [autoProgresso, setAutoProgresso] = useState(0)
  // Logo: sobe pro Storage assim que é escolhida e já mostra o preview.
  // `logoUrl` é a URL pública salva; `logoPreview` é o objectURL local que
  // aparece na hora enquanto a imagem definitiva ainda carrega do Storage.
  const [logoUrl, setLogoUrl] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<OnboardingData>({
    restaurante_nome: '',
    restaurante_culinaria: '',
    restaurante_mesas: '',
    como_coleta_feedbacks: '',
    frequencia_relatorios: '',
    ia_nome: 'Chef Pepê',
    ia_tom: '',
    ia_focos: [],
  })

  useEffect(() => {
    if (usuario?.onboarding_completo) {
      navigate('/', { replace: true })
    }
  }, [usuario, navigate])

  // Pré-carregar nome e logo do restaurante se já existirem
  useEffect(() => {
    if (!usuario?.restaurante_id) return
    supabase
      .from('restaurantes')
      .select('nome_restaurante, logo_url')
      .eq('id', usuario.restaurante_id)
      .single()
      .then(({ data: rest }) => {
        if (rest?.nome_restaurante && rest.nome_restaurante !== 'Meu Restaurante') {
          setData((prev) => ({ ...prev, restaurante_nome: rest.nome_restaurante }))
        }
        if (rest?.logo_url) setLogoUrl(rest.logo_url)
      })
  }, [usuario?.restaurante_id])

  const logoMostrada = logoPreview || logoUrl

  const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !usuario?.restaurante_id) return

    const objetoUrl = URL.createObjectURL(file)
    setLogoPreview(objetoUrl) // aparece na hora
    setEnviandoLogo(true)

    try {
      const ext = file.name.split('.').pop()
      const caminho = `logo-${usuario.restaurante_id}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('logos').upload(caminho, file, { upsert: true })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(caminho)
      setLogoUrl(publicUrl)

      // Só troca o preview local pela URL pública depois que ela carrega,
      // pra imagem não "piscar" some/aparece.
      const img = new Image()
      img.onload = () => {
        setLogoPreview(null)
        URL.revokeObjectURL(objetoUrl)
      }
      img.onerror = () => setLogoPreview(null)
      img.src = publicUrl
    } catch (err: any) {
      setLogoPreview(null)
      URL.revokeObjectURL(objetoUrl)
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' })
    } finally {
      setEnviandoLogo(false)
    }
  }

  const handleRemoveLogo = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLogoPreview(null)
    setLogoUrl('')
  }

  // Cada passo exige seus campos preenchidos; o passo 4 exige o WhatsApp conectado.
  const validarStep = (s: number): string | null => {
    if (s === 1) {
      if (!data.restaurante_nome.trim()) return 'Informe o nome do restaurante.'
      if (!data.restaurante_culinaria) return 'Selecione o tipo de culinária.'
      if (!data.restaurante_mesas.trim()) return 'Informe o número de mesas.'
    }
    if (s === 2) {
      if (!data.como_coleta_feedbacks.trim()) return 'Conte como você coleta feedbacks hoje.'
      if (!data.frequencia_relatorios) return 'Selecione a frequência de relatórios.'
    }
    if (s === 3) {
      if (!data.ia_nome.trim()) return 'Dê um nome ao assistente de IA.'
      if (!data.ia_tom) return 'Selecione o tom de comunicação.'
      if (data.ia_focos.length === 0) return 'Selecione ao menos uma área de foco.'
    }
    if (s === 4 && !whatsappConectado) return 'Conecte o WhatsApp para continuar.'
    return null
  }

  const handleNext = () => {
    const erro = validarStep(step)
    if (erro) {
      toast({ title: 'Faltou preencher', description: erro, variant: 'destructive' })
      return
    }
    setStep((s) => s + 1)
  }

  const handlePrev = () => {
    setStep((s) => s - 1)
  }

  const handleComplete = async () => {
    if (!usuario?.restaurante_id) return
    // Garante que nenhum passo ficou incompleto (inclui WhatsApp conectado).
    for (const s of [1, 2, 3, 4]) {
      const erro = validarStep(s)
      if (erro) {
        toast({ title: 'Faltou preencher', description: erro, variant: 'destructive' })
        setStep(s)
        return
      }
    }
    setLoadingSubmit(true)

    try {
      const mascoteConfig = {
        nome: data.ia_nome || 'Chef Pepê',
        personalidade: data.ia_tom || 'direto_objetivo',
        ...(data.ia_focos.length > 0 && { focos: data.ia_focos }),
      }

      const { error } = await supabase
        .from('restaurantes')
        .update({
          nome_restaurante: data.restaurante_nome,
          tipo_culinaria: data.restaurante_culinaria || null,
          numero_mesas: data.restaurante_mesas ? parseInt(data.restaurante_mesas, 10) : null,
          metodo_coleta_feedback: data.como_coleta_feedbacks || null,
          frequencia_relatorios: data.frequencia_relatorios || null,
          logo_url: logoUrl || null,
          mascote_config: mascoteConfig,
          onboarding_completo: true,
        } as any)
        .eq('id', usuario.restaurante_id)

      if (error) throw error

      toast({ title: 'Tudo pronto!', description: 'Seu ambiente foi configurado com sucesso.' })
      window.location.href = '/'
    } catch (error: any) {
      console.error('Erro ao salvar onboarding:', error)
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível salvar as configurações. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoadingSubmit(false)
    }
  }

  // Auto-finalizar no passo 5: o botão vai "preenchendo" e conclui sozinho se a
  // pessoa não clicar nem voltar — evita conta parada no onboarding. Voltar
  // (sair do passo 5) cancela e rearma; se a conclusão falhar, não fica em loop.
  const handleCompleteRef = useRef(handleComplete)
  handleCompleteRef.current = handleComplete
  const jaAutoFinalizou = useRef(false)
  const AUTO_FINALIZAR_MS = 6000

  useEffect(() => {
    if (step !== 5 || loadingSubmit || jaAutoFinalizou.current) {
      if (step !== 5) {
        setAutoProgresso(0)
        jaAutoFinalizou.current = false
      }
      return
    }
    const inicio = Date.now()
    const iv = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - inicio) / AUTO_FINALIZAR_MS) * 100)
      setAutoProgresso(pct)
      if (pct >= 100) {
        clearInterval(iv)
        jaAutoFinalizou.current = true
        handleCompleteRef.current()
      }
    }, 50)
    return () => clearInterval(iv)
  }, [step, loadingSubmit])

  const progress = (step / 5) * 100

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl mb-8 flex justify-between items-center">
        <div>
          {/* Fecha o ciclo Conta → Pagamento → Acesso sem trazer a trilha para
              cá: esta tela já tem a própria barra de 4 passos, e dois medidores
              empilhados obrigariam a ler "passo 2 de 4 dentro da etapa 3 de 3". */}
          <p className="text-sm text-gray-500">
            Pagamento confirmado · configurando seu acesso
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout()} className="text-gray-500">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>

      <Card className="w-full max-w-xl shadow-lg border-0 ring-1 ring-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">Passo {step} de 5</span>
            <span className="text-sm font-medium text-[#1D4ED8]">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2 mb-6" />

          <CardTitle className="text-2xl font-bold text-gray-900 mt-2 flex items-center gap-2">
            {step === 1 && (
              <>
                <Store className="h-6 w-6 text-[#1D4ED8]" /> Perfil do Restaurante
              </>
            )}
            {step === 2 && (
              <>
                <MessageSquare className="h-6 w-6 text-[#1D4ED8]" /> Configuração de Feedbacks
              </>
            )}
            {step === 3 && (
              <>
                <Bot className="h-6 w-6 text-[#1D4ED8]" /> Personalização da IA
              </>
            )}
            {step === 4 && (
              <>
                <MessageCircle className="h-6 w-6 text-[#1D4ED8]" /> Conectar WhatsApp
              </>
            )}
            {step === 5 && (
              <>
                <CheckCircle className="h-6 w-6 text-[#1D4ED8]" /> Confirmação
              </>
            )}
          </CardTitle>
          <CardDescription className="text-base">
            {step === 1 && 'Conte-nos um pouco sobre o seu estabelecimento.'}
            {step === 2 && 'Como você costuma ouvir seus clientes hoje?'}
            {step === 3 && 'Vamos dar uma personalidade ao seu assistente.'}
            {step === 4 && 'Conecte o WhatsApp que vai receber e responder os feedbacks dos clientes.'}
            {step === 5 && 'Revise as informações antes de começarmos.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="py-6">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-gray-700">
                  Nome do restaurante <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  value={data.restaurante_nome}
                  onChange={(e) => setData({ ...data, restaurante_nome: e.target.value })}
                  placeholder="Ex: Cantina do Chef"
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="culinaria" className="text-gray-700">
                  Tipo de culinária
                </Label>
                <Select
                  value={data.restaurante_culinaria}
                  onValueChange={(v) => setData({ ...data, restaurante_culinaria: v })}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      'Brasileira',
                      'Italiana',
                      'Japonesa',
                      'Fast Food',
                      'Pizzaria',
                      'Churrascaria',
                      'Outro',
                    ].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mesas" className="text-gray-700">
                  Número de mesas
                </Label>
                <Input
                  id="mesas"
                  type="number"
                  value={data.restaurante_mesas}
                  onChange={(e) => setData({ ...data, restaurante_mesas: e.target.value })}
                  placeholder="Ex: 20"
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">Foto/Logo do restaurante</Label>
                <div className="flex items-center gap-4">
                  <div
                    className="group relative flex items-center justify-center w-20 h-20 border border-gray-200 rounded-xl bg-gray-50 overflow-hidden cursor-pointer hover:border-[#1D4ED8]/50 transition-all shrink-0"
                    onClick={() => !enviandoLogo && fileInputRef.current?.click()}
                  >
                    {logoMostrada ? (
                      <img
                        src={logoMostrada}
                        alt="Logo do restaurante"
                        className="w-full h-full object-contain p-1.5 bg-white"
                      />
                    ) : data.restaurante_nome.trim() ? (
                      <span className="text-2xl font-bold text-[#1D4ED8]">
                        {getIniciais(data.restaurante_nome, 2)}
                      </span>
                    ) : (
                      <ImagePlus className="h-6 w-6 text-gray-400" />
                    )}

                    {!enviandoLogo && logoMostrada && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        title="Remover imagem"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/95 text-red-600 flex items-center justify-center shadow-sm hover:bg-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {enviandoLogo && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={enviandoLogo}
                      onClick={() => !enviandoLogo && fileInputRef.current?.click()}
                      className="bg-white"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {logoMostrada ? 'Trocar imagem' : 'Enviar imagem'}
                    </Button>
                    <p className="text-xs text-gray-500 mt-1.5">
                      Opcional · PNG, JPG ou WEBP
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif, image/webp"
                  onChange={handleUploadLogo}
                  disabled={enviandoLogo}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <Label htmlFor="como_coleta" className="text-base text-gray-800 font-medium">
                  Como você coleta feedbacks hoje?
                </Label>
                <Textarea
                  id="como_coleta"
                  value={data.como_coleta_feedbacks}
                  onChange={(e) => setData({ ...data, como_coleta_feedbacks: e.target.value })}
                  placeholder="Conte-nos um pouco sobre como ocorre a coleta de feedbacks no restaurante atualmente..."
                  className="bg-white min-h-[120px] resize-none"
                />
                <p className="text-xs text-gray-500">Opcional</p>
              </div>
              <div className="space-y-2 pt-2">
                <Label htmlFor="frequencia" className="text-base text-gray-800 font-medium">
                  Frequência desejada de relatórios
                </Label>
                <Select
                  value={data.frequencia_relatorios}
                  onValueChange={(v) => setData({ ...data, frequencia_relatorios: v })}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione a frequência..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diário">Diário</SelectItem>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <Label htmlFor="ia_nome" className="text-gray-700">
                  Nome do assistente IA
                </Label>
                <Input
                  id="ia_nome"
                  value={data.ia_nome}
                  onChange={(e) => setData({ ...data, ia_nome: e.target.value })}
                  className="bg-white"
                />
                <p className="text-xs text-gray-500">
                  Como você quer chamar a inteligência artificial?
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ia_tom" className="text-gray-700">
                  Tom de comunicação
                </Label>
                <Select value={data.ia_tom} onValueChange={(v) => setData({ ...data, ia_tom: v })}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione o tom..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal_profissional">Formal</SelectItem>
                    <SelectItem value="direto_objetivo">Casual</SelectItem>
                    <SelectItem value="motivador_positivo">Amigável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 pt-2">
                <Label className="text-base text-gray-800 font-medium">
                  Áreas de foco principais
                </Label>
                <div className="flex flex-wrap gap-2">
                  {['Atendimento', 'Comida', 'Ambiente', 'Preço', 'Agilidade'].map((foco) => (
                    <div key={foco} className="flex items-center space-x-2">
                      <Checkbox
                        id={`foco-${foco}`}
                        className="peer sr-only"
                        checked={data.ia_focos.includes(foco)}
                        onCheckedChange={(checked) => {
                          if (checked) setData({ ...data, ia_focos: [...data.ia_focos, foco] })
                          else
                            setData({ ...data, ia_focos: data.ia_focos.filter((c) => c !== foco) })
                        }}
                      />
                      <Label
                        htmlFor={`foco-${foco}`}
                        className={`px-4 py-2 rounded-full border text-sm cursor-pointer transition-colors ${
                          data.ia_focos.includes(foco)
                            ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {foco}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <WhatsAppTab
                restauranteId={usuario?.restaurante_id ?? null}
                embedded
                onConnectedChange={setWhatsappConectado}
              />
              <p className="text-xs text-gray-500 mt-4 text-center">
                Conecte o WhatsApp para concluir o onboarding — é por ele que os feedbacks chegam.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 space-y-5">
                <div className="flex gap-3">
                  <Store className="h-5 w-5 text-[#1D4ED8] shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900">{data.restaurante_nome}</h4>
                    <p className="text-gray-600 text-sm mt-1">
                      {data.restaurante_culinaria || 'Culinária não informada'}
                      {data.restaurante_mesas ? ` • ${data.restaurante_mesas} mesas` : ''}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-200" />

                <div className="flex gap-3">
                  <MessageSquare className="h-5 w-5 text-[#1D4ED8] shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Coleta de Feedbacks</h4>
                    <p className="text-gray-600 text-sm mt-1">
                      <span className="font-medium">Método atual:</span>{' '}
                      {data.como_coleta_feedbacks || 'Não informado'}
                    </p>
                    <p className="text-gray-600 text-sm">
                      <span className="font-medium">Relatórios:</span>{' '}
                      {data.frequencia_relatorios || 'Não informado'}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-200" />

                <div className="flex gap-3">
                  <Bot className="h-5 w-5 text-[#1D4ED8] shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Assistente: {data.ia_nome}</h4>
                    <p className="text-gray-600 text-sm mt-1">
                      <span className="font-medium">Tom:</span> {data.ia_tom || 'Não informado'}
                    </p>
                    <p className="text-gray-600 text-sm">
                      <span className="font-medium">Foco em:</span>{' '}
                      {data.ia_focos.length > 0 ? data.ia_focos.join(', ') : 'Nenhum selecionado'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        {step === 5 && !loadingSubmit && (
          <p className="px-6 text-center text-xs text-gray-500">
            Concluindo sozinho em instantes — clique em{' '}
            <span className="font-semibold">Começar a usar</span> para finalizar agora, ou em{' '}
            <span className="font-semibold">Anterior</span> para ajustar.
          </p>
        )}

        <CardFooter className="flex justify-between border-t border-gray-100 bg-gray-50/50 py-4 px-6 rounded-b-xl">
          {step > 1 ? (
            <Button variant="outline" onClick={handlePrev} className="bg-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <Button onClick={handleNext} className="bg-[#1D4ED8] hover:bg-blue-700 text-white">
              Próximo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => {
                jaAutoFinalizou.current = true
                handleComplete()
              }}
              disabled={loadingSubmit}
              className="relative overflow-hidden bg-[#1D4ED8] hover:bg-blue-700 text-white"
            >
              {/* Preenchimento do auto-finalizar (fica atrás do texto). */}
              {!loadingSubmit && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-white/25"
                  style={{ width: `${autoProgresso}%` }}
                />
              )}
              <span className="relative z-10 inline-flex items-center">
                {loadingSubmit ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Começar a usar
                  </>
                )}
              </span>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
