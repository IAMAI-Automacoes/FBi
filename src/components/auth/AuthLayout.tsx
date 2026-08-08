import { ReactNode } from 'react'
import { TrendingUp, Star, Brain, ArrowUpRight } from 'lucide-react'
import { easyFeedLogo } from '@/assets/brand'

/* ───────────── Marca ─────────────
   Logo completa do Easy Feed (ícone + nome). `size` é a ALTURA; a largura
   acompanha. Como a logo já traz o nome, quem a usa não repete o texto ao lado. */
export function BrandMark({ size = 72 }: { size?: number }) {
  return (
    <img src={easyFeedLogo} alt="Easy Feed" style={{ height: size, width: 'auto', display: 'block' }} />
  )
}

/* ───────────── Ícone WhatsApp ───────────── */
export function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  )
}

/* ───────── Estilos de input compartilhados ───────── */
export const authInputStyle: React.CSSProperties = {
  width: '100%',
  height: '52px',
  padding: '0 16px',
  fontSize: '14px',
  backgroundColor: '#F8FAFC',
  border: '1.5px solid #E9EEF5',
  borderRadius: '12px',
  color: '#0F172A',
  outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.025)',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease',
}

export function authInputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = '#2563EB'
  e.target.style.backgroundColor = '#FFFFFF'
  e.target.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.10)'
}

export function authInputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = '#E9EEF5'
  e.target.style.backgroundColor = '#F8FAFC'
  e.target.style.boxShadow = 'inset 0 1px 2px rgba(15,23,42,0.025)'
}

/* ───────── Painel esquerdo (showcase) ───────── */
function ShowcasePanel() {
  const cardHoverIn = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.style.transform = `${el.dataset.rot || ''} translateY(-4px)`
  }
  const cardHoverOut = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.style.transform = `${el.dataset.rot || ''}`
  }

  return (
    <div
      className="hidden lg:block"
      style={{
        width: '54%',
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #F5F9FF 0%, #EEF6FF 50%, #F0FBFF 100%)',
        flexShrink: 0,
      }}
    >
      {/* blur orbs */}
      <div style={{ position: 'absolute', top: '-100px', left: '-60px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 65%)', filter: 'blur(20px)' }} />
      <div style={{ position: 'absolute', bottom: '-120px', right: '-40px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 65%)', filter: 'blur(20px)' }} />
      <div style={{ position: 'absolute', top: '45%', left: '30%', width: '360px', height: '360px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,184,166,0.13) 0%, transparent 65%)', filter: 'blur(24px)' }} />

      <div style={{ position: 'relative', zIndex: 10, height: '100vh', display: 'flex', flexDirection: 'column', padding: '48px 52px' }}>

        {/* Marca topo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BrandMark size={68} />
        </div>

        {/* Headline */}
        <div style={{ marginTop: '44px', maxWidth: '440px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 700, lineHeight: 1.13, color: '#0F172A', letterSpacing: '-0.025em', marginBottom: '16px' }}>
            Inteligência operacional para{' '}
            <span style={{ background: 'linear-gradient(95deg, #3B82F6 0%, #8B5CF6 55%, #14B8A6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              restaurantes que crescem.
            </span>
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7 }}>
            Cada feedback do WhatsApp vira decisão. A IA lê, classifica e sugere ações antes que um cliente insatisfeito vire uma avaliação negativa.
          </p>
        </div>

        {/* composição flutuante */}
        <div style={{ position: 'relative', flex: 1, marginTop: '36px' }}>

          {/* Mockup principal inclinado */}
          <div
            data-rot="rotate(-6deg)"
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
            style={{
              position: 'absolute', top: '20px', left: '8px', width: '340px',
              transform: 'rotate(-6deg)',
              background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.9)', borderRadius: '18px',
              boxShadow: '0 24px 60px rgba(37,99,235,0.14), 0 2px 8px rgba(15,23,42,0.04)',
              padding: '20px', transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Satisfação · 7 dias</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 700, color: '#16A34A' }}>
                <ArrowUpRight className="h-3 w-3" /> +12%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '7px', height: '72px' }}>
              {[40, 55, 48, 68, 60, 82, 95].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 2px 2px', background: i === 6 ? 'linear-gradient(180deg, #3B82F6, #14B8A6)' : 'linear-gradient(180deg, #BFDBFE, #DBEAFE)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <span style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>4.8</span>
              <div style={{ display: 'flex', gap: '1px', color: '#F59E0B' }}>
                {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3 w-3" fill="currentColor" />)}
              </div>
            </div>
          </div>

          {/* Card insight IA — pulsação suave */}
          <div
            data-rot="rotate(4deg)"
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
            className="animate-pulse-soft"
            style={{
              position: 'absolute', top: '0px', right: '14px', width: '264px',
              transform: 'rotate(4deg)',
              background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.9)', borderRadius: '16px',
              boxShadow: '0 20px 48px rgba(139,92,246,0.14)', padding: '16px 18px',
              transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <Brain className="h-3.5 w-3.5" />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8B5CF6' }}>
                Insight da IA
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.55 }}>
              "Aumento de reclamações sobre <strong style={{ color: '#0F172A' }}>tempo de espera</strong> no jantar — sugerir reforço no turno."
            </p>
          </div>

          {/* Pílula 12 min */}
          <div
            data-rot="rotate(-3deg)"
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
            style={{
              position: 'absolute', top: '188px', right: '54px',
              transform: 'rotate(-3deg)',
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.9)', borderRadius: '14px',
              boxShadow: '0 16px 40px rgba(20,184,166,0.16)', padding: '13px 16px',
              display: 'flex', alignItems: 'center', gap: '11px',
              transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(20,184,166,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D9488' }}>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>12 min</div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Tempo médio de resposta</div>
            </div>
          </div>

          {/* Pílula 12.845 */}
          <div
            data-rot="rotate(3deg)"
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
            style={{
              position: 'absolute', top: '264px', left: '40px',
              transform: 'rotate(3deg)',
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.9)', borderRadius: '14px',
              boxShadow: '0 16px 40px rgba(37,99,235,0.14)', padding: '13px 16px',
              display: 'flex', alignItems: 'center', gap: '11px',
              transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{ position: 'relative', width: '8px', height: '8px' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#14B8A6' }} />
              <span style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', backgroundColor: 'rgba(20,184,166,0.3)' }} className="animate-ping" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>12.845</div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Feedbacks analisados por IA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── Layout compartilhado das telas de auth ───────── */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#FFFFFF' }}>
      <ShowcasePanel />

      {/* ─── PAINEL DIREITO ─── */}
      <div className="flex-1 flex items-center justify-center" style={{ position: 'relative', padding: '32px 24px', background: 'linear-gradient(155deg, #EAF1FF 0%, #F0F4FF 40%, #EAF7FB 100%)', overflow: 'hidden' }}>

        {/* Blur orbs ambientais */}
        <div style={{ position: 'absolute', top: '-80px', right: '-60px', width: '380px', height: '380px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.20) 0%, transparent 65%)', filter: 'blur(28px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-70px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.16) 0%, transparent 65%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '12%', left: '8%', width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,184,166,0.14) 0%, transparent 68%)', filter: 'blur(26px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '14%', right: '6%', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 68%)', filter: 'blur(24px)', pointerEvents: 'none' }} />

        {/* Grid translúcido sutil */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(circle at 50% 45%, black 0%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black 0%, transparent 78%)' }} />

        {/* Wrapper do formulário com halo de destaque */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '420px' }}>
          {/* Halo gradiente difuso atrás do card */}
          <div style={{ position: 'absolute', inset: '-30px', borderRadius: '44px', background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, rgba(139,92,246,0.09) 45%, transparent 72%)', filter: 'blur(22px)', pointerEvents: 'none' }} />

          {/* Superfície branca de destaque */}
          <div
            className="w-full"
            style={{
              position: 'relative',
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.9)',
              borderRadius: '24px',
              padding: '40px',
              boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 30px 70px rgba(37,99,235,0.16), 0 12px 28px rgba(15,23,42,0.08), 0 0 0 1px rgba(37,99,235,0.06)',
            }}
          >
            <div style={{ maxWidth: '340px', margin: '0 auto' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
