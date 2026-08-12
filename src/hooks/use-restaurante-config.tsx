import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { carregarPromptsEditaveis } from '@/lib/ia/prompt-store'
import { carregarParamsAgentes } from '@/lib/ia/params'

export interface MascoteConfig {
  nome: string
  personalidade: string
  fotoUrl: string | null
}

export interface RestauranteConfig {
  nomeRestaurante: string
  logoUrl: string | null
  mascote: MascoteConfig
  configInsights: any
  loading: boolean
  refetch: () => Promise<void>
}

const MASCOTE_PADRAO: MascoteConfig = {
  nome: 'Chef Pepê',
  personalidade: 'direto_objetivo',
  fotoUrl: null,
}

const RestauranteConfigContext = createContext<RestauranteConfig | undefined>(undefined)

export const useRestauranteConfig = () => {
  const context = useContext(RestauranteConfigContext)
  if (!context)
    throw new Error('useRestauranteConfig deve ser usado dentro de um RestauranteConfigProvider')
  return context
}

export const RestauranteConfigProvider = ({ children }: { children: ReactNode }) => {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null

  const [nomeRestaurante, setNomeRestaurante] = useState('Meu Restaurante')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [mascote, setMascote] = useState<MascoteConfig>(MASCOTE_PADRAO)
  const [configInsights, setConfigInsights] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!restauranteId) {
      // Sem restaurante vinculado: mantém os padrões
      setNomeRestaurante('Meu Restaurante')
      setLogoUrl(null)
      setMascote(MASCOTE_PADRAO)
      setConfigInsights({})
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('restaurantes')
        .select('nome_restaurante, logo_url, mascote_config, config_insights')
        .eq('id', restauranteId)
        .single()

      if (error) throw error

      if (data) {
        setNomeRestaurante(data.nome_restaurante || 'Meu Restaurante')
        setLogoUrl((data as any).logo_url || null)
        const mc = (data.mascote_config as any) || {}
        setMascote({
          nome: mc.nome || MASCOTE_PADRAO.nome,
          personalidade: mc.personalidade || MASCOTE_PADRAO.personalidade,
          fotoUrl: mc.foto_url || null,
        })
        setConfigInsights((data.config_insights as any) || {})
      }
    } catch {
      // Mantém os padrões em caso de falha
    } finally {
      setLoading(false)
    }
  }, [restauranteId])

  useEffect(() => {
    if (usuario === undefined) return // auth ainda carregando
    fetchConfig()
    // Carrega as sobrescritas do painel de admin (texto dos prompts e
    // parâmetros de inferência) para os agentes usarem em runtime.
    void carregarPromptsEditaveis()
    void carregarParamsAgentes()
  }, [usuario, fetchConfig])

  return (
    <RestauranteConfigContext.Provider
      value={{ nomeRestaurante, logoUrl, mascote, configInsights, loading, refetch: fetchConfig }}
    >
      {children}
    </RestauranteConfigContext.Provider>
  )
}
