import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, ShieldCheck } from 'lucide-react'
import { ancora, cores, orbe, rotuloSecao, tituloSecao, TRANSICAO } from './tokens'
import { CICLOS, RECURSOS_INCLUSOS, buscarCiclo, type Ciclo } from './ciclos-plano'

export function Planos() {
  const [ciclo, setCiclo] = useState<Ciclo>('semestral')
  const atual = buscarCiclo(ciclo)

  return (
    <section
      id="planos"
      style={{
        ...ancora,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(170deg, #F5F9FF 0%, #EEF6FF 55%, #F0FBFF 100%)',
        borderTop: `1px solid ${cores.borda}`,
      }}
    >
      <div style={orbe('rgba(59,130,246,0.18)', 520, { top: '-150px', left: '-130px' })} />
      <div style={orbe('rgba(139,92,246,0.14)', 440, { bottom: '-140px', right: '-120px' })} />

      <div
        className="relative mx-auto"
        style={{ maxWidth: '1180px', padding: 'clamp(64px, 8vw, 104px) 24px', zIndex: 10 }}
      >
        <div className="text-center" style={{ marginBottom: 'clamp(32px, 4vw, 44px)' }}>
          <span style={rotuloSecao}>Planos</span>
          <h2 style={{ ...tituloSecao, marginTop: '12px', marginBottom: '14px' }}>
            Um plano. Tudo incluso.
          </h2>
          <p
            className="mx-auto"
            style={{
              fontSize: '16px',
              lineHeight: 1.65,
              color: cores.corpoSuave,
              maxWidth: '520px',
            }}
          >
            Sem taxa de instalação e sem cobrança por feedback recebido. Quanto maior o ciclo, menor
            a mensalidade.
          </p>
        </div>

        {/* ── Alternador de ciclo ── */}
        <div className="flex justify-center" style={{ marginBottom: '34px' }}>
          <div
            className="inline-flex"
            style={{
              background: 'rgba(255,255,255,0.75)',
              border: `1px solid ${cores.borda}`,
              borderRadius: '14px',
              padding: '5px',
              gap: '4px',
            }}
          >
            {CICLOS.map((c) => {
              const ativo = c.id === ciclo
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCiclo(c.id)}
                  aria-pressed={ativo}
                  className="inline-flex items-center"
                  style={{
                    gap: '7px',
                    height: '40px',
                    padding: '0 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    color: ativo ? '#FFFFFF' : cores.corpo,
                    background: ativo ? cores.azul : 'transparent',
                    boxShadow: ativo ? '0 6px 16px rgba(37,99,235,0.26)' : 'none',
                    transition: 'background-color 0.2s ease, color 0.2s ease',
                  }}
                >
                  {c.rotulo}
                  {c.descontoPercentual !== null && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '999px',
                        padding: '2px 7px',
                        color: ativo ? '#FFFFFF' : cores.verde,
                        background: ativo ? 'rgba(255,255,255,0.22)' : 'rgba(22,163,74,0.12)',
                      }}
                    >
                      −{c.descontoPercentual}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Card único ── */}
        <div className="mx-auto" style={{ position: 'relative', maxWidth: '460px' }}>
          {/* Halo difuso atrás do card — mesmo recurso do AuthLayout */}
          <div
            style={{
              position: 'absolute',
              inset: '-28px',
              borderRadius: '48px',
              background:
                'radial-gradient(circle, rgba(37,99,235,0.20) 0%, rgba(139,92,246,0.10) 45%, transparent 72%)',
              filter: 'blur(22px)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              background: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.9)',
              borderRadius: '24px',
              padding: 'clamp(28px, 4vw, 38px)',
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
                marginBottom: '20px',
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: cores.azul }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: cores.azul }}>
                Plano completo
              </span>
            </div>

            <div className="flex items-baseline" style={{ gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '18px', fontWeight: 600, color: cores.corpoSuave }}>R$</span>
              <span
                style={{
                  fontSize: 'clamp(44px, 6vw, 56px)',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: cores.tinta,
                }}
              >
                {atual.mensalEquivalente}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 500, color: cores.corpoSuave }}>
                /mês
              </span>
            </div>

            <p style={{ fontSize: '13.5px', color: cores.corpoSuave, marginBottom: '24px' }}>
              {atual.descricaoCobranca}
              {atual.descontoPercentual !== null && (
                <span style={{ color: cores.verde, fontWeight: 600 }}>
                  {' '}
                  · economia de {atual.descontoPercentual}%
                </span>
              )}
            </p>

            <Link
              to={`/checkout?ciclo=${ciclo}`}
              className="flex items-center justify-center"
              style={{
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
                marginBottom: '10px',
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
              Assinar plano {atual.rotulo.toLowerCase()}
            </Link>

            {/* Define a expectativa ANTES do clique: quem aperta "assinar"
                espera um campo de cartão e recebe um cadastro. Avisar aqui sai
                mais barato do que explicar na tela seguinte. */}
            <div
              className="flex items-center justify-center flex-wrap"
              style={{ gap: '6px', marginBottom: '8px' }}
            >
              {['Conta', 'Pagamento', 'Acesso imediato'].map((etapa, i) => (
                <span key={etapa} className="inline-flex items-center" style={{ gap: '6px' }}>
                  {i > 0 && (
                    <ChevronRight
                      className="h-3 w-3"
                      style={{ color: 'rgba(100,116,139,0.45)' }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: i === 2 ? cores.verde : cores.corpo,
                    }}
                  >
                    {etapa}
                  </span>
                </span>
              ))}
            </div>

            <p
              className="text-center"
              style={{ fontSize: '12.5px', color: cores.corpoSuave, marginBottom: '26px' }}
            >
              Pagamento seguro via Stripe · cancele quando quiser
            </p>

            <div style={{ height: '1px', background: cores.borda, marginBottom: '22px' }} />

            <ul style={{ display: 'grid', gap: '12px', listStyle: 'none', padding: 0, margin: 0 }}>
              {RECURSOS_INCLUSOS.map((r) => (
                <li key={r} className="flex items-start" style={{ gap: '10px' }}>
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      background: 'rgba(22,163,74,0.12)',
                      color: cores.verde,
                      marginTop: '1px',
                    }}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span style={{ fontSize: '14px', lineHeight: 1.5, color: cores.corpoForte }}>
                    {r}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
