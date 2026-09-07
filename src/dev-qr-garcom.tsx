/**
 * Banco de teste do cartaz do QR — página isolada, sem login, pra dirigir o
 * desenho num navegador de verdade (Playwright) e conferir coisas que só
 * existem em pixel: qual QR foi codificado, qual texto foi escrito e de que
 * cor saiu o crédito do produto sobre cada fundo.
 *
 * Não entra em build de produção: as entradas do build são só `index.html` e
 * `f.html` (ver vite.config.ts).
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { desenharPoster, landingUrl, POSTER_W, POSTER_H, ID_ROTULO, ID_TITULO } from '@/lib/qr-poster'

/** Mesma forma dos dados reais: garçom -> slug do QR dele. */
const GARCONS = [
  { id: 2, nome: 'Rogério', slug: '6xkfdaxU' },
  { id: 4, nome: 'Davi', slug: '89f9fae8' },
  { id: 5, nome: 'brenox', slug: '3dd6972c' },
  { id: 6, nome: 'canario', slug: 'JjJi6dGf' },
]

function Banco() {
  const [pronto, setPronto] = useState(false)
  const [caixas, setCaixas] = useState<any[]>([])

  /** Espelha o laço de `baixarPdf`: sequencial, um cartaz por garçom. */
  const gerar = async (
    ids: number[],
    extra: { temaId?: string; rotulo?: string | null; titulo?: string; mensagem?: string; estilos?: any } = {},
  ) => {
    setPronto(false)
    const alvos = GARCONS.filter((g) => ids.includes(g.id))
    for (const g of alvos) {
      const canvas = document.getElementById(`canvas-${g.id}`) as HTMLCanvasElement
      canvas.width = POSTER_W
      canvas.height = POSTER_H
      const cx = await desenharPoster(canvas, {
        url: landingUrl(g.slug),
        nome: extra.titulo ?? 'Camelo',
        rotulo: extra.rotulo,
        temaId: extra.temaId ?? 'branco',
        tagline: extra.mensagem ?? 'Conte como foi sua experiência',
        estilos: extra.estilos,
        garcom: g.nome,
      })
      setCaixas(cx)
    }
    setPronto(true)
  }

  const todos = GARCONS.map((g) => g.id)

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <button data-teste="gerar-todos" onClick={() => gerar(todos)}>Baixar todos</button>
      <button data-teste="gerar-um" onClick={() => gerar([4])}>Baixar só o Davi (popup)</button>
      <button data-teste="gerar-selecionados" onClick={() => gerar([5, 6])}>Baixar selecionados</button>
      <button data-teste="tema-claro" onClick={() => gerar([2], { temaId: 'branco' })}>Tema claro</button>
      <button data-teste="tema-escuro" onClick={() => gerar([2], { temaId: '#1A1A1A' })}>Tema escuro</button>
      <button data-teste="textos-proprios" onClick={() => gerar([2], { rotulo: 'Bar & Boteco', titulo: 'Seu Zé' })}>
        Textos próprios
      </button>
      <button data-teste="rotulo-movido" onClick={() => gerar([2], { estilos: { [ID_ROTULO]: { x: 0.2, y: 0.8 } } })}>Rótulo movido</button>
      <button data-teste="estilo-proprio" onClick={() => gerar([2], { estilos: { [ID_ROTULO]: { fonte: 'pacifico', tamanho: 40, negrito: false, italico: true, cor: '#B22222' }, [ID_TITULO]: { fonte: 'bebas', tamanho: 70, cor: '#0000FF' } } })}>Estilo próprio</button>
      <button data-teste="sem-mensagem" onClick={() => gerar([2], { mensagem: '' })}>Sem mensagem</button>
      <button data-teste="sem-rotulo" onClick={() => gerar([2], { rotulo: '' })}>Sem rótulo</button>
      <pre data-teste="caixas">{JSON.stringify(caixas.map((c) => c.id))}</pre>
      <pre data-teste="pronto">{String(pronto)}</pre>
      <pre data-teste="esperado">{JSON.stringify(GARCONS.map((g) => ({ id: g.id, url: landingUrl(g.slug) })))}</pre>
      {GARCONS.map((g) => (
        <canvas key={g.id} id={`canvas-${g.id}`} data-garcom={g.id} style={{ width: 180, border: '1px solid #ccc' }} />
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Banco />)
