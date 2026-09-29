import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Loader2, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark, WhatsAppIcon } from '@/components/auth/AuthLayout'
import { cores, orbe, TRANSICAO } from '@/components/vendas/tokens'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
import { ErroStripe, limparSessaoCheckout, vincularCompra } from '@/lib/queries/stripe'

/* Retorno do pagamento — fecha a trilha Pagamento → Conta → Acesso.

   Duas origens chegam aqui com `?sessao=cs_...`:
   - LANDING: pagou sem conta, criou a conta, e agora o servidor precisa LIGAR
     a assinatura à conta (`vincular-compra`, que confere tudo no Stripe);
   - APP: já tinha conta; o webhook liga sozinho (metadata veio do JWT). Chamar
     `vincular-compra` aqui também é inofensivo: idempotente para a mesma conta.

   O webhook costuma chegar DEPOIS do redirect, então `assinatura_status` pode
   estar defasado: faz polling curto até virar 'ativa', e é honesto quando o
   pagamento ainda está em processamento (boleto/Pix). */
type Estado = 'verificando' | 'ativa' | 'pendente' | 'email_diferente' | 'erro'

const POLL_MS = 3000
/** Cartão confirma em segundos; boleto/Pix podem levar minutos. */
const LIMITE_MS = 90_000
const LIMITE_PENDENTE_MS = 10 * 60_000

export default function CheckoutSucesso() {
  const { usuario, logout, refetchUsuario } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sessao = params.get('sessao')
  const [estado, setEstado] = useState<Estado>(usuario?.assinatura_status === 'ativa' ? 'ativa' : 'verificando')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const inicio = useRef(Date.now())
  const vinculou = useRef(false)

  useEffect(() => {
    if (usuario?.assinatura_status === 'ativa') {
      setEstado('ativa')
      limparSessaoCheckout()
    }
  }, [usuario?.assinatura_status])

  useEffect(() => {
    if (estado === 'ativa' || estado === 'email_diferente' || estado === 'erro') return
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const passo = async () => {
      if (!vivo) return
      try {
        if (sessao && !vinculou.current) {
          const r = await vincularCompra(sessao)
          vinculou.current = true
          if (r.ok) {
            await refetchUsuario()
            if (vivo) setEstado('ativa')
            limparSessaoCheckout()
            return
          }
        } else {
          await refetchUsuario()
        }
      } catch (e) {
        if (!vivo) return
        const erro = e instanceof ErroStripe ? e : null
        if (erro?.corpo?.email_diferente) {
          setEstado('email_diferente')
          setMensagem(erro.message)
          return
        }
        if (erro?.corpo?.pendente) {
          vinculou.current = false // tenta de novo quando o pagamento confirmar
          setEstado('pendente')
        } else if (erro && (erro.status === 404 || erro.status === 410 || erro.status === 409)) {
          setEstado('erro')
          setMensagem(erro.message)
          return
        }
        // Rede/500: cai no polling abaixo e tenta de novo.
        vinculou.current = false
      }
      if (Date.now() - inicio.current > (estado === 'pendente' ? LIMITE_PENDENTE_MS : LIMITE_MS)) {
        if (vivo) {
          setEstado('erro')
          setMensagem('O pagamento foi recebido, mas a liberação está demorando mais que o normal.')
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
    // `estado` entra para reiniciar o ciclo quando muda para 'pendente'.
  }, [sessao, estado, refetchUsuario])

  const sairECriarComEmailCerto = async () => {
    await logout()
    navigate(sessao ? `/cadastro?sessao=${encodeURIComponent(sessao)}` : '/cadastro', { replace: true })
  }

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
          ) : estado === 'verificando' || estado === 'pendente' ? (
            <>
              <div
                className="mx-auto flex items-center justify-center"
                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(37,99,235,0.10)', color: cores.azul, marginBottom: '20px' }}
              >
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <h1 style={{ fontSize: 'clamp(22px, 3vw, 27px)', fontWeight: 700, letterSpacing: '-0.025em', color: cores.tinta, marginBottom: '10px' }}>
                {estado === 'pendente' ? 'Pagamento em processamento' : 'Liberando seu acesso'}
              </h1>
              <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpoSuave }}>
                {estado === 'pendente'
                  ? 'Recebemos seu pedido. Boleto e Pix levam alguns instantes para confirmar; esta tela libera o acesso sozinha quando isso acontecer.'
                  : 'Pagamento recebido. Estamos ligando a assinatura à sua conta — leva só alguns segundos.'}
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 'clamp(22px, 3vw, 27px)', fontWeight: 700, letterSpacing: '-0.025em', color: cores.tinta, marginBottom: '10px' }}>
                {estado === 'email_diferente' ? 'E-mail diferente do pagamento' : 'Não conseguimos liberar o acesso'}
              </h1>
              <p style={{ fontSize: '14.5px', lineHeight: 1.6, color: cores.corpoSuave, marginBottom: '24px' }}>
                {mensagem ?? 'Algo deu errado ao ligar o pagamento à sua conta.'}
                {estado === 'email_diferente' && (
                  <> A assinatura fica ligada ao e-mail informado no pagamento, por segurança.</>
                )}
              </p>
              {estado === 'email_diferente' ? (
                <button
                  type="button"
                  onClick={sairECriarComEmailCerto}
                  className="flex items-center justify-center"
                  style={{ gap: '8px', height: '54px', width: '100%', fontSize: '15px', fontWeight: 600, color: '#FFFFFF', backgroundColor: cores.azul, border: 'none', borderRadius: '13px', cursor: 'pointer', boxShadow: '0 12px 30px rgba(37,99,235,0.30)' }}
                >
                  Criar conta com o e-mail do pagamento
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <Link
                  to="/assinatura"
                  className="flex items-center justify-center"
                  style={{ gap: '8px', height: '54px', width: '100%', fontSize: '15px', fontWeight: 600, color: '#FFFFFF', backgroundColor: cores.azul, borderRadius: '13px', textDecoration: 'none', boxShadow: '0 12px 30px rgba(37,99,235,0.30)' }}
                >
                  Ver minha assinatura
                </Link>
              )}
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
