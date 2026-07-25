import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export interface UsuarioDados {
  id: string             // UUID do auth.users — usado em operações de auth
  restaurante_id: number | null  // restaurantes.id (bigint) — usado em queries de dados
  email: string | null
  nome: string | null
  cargo: string | null
  onboarding_completo: boolean | null
  configuracoes?: any
  avatar_url?: string | null
  username?: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  usuario: UsuarioDados | null
  login: (email: string, password: string) => Promise<{ error: any }>
  cadastro: (nome: string, email: string, password: string) => Promise<{ error: any }>
  logout: () => Promise<{ error: any }>
  recuperarSenha: (email: string) => Promise<{ error: any }>
  loading: boolean
  /** Recarrega os dados do restaurante do banco (sem precisar de F5). */
  refetchUsuario: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  return context
}

function mapRestauranteToUsuario(row: any, authId: string): UsuarioDados {
  return {
    ...row,
    id: authId,           // auth UUID — mantido para operações de auth
    restaurante_id: row.id, // bigint — usado em queries de dados
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<UsuarioDados | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsuario = async (userAuth: User) => {
      const { data, error } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('auth_user_id', userAuth.id)
        .single()

      if (data) {
        setUsuario(mapRestauranteToUsuario(data, userAuth.id))
        setLoading(false)
        return
      }

      // Sem restaurante — cria placeholder (novo cadastro sem trigger)
      if (error?.code === 'PGRST116') {
        const { data: novo } = await supabase
          .from('restaurantes')
          .insert({
            auth_user_id: userAuth.id,
            email: userAuth.email || '',
            nome: null,
            nome_restaurante: 'Meu Restaurante',
            onboarding_completo: false,
          })
          .select('*')
          .single()

        setUsuario(novo ? mapRestauranteToUsuario(novo, userAuth.id) : null)
        setLoading(false)
        return
      }

      console.error('Erro ao buscar restaurante:', error)
      setLoading(false)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUsuario(session.user)
      } else {
        setUsuario(null)
        setLoading(false)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUsuario(session.user)
      } else {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const cadastro = async (nome: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    })

    if (error) return { error }

    if (data.user) {
      const { data: novo, error: insertError } = await supabase
        .from('restaurantes')
        .insert({
          auth_user_id: data.user.id,
          email,
          nome,
          nome_restaurante: 'Meu Restaurante',
          onboarding_completo: false,
        })
        .select('*')
        .single()

      if (insertError) {
        console.error('Erro ao criar restaurante:', insertError)
        return { error: insertError }
      }

      if (novo) setUsuario(mapRestauranteToUsuario(novo, data.user.id))
    }

    return { error: null }
  }

  const logout = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    setUsuario(null)
    setUser(null)
    setSession(null)
    setLoading(false)
    return { error }
  }

  const recuperarSenha = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar-senha`,
    })
    return { error }
  }

  // Rebusca o restaurante do usuário logado. O `usuario` era carregado só uma
  // vez (no login) e não atualizava ao navegar — só com F5. Chamado após salvar.
  const refetchUsuario = useCallback(async () => {
    const { data: { user: atual } } = await supabase.auth.getUser()
    if (!atual) return
    const { data } = await supabase
      .from('restaurantes')
      .select('*')
      .eq('auth_user_id', atual.id)
      .single()
    if (data) setUsuario(mapRestauranteToUsuario(data, atual.id))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, usuario, login, cadastro, logout, recuperarSenha, loading, refetchUsuario }}
    >
      {children}
    </AuthContext.Provider>
  )
}
