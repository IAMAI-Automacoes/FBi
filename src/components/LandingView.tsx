import { fundoCss, getTema } from '@/lib/qr-temas'
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
  // Duas apresentações possíveis, e elas pedem tratamentos opostos:
  //
  // FOTO (o dono subiu a própria imagem): a foto tem contraste imprevisível,
  // então entra o scrim escuro e o texto vai branco — é o que sempre foi.
  //
  // TEMA (cor sólida ou textura): o contraste é conhecido de antemão, e um
  // scrim escuro por cima de um creme claro só faria lama. Aqui não há scrim e
  // a tinta vem do próprio tema, que já sabe se é fundo claro ou escuro.
  const sobreFoto = modo === 'upload' && !!imagem
  const forte = sobreFoto ? '#ffffff' : tema.tinta
  const suave = sobreFoto ? 'rgba(255,255,255,0.9)' : tema.suave
  const tenue = sobreFoto ? 'rgba(255,255,255,0.7)' : tema.suave
  const waLink = whatsapp ? `https://wa.me/${whatsapp}` : null

  const botaoStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: '100%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    borderRadius: '16px',
    background: '#25D366',
    padding: '16px 24px',
    fontSize: '17px',
    fontWeight: 700,
    color: '#ffffff',
    textDecoration: 'none',
    boxShadow: '0 14px 34px -10px rgba(37,211,102,0.75)',
    border: '1px solid rgba(255,255,255,0.22)',
  }
  const Icone = <WhatsappIcon style={{ width: 22, height: 22 }} />
  // Sem número não há para onde mandar. O cliente não pode resolver isso, e
  // dizer "WhatsApp não configurado" o deixa achando que ele é que errou —
  // então a página só admite que a coleta está fora do ar.
  const Botao = !whatsapp ? (
    <p style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.5, color: suave }}>
      A coleta de feedback deste restaurante está temporariamente indisponível.
    </p>
  ) : preview || !waLink ? (
    <div style={botaoStyle}>{Icone} Dar meu feedback</div>
  ) : (
    <a href={waLink} style={botaoStyle}>{Icone} Dar meu feedback</a>
  )

  // O tamanho pedido ao gerador é o de uma tela de celular, e não o padrão do
  // selo da paleta: a textura cobre a tela inteira, e ampliar um selo pequeno
  // para ~800px de altura borra o material todo.
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: fundoCss(tema, 420, 760), fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {sobreFoto && (
        <>
          <img src={imagem!} alt="" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }} />
          {/* Scrim para leitura — só sobre foto */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.22))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 96, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0))' }} />
        </>
      )}

      {/* A COMPOSIÇÃO, e por que é esta.
          Quem abre acabou de comer, está sentado, com o celular numa mão e
          pressa. A página tem UMA decisão: mandar o feedback ou não. Então ela
          é lida de baixo pra cima, na ordem em que a pessoa precisa:

          1. o botão, na metade de baixo — onde o polegar alcança sem trocar a
             mão de posição;
          2. logo acima dele, o que vai acontecer ao tocar (abre o WhatsApp) —
             sem isso, quem hesita não toca;
          3. acima, o pedido do dono;
          4. e no alto do bloco, o nome do restaurante, que é o que responde
             "caí no lugar certo?".

          O crédito do produto sai do caminho e vai pro pé da tela: ele estava
          logo abaixo do botão, disputando a área mais nobre com a única ação
          que a página tem. */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'flex-end', padding: '56px 24px calc(64px + env(safe-area-inset-bottom, 0px))', color: forte }}>
        {/* Selo topo */}
        <div style={{ position: 'absolute', left: '50%', top: 24, transform: 'translateX(-50%)' }}>
          <span style={{ borderRadius: 999, background: sobreFoto ? 'rgba(255,255,255,0.12)' : 'rgba(127,127,127,0.13)', padding: '6px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: suave, border: `1px solid ${sobreFoto ? 'rgba(255,255,255,0.15)' : 'rgba(127,127,127,0.18)'}`, WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}>
            Sua opinião
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: tenue }}>Restaurante</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{restauranteNome}</h1>
          <p style={{ margin: '12px 0 0', maxWidth: '19rem', fontSize: 15, lineHeight: 1.5, color: suave }}>
            {mensagem?.trim() || 'É rapidinho! Conte como foi sua experiência com a gente.'}
          </p>

          {/* Mesma largura do texto acima: mais estreito que a frase, o botão
              lia como um detalhe dela em vez da ação da tela. */}
          <div style={{ marginTop: 26, width: '100%', maxWidth: '19rem' }}>{Botao}</div>

          {whatsapp && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.4, color: tenue }}>
              Abre o WhatsApp do restaurante
            </p>
          )}
        </div>
      </div>

      {/* Crédito do produto, no pé e fora do fluxo: presente pra quem procura,
          invisível pra quem só quer tocar no botão. */}
      <div style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: 0.75 }}>
        <span style={{ fontSize: 10.5, color: tenue }}>feito com</span>
        <span style={{ borderRadius: 5, background: 'rgba(255,255,255,0.95)', padding: '3px 6px', display: 'inline-flex', boxShadow: sobreFoto ? 'none' : '0 1px 3px rgba(0,0,0,0.12)' }}>
          <img src={easyFeedLogo} alt="Easy Feed" style={{ height: 13, width: 'auto', objectFit: 'contain', display: 'block' }} />
        </span>
      </div>
    </div>
  )
}
