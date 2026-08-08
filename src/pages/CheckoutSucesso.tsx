import { Link } from 'react-router-dom'
import { ArrowRight, Check, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores, orbe, TRANSICAO } from '@/components/vendas/tokens'
import { EtapasCompra } from '@/components/compra/EtapasCompra'

/* Retorno do pagamento — fecha a trilha Conta → Pagamento → Acesso.
   É a única tela onde a etapa 3 acende: sem ela o indicador saltaria da etapa 2
   direto para o onboarding (que não mostra trilha) e a promessa de três passos
   morreria pela metade.

   TODO(stripe): quando o checkout hospedado entrar, esta página precisa
   1. ler `session_id` da query string (o Stripe devolve em `success_url`);
   2. aguardar o webhook gravar `assinatura_status = 'ativa'` — ele costuma
      chegar depois do redirect, então o estado aqui pode ainda estar defasado;
   3. fazer polling curto com timeout e uma mensagem honesta caso o webhook
      demore ("pagamento recebido, liberando acesso"), em vez de afirmar que
      está tudo pronto antes de confirmar. */
export default function CheckoutSucesso() {
  const { usuario, logout } = useAuth()

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
          <BrandMark size={30} />
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
        <EtapasCompra etapa={3} marginBottom={20} />

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
          <div
            className="mx-auto flex items-center justify-center"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(22,163,74,0.12)',
              color: cores.verde,
              marginBottom: '20px',
            }}
          >
            <Check className="h-7 w-7" strokeWidth={3} />
          </div>

          <h1
            style={{
              fontSize: 'clamp(22px, 3vw, 27px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: cores.tinta,
              marginBottom: '10px',
            }}
          >
            Pagamento confirmado
          </h1>

          <p
            style={{
              fontSize: '14.5px',
              lineHeight: 1.6,
              color: cores.corpoSuave,
              marginBottom: '28px',
            }}
          >
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
            style={{
              gap: '8px',
              height: '54px',
              width: '100%',
              fontSize: '15px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: cores.azul,
              borderRadius: '13px',
              textDecoration: 'none',
              boxShadow: '0 12px 30px rgba(37,99,235,0.30)',
              transition: TRANSICAO,
            }}
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
        </div>
      </div>
    </div>
  )
}
