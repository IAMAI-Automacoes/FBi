/*
 * Entrada LEVE da página pública `/f/:slug` (o que o cliente abre ao escanear).
 * É um bundle separado, propositalmente mínimo: só React + a LandingView. NÃO
 * importa o app (2 MB), nem os providers de auth/config, nem o supabase-js.
 * Faz UMA chamada `fetch` à edge function `qr-landing` (que registra a abertura
 * e devolve os dados) e renderiza. Isso troca os ~10 s de tela branca por uma
 * abertura quase instantânea.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { LandingView } from '@/components/LandingView'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/qr-landing-config'

interface LandingData {
  restauranteNome: string
  whatsapp: string | null
  garcomNome: string | null
  modo: string
  imagem: string | null
  estilo: string
  filtro: string
  mensagem: string | null
}

function slugDaUrl(): string | null {
  const m = window.location.pathname.match(/\/f\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function Boot() {
  return (
    <div className="ef-boot"><div className="ef-spin" /></div>
  )
}

function Invalido() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#f8fafc', textAlign: 'center', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#334155' }}>QR Code inválido</p>
      <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Este código não está mais disponível.</p>
    </div>
  )
}

function App() {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [data, setData] = useState<LandingData | null>(null)

  useEffect(() => {
    const slug = slugDaUrl()
    if (!slug) { setEstado('erro'); return }
    fetch(`${SUPABASE_URL}/functions/v1/qr-landing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ slug }),
    })
      .then((r) => r.json())
      .then((d: LandingData & { error?: string }) => {
        if (!d || d.error) { setEstado('erro'); return }
        setData(d)
        setEstado('ok')
        if (d.restauranteNome) document.title = `${d.restauranteNome} — Deixe seu feedback`
      })
      .catch(() => setEstado('erro'))
  }, [])

  if (estado === 'carregando') return <Boot />
  if (estado === 'erro' || !data) return <Invalido />

  return (
    <div style={{ height: '100dvh', width: '100%' }}>
      <LandingView
        restauranteNome={data.restauranteNome}
        modo={data.modo}
        imagem={data.imagem}
        estilo={data.estilo}
        mensagem={data.mensagem}
        whatsapp={data.whatsapp}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
