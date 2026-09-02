import { Bot, ArrowRight, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useToast } from '@/hooks/use-toast'

export function AiBanner() {
  const { usuario } = useAuth()
  const { mascote } = useRestauranteConfig()
  const { toast } = useToast()
  const [textoBanner, setTextoBanner] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const restauranteId = usuario?.restaurante_id ?? null
  const defaultText = `Continue coletando feedbacks para receber insights do ${mascote.nome}.`

  const carregarBanner = async () => {
    if (!restauranteId) return
    try {
      const { data: config } = await supabase
        .from('restaurantes')
        .select('texto_banner')
        .eq('id', restauranteId)
        .single()
      if (config?.texto_banner) setTextoBanner(config.texto_banner)
    } catch (error) {
      console.error('Erro ao carregar banner', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (restauranteId) {
      carregarBanner()
    } else {
      setLoading(false)
    }
  }, [restauranteId])

  const atualizarAgora = async () => {
    if (!restauranteId) {
      toast({ title: 'Restaurante não encontrado.', variant: 'destructive' })
      return
    }
    setRefreshing(true)
    try {
      const { data, error } = await supabase.functions.invoke('atualizar-banner', {
        body: { restaurante_id: restauranteId, force: true },
      })

      if (error) throw error

      let novoTexto = null
      if (data?.resultados && data.resultados.length > 0) {
        novoTexto = data.resultados[0].texto
      } else if (data?.texto) {
        novoTexto = data.texto
      }

      if (novoTexto) {
        setTextoBanner(novoTexto)
        toast({ title: 'Banner atualizado' })
      } else {
        toast({
          title: 'Sem alterações',
          description: data?.message || 'Não foi possível gerar resumo agora.',
        })
        carregarBanner()
      }
    } catch (error: any) {
      toast({ title: 'Falha ao atualizar: ' + error.message,
        variant: 'destructive',
      })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card className="border border-orange-100 shadow-sm bg-white overflow-hidden relative group">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-warning" />
      <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-warning border border-orange-100">
          <Bot className="h-6 w-6" />
        </div>
        <div className="flex-1 text-sm text-foreground leading-relaxed">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando resumo...
            </div>
          ) : (
            textoBanner || defaultText
          )}
        </div>
        <div className="flex items-center gap-3 mt-2 sm:mt-0 flex-shrink-0">
          <button
            onClick={atualizarAgora}
            disabled={refreshing || loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Atualizar agora"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('open-ai-chat'))}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
          >
            Conversar sobre isso <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
