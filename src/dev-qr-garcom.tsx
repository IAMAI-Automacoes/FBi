/**
 * Banco de teste do download de QR por garçom — página isolada, sem login,
 * pra provar num navegador de verdade que o cartaz gerado para cada garçom
 * codifica o QR DAQUELE garçom (e não o de outro, nem sempre o mesmo).
 *
 * Reproduz o laço exato do `baixarPdf` de `Garcons.tsx`: para cada garçom da
 * lista, pega o slug dele e desenha o cartaz com `landingUrl(slug)`. Depois o
 * Playwright lê cada canvas e DECODIFICA o QR, comparando com o esperado.
 *
 * Não entra em build de produção: as entradas do build são só `index.html` e
 * `f.html` (ver vite.config.ts).
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { desenharPoster, landingUrl, POSTER_W, POSTER_H } from '@/lib/qr-poster'

/** Mesma forma dos dados reais: garçom -> slug do QR dele. */
const GARCONS = [
  { id: 2, nome: 'Rogério', slug: '6xkfdaxU' },
  { id: 4, nome: 'Davi', slug: '89f9fae8' },
  { id: 5, nome: 'brenox', slug: '3dd6972c' },
  { id: 6, nome: 'canario', slug: 'JjJi6dGf' },
]

function Banco() {
  const [pronto, setPronto] = useState(false)

  /** Espelha o laço de `baixarPdf`: sequencial, um cartaz por garçom. */
  const gerar = async (ids: number[]) => {
    setPronto(false)
    const alvos = GARCONS.filter((g) => ids.includes(g.id))
    for (const g of alvos) {
      const canvas = document.getElementById(`canvas-${g.id}`) as HTMLCanvasElement
      canvas.width = POSTER_W
      canvas.height = POSTER_H
      await desenharPoster(canvas, {
        url: landingUrl(g.slug),
        nome: "Camelo",
        temaId: 'classico',
        tagline: 'Conte como foi sua experiência',
        garcom: g.nome,
      })
    }
    setPronto(true)
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <button data-teste="gerar-todos" onClick={() => gerar(GARCONS.map((g) => g.id))}>Baixar todos</button>
      <button data-teste="gerar-um" onClick={() => gerar([4])}>Baixar só o Davi (popup)</button>
      <button data-teste="gerar-selecionados" onClick={() => gerar([5, 6])}>Baixar selecionados (brenox + canario)</button>
      <pre data-teste="pronto">{String(pronto)}</pre>
      <pre data-teste="esperado">{JSON.stringify(GARCONS.map((g) => ({ id: g.id, url: landingUrl(g.slug) })))}</pre>
      {GARCONS.map((g) => (
        <canvas key={g.id} id={`canvas-${g.id}`} data-garcom={g.id} style={{ width: 180, border: '1px solid #ccc' }} />
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Banco />)
