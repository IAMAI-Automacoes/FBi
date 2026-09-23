import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { AuthLayout, authInputStyle, authInputFocus, authInputBlur } from '@/components/auth/AuthLayout'
import { entrarNaDemo } from '@/lib/queries/demo'
import { PREFIXO_DEMO } from '@/lib/demo'

/* Entrada da demonstração: /demo/login.
   Não é a tela de login. Quem está aqui é o dono de um restaurante vendo o Easy
   Feed pela primeira vez, no próprio computador, com o vendedor do lado. Por
   isso só um campo: sem email, sem senha e sem "Lembrar-me" — nada que o
   navegador possa oferecer para salvar. */
export default function DemoLogin() {
  const { session, sessaoDemo } = useAuth()
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const campoRef = useRef<HTMLInputElement>(null)

  if (session && sessaoDemo && !enviando) return <Navigate to="/" replace />

  const entrar = async (valor: string) => {
    if (valor.length !== 6 || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await entrarNaDemo(valor)
      // Recarrega em vez de navegar: o app remonta com a demonstração já
      // resolvida, sem piscar esta tela no meio.
      window.location.replace(`${PREFIXO_DEMO}/`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.')
      setCodigo('')
      setEnviando(false)
      requestAnimationFrame(() => campoRef.current?.focus())
    }
  }

  const podeEnviar = codigo.length === 6 && !enviando

  return (
    <AuthLayout>
      <div style={{ marginBottom: '22px' }}>
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '999px', padding: '4px 11px', marginBottom: '16px' }}
        >
          <KeyRound className="h-3 w-3" style={{ color: '#1D4ED8' }} />
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#1D4ED8' }}>Demonstração</span>
        </div>
        <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Entrar na demonstração
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.55 }}>
          Digite o código de 6 dígitos que aparece no aparelho de quem está apresentando o Easy Feed.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          entrar(codigo)
        }}
        autoComplete="off"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label htmlFor="codigo-demo" style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
            Código
          </label>
          <input
            ref={campoRef}
            id="codigo-demo"
            name="codigo-demo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="000000"
            value={codigo}
            disabled={enviando}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'erro-codigo' : undefined}
            onChange={(e) => {
              const valor = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCodigo(valor)
              setErro(null)
              // Seis dígitos já é o código inteiro: entra sem pedir o clique.
              if (valor.length === 6) entrar(valor)
            }}
            onFocus={authInputFocus}
            onBlur={authInputBlur}
            style={{
              ...authInputStyle,
              height: '64px',
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '0.45em',
              textAlign: 'center',
              // O espaçamento entra depois de cada dígito; sem isto o conjunto
              // fica deslocado para a esquerda.
              paddingLeft: 'calc(16px + 0.45em)',
              fontVariantNumeric: 'tabular-nums',
            }}
          />

          {erro && (
            <div
              id="erro-codigo"
              role="alert"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '11px 13px', fontSize: '13px', lineHeight: 1.5, color: '#991B1B' }}
            >
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={!podeEnviar}
            style={{
              width: '100%', height: '52px', fontSize: '14px', fontWeight: 600, color: 'white',
              background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
              border: 'none', borderRadius: '12px',
              cursor: podeEnviar ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              opacity: podeEnviar || enviando ? 1 : 0.6, marginTop: '4px',
              boxShadow: '0 4px 12px rgba(79,70,229,0.18)',
            }}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Abrindo…
              </>
            ) : (
              'Entrar na demonstração'
            )}
          </button>

          <p style={{ fontSize: '12.5px', color: '#64748B', textAlign: 'center', lineHeight: 1.5, marginTop: '2px' }}>
            O acesso dura 2 horas e fecha sozinho. Nada fica salvo neste navegador.
          </p>
        </div>
      </form>
    </AuthLayout>
  )
}
