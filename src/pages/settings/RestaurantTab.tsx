import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { getIniciais } from '@/lib/iniciais'
import { Upload, Store, Loader2, X } from 'lucide-react'
import { ImageCropper } from '@/components/ImageCropper'

export interface RestauranteForm {
  nome_restaurante: string
  logo_url: string
}

export function RestaurantTab({
  restauranteId,
  value,
  onChange,
  onUploadingChange,
}: {
  restauranteId: number | null
  value: RestauranteForm
  onChange: (v: RestauranteForm) => void
  onUploadingChange?: (v: boolean) => void
}) {
  const { toast } = useToast()
  const [enviando, setEnviando] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const logoMostrada = preview || value.logo_url

  /** Só escolhe o arquivo — o upload de verdade só acontece depois do
   *  recorte, em `handleConfirmCrop`. */
  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) setCropFile(file)
  }

  const handleConfirmCrop = async (blob: Blob) => {
    if (!restauranteId) return
    setCropFile(null)

    const objetoUrl = URL.createObjectURL(blob)
    setPreview(objetoUrl) // aparece na hora
    setEnviando(true)
    onUploadingChange?.(true)

    try {
      const caminho = `logo-${restauranteId}-${Date.now()}.jpg`
      const { error } = await supabase.storage
        .from('logos')
        .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(caminho)
      onChange({ ...value, logo_url: publicUrl })

      const img = new Image()
      img.onload = () => {
        setPreview(null)
        URL.revokeObjectURL(objetoUrl)
      }
      img.onerror = () => setPreview(null)
      img.src = publicUrl
    } catch (err: any) {
      setPreview(null)
      URL.revokeObjectURL(objetoUrl)
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' })
    } finally {
      setEnviando(false)
      onUploadingChange?.(false)
    }
  }

  const handleRemoveLogo = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview(null)
    onChange({ ...value, logo_url: '' })
  }

  return (
    <Card className="shadow-subtle border-gray-200/75 rounded-xl overflow-hidden">
      <CardHeader className="bg-white pb-6 border-b border-gray-300">
        <CardTitle className="text-xl">Perfil do Restaurante</CardTitle>
        <CardDescription className="text-sm mt-1">
          Gerencie a identidade visual e as informações principais do seu restaurante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-10 p-6 sm:p-8 bg-white">
        <section className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Store className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-gray-900">Identidade da Marca</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-8 items-start">
            <div className="space-y-3 shrink-0">
              <Label className="text-gray-700">Logotipo</Label>
              <div
                className="group relative flex items-center justify-center w-36 h-36 border border-gray-200 rounded-xl bg-gray-50 overflow-hidden cursor-pointer hover:border-primary/50 transition-all duration-200"
                onClick={() => !enviando && fileInputRef.current?.click()}
              >
                {logoMostrada ? (
                  <img
                    src={logoMostrada}
                    alt="Logo do Restaurante"
                    className="w-full h-full object-contain p-2 bg-white"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary/10">
                    <span className="text-3xl font-bold text-primary">
                      {getIniciais(value.nome_restaurante, 2)}
                    </span>
                  </div>
                )}

                {!enviando && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                    <Upload className="w-5 h-5 text-white mb-1.5" />
                    <span className="text-[11px] text-white font-medium tracking-wide">
                      Trocar logo
                    </span>
                    {logoMostrada && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        title="Remover logo"
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 text-red-600 flex items-center justify-center hover:bg-white hover:scale-105 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {enviando && (
                  <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif, image/webp"
                  onChange={handlePickFile}
                  disabled={enviando}
                />
              </div>
            </div>

            <div className="flex-1 space-y-5 w-full">
              <div className="space-y-2">
                <Label htmlFor="nome_restaurante" className="text-gray-700">
                  Nome do Restaurante
                </Label>
                <Input
                  id="nome_restaurante"
                  value={value.nome_restaurante}
                  onChange={(e) => onChange({ ...value, nome_restaurante: e.target.value })}
                  placeholder="Nome público do seu restaurante"
                  className="max-w-md"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Os dados do negócio (cozinha, mesas, público, diferenciais…) ficam na seção
                <b> Sobre o restaurante</b>.
              </p>
            </div>
          </div>
        </section>
      </CardContent>

      {cropFile && (
        <ImageCropper
          file={cropFile}
          salvando={enviando}
          onConfirm={handleConfirmCrop}
          onCancel={() => setCropFile(null)}
          outputWidth={800}
          outputHeight={800}
          title="Ajuste o logotipo"
          instructions="Arraste ou dê zoom para ajustar o logotipo."
        />
      )}
    </Card>
  )
}
