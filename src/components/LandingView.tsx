import { getTema } from '@/lib/qr-temas'
import { WhatsappIcon } from '@/components/WhatsappIcon'
import { easyFeedLogo } from '@/assets/brand'

export interface LandingViewProps {
  restauranteNome: string
  garcomNome?: string | null // recebido mas NÃO exibido (QR de garçom = igual ao comum)
  modo: string
  imagem?: string | null
  estilo: string
  filtro?: string // legado — ignorado
  mensagem?: string | null
  whatsapp?: string | null
  preview?: boolean // no preview o botão não navega
}

// Estilos inline (sem Tailwind) de propósito: assim a LandingView funciona tanto
// no painel (preview) quanto na entrada leve `f.html` — que NÃO carrega o CSS do
// app — mantendo a página que o cliente abre pequena e rápida.
export function LandingView({
  restauranteNome, modo, imagem, estilo, mensagem, whatsapp, preview,
}: LandingViewProps) {
  const tema = getTema(estilo)
  // Foto de fundo: imagem própria (upload) ou a foto do tema escolhido.
  const fundo = modo === 'upload' && imagem ? imagem : tema.foto
  const waLink = whatsapp ? `https://wa.me/${whatsapp}` : null

  const botaoStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    borderRadius: '16px',
    background: '#25D366',
    padding: '15px 24px',
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    textDecoration: 'none',
    boxShadow: '0 14px 34px -10px rgba(37,211,102,0.75)',
    border: '1px solid rgba(255,255,255,0.22)',
  }
  const Icone = <WhatsappIcon style={{ width: 22, height: 22 }} />
  const Botao = !whatsapp ? (
    <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>WhatsApp ainda não configurado.</p>
  ) : preview || !waLink ? (
    <div style={botaoStyle}>{Icone} Dar meu feedback</div>
  ) : (
    <a href={waLink} style={botaoStyle}>{Icone} Dar meu feedback</a>
  )

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: '#171717', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {/* Foto de fundo */}
      <img src={fundo} alt="" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }} />
      {/* Scrim para leitura */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.22))' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 96, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0))' }} />

      <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'flex-end', padding: '56px 24px 32px', color: '#fff' }}>
        {/* Selo topo */}
        <div style={{ position: 'absolute', left: '50%', top: 24, transform: 'translateX(-50%)' }}>
          <span style={{ borderRadius: 999, background: 'rgba(255,255,255,0.12)', padding: '6px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.15)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}>
            Sua opinião
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)' }}>Restaurante</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{restauranteNome}</h1>
          <p style={{ margin: '12px 0 0', maxWidth: '19rem', fontSize: 15, lineHeight: 1.5, color: 'rgba(255,255,255,0.9)' }}>
            {mensagem?.trim() || 'É rapidinho! Conte como foi sua experiência com a gente.'}
          </p>

          <div style={{ marginTop: 24, width: '100%', maxWidth: '18rem' }}>{Botao}</div>

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>feito com</span>
            <span style={{ borderRadius: 6, background: 'rgba(255,255,255,0.95)', padding: '4px 8px', display: 'inline-flex' }}>
              <img src={easyFeedLogo} alt="Easy Feed" style={{ height: 16, width: 'auto', objectFit: 'contain', display: 'block' }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
