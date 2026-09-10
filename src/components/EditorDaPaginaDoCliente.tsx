/**
 * O editor da página do cliente: as mesmas ferramentas do cartaz, sobre o
 * celular da prévia.
 *
 * Reaproveita três coisas do passo A de propósito, e não por economia: as
 * `Alcas` (mesmo desenho e mesmas regras de quando somem), a matemática de
 * `redimensionar-cartaz` (testada fora da tela) e a `BarraElemento` (mesmas 50
 * fontes, mesma transparência). Quem aprendeu a mexer no cartaz já sabe mexer
 * aqui — e uma segunda implementação das mesmas regras divergiria da primeira
 * no primeiro ajuste.
 *
 * A diferença real está em COMO o elemento é medido. No cartaz o desenho é um
 * canvas e as caixas saem de uma conta paralela; aqui cada elemento é um nó do
 * DOM, então a caixa é lida dele mesmo (ver `CamadaDeElementos`).
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Plus, RotateCw, Type, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alcas } from '@/components/AlcasElemento'
import { BarraElemento } from '@/components/EditorCartaz'
import { LandingView, TEXTOS_DA_PAGINA, type TextoDaPagina, type TextosDaPagina } from '@/components/LandingView'
import { SeletorCor } from '@/components/SeletorCor'
import { ehCorPersonalizada } from '@/lib/qr-temas'
import type { CaixaDoElemento } from '@/components/CamadaDeElementos'
import { novoTexto, novaLogo, type ElementoCartaz, type EstilosDosTextos } from '@/lib/cartaz-elementos'
import { redimensionar as calcularRedimensionamento, type Ancora } from '@/lib/redimensionar-cartaz'

/** Folga do quadro de seleção. Texto ganha; imagem não — a borda é a figura. */
const FOLGA_TEXTO = 6

/** Como cada texto da página se chama pra quem está editando. */
const ROTULO_DO_TEXTO: Record<TextoDaPagina, string> = {
  rotulo: 'a palavra acima do nome',
  nome: 'o nome do restaurante',
  mensagem: 'o pedido ao cliente',
  botao: 'o texto do botão',
  dica: 'a linha abaixo do botão',
}

/** O aparelho fica centrado na coluna, com a proporção de um telefone atual. */
const LARGURA_APARELHO = Math.round(638 * (9 / 19.5)) + 20

interface Props {
  elementos: ElementoCartaz[]
  onChange: (els: ElementoCartaz[]) => void
  onSubirImagem: (arquivo: File) => Promise<string | null>
  enviandoImagem?: boolean
  /** Tudo o que a página do cliente precisa pra se desenhar de verdade. */
  restauranteNome: string
  mensagem: string | null
  whatsapp: string | null
  modo: 'upload' | 'estilo'
  imagem: string | null
  estilo: string
  /** Trocar o fundo por uma cor livre, sem sair da prévia. */
  onEstiloChange: (id: string) => void
  /** Largura da COLUNA. O aparelho tem a sua, centrado nela. */
  largura: number
  altura: number
  /** Os textos da própria página e a tipografia deles. */
  textos: TextosDaPagina
  onTextosChange: (t: TextosDaPagina) => void
  estilosDosTextos: EstilosDosTextos
  onEstilosChange: (e: EstilosDosTextos) => void
}

export function EditorDaPaginaDoCliente({
  elementos, onChange, onSubirImagem, enviandoImagem,
  restauranteNome, mensagem, whatsapp, modo, imagem, estilo, onEstiloChange, largura, altura,
  textos, onTextosChange, estilosDosTextos, onEstilosChange,
}: Props) {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [textoSelecionado, setTextoSelecionado] = useState<TextoDaPagina | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [caixas, setCaixas] = useState<CaixaDoElemento[]>([])
  const camadaRef = useRef<HTMLDivElement>(null)

  // `onCaixas` entra num efeito lá dentro: uma função nova a cada render
  // faria o efeito rodar em laço.
  const receberCaixas = useCallback((c: CaixaDoElemento[]) => setCaixas(c), [])

  /**
   * Onde caíram os textos da PRÓPRIA página (nome, mensagem, botão…).
   *
   * Diferente dos elementos livres, eles não têm posição guardada: quem os
   * põe no lugar é o layout da página, que é responsivo de propósito — o
   * celular do cliente não tem o tamanho da prévia. Então o alvo de clique é
   * medido do DOM depois de cada pintura.
   */
  const [caixasDeTexto, setCaixasDeTexto] = useState<{ id: TextoDaPagina; x: number; y: number; w: number; h: number }[]>([])
  const paginaRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const raiz = paginaRef.current
    if (!raiz) return
    const medir = () => {
      const base = raiz.getBoundingClientRect()
      const achadas: typeof caixasDeTexto = []
      for (const id of TEXTOS_DA_PAGINA) {
        const no = raiz.querySelector<HTMLElement>(`[data-texto="${id}"]`)
        if (!no) continue
        const r = no.getBoundingClientRect()
        achadas.push({ id, x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height })
      }
      setCaixasDeTexto(achadas)
    }
    medir()
    // As fontes chegam depois do primeiro layout e mudam a largura do texto:
    // sem observar, o alvo de clique fica do tamanho da fonte de reserva.
    const obs = new ResizeObserver(medir)
    obs.observe(raiz)
    return () => obs.disconnect()
  }, [textos, estilosDosTextos, restauranteNome, mensagem, whatsapp, modo, imagem, estilo, editandoId])

  /** Um texto da página, vestido de elemento pra caber na mesma barra. */
  const comoElemento = (id: TextoDaPagina): ElementoCartaz => {
    const e = estilosDosTextos[id] ?? {}
    return {
      id, tipo: 'texto',
      x: 0.5, y: 0.5,
      texto: textos[id] ?? '',
      fonte: e.fonte ?? 'inter',
      tamanho: e.tamanho ?? 16,
      negrito: e.negrito ?? false,
      italico: e.italico ?? false,
      cor: e.cor ?? null,
      esticarX: 1, esticarY: 1,
      url: null, escala: 0.3, escalaY: null,
      recorte: { x: 0, y: 0, w: 1, h: 1 }, rotacao: 0, opacidade: 1,
    }
  }

  /**
   * Arrastar um texto da própria página.
   *
   * A posição vai pro estilo daquele texto, em fração — e é ela que faz a
   * `LandingView` tirá-lo do empilhamento. Enquanto ninguém arrasta, o layout
   * continua mandando, que é o que mantém a página funcionando em telas de
   * tamanhos diferentes.
   */
  const arrastarTexto = (id: TextoDaPagina) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setTextoSelecionado(id)
    setSelecionado(null)

    const camada = camadaRef.current
    const caixa = caixasDeTexto.find((c) => c.id === id)
    if (!camada || !caixa) return

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    try { alvo.setPointerCapture(e.pointerId) } catch { /* ponteiro sintético */ }

    // Sem posição guardada, ele parte de onde o layout o deixou.
    const atual = estilosDosTextos[id] ?? {}
    const partida = {
      x: atual.x ?? (caixa.x + caixa.w / 2) / area.width,
      y: atual.y ?? (caixa.y + caixa.h / 2) / area.height,
    }
    const inicio = { px: e.clientX, py: e.clientY }

    const mover = (ev: PointerEvent) => {
      onEstilosChange({
        ...estilosDosTextos,
        [id]: {
          ...atual,
          x: Math.min(1, Math.max(0, partida.x + (ev.clientX - inicio.px) / area.width)),
          y: Math.min(1, Math.max(0, partida.y + (ev.clientY - inicio.py) / area.height)),
        },
      })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /** Puxar as alças de um texto da página: canto muda o corpo, lado estica. */
  const redimensionarTexto = (id: string, ancora: Ancora) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const alvoTexto = id as TextoDaPagina
    setTextoSelecionado(alvoTexto)
    setSelecionado(null)

    const camada = camadaRef.current
    const caixa = caixasDeTexto.find((c) => c.id === alvoTexto)
    if (!camada || !caixa) return

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    try { alvo.setPointerCapture(e.pointerId) } catch { /* ponteiro sintético */ }

    const atual = estilosDosTextos[alvoTexto] ?? {}
    const no = paginaRef.current?.querySelector<HTMLElement>(`[data-texto="${alvoTexto}"]`)
    const corpoAtual = atual.tamanho ?? (no ? parseFloat(getComputedStyle(no).fontSize) : 16)
    const inicio = {
      px: e.clientX, py: e.clientY,
      w: caixa.w, h: caixa.h,
      tamanho: corpoAtual,
      esticarX: atual.esticarX ?? 1,
      esticarY: atual.esticarY ?? 1,
      escala: 0.3, escalaY: null,
      recorte: { x: 0, y: 0, w: 1, h: 1 },
    }
    const partida = {
      x: atual.x ?? (caixa.x + caixa.w / 2) / area.width,
      y: atual.y ?? (caixa.y + caixa.h / 2) / area.height,
    }
    const oeste = ancora.includes('o')
    const norte = ancora.includes('n')
    const leste = ancora === 'l' || ancora.includes('e')
    const sul = ancora.includes('s')

    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - inicio.px) * (oeste ? -1 : 1)
      const dy = (ev.clientY - inicio.py) * (norte ? -1 : 1)
      const { fatorW, fatorH, ...campos } = calcularRedimensionamento('texto', ancora, inicio, dx, dy)
      // A borda oposta fica parada: a origem anda metade do que a caixa cresceu.
      const desX = leste ? 0.5 * inicio.w * (fatorW - 1) : oeste ? -0.5 * inicio.w * (fatorW - 1) : 0
      const desY = sul ? 0.5 * inicio.h * (fatorH - 1) : norte ? -0.5 * inicio.h * (fatorH - 1) : 0
      onEstilosChange({
        ...estilosDosTextos,
        [alvoTexto]: {
          ...atual,
          ...campos,
          x: partida.x + desX / area.width,
          y: partida.y + desY / area.height,
        },
      })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  const alterarTextoDaPagina = (id: string, campos: Partial<ElementoCartaz>) => {
    if ('texto' in campos && typeof campos.texto === 'string') {
      onTextosChange({ ...textos, [id]: campos.texto })
    }
    const estilo: Record<string, unknown> = { ...(estilosDosTextos[id] ?? {}) }
    if (campos.fonte !== undefined) estilo.fonte = campos.fonte
    if (campos.tamanho !== undefined) estilo.tamanho = campos.tamanho
    if (campos.negrito !== undefined) estilo.negrito = campos.negrito
    if (campos.italico !== undefined) estilo.italico = campos.italico
    if ('cor' in campos) estilo.cor = campos.cor
    if (Object.keys(estilo).length) onEstilosChange({ ...estilosDosTextos, [id]: estilo })
  }

  const alterar = (id: string, campos: Partial<ElementoCartaz>) => {
    onChange(elementos.map((el) => (el.id === id ? { ...el, ...campos } : el)))
  }
  const remover = (id: string) => {
    onChange(elementos.filter((el) => el.id !== id))
    setSelecionado((a) => (a === id ? null : a))
    setEditandoId((a) => (a === id ? null : a))
  }

  const adicionarTexto = () => {
    const novo = novoTexto(elementos)
    onChange([...elementos, novo])
    setSelecionado(novo.id)
    setTextoSelecionado(null)
  }

  const escolherImagem = async (arquivo: File) => {
    const url = await onSubirImagem(arquivo)
    if (!url) return
    const novo = { ...novaLogo(elementos), url }
    onChange([...elementos, novo])
    setSelecionado(novo.id)
    setTextoSelecionado(null)
  }

  /** Arrastar: a posição é fração do container, então o delta também é. */
  const arrastar = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setSelecionado(id)
    setTextoSelecionado(null)
    const camada = camadaRef.current
    const el = elementos.find((x) => x.id === id)
    if (!camada || !el) return

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    try { alvo.setPointerCapture(e.pointerId) } catch { /* ponteiro sintético */ }
    const inicio = { px: e.clientX, py: e.clientY, x: el.x, y: el.y }

    const mover = (ev: PointerEvent) => {
      alterar(id, {
        x: Math.min(1, Math.max(0, inicio.x + (ev.clientX - inicio.px) / area.width)),
        y: Math.min(1, Math.max(0, inicio.y + (ev.clientY - inicio.py) / area.height)),
      })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /**
   * Puxar as bordas. As regras moram em `redimensionar-cartaz`; aqui só entram
   * as duas correções que dependem da tela: projetar o movimento nos eixos do
   * elemento virado, e andar com a origem pra segurar a borda oposta parada.
   */
  const redimensionar = (id: string, ancora: Ancora) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setSelecionado(id)

    const camada = camadaRef.current
    const caixa = caixas.find((c) => c.id === id)
    const el = elementos.find((x) => x.id === id)
    if (!camada || !caixa || !el) return

    const area = camada.getBoundingClientRect()
    const alvo = e.currentTarget
    try { alvo.setPointerCapture(e.pointerId) } catch { /* ponteiro sintético */ }

    const inicio = {
      px: e.clientX, py: e.clientY,
      w: caixa.w, h: caixa.h,
      tamanho: el.tamanho,
      esticarX: el.esticarX ?? 1,
      esticarY: el.esticarY ?? 1,
      escala: el.escala,
      escalaY: el.escalaY,
      recorte: el.recorte ?? { x: 0, y: 0, w: 1, h: 1 },
    }
    const posX = el.x * area.width
    const posY = el.y * area.height

    const oeste = ancora.includes('o')
    const norte = ancora.includes('n')
    const leste = ancora === 'l' || ancora.includes('e')
    const sul = ancora.includes('s')
    const giro = ((el.rotacao ?? 0) * Math.PI) / 180
    const cos = Math.cos(giro)
    const sen = Math.sin(giro)

    const mover = (ev: PointerEvent) => {
      const telaX = ev.clientX - inicio.px
      const telaY = ev.clientY - inicio.py
      const dx = (telaX * cos + telaY * sen) * (oeste ? -1 : 1)
      const dy = (-telaX * sen + telaY * cos) * (norte ? -1 : 1)
      const { fatorW, fatorH, ...campos } = calcularRedimensionamento(
        el.tipo === 'texto' ? 'texto' : 'imagem', ancora, inicio, dx, dy,
      )
      // A origem é o miolo do elemento, então metade do que ele cresceu.
      const desX = leste ? 0.5 * inicio.w * (fatorW - 1) : oeste ? -0.5 * inicio.w * (fatorW - 1) : 0
      const desY = sul ? 0.5 * inicio.h * (fatorH - 1) : norte ? -0.5 * inicio.h * (fatorH - 1) : 0
      alterar(id, {
        ...campos,
        x: (posX + (desX * cos - desY * sen)) / area.width,
        y: (posY + (desX * sen + desY * cos)) / area.height,
      })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  /** Girar pela argola: só a diferença entre leituras entra, e sem teto. */
  const girar = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const camada = camadaRef.current
    const caixa = caixas.find((c) => c.id === id)
    const el = elementos.find((x) => x.id === id)
    if (!camada || !caixa || !el) return

    const area = camada.getBoundingClientRect()
    const centro = { x: area.left + caixa.x + caixa.w / 2, y: area.top + caixa.y + caixa.h / 2 }
    const anguloDe = (px: number, py: number) => (Math.atan2(py - centro.y, px - centro.x) * 180) / Math.PI
    const alvo = e.currentTarget
    try { alvo.setPointerCapture(e.pointerId) } catch { /* ponteiro sintético */ }

    let anterior = anguloDe(e.clientX, e.clientY)
    let voltas = 0
    const inicial = el.rotacao ?? 0

    const mover = (ev: PointerEvent) => {
      const agora = anguloDe(ev.clientX, ev.clientY)
      let passo = agora - anterior
      if (passo > 180) passo -= 360
      if (passo < -180) passo += 360
      voltas += passo
      anterior = agora
      let nova = inicial + voltas
      if (ev.shiftKey) nova = Math.round(nova / 15) * 15
      alterar(id, { rotacao: nova })
    }
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
  }

  const elSelecionado = elementos.find((e) => e.id === selecionado) ?? null

  return (
    <div className="flex flex-col" style={{ width: largura }}>
      {/* Adicionar fica no cabeçalho, longe do celular: é ação de uma vez só,
          e logo acima da prévia empurraria pra baixo a barra de propriedades,
          que é a que se usa a cada ajuste. */}
      <div className="mb-2 flex min-h-[50px] items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-gray-700">Página do cliente</p>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            É isto que abre no celular de quem escaneia o QR.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-[12px]" onClick={adicionarTexto}>
            <Plus className="h-3 w-3" /> <Type className="h-3.5 w-3.5" /> Texto
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-[12px] font-medium shadow-sm hover:bg-accent">
            {enviandoImagem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3 w-3" />}
            <ImagePlus className="h-3.5 w-3.5" /> Imagem
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void escolherImagem(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      {/* Cor livre pro fundo, embaixo do adicionar imagem.
          As oito texturas do card ao lado cobrem os materiais; isto cobre o
          resto — a cor da marca do restaurante, que nenhuma lista de oito
          adivinha. Fica aqui, e não lá, porque é a única escolha de fundo que
          se faz olhando a prévia mudar. */}
      <div className="mb-2 flex items-center justify-end gap-2">
        <span className="text-[11.5px] text-muted-foreground">Cor de fundo</span>
        <SeletorCor
          compacto
          valor={modo === 'estilo' && ehCorPersonalizada(estilo) ? estilo : null}
          onChange={onEstiloChange}
        />
      </div>

      {/* A ALTURA DA BARRA É RESERVADA, ocupada ou não.
          Sem isso a barra nascia ao selecionar e empurrava o celular pra
          baixo — e o segundo clique de um duplo clique caía no texto DE CIMA,
          porque o conteúdo tinha andado entre um clique e outro. Quem tentava
          editar o nome entrava no rótulo. */}
      <div className="min-h-[46px]">
      {elSelecionado ? (
        <BarraElemento elemento={elSelecionado} onAlterar={alterar} onRemover={remover} />
      ) : textoSelecionado ? (
        /* A mesma barra dos elementos livres. `podeRemover` fica de fora: o
           jeito de tirar uma linha da página é apagar o conteúdo dela, não um
           botão que some com um campo que depois ninguém acha pra trazer de
           volta. */
        <BarraElemento
          elemento={comoElemento(textoSelecionado)}
          onAlterar={alterarTextoDaPagina}
          onRemover={() => {}}
          podeRemover={false}
        />
      ) : null}
      </div>

      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-5">
        <div className="relative" style={{ width: LARGURA_APARELHO }}>
          <div
            className="relative overflow-hidden bg-gray-900 shadow-[0_22px_50px_-16px_rgba(16,24,40,0.55)]"
            style={{ borderRadius: 40, padding: 10 }}
          >
            <div className="relative overflow-hidden bg-white" style={{ height: altura, borderRadius: 30 }}>
              {/* A página DE VERDADE, o mesmo componente que o cliente abre. */}
              <div ref={paginaRef} className="absolute inset-0">
              <LandingView
                preview
                restauranteNome={restauranteNome}
                modo={modo}
                imagem={imagem}
                estilo={estilo}
                mensagem={mensagem}
                whatsapp={whatsapp}
                elementos={elementos}
                editandoId={editandoId}
                onCaixas={receberCaixas}
                textos={textos}
                estilosDosTextos={estilosDosTextos}
              />
              </div>

              {/* Camada de arraste, exatamente sobre a página. */}
              <div
                ref={camadaRef}
                className="absolute inset-0 z-30"
                onPointerDown={() => { setSelecionado(null); setTextoSelecionado(null); setEditandoId(null) }}
              >
                {/* Os textos da própria página: clique seleciona (a barra
                    aparece), dois cliques abrem pra digitar. Não se arrastam —
                    quem os posiciona é o layout, que precisa continuar
                    funcionando em telas de tamanhos diferentes. */}
                {caixasDeTexto.map((c) => {
                  const emEdicao = editandoId === c.id
                  const marcado = textoSelecionado === c.id
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'absolute rounded-[3px] transition-colors',
                        marcado || emEdicao
                          ? 'ring-1 ring-[#8B3DFF] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]'
                          : 'hover:ring-1 hover:ring-[#8B3DFF]/70',
                      )}
                      style={{ left: c.x - 4, top: c.y - 4, width: c.w + 8, height: c.h + 8 }}
                    >
                      {emEdicao ? (
                        <textarea
                          autoFocus
                          value={textos[c.id] ?? ''}
                          onChange={(ev) => onTextosChange({ ...textos, [c.id]: ev.target.value })}
                          onBlur={() => setEditandoId(null)}
                          onKeyDown={(ev) => { if (ev.key === 'Escape') setEditandoId(null) }}
                          className="h-full w-full resize-none overflow-hidden rounded-[3px] border-0 bg-white/90 p-0 text-center text-[12px] leading-[1.2] text-gray-900 outline-none"
                        />
                      ) : (
                        <div
                          onPointerDown={arrastarTexto(c.id)}
                          onDoubleClick={() => {
                            // Um campo vazio não tem o que editar: abre já com
                            // o texto que está aparecendo na página.
                            if (textos[c.id] == null) {
                              const no = paginaRef.current?.querySelector<HTMLElement>(`[data-texto="${c.id}"]`)
                              onTextosChange({ ...textos, [c.id]: no?.innerText?.trim() ?? '' })
                            }
                            setEditandoId(c.id)
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Editar o texto: ${ROTULO_DO_TEXTO[c.id]}`}
                          title={`Clique para selecionar, dois cliques para editar: ${ROTULO_DO_TEXTO[c.id]}`}
                          className="h-full w-full cursor-move touch-none"
                        />
                      )}

                      {/* As mesmas alças dos elementos livres: canto muda o
                          corpo da fonte, lado estica só naquele sentido. */}
                      {marcado && !emEdicao && (
                        <Alcas
                          id={c.id}
                          aoPegar={redimensionarTexto}
                          larguraTela={c.w + 8}
                          alturaTela={c.h + 8}
                        />
                      )}
                    </div>
                  )
                })}

                {caixas.map((c) => {
                  const el = elementos.find((e) => e.id === c.id)
                  if (!el) return null
                  const folga = el.tipo === 'logo' ? 0 : FOLGA_TEXTO
                  const selecionadoAqui = selecionado === c.id
                  const emEdicao = editandoId === c.id
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'group absolute rounded-[2px] transition-colors',
                        selecionadoAqui || emEdicao
                          ? 'ring-1 ring-[#8B3DFF] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]'
                          : 'hover:ring-1 hover:ring-[#8B3DFF]/70',
                      )}
                      style={{
                        left: c.x - folga,
                        top: c.y - folga,
                        width: c.w + folga * 2,
                        height: c.h + folga * 2,
                        transform: c.rotacao ? `rotate(${c.rotacao}deg)` : undefined,
                      }}
                    >
                      {emEdicao && el.tipo === 'texto' ? (
                        <textarea
                          autoFocus
                          value={el.texto}
                          onChange={(ev) => alterar(el.id, { texto: ev.target.value })}
                          onBlur={() => setEditandoId(null)}
                          onKeyDown={(ev) => { if (ev.key === 'Escape') setEditandoId(null) }}
                          className="h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 text-left leading-[1.2] outline-none"
                          style={{
                            fontFamily: undefined,
                            fontSize: (el.tamanho * (LARGURA_APARELHO - 20)) / 390,
                            fontWeight: el.negrito ? 700 : 400,
                            fontStyle: el.italico ? 'italic' : 'normal',
                            color: el.cor ?? '#ffffff',
                          }}
                        />
                      ) : (
                        <div
                          onPointerDown={arrastar(c.id)}
                          onDoubleClick={() => { if (el.tipo === 'texto') setEditandoId(c.id) }}
                          role="button"
                          tabIndex={0}
                          aria-label={el.tipo === 'texto' ? 'Mover o texto (dois cliques para editar)' : 'Mover a imagem'}
                          className="h-full w-full cursor-move touch-none"
                        />
                      )}

                      {!selecionadoAqui && (
                        <button
                          type="button"
                          onClick={() => remover(c.id)}
                          aria-label="Excluir o elemento"
                          title="Excluir"
                          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-2 ring-white group-hover:flex"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {selecionadoAqui && !emEdicao && (
                        <Alcas
                          id={c.id}
                          aoPegar={redimensionar}
                          larguraTela={c.w + folga * 2}
                          alturaTela={c.h + folga * 2}
                        />
                      )}

                      {selecionadoAqui && (
                        <div
                          onPointerDown={girar(c.id)}
                          role="button"
                          tabIndex={-1}
                          aria-label="Girar (segure Shift para travar de 15 em 15 graus)"
                          title="Girar (Shift trava de 15 em 15)"
                          className="absolute left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border border-gray-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                          style={{ bottom: -34 }}
                        >
                          <RotateCw className="h-3 w-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Sem a ilha da câmera: ela era só enfeite de aparelho, e no topo
                da prévia lia como um elemento preto que a pessoa tinha posto
                ali sem querer. */}
          </div>
        </div>
      </div>

      {!whatsapp && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900">
          O WhatsApp do restaurante ainda não está conectado. Sem ele o botão não
          tem para onde levar, e o cliente abre a página sem conseguir mandar nada.
        </p>
      )}
    </div>
  )
}
