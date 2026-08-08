import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandMark } from '@/components/auth/AuthLayout'
import { cores, orbe, textoGradiente, TRANSICAO } from './tokens'

export function CtaFinal() {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(165deg, #EAF1FF 0%, #F0F4FF 45%, #EAF7FB 100%)',
        borderTop: `1px solid ${cores.borda}`,
      }}
    >
      <div style={orbe('rgba(59,130,246,0.22)', 520, { top: '-170px', left: '12%' })} />
      <div style={orbe('rgba(139,92,246,0.18)', 440, { bottom: '-160px', right: '10%' })} />
      <div style={orbe('rgba(20,184,166,0.14)', 360, { top: '20%', right: '28%' })} />

      <div
        className="relative mx-auto text-center"
        style={{ maxWidth: '720px', padding: 'clamp(64px, 8vw, 108px) 24px', zIndex: 10 }}
      >
        <h2
          style={{
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            color: cores.tinta,
            marginBottom: '16px',
          }}
        >
          Comece a ouvir o que a sua sala{' '}
          <span style={textoGradiente}>não está te contando.</span>
        </h2>

        <p
          className="mx-auto"
          style={{
            fontSize: '16.5px',
            lineHeight: 1.65,
            color: cores.corpoSuave,
            maxWidth: '520px',
            marginBottom: '30px',
          }}
        >
          Coloque o QR nas mesas hoje e receba o primeiro insight assim que os feedbacks começarem a
          chegar.
        </p>

        <div className="flex flex-wrap justify-center items-center" style={{ gap: '12px' }}>
          <a
            href="#planos"
            className="inline-flex items-center justify-center"
            style={{
              gap: '8px',
              height: '54px',
              padding: '0 30px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: cores.azul,
              borderRadius: '13px',
              textDecoration: 'none',
              boxShadow: '0 14px 34px rgba(37,99,235,0.32)',
              transition: TRANSICAO,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 20px 44px rgba(37,99,235,0.38)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = '0 14px 34px rgba(37,99,235,0.32)'
            }}
          >
            Ver planos e assinar
            <ArrowRight className="h-4 w-4" />
          </a>

          <Link
            to="/login"
            className="inline-flex items-center justify-center"
            style={{
              height: '54px',
              padding: '0 26px',
              fontSize: '15px',
              fontWeight: 600,
              color: cores.corpo,
              background: 'rgba(255,255,255,0.75)',
              border: `1px solid ${cores.borda}`,
              borderRadius: '13px',
              textDecoration: 'none',
              transition: 'background-color 0.18s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#FFFFFF')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.75)')}
          >
            Já sou cliente
          </Link>
        </div>
      </div>
    </section>
  )
}

export function RodapeVendas() {
  const ano = new Date().getFullYear()

  return (
    <footer style={{ background: '#FFFFFF', borderTop: `1px solid ${cores.borda}` }}>
      <div
        className="mx-auto flex flex-col sm:flex-row items-center justify-between"
        style={{ maxWidth: '1180px', padding: '30px 24px', gap: '16px' }}
      >
        <div className="flex items-center">
          <BrandMark size={26} />
        </div>

        <div
          className="flex flex-wrap items-center justify-center"
          style={{ gap: '20px', fontSize: '13px', color: cores.corpoSuave }}
        >
          <a href="#como-funciona" style={{ color: 'inherit', textDecoration: 'none' }}>
            Como funciona
          </a>
          <a href="#planos" style={{ color: 'inherit', textDecoration: 'none' }}>
            Planos
          </a>
          <a href="#faq" style={{ color: 'inherit', textDecoration: 'none' }}>
            Dúvidas
          </a>
          <Link to="/login" style={{ color: 'inherit', textDecoration: 'none' }}>
            Entrar
          </Link>
        </div>

        <span style={{ fontSize: '13px', color: cores.corpoSuave }}>© {ano} IAMAI</span>
      </div>
    </footer>
  )
}
