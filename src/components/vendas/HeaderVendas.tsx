import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/auth/AuthLayout'
import { useIsMobile } from '@/hooks/use-mobile'
import { cores, TRANSICAO } from './tokens'

const LINKS = [
  { href: '#como-funciona', texto: 'Como funciona' },
  { href: '#beneficios', texto: 'Benefícios' },
  { href: '#planos', texto: 'Planos' },
  { href: '#faq', texto: 'Dúvidas' },
]

export function HeaderVendas() {
  // A borda inferior só entra depois que a página sai do topo — no topo o header
  // precisa parecer parte do hero, não uma barra colada por cima dele.
  const [rolou, setRolou] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 12)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: rolou ? 'rgba(255,255,255,0.72)' : 'transparent',
        backdropFilter: rolou ? 'blur(14px)' : 'none',
        WebkitBackdropFilter: rolou ? 'blur(14px)' : 'none',
        borderBottom: `1px solid ${rolou ? cores.borda : 'transparent'}`,
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}
    >
      <div
        className="mx-auto flex items-center justify-between"
        style={{ maxWidth: '1180px', padding: '14px clamp(16px, 4vw, 24px)' }}
      >
        <a href="#topo" className="flex shrink-0 items-center" style={{ textDecoration: 'none' }}>
          <BrandMark size={isMobile ? 48 : 64} />
        </a>

        <nav className="hidden md:flex items-center" style={{ gap: '28px' }}>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: cores.corpoSuave,
                textDecoration: 'none',
                transition: 'color 0.18s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = cores.tinta)}
              onMouseLeave={(e) => (e.currentTarget.style.color = cores.corpoSuave)}
            >
              {l.texto}
            </a>
          ))}
        </nav>

        {/* "Entrar" aparece no celular também: quem já tem conta entra por aqui.
            No celular ganha contorno, para não parecer texto solto. */}
        <div className="flex items-center" style={{ gap: isMobile ? '8px' : '10px' }}>
          <Link
            to="/login"
            className="inline-flex"
            style={{
              alignItems: 'center',
              height: '40px',
              padding: isMobile ? '0 14px' : '0 16px',
              fontSize: '14px',
              fontWeight: isMobile ? 600 : 500,
              color: cores.corpo,
              border: isMobile ? `1px solid ${cores.borda}` : '1px solid transparent',
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'background-color 0.18s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = cores.superficieAlt)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Entrar
          </Link>

          <a
            href="#planos"
            className="inline-flex items-center"
            style={{
              height: '40px',
              padding: isMobile ? '0 14px' : '0 18px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: cores.azul,
              borderRadius: '10px',
              textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(37,99,235,0.28)',
              transition: TRANSICAO,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 10px 24px rgba(37,99,235,0.34)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(37,99,235,0.28)'
            }}
          >
            Assinar
          </a>
        </div>
      </div>
    </header>
  )
}
