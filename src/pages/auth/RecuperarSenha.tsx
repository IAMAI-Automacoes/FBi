import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import {
  AuthLayout,
  BrandMark,
  authInputStyle,
  authInputFocus,
  authInputBlur,
} from '@/components/auth/AuthLayout'

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%', height: '52px', fontSize: '14px', fontWeight: 600, color: 'white',
  background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
  border: 'none', borderRadius: '12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease, opacity 0.15s',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  opacity: disabled ? 0.6 : 1, marginTop: '4px',
  boxShadow: '0 4px 12px rgba(79,70,229,0.18)',
})

const buttonHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.disabled) {
      e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'
      e.currentTarget.style.boxShadow = '0 12px 24px rgba(79,70,229,0.25)'
    }
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'none'
    e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.18)'
  },
}

function VoltarLogin() {
  return (
    <Link
      to="/login"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', fontSize: '13px', fontWeight: 500, color: '#64748B', textDecoration: 'none', marginTop: '8px', transition: 'color 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#0F172A')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para o login
    </Link>
  )
}

export default function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [modoRedefinir, setModoRedefinir] = useState(false)

  const { recuperarSenha } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setModoRedefinir(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleEnviarLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const { error } = await recuperarSenha(email)
    setIsLoading(false)

    if (error) {
      toast({
        title: 'Erro ao enviar link',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } else {
      setIsSent(true)
    }
  }

  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault()

    if (novaSenha !== confirmarSenha) {
      toast({
        title: 'Senhas não conferem',
        description: 'A senha e a confirmação devem ser iguais.',
        variant: 'destructive',
      })
      return
    }

    if (novaSenha.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setIsLoading(false)

    if (error) {
      toast({
        title: 'Erro ao redefinir senha',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Senha redefinida!',
        description: 'Sua senha foi alterada com sucesso.',
      })
      navigate('/login', { replace: true })
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: '#374151' }

  return (
    <AuthLayout>
      {/* Marca — só ícone */}
      <div style={{ marginBottom: '24px' }}>
        <BrandMark size={72} />
      </div>

      {/* ─── MODO REDEFINIR SENHA ─── */}
      {modoRedefinir ? (
        <>
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>
              Criar nova senha
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B' }}>
              Digite sua nova senha abaixo.
            </p>
          </div>

          <form onSubmit={handleRedefinir}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label htmlFor="nova-senha" style={labelStyle}>Nova senha</label>
                <input
                  id="nova-senha" type="password" placeholder="••••••••"
                  value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)}
                  required disabled={isLoading} style={authInputStyle}
                  onFocus={authInputFocus} onBlur={authInputBlur}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label htmlFor="confirmar-senha" style={labelStyle}>Confirmar nova senha</label>
                <input
                  id="confirmar-senha" type="password" placeholder="••••••••"
                  value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)}
                  required disabled={isLoading} style={authInputStyle}
                  onFocus={authInputFocus} onBlur={authInputBlur}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !novaSenha || !confirmarSenha}
                style={primaryButtonStyle(isLoading || !novaSenha || !confirmarSenha)}
                {...buttonHover}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar nova senha'
                )}
              </button>
            </div>
          </form>
        </>
      ) : isSent ? (
        /* ─── EMAIL ENVIADO ─── */
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(22,163,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', marginBottom: '18px' }}>
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Email enviado
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>
              Enviamos as instruções para <strong style={{ color: '#0F172A' }}>{email}</strong>. Verifique sua caixa de entrada e clique no link para redefinir sua senha.
            </p>
          </div>
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
            <VoltarLogin />
          </div>
        </>
      ) : (
        /* ─── ENVIAR LINK ─── */
        <>
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>
              Esqueceu sua senha?
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>
              Digite seu email e enviaremos um link para redefinir sua senha.
            </p>
          </div>

          <form onSubmit={handleEnviarLink}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label htmlFor="email" style={labelStyle}>Email</label>
                <input
                  id="email" type="email" placeholder="seu@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  required disabled={isLoading} style={authInputStyle}
                  onFocus={authInputFocus} onBlur={authInputBlur}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email}
                style={primaryButtonStyle(isLoading || !email)}
                {...buttonHover}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar link de recuperação'
                )}
              </button>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <VoltarLogin />
              </div>
            </div>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
