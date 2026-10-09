import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabaseInfluencers } from '@/lib/supabase/cliente-influencers'
import { buscarMeuPerfil, sair as sairDaArea, type PerfilInfluencer } from './dados'

/*
 * Login da área /influencers — separado do EasyFeed normal (outro cliente do
 * Supabase, outra chave no navegador). Este contexto não usa o `useAuth` do
 * painel dos restaurantes.
 */

interface EstadoInfluencer {
  carregando: boolean
  sessao: Session | null
  /** A linha da pessoa na lista do admin; `null` com sessão = fora da lista. */
  perfil: PerfilInfluencer | null
  recarregarPerfil: () => Promise<void>
  sair: () => Promise<void>
  /** Por que a pessoa voltou para a entrada (ex.: e-mail fora da lista). */
  avisoEntrada: string | null
  limparAvisoEntrada: () => void
}

const Contexto = createContext<EstadoInfluencer | null>(null)
/** Exportado só para prévias e testes de tela, que montam o estado na mão. */
export const ContextoInfluencer = Contexto

export function ProvedorInfluencer({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<PerfilInfluencer | null>(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  // De qual e-mail é o `perfil` atual: até chegar o do e-mail logado, está carregando
  // (sem isto, a tela piscava "sem acesso" entre a sessão e o perfil chegarem).
  const [perfilDe, setPerfilDe] = useState<string | null>(null)
  const [avisoEntrada, setAvisoEntrada] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    supabaseInfluencers.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      setCarregandoSessao(false)
    })
    const { data: { subscription } } = supabaseInfluencers.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setCarregandoSessao(false)
    })
    return () => {
      vivo = false
      subscription.unsubscribe()
    }
  }, [])

  const email = sessao?.user.email ?? null
  const recarregarPerfil = useCallback(async () => {
    if (!email) {
      setPerfil(null)
      setPerfilDe(null)
      return
    }
    try {
      const p = await buscarMeuPerfil(email)
      if (!p) {
        // Logado aqui mas fora da lista (conta de restaurante, ou tirado pelo
        // admin): os logins não se misturam, então sai daqui na hora.
        setAvisoEntrada(`${email} não tem acesso ao EasyFeed Influencers. Se você é parceiro, fale com a nossa equipe.`)
        await sairDaArea()
        setSessao(null)
      }
      setPerfil(p)
    } catch {
      setPerfil(null)
    } finally {
      setPerfilDe(email)
    }
  }, [email])

  useEffect(() => { recarregarPerfil() }, [recarregarPerfil])

  const sair = useCallback(async () => {
    await sairDaArea()
    setSessao(null)
    setPerfil(null)
    setPerfilDe(null)
  }, [])

  return (
    <Contexto.Provider value={{ carregando: carregandoSessao || (!!email && perfilDe !== email), sessao, perfil, recarregarPerfil, sair, avisoEntrada, limparAvisoEntrada: () => setAvisoEntrada(null) }}>
      {children}
    </Contexto.Provider>
  )
}

export function useInfluencer(): EstadoInfluencer {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useInfluencer fora do ProvedorInfluencer')
  return ctx
}
