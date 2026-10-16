import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Loader2, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark, WhatsAppIcon } from '@/components/auth/AuthLayout'
import { cores, orbe, TRANSICAO } from '@/components/vendas/tokens'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
/* Retorno do pagamento — fecha a trilha Conta → Pagamento → Acesso.

   A confirmação do pagamento chega ao servidor pelo webhook do provedor, que
   costuma chegar DEPOIS do redirect: `assinatura_status` pode estar defasado.
   Faz polling até virar 'ativa' (o webhook do Asaas leva alguns segundos) e
   então segue sozinha para o onboarding (quem já configurou cai no painel). */
type Estado = 'verificando' | 'ativa' | 'erro'

const POLL_MS = 3000
/** Cartão confirma em segundos; a margem cobre atraso do webhook. */
const LIMITE_MS = 10 * 60_000

export default function CheckoutSucesso() {
  const { usuario, logout, refetchUsuario } = useAuth()
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>(usuario?.assinatura_status === 'ativa' ? 'ativa' : 'verificando')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const inicio = useRef(Date.now())

  useEffect(() => {
    if (usuario?.assinatura_status === 'ativa') setEstado('ativa')
  }, [usuario?.assinatura_status])

  // Confirmado: mostra o "Pagamento confirmado" por um instante e segue.
  useEffect(() => {
    if (estado !== 'ativa') return
    const t = setTimeout(() => navigate('/onboarding', { replace: true }), 1800)
    return () => clearTimeout(t)
  }, [estado, navigate])

  useEffect(() => {
    if (estado !== 'verificando') return
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const passo = async () => {
      if (!vivo) return
      try {
        await refetchUsuario()
      } catch {
        // Rede: tenta de novo no próximo passo.
      }
      if (Date.now() - inicio.current > LIMITE_MS) {
        if (vivo) {
          setEstado('erro')
          setMensagem('O pagamento ainda não foi confirmado. Se você já pagou, a liberação pode levar alguns minutos.')
        }
        return
      }
      timer = setTimeout(passo, POLL_MS)
    }
    passo()
    return () => {
      vivo = false
      if (timer) clearTimeout(timer)
    }
  }, [estado, refetchUsuario])

  return (
    <div
      className="min-h-screen"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(165deg, #F5F9FF 0%, #EEF6FF 50%, #F0FBFF 100%)',
      }}
    >
      <div style={orbe('rgba(59,130,246,0.18)', 480, { top: '-150px', left: '-120px' })} />
      <div style={orbe('rgba(20,184,166,0.16)', 420, { bottom: '-140px', right: '-110px' })} />

      <div
        className="relative mx-auto flex items-center justify-between"
        style={{ maxWidth: '760px', padding: '22px 24px', zIndex: 10 }}
      >
        <div className="flex items-center">
          <BrandMark size={60} />
        </div>

        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center"
          style={{
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: cores.corpoSuave,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>

      <div
        className="relative mx-auto"
        style={{ maxWidth: '520px', padding: '12px 24px 64px', zIndex: 10 }}
      >
        <EtapasCompra etapa={3} marginBottom={20} legenda={estado === 'ativa' ? undefined : null} />

        <div
          className="text-center"
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.9)',
            borderRadius: '24px',
            padding: 'clamp(30px, 4vw, 40px)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.9) inset, 0 30px 70px rgba(37,99,235,0.16), 0 12px 28px rgba(15,23,42,0.08)',
          }}
        >
          {estado === 'ativa' ? (
            <>
              <div
                className="mx-auto flex items-center justify-center"
                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(22,163,74,0.12)', color: cores.verde, marginBottom: '20px' }}
              >
                <Check className="h-7 w-7" strokeWidth={3} />
              </div>
              <h1 style={{ fontSize: 'clamp(22px, 3vw, 27px)', fontWeight: 700, letterSpacing: '-0.025em', color: cores.tinta, marginBottom: '10px' }}>
                Pagamento confirmado
              </h1>
              <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpoSuave, marginBottom: '28px' }}>
                {usuario?.email ? (
                  <>
                    A conta <strong style={{ color: cores.corpoForte }}>{usuario.email}</strong> está
                    liberada. Falta só configurar seu restaurante.
                  </>
                ) : (
                  'Sua assinatura está ativa. Falta só configurar seu restaurante.'
                )}
              </p>
              <Link
                to="/onboarding"
                className="flex items-center justify-center"
                style={{ gap: '8px', height: '54px', width: '100%', fontSize: '15px', fontWeight: 600, color: '#FFFFFF', backgroundColor: cores.azul, borderRadius: '13px', textDecoration: 'none', boxShadow: '0 12px 30px rgba(37,99,235,0.30)', transition: TRANSICAO }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 18px 40px rgba(37,99,235,0.36)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(37,99,235,0.30)'
                }}
              >
                Configurar meu restaurante
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : estado === 'verificando' ? (
            <>
              <div
                className="mx-auto flex items-center justify-center"
                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(37,99,235,0.10)', color: cores.azul, marginBottom: '20px' }}
              >
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <h1 style={{ fontSize: 'clamp(22px, 3vw, 27px)', fontWeight: 700, letterSpacing: '-0.025em', color: cores.tinta, marginBottom: '10px' }}>
                Liberando seu acesso
              </h1>
              <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpoSuave }}>
                Estamos confirmando o pagamento com o Asaas. No cartão leva alguns segundos. Esta tela
                libera o acesso sozinha quando isso acontecer.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 'clamp(22px, 3vw, 27px)', fontWeight: 700, letterSpacing: '-0.025em', color: cores.tinta, marginBottom: '10px' }}>
                Não conseguimos liberar o acesso
              </h1>
              <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpoSuave, marginBottom: '24px' }}>
                {mensagem ?? 'Algo deu errado ao ligar o pagamento à sua conta.'}
              </p>
              <Link
                to="/assinatura"
                className="flex items-center justify-center"
                style={{ gap: '8px', height: '54px', width: '100%', fontSize: '15px', fontWeight: 600, color: '#FFFFFF', backgroundColor: cores.azul, borderRadius: '13px', textDecoration: 'none', boxShadow: '0 12px 30px rgba(37,99,235,0.30)' }}
              >
                Ver minha assinatura
              </Link>
              <a
                href="https://wa.me/5511952138636"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center"
                style={{ gap: '7px', fontSize: '13.5px', fontWeight: 500, color: '#25D366', textDecoration: 'none', marginTop: '16px' }}
              >
                <WhatsAppIcon size={15} />
                Falar com o suporte
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
