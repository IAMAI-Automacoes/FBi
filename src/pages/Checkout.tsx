import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, LogOut, ShieldCheck, Ticket } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores, orbe, TRANSICAO } from '@/components/vendas/tokens'
import { RECURSOS_INCLUSOS, buscarCiclo, ehCiclo } from '@/components/vendas/ciclos-plano'
import { EtapasCompra } from '@/components/compra/EtapasCompra'
import { resgatarCupom } from '@/lib/queries/cupom'

/* Confirmação do plano antes de mandar para o Stripe.
   Rota protegida: quem chega aqui já está autenticado — o portão de login é o
   próprio `RotaProtegida`, então este é o primeiro passo depois da conta criada. */
export default function Checkout() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { usuario, logout, refetchUsuario } = useAuth()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Cupom de acesso — libera sem depender do Stripe (o resgate é no servidor)
  const [cupom, setCupom] = useState('')
  const [aplicandoCupom, setAplicandoCupom] = useState(false)
  const [erroCupom, setErroCupom] = useState<string | null>(null)

  const cicloParam = params.get('ciclo')
  const ciclo = ehCiclo(cicloParam) ? cicloParam : 'mensal'
  const plano = buscarCiclo(ciclo)

  const aplicarCupom = async () => {
    const codigo = cupom.trim()
    if (!codigo || aplicandoCupom) return
    setAplicandoCupom(true)
    setErroCupom(null)
    try {
      await resgatarCupom(codigo)
      // Atualiza o usuário (assinatura_status vira "ativa") e entra no app.
      // O RotaProtegida encaminha para o onboarding ou para o painel.
      await refetchUsuario()
      navigate('/', { replace: true })
    } catch (e) {
      setErroCupom(e instanceof Error ? e.message : 'Não foi possível aplicar o cupom.')
      setAplicandoCupom(false)
    }
  }

  const irParaPagamento = async () => {
    setEnviando(true)
    setErro(null)
    try {
      // TODO(stripe): chamar a Edge Function `criar-checkout-session`, que
      // resolve o price_id do ciclo no servidor e devolve a URL hospedada.
      throw new Error(
        'O pagamento ainda não foi configurado. Falta criar os produtos no Stripe e publicar a função criar-checkout-session.',
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.')
      setEnviando(false)
    }
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
      <div style={orbe('rgba(139,92,246,0.14)', 420, { bottom: '-140px', right: '-110px' })} />

      {/* Cabeçalho enxuto — sem navegação que tire a pessoa do fluxo de pagamento */}
      <div
        className="relative mx-auto flex items-center justify-between"
        style={{ maxWidth: '760px', padding: '22px 24px', zIndex: 10 }}
      >
        <Link to="/assinatura" className="flex items-center" style={{ textDecoration: 'none' }}>
          <BrandMark size={60} />
        </Link>

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
        {/* Volta para a lista de planos, não para a landing pública: quem está
            aqui já tem conta e só quer trocar de ciclo. */}
        <Link
          to="/assinatura"
          className="inline-flex items-center"
          style={{
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: cores.corpoSuave,
            textDecoration: 'none',
            marginBottom: '18px',
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Escolher outro plano
        </Link>

        {/* Fora do card: dentro competiria com a pílula do plano e o h1. */}
        <EtapasCompra etapa={2} marginBottom={20} />

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.9)',
            borderRadius: '24px',
            padding: 'clamp(26px, 4vw, 36px)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.9) inset, 0 30px 70px rgba(37,99,235,0.16), 0 12px 28px rgba(15,23,42,0.08)',
          }}
        >
          <div
            className="inline-flex items-center"
            style={{
              gap: '6px',
              background: 'rgba(37,99,235,0.08)',
              borderRadius: '999px',
              padding: '5px 12px',
              marginBottom: '18px',
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: cores.azul }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: cores.azul }}>
              Plano {plano.rotulo.toLowerCase()}
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(22px, 3vw, 27px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: cores.tinta,
              marginBottom: '8px',
            }}
          >
            Confirme sua assinatura
          </h1>
          {usuario?.email && (
            <p style={{ fontSize: '14px', color: cores.corpoSuave, marginBottom: '24px' }}>
              A conta <strong style={{ color: cores.corpoForte }}>{usuario.email}</strong> terá
              acesso liberado assim que o pagamento for confirmado.
            </p>
          )}

          {/* Resumo do valor */}
          <div
            style={{
              background: cores.superficie,
              border: `1px solid ${cores.borda}`,
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '22px',
            }}
          >
            <div className="flex items-baseline" style={{ gap: '7px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: cores.corpoSuave }}>R$</span>
              <span
                style={{
                  fontSize: '40px',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: cores.tinta,
                }}
              >
                {plano.mensalEquivalente}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 500, color: cores.corpoSuave }}>
                /mês
              </span>
            </div>
            <p style={{ fontSize: '13.5px', color: cores.corpoSuave, marginTop: '8px' }}>
              {plano.descricaoCobranca}
              {plano.descontoPercentual !== null && (
                <span style={{ color: cores.verde, fontWeight: 600 }}>
                  {' '}
                  · economia de {plano.descontoPercentual}%
                </span>
              )}
            </p>
          </div>

          {erro && (
            <div
              role="alert"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: '12px',
                padding: '13px 15px',
                fontSize: '13.5px',
                lineHeight: 1.55,
                color: '#B91C1C',
                marginBottom: '18px',
              }}
            >
              {erro}
            </div>
          )}

          <button
            type="button"
            onClick={irParaPagamento}
            disabled={enviando}
            className="flex items-center justify-center"
            style={{
              width: '100%',
              height: '54px',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: cores.azul,
              border: 'none',
              borderRadius: '13px',
              cursor: enviando ? 'not-allowed' : 'pointer',
              opacity: enviando ? 0.7 : 1,
              boxShadow: '0 12px 30px rgba(37,99,235,0.30)',
              transition: TRANSICAO,
            }}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecionando...
              </>
            ) : (
              'Ir para o pagamento'
            )}
          </button>

          <p
            className="text-center"
            style={{ fontSize: '12.5px', color: cores.corpoSuave, margin: '10px 0 22px' }}
          >
            Pagamento processado pelo Stripe · cancele quando quiser
          </p>

          {/* Cupom de acesso — funciona mesmo sem o Stripe configurado */}
          <div
            style={{
              background: cores.superficie,
              border: `1px solid ${cores.borda}`,
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '22px',
            }}
          >
            <div className="flex items-center" style={{ gap: '7px', marginBottom: '10px' }}>
              <Ticket className="h-4 w-4" style={{ color: cores.azul }} />
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: cores.corpoForte }}>
                Tem um cupom de acesso?
              </span>
            </div>
            <div className="flex" style={{ gap: '8px' }}>
              <input
                value={cupom}
                onChange={(e) => { setCupom(e.target.value); setErroCupom(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupom() }}
                placeholder="Digite o código"
                disabled={aplicandoCupom}
                style={{
                  flex: 1,
                  height: '44px',
                  padding: '0 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  color: cores.tinta,
                  background: '#FFFFFF',
                  border: `1px solid ${cores.borda}`,
                  borderRadius: '11px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={aplicarCupom}
                disabled={aplicandoCupom || !cupom.trim()}
                className="flex items-center justify-center"
                style={{
                  height: '44px',
                  padding: '0 18px',
                  gap: '7px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: cores.azul,
                  border: 'none',
                  borderRadius: '11px',
                  cursor: aplicandoCupom || !cupom.trim() ? 'not-allowed' : 'pointer',
                  opacity: aplicandoCupom || !cupom.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {aplicandoCupom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </button>
            </div>
            {erroCupom && (
              <p role="alert" style={{ fontSize: '12.5px', color: '#B91C1C', marginTop: '9px' }}>
                {erroCupom}
              </p>
            )}
            <p style={{ fontSize: '11.5px', color: cores.corpoSuave, marginTop: '9px', lineHeight: 1.5 }}>
              Um cupom válido libera seu acesso na hora, sem passar pelo pagamento.
            </p>
          </div>

          <div style={{ height: '1px', background: cores.borda, marginBottom: '20px' }} />

          <ul style={{ display: 'grid', gap: '10px', listStyle: 'none', padding: 0, margin: 0 }}>
            {RECURSOS_INCLUSOS.map((r) => (
              <li key={r} className="flex items-start" style={{ gap: '9px' }}>
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '6px',
                    background: 'rgba(22,163,74,0.12)',
                    color: cores.verde,
                    marginTop: '1px',
                  }}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: cores.corpoForte }}>
                  {r}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
