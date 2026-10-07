import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { AlertTriangle, Lightbulb, Loader2 } from 'lucide-react'
import { AuthLayout, BrandMark } from '@/components/auth/AuthLayout'

/* As telas de entrada do EasyFeed Influencers usam a MESMA moldura, os mesmos
   campos e o mesmo botão do login dos restaurantes (AuthLayout,
   RecuperarSenha). Só muda o texto do painel da esquerda. */

export { authInputStyle, authInputFocus, authInputBlur } from '@/components/auth/AuthLayout'

/** Logo do EasyFeed com "Influencers" ao lado. */
export function MarcaInfluencers({ altura = 56 }: { altura?: number }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={altura} />
      <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#2563EB]">Influencers</span>
    </div>
  )
}

/* Mesmo botão do login (`primaryButtonStyle` de RecuperarSenha/Autenticacao). */
const estiloBotao = (desligado: boolean): CSSProperties => ({
  width: '100%', height: '52px', fontSize: '14px', fontWeight: 600, color: 'white',
  background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
  border: 'none', borderRadius: '12px',
  cursor: desligado ? 'not-allowed' : 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease, opacity 0.15s',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  opacity: desligado ? 0.6 : 1, marginTop: '4px',
  boxShadow: '0 4px 12px rgba(79,70,229,0.18)',
})

export function BotaoPrincipal({ carregando, children, disabled, ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  const desligado = !!disabled || !!carregando
  return (
    <button
      {...resto}
      disabled={desligado}
      style={estiloBotao(desligado)}
      onMouseEnter={(e) => {
        if (!e.currentTarget.disabled) {
          e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(79,70,229,0.25)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.18)'
      }}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/* Mesmo estilo do "Voltar para o login" da recuperação de senha. */
export function BotaoTexto({ children, ...resto }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...resto}
      className="text-[13px] font-medium text-[#64748B] transition-colors hover:text-[#0F172A] disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-[#1D4ED8]" />
    </div>
  )
}

export const rotuloCampo: CSSProperties = { fontSize: '13px', fontWeight: 500, color: '#374151' }

export function TituloEntrada({ titulo, subtitulo }: { titulo: string; subtitulo?: ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>{titulo}</h1>
      {subtitulo && <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>{subtitulo}</p>}
    </div>
  )
}

/* Mesmo aviso do "link expirou" da recuperação de senha. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(220,38,38,0.08)', color: '#B91C1C', fontSize: '13px', lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

/* Painel da esquerda: a mesma linguagem do login dos restaurantes (título com
   degradê, cartões de vidro inclinados), com o que tem do lado de dentro. Os
   números são de exemplo. */
const vidro: CSSProperties = {
  position: 'absolute',
  background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.9)', borderRadius: '18px',
  transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
}

const PILULAS_EXEMPLO = [
  { rotulo: 'Comida fria', n: 8 },
  { rotulo: 'Demora no atendimento', n: 5 },
  { rotulo: 'Banheiro sujo', n: 4 },
]

function VitrineInfluencers() {
  return (
    <>
      <div style={{ marginTop: '44px', maxWidth: '440px' }}>
        <h2 style={{ fontSize: '36px', fontWeight: 700, lineHeight: 1.13, color: '#0F172A', letterSpacing: '-0.025em', marginBottom: '16px' }}>
          O que os clientes de restaurante{' '}
          <span style={{ background: 'linear-gradient(95deg, #3B82F6 0%, #8B5CF6 55%, #14B8A6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            estão falando.
          </span>
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7 }}>
          Os temas, os números e as frases dos feedbacks reais, sem nome de restaurante nem de cliente, para virar conteúdo para donos de restaurante.
        </p>
      </div>

      <div style={{ position: 'relative', flex: 1, marginTop: '36px' }}>
        {/* Pontos de atenção, como na Visão Geral */}
        <div style={{ ...vidro, top: '20px', left: '8px', width: '330px', transform: 'rotate(-5deg)', padding: '18px', boxShadow: '0 24px 60px rgba(37,99,235,0.14), 0 2px 8px rgba(15,23,42,0.04)' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#DC2626', marginBottom: '12px' }}>Pontos de Atenção</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {PILULAS_EXEMPLO.map((p) => (
              <div key={p.rotulo} className="flex items-center gap-2.5 rounded-full bg-red-100 py-1.5 pl-2 pr-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                  <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{p.rotulo}</span>
                <span className="min-w-[26px] shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-center text-xs font-bold text-white">{p.n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ideia de pauta, no lugar do "Insight da IA" do login */}
        <div className="animate-pulse-soft" style={{ ...vidro, top: '0px', right: '14px', width: '258px', transform: 'rotate(4deg)', padding: '16px 18px', borderRadius: '16px', boxShadow: '0 20px 48px rgba(139,92,246,0.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Lightbulb className="h-3.5 w-3.5" />
            </div>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8B5CF6' }}>Ideia de pauta</span>
          </div>
          <p style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.55 }}>
            "<strong style={{ color: '#0F172A' }}>Comida fria</strong>: a reclamação que mais aparece e como resolver"
          </p>
        </div>

        <div style={{ ...vidro, top: '236px', right: '40px', transform: 'rotate(-3deg)', padding: '13px 16px', borderRadius: '14px', boxShadow: '0 16px 40px rgba(20,184,166,0.16)', display: 'flex', alignItems: 'center', gap: '11px' }}>
          <div style={{ position: 'relative', width: '8px', height: '8px' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#14B8A6' }} />
            <span style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', backgroundColor: 'rgba(20,184,166,0.3)' }} className="animate-ping" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', lineHeight: 1.1 }}>Tudo anônimo</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Sem nome de restaurante nem de cliente</div>
          </div>
        </div>
      </div>
    </>
  )
}

/** Entrada, criar senha e boas-vindas: a moldura do login, com a marca no topo do cartão. */
export function LayoutEntrada({ children }: { children: ReactNode }) {
  return (
    <AuthLayout vitrine={<VitrineInfluencers />}>
      <div style={{ marginBottom: '24px' }}>
        <MarcaInfluencers />
      </div>
      {children}
    </AuthLayout>
  )
}
