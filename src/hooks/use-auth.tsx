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
  /** 'sem_assinatura' | 'ativa' | 'inadimplente' | 'cancelada'.
      Só o servidor e admins da plataforma escrevem (trigger no banco). */
  assinatura_status: string | null
  /** Nulo = conta ativa. Preenchido = excluída (reversível pelo admin). */
  excluida_em: string | null
  configuracoes?: any
  avatar_url?: string | null
  username?: string | null
  perfil_notas?: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  usuario: UsuarioDados | null
  login: (email: string, password: string) => Promise<{ error: any }>
  cadastro: (nome: string, email: string, password: string) => Promise<{ error: any }>
  logout: () => Promise<{ error: any }>
  recuperarSenha: (email: string) => Promise<{ error: any }>
  /** Admin da plataforma (tabela `platform_admins`, casada por email).
      Diferente de `usuario.cargo === 'admin'`, que é papel DENTRO de um
      restaurante. Quem administra a plataforma não precisa de assinatura. */
  ehAdminPlataforma: boolean
  loading: boolean
  /** True enquanto o cadastro do restaurante está sendo buscado.
      Distingue "ainda carregando" de "carregou e não achou" — sem isso a tela
      de erro pisca no login, quando a sessão já existe mas o fetch não voltou. */
  buscandoUsuario: boolean
  /** Recarrega os dados do restaurante do banco (sem precisar de F5). */
  refetchUsuario: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  return context
}

// Os dados de PESSOA (nome, email, avatar, username, cargo, notas, configuracoes)
// agora moram na tabela `usuarios`, separada de `restaurantes`. Durante a
// transição as duas ficam sincronizadas por trigger, então mesclar
// `restaurantes` (dados do restaurante) com `usuarios` (dados da pessoa) é
// sempre consistente. `mesclarUsuario` prioriza os campos vindos de `usuarios`.
const CAMPOS_PESSOA = 'nome, email, avatar_url, username, cargo, perfil_notas, configuracoes'

function mesclarUsuario(rest: any, pessoa: any, authUser: User): UsuarioDados {
  return {
    ...rest,
    ...(pessoa || {}),          // campos de pessoa sobrescrevem, vindos de `usuarios`
    id: authUser.id,            // auth UUID — operações de auth
    restaurante_id: rest.id,    // bigint — queries de dados
    email: pessoa?.email ?? rest?.email ?? authUser.email ?? null,
  }
}

async function buscarPessoa(authId: string) {
  const { data } = await supabase.from('usuarios').select(CAMPOS_PESSOA).eq('id', authId).maybeSingle()
  return data
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<UsuarioDados | null>(null)
  const [loading, setLoading] = useState(true)
  const [buscandoUsuario, setBuscandoUsuario] = useState(false)
  const [ehAdminPlataforma, setEhAdminPlataforma] = useState(false)

  useEffect(() => {
    // Resolvido junto do usuário, e não num hook separado por componente.
    // Antes cada consumidor de `usePlatformAdmin` disparava a própria consulta,
    // e o gate de rota precisaria esperar um `loading` que corria por fora do
    // fluxo de auth — o que fazia o primeiro render decidir com `isAdmin=false`.
    const buscarAdminPlataforma = async (email: string | undefined) => {
      if (!email) {
        setEhAdminPlataforma(false)
        return
      }
      const { data, error } = await supabase
        .from('platform_admins')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        // Falha de consulta significa "não é admin", nunca acesso liberado.
        console.error('Erro ao verificar admin da plataforma:', error)
        setEhAdminPlataforma(false)
        return
      }
      setEhAdminPlataforma(!!data)
    }

    const fetchUsuario = async (userAuth: User) => {
      setBuscandoUsuario(true)
      try {
        await buscarAdminPlataforma(userAuth.email)
        const { data, error } = await supabase
          .from('restaurantes')
          .select('*')
          .eq('auth_user_id', userAuth.id)
          .single()

        if (data) {
          const pessoa = await buscarPessoa(userAuth.id)
          setUsuario(mesclarUsuario(data, pessoa, userAuth))
          return
        }

        // Sem restaurante — cria placeholder. Os campos de pessoa NÃO vão para
        // `restaurantes`; o trigger cria a linha em `usuarios`, e aqui só
        // garantimos o email da conta nela.
        if (error?.code === 'PGRST116') {
          const { data: novo } = await supabase
            .from('restaurantes')
            .insert({
              auth_user_id: userAuth.id,
              nome_restaurante: 'Meu Restaurante',
              onboarding_completo: false,
            })
            .select('*')
            .single()

          if (novo) {
            await supabase.from('usuarios').update({ email: userAuth.email || null }).eq('id', userAuth.id)
            const pessoa = await buscarPessoa(userAuth.id)
            setUsuario(mesclarUsuario(novo, pessoa, userAuth))
          } else {
            setUsuario(null)
          }
          return
        }

        console.error('Erro ao buscar restaurante:', error)
      } finally {
        setBuscandoUsuario(false)
        setLoading(false)
      }
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
        setEhAdminPlataforma(false)
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

    // Email já cadastrado nem sempre volta como erro: para não virar um oráculo
    // de enumeração, o Supabase pode responder "sucesso" com um usuário de
    // fachada e `identities` vazio. Sem tratar isso, o cadastro parecia dar
    // certo e a pessoa achava que tinha criado uma segunda conta.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: { code: 'email_ja_cadastrado', message: 'Email já cadastrado' } }
    }

    if (data.user) {
      const { data: novo, error: insertError } = await supabase
        .from('restaurantes')
        .insert({
          auth_user_id: data.user.id,
          nome_restaurante: 'Meu Restaurante',
          onboarding_completo: false,
        })
        .select('*')
        .single()

      if (insertError) {
        console.error('Erro ao criar restaurante:', insertError)
        return { error: insertError }
      }

      if (novo) {
        // A pessoa (nome/email) mora em `usuarios`. O trigger já criou a linha
        // ao inserir o restaurante; aqui preenchemos nome e email.
        await supabase.from('usuarios').update({ nome, email }).eq('id', data.user.id)
        const pessoa = await buscarPessoa(data.user.id)
        setUsuario(mesclarUsuario(novo, pessoa, data.user))
      }
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
    if (data) {
      const pessoa = await buscarPessoa(atual.id)
      setUsuario(mesclarUsuario(data, pessoa, atual))
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, usuario, ehAdminPlataforma, login, cadastro, logout, recuperarSenha, loading, buscandoUsuario, refetchUsuario }}
    >
      {children}
    </AuthContext.Provider>
  )
}
