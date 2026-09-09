import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { LandingView, type TextosDaPagina } from '@/components/LandingView'
import { lerElementos, lerEstiloDosTextos, type ElementoCartaz, type EstilosDosTextos } from '@/lib/cartaz-elementos'

interface LandingData {
  restauranteNome: string
  whatsapp: string | null
  garcomNome: string | null
  modo: string
  imagem: string | null
  estilo: string
  filtro: string
  mensagem: string | null
  elementos: ElementoCartaz[]
  textos: TextosDaPagina
  estilosDosTextos: EstilosDosTextos
}

export default function FeedbackLanding() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<LandingData | null>(null)
  const [erro, setErro] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    supabase.functions
      .invoke('qr-landing', { body: { slug } })
      .then(({ data, error }) => {
        if (error || (data as any)?.error || !data) setErro(true)
        else setData(data as LandingData)
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-2 bg-slate-50 text-center px-6">
        <p className="text-lg font-semibold text-slate-700">QR Code inválido</p>
        <p className="text-sm text-slate-500">Este código não está mais disponível.</p>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full">
      <LandingView
        restauranteNome={data.restauranteNome}
        garcomNome={data.garcomNome}
        modo={data.modo}
        imagem={data.imagem}
        estilo={data.estilo}
        filtro={data.filtro}
        mensagem={data.mensagem}
        whatsapp={data.whatsapp}
        elementos={lerElementos(data.elementos)}
        textos={data.textos ?? {}}
        estilosDosTextos={lerEstiloDosTextos(data.estilosDosTextos)}
      />
    </div>
  )
}
