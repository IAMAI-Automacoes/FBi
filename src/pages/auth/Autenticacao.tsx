import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
// Alias explícito: o nome cru colidia com o setter do useState e a chamada
// silenciosamente virava um no-op — o "Lembrar-me" nunca era gravado.
import { setRememberMe as gravarLembrarMe } from '@/lib/supabase/auth-storage'
import { destinoPosAuth } from '@/lib/auth-destino'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
import { ehRotaDeCompra } from '@/components/compra/etapas'
import { ArrowLeft, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import {
  AuthLayout,
  BrandMark,
  WhatsAppIcon,
  authInputStyle,
  authInputFocus,
  authInputBlur,
} from '@/components/auth/AuthLayout'

export type ModoAuth = 'entrar' | 'criar'

/* Tela única de autenticação, usada por /login e /cadastro.
   Antes eram duas páginas com visuais diferentes (uma no AuthLayout, outra em
   card shadcn cinza) e lógicas espelhadas. Aqui o formulário é um só e o modo
   decide quais campos aparecem — `login()` e `cadastro()` do use-auth seguem
   intocados. */
/** Mensagem e email repassados quando o cadastro descobre que a conta já existe
    e manda a pessoa para o login. */
interface EstadoAuth {
  avisoAuth?: string
  emailPreenchido?: string
}

export default function Autenticacao({ modoInicial }: { modoInicial: ModoAuth }) {
  const location = useLocation()
  const estado = location.state as EstadoAuth | null

  const [modo, setModo] = useState<ModoAuth>(modoInicial)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState(estado?.emailPreenchido ?? '')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrarMe, setLembrarMe] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(estado?.avisoAuth ?? null)

  const { login, cadastro } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const criando = modo === 'criar'

  // As rotas /login e /cadastro montam ESTE mesmo componente. Os `key` em
  // App.tsx forçam a remontagem ao trocar de rota, mas depender só disso é
  // frágil: se a remontagem não acontecer, `modo`, `aviso` e `email` ficam
  // congelados nos valores iniciais e a navegação não muda nada na tela — foi
  // assim que o aviso de email já cadastrado sumiu sem deixar rastro.
  // Estes dois efeitos sincronizam de qualquer jeito.
  useEffect(() => {
    setModo(modoInicial)
  }, [modoInicial])

  useEffect(() => {
    const atual = location.state as EstadoAuth | null
    if (atual?.avisoAuth) setAviso(atual.avisoAuth)
    if (atual?.emailPreenchido) setEmail(atual.emailPreenchido)
  }, [location.key, location.state])

  // Esta tela não sabe nada sobre planos — só autentica e devolve a pessoa para
  // onde ela ia. Quem exibe e confirma o plano é o /checkout, logo adiante.
  const destino = destinoPosAuth(location.state, criando ? '/onboarding' : '/')

  // Booleano, não dado: só interessa se veio comprando, nunca qual plano.
  // `ehRotaDeCompra` corta a query string antes de consultar o mapa — o destino
  // chega como `/checkout?ciclo=anual`. Também cobre quem cai aqui indo para
  // `/assinatura`, caso que o `startsWith('/checkout')` anterior deixava passar.
  const vindoDaCompra = ehRotaDeCompra(destino)

  const trocarModo = (novo: ModoAuth) => {
    setModo(novo)
    setAviso(null)
  }

  // "Criar conta" no /login não alterna mais o formulário na mesma tela: leva
  // para a criação de conta DENTRO do fluxo de compra (Conta → Pagamento →
  // Acesso). Assim quem se cadastra por aqui passa pelo pagamento e só então
  // pelo onboarding — nunca entra no software sem assinar. Preserva um destino
  // de compra que já estivesse em andamento e o email já digitado.
  const irCriarConta = () => {
    const fromExistente = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
    navigate('/cadastro', {
      state: {
        from: fromExistente ?? { pathname: '/assinatura' },
        emailPreenchido: email || undefined,
      },
    })
  }

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setAviso(null)

    if (criando) {
      if (senha !== confirmarSenha) {
        toast({
          title: 'Senhas não conferem',
          description: 'A senha e a confirmação devem ser iguais.',
          variant: 'destructive',
        })
        return
      }
      if (senha.length < 6) {
        toast({
          title: 'Senha muito curta',
          description: 'Use pelo menos 6 caracteres.',
          variant: 'destructive',
        })
        return
      }
    }

    // Precisa valer antes de autenticar: decide se a sessão vai para
    // localStorage ou sessionStorage.
    gravarLembrarMe(criando ? true : lembrarMe)

    setCarregando(true)
    const { error } = criando
      ? await cadastro(nome, email, senha)
      : await login(email, senha)
    setCarregando(false)

    if (!error) {
      navigate(destino, { replace: true })
      return
    }

    const mensagem = error.message ?? ''
    const codigo = (error as { code?: string }).code ?? ''

    // Email já cadastrado. Chega por dois caminhos: erro explícito do Supabase,
    // ou a resposta ofuscada que o `cadastro()` traduz em `email_ja_cadastrado`.
    // Manda para o login já com o email preenchido — a pessoa só completa a
    // senha, e o destino da compra segue junto no state.
    if (
      criando &&
      (codigo === 'email_ja_cadastrado' ||
        codigo === 'user_already_exists' ||
        /already registered|already exists|user_already/i.test(mensagem))
    ) {
      navigate('/login', {
        replace: true,
        state: {
          // Repassa o destino da compra, para o login continuar de onde parou.
          from: (location.state as { from?: unknown } | null)?.from,
          avisoAuth: 'Você já tem uma conta com esse email. Digite sua senha para continuar.',
          emailPreenchido: email,
        },
      })
      return
    }

    toast({
      title: criando ? 'Erro ao criar conta' : 'Erro ao entrar',
      description:
        mensagem === 'Invalid login credentials' ? 'Email ou senha incorretos.' : mensagem,
      variant: 'destructive',
    })
  }

  const podeEnviar = criando
    ? nome && email && senha && confirmarSenha
    : email && senha

  return (
    <AuthLayout>
      <Link
        to="/vendas"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#64748B', textDecoration: 'none', marginBottom: '20px', transition: 'color 0.15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#0F172A')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para o site
      </Link>

      <div style={{ marginBottom: '24px' }}>
        <BrandMark size={36} />
      </div>

      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          {criando ? 'Crie sua conta' : 'Bem-vindo de volta'}
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B' }}>
          {criando
            ? 'Leva menos de um minuto para começar.'
            : 'Acesse o painel de gestão do seu restaurante'}
        </p>
      </div>

      {/* Quem chegou comprando vê onde está no fluxo; quem só quer entrar
          continua vendo a prova social. */}
      {vindoDaCompra ? (
        <EtapasCompra etapa={1} densidade="compacto" />
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F1F5F9', border: '1px solid #E9EEF5', borderRadius: '999px', padding: '4px 11px', marginBottom: '28px' }}>
          <Sparkles className="h-3 w-3" style={{ color: '#8B5CF6' }} />
          <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748B' }}>
            +12.000 feedbacks analisados por IA
          </span>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          style={{ backgroundColor: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '12px', padding: '11px 13px', fontSize: '13px', lineHeight: 1.5, color: '#1E40AF', marginBottom: '18px' }}
        >
          {aviso}
        </div>
      )}

      <form onSubmit={aoEnviar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {criando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <label htmlFor="nome" style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                Nome completo
              </label>
              <input
                id="nome" type="text" placeholder="Seu nome"
                value={nome} onChange={(e) => setNome(e.target.value)}
                required disabled={carregando} style={authInputStyle}
                onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <label htmlFor="email" style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
              Email
            </label>
            <input
              id="email" type="email" placeholder="seu@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required disabled={carregando} style={authInputStyle}
              onFocus={authInputFocus} onBlur={authInputBlur}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label htmlFor="senha" style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                Senha
              </label>
              {!criando && (
                <Link
                  to="/recuperar-senha"
                  style={{ fontSize: '13px', fontWeight: 500, color: '#2563EB', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1D4ED8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#2563EB')}
                >
                  Esqueceu a senha?
                </Link>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="senha" type={mostrarSenha ? 'text' : 'password'} placeholder="••••••••"
                value={senha} onChange={(e) => setSenha(e.target.value)}
                required disabled={carregando}
                style={{ ...authInputStyle, paddingRight: '46px' }}
                onFocus={authInputFocus} onBlur={authInputBlur}
              />
              <button
                type="button" onClick={() => setMostrarSenha((v) => !v)} disabled={carregando}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', display: 'flex', alignItems: 'center', lineHeight: 0 }}
              >
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {criando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <label htmlFor="confirmar" style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                Confirmar senha
              </label>
              <input
                id="confirmar" type={mostrarSenha ? 'text' : 'password'} placeholder="••••••••"
                value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)}
                required disabled={carregando} style={authInputStyle}
                onFocus={authInputFocus} onBlur={authInputBlur}
              />
            </div>
          )}

          {!criando && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <button
                type="button" role="checkbox" aria-checked={lembrarMe}
                onClick={() => setLembrarMe((v) => !v)} disabled={carregando}
                style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${lembrarMe ? '#2563EB' : '#CBD5E1'}`, backgroundColor: lembrarMe ? '#2563EB' : 'transparent', cursor: 'pointer', transition: 'border-color 0.15s, background-color 0.15s', padding: 0 }}
              >
                {lembrarMe && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span
                style={{ fontSize: '13px', color: '#64748B', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => !carregando && setLembrarMe((v) => !v)}
              >
                Lembrar-me
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={carregando || !podeEnviar}
            style={{
              width: '100%', height: '52px', fontSize: '14px', fontWeight: 600, color: 'white',
              background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
              border: 'none', borderRadius: '12px',
              cursor: carregando || !podeEnviar ? 'not-allowed' : 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.2s ease, opacity 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              opacity: carregando || !podeEnviar ? 0.6 : 1, marginTop: '4px',
              boxShadow: '0 4px 12px rgba(79,70,229,0.18)',
            }}
            onMouseEnter={(e) => { if (!carregando && podeEnviar) { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(79,70,229,0.25)' } }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.18)' }}
          >
            {carregando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {criando ? 'Criando conta...' : 'Entrando...'}
              </>
            ) : criando ? (
              'Criar conta'
            ) : (
              'Entrar'
            )}
          </button>

          <a
            href="https://wa.me/5511952138636"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', fontSize: '13px', fontWeight: 500, color: '#25D366', textDecoration: 'none', marginTop: '8px', transition: 'opacity 0.15s' }}
          >
            <WhatsAppIcon size={15} />
            Precisa de ajuda?
          </a>

          {/* No /cadastro, "Entrar" alterna o modo na mesma tela (sem perder o
              que já foi digitado nem o plano em compra). No /login, "Criar conta"
              leva para o fluxo de compra completo — por isso navega, em vez de
              só trocar o modo. */}
          <div style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', marginTop: '4px' }}>
            {criando ? (
              <>
                Já tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => trocarModo('entrar')}
                  style={{ fontWeight: 600, color: '#2563EB', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px' }}
                >
                  Entrar
                </button>
              </>
            ) : (
              <>
                Ainda não tem conta?{' '}
                <button
                  type="button"
                  onClick={irCriarConta}
                  style={{ fontWeight: 600, color: '#2563EB', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px' }}
                >
                  Criar conta e assinar
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}
