import { fundoCss, getTema } from '@/lib/qr-temas'
import { CamadaDeElementos, type CaixaDoElemento } from '@/components/CamadaDeElementos'
import { useLayoutEffect, useRef, useState } from 'react'
import { fonteCss, type ElementoCartaz, type EstilosDosTextos } from '@/lib/cartaz-elementos'
import { BASE_CLIENTE } from '@/components/CamadaDeElementos'
import { WhatsappIcon } from '@/components/WhatsappIcon'
import { easyFeedLogo } from '@/assets/brand'

/**
 * Os textos da página que o dono pode reescrever.
 *
 * Tudo o que aparece na tela é dele, menos o crédito do produto — esse é a
 * marca do Easy Feed no material do cliente, e se coubesse aqui bastaria
 * apagar o campo para sumir.
 */
export const TEXTOS_DA_PAGINA = ['rotulo', 'nome', 'mensagem', 'botao', 'dica'] as const
export type TextoDaPagina = (typeof TEXTOS_DA_PAGINA)[number]
export type TextosDaPagina = Partial<Record<TextoDaPagina, string>>

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
  /** Textos e imagens que o dono posicionou sobre a página. */
  elementos?: ElementoCartaz[]
  /** O que o dono reescreveu nos textos da própria página. */
  textos?: TextosDaPagina
  /** Tipografia escolhida para esses textos, por id. */
  estilosDosTextos?: EstilosDosTextos
  /** Texto em edição: medido, mas não pintado (o editor o mostra). */
  editandoId?: string | null
  /** Onde cada elemento ficou. Só o editor usa. */
  onCaixas?: (caixas: CaixaDoElemento[]) => void
}

// Estilos inline (sem Tailwind) de propósito: assim a LandingView funciona tanto
// no painel (preview) quanto na entrada leve `f.html` — que NÃO carrega o CSS do
// app — mantendo a página que o cliente abre pequena e rápida.
export function LandingView({
  restauranteNome, modo, imagem, estilo, mensagem, whatsapp, preview,
  elementos, textos, estilosDosTextos, editandoId, onCaixas,
}: LandingViewProps) {
  const tema = getTema(estilo)

  /**
   * Quanto a tela atual é maior ou menor que a régua do editor.
   *
   * Sem isto, o corpo escolhido na prévia ia em PIXEL para o celular do
   * cliente: um nome com 43px ocupava quase a largura toda na prévia (294px de
   * largura) e sobrava folga num telefone de 390px — a página que chegava não
   * era a que o dono aprovou. Os elementos livres já faziam esta conta; os
   * textos da própria página passaram a fazer também.
   */
  const raizRef = useRef<HTMLDivElement>(null)
  const [tela, setTela] = useState({ w: BASE_CLIENTE, h: BASE_CLIENTE * 2 })
  useLayoutEffect(() => {
    const no = raizRef.current
    if (!no) return
    const ler = () => setTela({
      w: no.clientWidth || BASE_CLIENTE,
      h: no.clientHeight || BASE_CLIENTE * 2,
    })
    ler()
    const obs = new ResizeObserver(ler)
    obs.observe(no)
    return () => obs.disconnect()
  }, [])
  const larguraTela = tela.w
  const escalaTela = larguraTela / BASE_CLIENTE

  /**
   * As faixas de cima e de baixo saem da ALTURA, em pixel calculado.
   *
   * Não dá pra usar porcentagem aqui: `padding-top`/`bottom` em % contam a
   * LARGURA do contentor, não a altura. Escrito como "17%", o vão de baixo
   * virava 50px numa tela de 638 de altura — e o conteúdo descia por cima do
   * crédito no pé. Calculado assim, continua proporcional (a prévia e o
   * celular do cliente mostram a mesma coisa) e agora proporcional ao eixo
   * certo.
   */
  const vaoDeCima = Math.round(tela.h * 0.075)
  const vaoDeBaixo = Math.round(tela.h * 0.155)
  const alturaDoCredito = Math.round(tela.h * 0.028)
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

  /** O texto que vale: o que o dono escreveu, ou o padrão. */
  const txt = (id: TextoDaPagina, padrao: string) => {
    const escolhido = textos?.[id]
    // String vazia é escolha ("não quero esta linha"), não falta de
    // configuração — por isso o teste é de nulidade.
    return escolhido != null ? escolhido : padrao
  }

  /**
   * A tipografia que o dono mexeu, por cima do padrão daquele texto — e, se
   * ele arrastou, a posição também.
   *
   * ARRASTAR TIRA O TEXTO DO FLUXO. Enquanto ninguém mexe, quem empilha
   * rótulo, nome, pedido e botão é o layout, que se ajusta a qualquer tela.
   * A partir do momento em que o dono põe um deles num lugar escolhido, esse
   * lugar passa a valer — em fração, não em pixel, pra sobreviver à diferença
   * de tamanho entre a prévia e o celular de quem escaneia.
   */
  const est = (id: TextoDaPagina, base: React.CSSProperties, soTipografia = false): React.CSSProperties => {
    const e = estilosDosTextos?.[id]
    if (!e) return base
    if (soTipografia) {
      return {
        ...base,
        fontFamily: e.fonte ? fonteCss(e.fonte) : base.fontFamily,
        fontSize: e.tamanho != null ? e.tamanho * escalaTela : base.fontSize,
        fontWeight: e.negrito != null ? (e.negrito ? 700 : 400) : base.fontWeight,
        fontStyle: e.italico != null ? (e.italico ? 'italic' : 'normal') : base.fontStyle,
        color: e.cor ?? base.color,
      }
    }
    const solto = e.x != null && e.y != null
    const esticou = (e.esticarX ?? 1) !== 1 || (e.esticarY ?? 1) !== 1
    return {
      ...base,
      fontFamily: e.fonte ? fonteCss(e.fonte) : base.fontFamily,
      fontSize: e.tamanho != null ? e.tamanho * escalaTela : base.fontSize,
      fontWeight: e.negrito != null ? (e.negrito ? 700 : 400) : base.fontWeight,
      fontStyle: e.italico != null ? (e.italico ? 'italic' : 'normal') : base.fontStyle,
      color: e.cor ?? base.color,
      ...(solto ? {
        position: 'absolute' as const,
        left: `${e.x! * 100}%`,
        top: `${e.y! * 100}%`,
        margin: 0,
        zIndex: 12,
        transform: `translate(-50%, -50%)${esticou ? ` scale(${e.esticarX ?? 1}, ${e.esticarY ?? 1})` : ''}`,
      } : esticou ? {
        transform: `scale(${e.esticarX ?? 1}, ${e.esticarY ?? 1})`,
      } : {}),
    }
  }

  /** Um texto arrastado sai do empilhamento e é posicionado sozinho. */
  const solto = (id: TextoDaPagina) => {
    const e = estilosDosTextos?.[id]
    return e?.x != null && e?.y != null
  }

  const oculto = (id: TextoDaPagina) => !txt(id, 'x').trim()

  /**
   * O texto que está sendo editado some do desenho — quem o mostra é o campo
   * de edição, exatamente por cima.
   *
   * Sem isto os dois apareciam ao mesmo tempo: o original ficava atrás,
   * fraquinho, na posição em que estava, e o campo por cima. Dava a impressão
   * de que a letra tinha subido um pouco ao ser selecionada, quando na verdade
   * eram duas letras. `visibility` e não `display`: o nó continua ocupando o
   * lugar, e é dele que sai a medida do alvo de clique.
   */
  const escondido = (id: TextoDaPagina): React.CSSProperties =>
    editandoId === id ? { visibility: 'hidden' } : {}

  const botaoStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: '100%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '9px',
    borderRadius: '16px',
    background: '#25D366',
    // Folga lateral menor e sem quebra: com 24px de cada lado, "Dar meu
    // feedback" não cabia numa linha num telefone estreito e o botão crescia
    // pra duas, empurrando o conteúdo por baixo do crédito no pé da tela.
    padding: '16px 14px',
    whiteSpace: 'nowrap' as const,
    fontSize: '17px',
    fontWeight: 700,
    color: '#ffffff',
    textDecoration: 'none',
    boxShadow: '0 14px 34px -10px rgba(37,211,102,0.75)',
    border: '1px solid rgba(255,255,255,0.22)',
  }
  const rotuloBotao = txt('botao', 'Dar meu feedback')
  const Icone = <WhatsappIcon style={{ width: 22, height: 22 }} />
  // Sem número não há para onde mandar. O cliente não pode resolver isso, e
  // dizer "WhatsApp não configurado" o deixa achando que ele é que errou —
  // então a página só admite que a coleta está fora do ar.
  const Botao = !whatsapp ? (
    <p style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.5, color: suave }}>
      A coleta de feedback deste restaurante está temporariamente indisponível.
    </p>
  ) : preview || !waLink ? (
    <div data-texto="botao" style={{ ...est('botao', botaoStyle, true), ...escondido('botao') }}>{Icone} {rotuloBotao}</div>
  ) : (
    <a data-texto="botao" href={waLink} style={{ ...est('botao', botaoStyle, true), ...escondido('botao') }}>{Icone} {rotuloBotao}</a>
  )

  // O tamanho pedido ao gerador é o de uma tela de celular, e não o padrão do
  // selo da paleta: a textura cobre a tela inteira, e ampliar um selo pequeno
  // para ~800px de altura borra o material todo.
  return (
    <div ref={raizRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: fundoCss(tema, 420, 760), fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {sobreFoto && (
        <>
          <img src={imagem!} alt="" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }} />
          {/* Scrim para leitura — só sobre foto */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.22))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 96, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0))' }} />
        </>
      )}

      {/* O que o dono acrescentou. Vai atrás do conteúdo fixo de propósito: o
          botão é a única ação da página, e um elemento livre por cima dele
          transformaria uma decoração num bloqueio. */}
      {elementos && elementos.length > 0 && (
        <CamadaDeElementos elementos={elementos} tinta={forte} editandoId={editandoId} onCaixas={onCaixas} />
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
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'flex-end', padding: `${vaoDeCima}px 7% calc(${vaoDeBaixo}px + env(safe-area-inset-bottom, 0px))`, color: forte }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {!oculto('rotulo') && (
            <p data-texto="rotulo" style={{ ...est('rotulo', { margin: 0, fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.2em', color: tenue }), ...escondido('rotulo') }}>
              {txt('rotulo', 'Restaurante')}
            </p>
          )}
          {!oculto('nome') && (
            <h1 data-texto="nome" style={{ ...est('nome', { margin: '4px 0 0', fontSize: 30, fontWeight: 700, lineHeight: 1.15 }), ...escondido('nome') }}>
              {txt('nome', restauranteNome)}
            </h1>
          )}
          {!oculto('mensagem') && (
            <p data-texto="mensagem" style={{ ...est('mensagem', { margin: '12px 0 0', maxWidth: '82%', fontSize: 15, lineHeight: 1.5, color: suave }), ...escondido('mensagem') }}>
              {txt('mensagem', mensagem?.trim() || 'É rapidinho! Conte como foi sua experiência com a gente.')}
            </p>
          )}

          {/* Mesma largura do texto acima: mais estreito que a frase, o botão
              lia como um detalhe dela em vez da ação da tela. */}
          <div style={solto('botao')
            ? { position: 'absolute', left: `${estilosDosTextos!.botao!.x! * 100}%`, top: `${estilosDosTextos!.botao!.y! * 100}%`, transform: 'translate(-50%, -50%)', width: '82%', maxWidth: '22rem', zIndex: 12 }
            : { marginTop: '4%', width: '82%', maxWidth: '22rem' }}>{Botao}</div>

          {whatsapp && !oculto('dica') && (
            <p data-texto="dica" style={{ ...est('dica', { margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.4, color: tenue }), ...escondido('dica') }}>
              {txt('dica', 'Abre o WhatsApp do restaurante')}
            </p>
          )}
        </div>
      </div>

      {/* Crédito do produto, no pé, fora do fluxo e ACIMA DE TUDO.
          É a única coisa da tela que o dono não reescreve — a marca do produto
          no material do cliente —, e o z-index alto é o que faz essa regra
          valer de verdade: sem ele bastava arrastar uma imagem da cor do fundo
          por cima pra a página chegar no celular do cliente sem marca nenhuma,
          sem nem parecer que algo tinha sido apagado. Tudo o que o dono põe na
          página fica abaixo desta camada.
          Ficou maior do que era: com 13px o lockup virava um borrão verde em
          que não dava pra ler "Easy Feed". */}
      <div style={{ position: 'absolute', zIndex: 900, left: 0, right: 0, bottom: `calc(${alturaDoCredito}px + env(safe-area-inset-bottom, 0px))`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
        <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: tenue, opacity: 0.85 }}>feito com</span>
        {/* A chapinha branca FICA. A marca é verde-escuro com um raio laranja,
            e sobre madeira escura ou uma foto com scrim ela simplesmente some —
            e um crédito que não se lê não credita ninguém. O branco é o que faz
            a mesma logo funcionar em cima de qualquer fundo que o dono escolha.
            Cresceu mais que o "feito com" de propósito: quem tem que ser lido
            ali é o nome do produto, não a preposição. */}
        <span style={{ borderRadius: 10, background: '#ffffff', padding: '7px 14px', display: 'inline-flex', boxShadow: '0 3px 12px rgba(0,0,0,0.18)' }}>
          <img src={easyFeedLogo} alt="Easy Feed" style={{ height: 30, width: 'auto', objectFit: 'contain', display: 'block' }} />
        </span>
      </div>
    </div>
  )
}
