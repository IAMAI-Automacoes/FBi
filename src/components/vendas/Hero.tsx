import { ArrowDown, Brain, Check, ChevronDown, Sparkles } from 'lucide-react'
import { WhatsAppIcon } from '@/components/auth/AuthLayout'
import { cores, orbe, gridSutil, textoGradiente, vidro, TRANSICAO } from './tokens'

/* Seta miúda que liga um card ao seguinte — deixa explícito que é um fluxo,
   não três cards soltos. */
function Elo() {
  return (
    <div className="flex justify-center" style={{ padding: '6px 0' }}>
      <ArrowDown className="h-4 w-4" style={{ color: 'rgba(100,116,139,0.5)' }} />
    </div>
  )
}

/* A composição encena a headline: a mensagem crua do cliente vira insight,
   o insight vira ação. Empilhada em coluna (e não posicionada em absoluto)
   para sobreviver ao mobile sem media query. */
function Composicao() {
  const inclinar = (graus: string) => ({
    transform: `rotate(${graus})`,
    transition: TRANSICAO,
  })

  const aoEntrar = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = `${e.currentTarget.dataset.rot} translateY(-4px)`
  }
  const aoSair = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = e.currentTarget.dataset.rot || ''
  }

  return (
    <div style={{ width: '100%', maxWidth: '380px' }}>
      {/* 1 — Feedback cru, do jeito que chega no WhatsApp */}
      <div
        data-rot="rotate(-4deg)"
        onMouseEnter={aoEntrar}
        onMouseLeave={aoSair}
        style={{ ...vidro(0.8), ...inclinar('-4deg'), padding: '18px' }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9px',
                background: 'rgba(37,211,102,0.12)',
                color: '#25D366',
              }}
            >
              <WhatsAppIcon size={14} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: cores.corpo }}>
              Cliente · Mesa 12
            </span>
          </div>
          <span style={{ fontSize: '11px', color: cores.corpoSuave }}>21:04</span>
        </div>

        <div
          style={{
            background: cores.superficie,
            border: `1px solid ${cores.borda}`,
            borderRadius: '14px 14px 14px 4px',
            padding: '11px 13px',
            fontSize: '13px',
            lineHeight: 1.55,
            color: cores.corpoForte,
          }}
        >
          "A comida estava ótima, mas esperamos quase 40 minutos pelo prato principal."
        </div>
      </div>

      <Elo />

      {/* 2 — O que a IA extraiu */}
      <div
        data-rot="rotate(3deg)"
        onMouseEnter={aoEntrar}
        onMouseLeave={aoSair}
        className="animate-pulse-soft"
        style={{
          ...vidro(0.82, 'rgba(139,92,246,0.16)'),
          ...inclinar('3deg'),
          padding: '16px 18px',
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${cores.violeta}, ${cores.indigo})`,
                color: '#FFFFFF',
              }}
            >
              <Brain className="h-3.5 w-3.5" />
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: cores.violeta,
              }}
            >
              Insight da IA
            </span>
          </div>
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#B45309',
              background: 'rgba(245,158,11,0.14)',
              borderRadius: '999px',
              padding: '3px 8px',
            }}
          >
            IMPORTANTE
          </span>
        </div>
        <p style={{ fontSize: '12.5px', lineHeight: 1.55, color: cores.corpoForte }}>
          Reclamações sobre <strong style={{ color: cores.tinta }}>tempo de espera</strong> subiram
          38% no jantar desta semana — concentradas entre 19h e 22h.
        </p>
      </div>

      <Elo />

      {/* 3 — A ação que cai no quadro de tarefas */}
      <div
        data-rot="rotate(-2deg)"
        onMouseEnter={aoEntrar}
        onMouseLeave={aoSair}
        style={{
          ...vidro(0.85, 'rgba(20,184,166,0.18)'),
          ...inclinar('-2deg'),
          padding: '16px 18px',
        }}
      >
        <div className="flex items-center" style={{ gap: '8px', marginBottom: '10px' }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '8px',
              background: 'rgba(20,184,166,0.14)',
              color: cores.tealEscuro,
            }}
          >
            <Check className="h-3.5 w-3.5" />
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: cores.tealEscuro,
            }}
          >
            Ação sugerida
          </span>
        </div>
        <p
          style={{
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.45,
            color: cores.tinta,
            marginBottom: '10px',
          }}
        >
          Reforçar a equipe de cozinha no turno das 19h às 22h
        </p>
        <div className="flex items-center" style={{ gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: cores.corpoSuave,
              background: cores.superficieAlt,
              borderRadius: '999px',
              padding: '4px 9px',
            }}
          >
            Sugerida
          </span>
          <span style={{ fontSize: '10px', color: cores.corpoSuave }}>
            baseada em 14 feedbacks
          </span>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section id="topo" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Fundo: mesma receita do AuthLayout — orbs difusos sobre gradiente claro */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(160deg, #F5F9FF 0%, #EEF6FF 48%, #F0FBFF 100%)',
        }}
      />
      <div style={orbe('rgba(59,130,246,0.20)', 520, { top: '-160px', left: '-120px' })} />
      <div style={orbe('rgba(139,92,246,0.16)', 460, { top: '10%', right: '-140px' })} />
      <div style={orbe('rgba(20,184,166,0.14)', 380, { bottom: '-120px', left: '30%' })} />
      <div style={gridSutil} />

      <div
        className="relative mx-auto grid items-center lg:grid-cols-2"
        style={{
          maxWidth: '1180px',
          padding: 'clamp(48px, 7vw, 96px) 24px clamp(56px, 7vw, 88px)',
          gap: 'clamp(48px, 6vw, 72px)',
          zIndex: 10,
        }}
      >
        {/* ── Coluna de texto ── */}
        <div>
          <div
            className="inline-flex items-center"
            style={{
              gap: '7px',
              background: 'rgba(255,255,255,0.75)',
              border: `1px solid ${cores.borda}`,
              borderRadius: '999px',
              padding: '6px 13px',
              marginBottom: '22px',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: cores.violeta }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: cores.corpo }}>
              Feedback por WhatsApp + Inteligência Artificial
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(34px, 4.6vw, 54px)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: cores.tinta,
              marginBottom: '20px',
            }}
          >
            Cada mesa vira um insight.
            <br />
            <span style={textoGradiente}>Cada insight vira uma ação.</span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(15px, 1.3vw, 17px)',
              lineHeight: 1.65,
              color: cores.corpoSuave,
              maxWidth: '480px',
              marginBottom: '30px',
            }}
          >
            QR code na mesa, resposta pelo WhatsApp, análise por IA. Você descobre o que está
            travando seu restaurante enquanto ainda dá tempo de agir — não quando a avaliação
            negativa já está no Google.
          </p>

          <div className="flex flex-wrap items-center" style={{ gap: '12px', marginBottom: '22px' }}>
            <a
              href="#planos"
              className="inline-flex items-center justify-center"
              style={{
                height: '52px',
                padding: '0 28px',
                fontSize: '15px',
                fontWeight: 600,
                color: '#FFFFFF',
                backgroundColor: cores.azul,
                borderRadius: '12px',
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
              Assinar agora
            </a>

            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center"
              style={{
                height: '52px',
                padding: '0 24px',
                fontSize: '15px',
                fontWeight: 600,
                color: cores.corpo,
                background: 'rgba(255,255,255,0.7)',
                border: `1px solid ${cores.borda}`,
                borderRadius: '12px',
                textDecoration: 'none',
                transition: 'background-color 0.18s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FFFFFF')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
            >
              Ver como funciona
            </a>
          </div>

          <div
            className="flex flex-wrap items-center"
            style={{ gap: '8px 18px', fontSize: '13px', color: cores.corpoSuave }}
          >
            {[
              'Sem aplicativo para o cliente baixar',
              'Configuração em minutos',
              'Cancele quando quiser',
            ].map((t) => (
              <span key={t} className="inline-flex items-center" style={{ gap: '6px' }}>
                <Check className="h-3.5 w-3.5" style={{ color: cores.verde }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── Coluna da composição ── */}
        <div className="flex justify-center lg:justify-end">
          <Composicao />
        </div>
      </div>

      {/* A barra de rolagem é ocultada globalmente (ver main.css), então a página
          não dá pista de que continua. Esta seta devolve essa dica. */}
      <div
        className="relative hidden md:flex justify-center"
        style={{ zIndex: 10, paddingBottom: '28px' }}
      >
        <a
          href="#como-funciona"
          aria-label="Ver como funciona"
          className="flex items-center justify-center"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.8)',
            border: `1px solid ${cores.borda}`,
            color: cores.corpoSuave,
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}
