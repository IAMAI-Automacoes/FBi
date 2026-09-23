import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { supabase } from '@/lib/supabase/client'

/* Fim da demonstração: /demo/encerrada.
   Uma tela clara, e não a do código com um erro: quem está vendo é o dono do
   restaurante, não o vendedor. */
export default function DemoEncerrada() {
  // Chegar aqui é sempre fim. Se sobrou sessão nesta aba, fecha — só nesta aba.
  useEffect(() => {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  }, [])

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{ width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', color: '#1D4ED8' }}
        >
          <Clock className="h-6 w-6" />
        </div>
        <h1 style={{ fontSize: '23px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          A demonstração terminou
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>
          O acesso fechou sozinho neste computador e nada ficou salvo aqui.
        </p>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginTop: '10px' }}>
          Gostou do que viu? Fale com quem apresentou o Easy Feed para começar no seu restaurante.
        </p>

        <a
          href="/vendas"
          style={{
            marginTop: '26px', width: '100%', height: '52px', fontSize: '14px', fontWeight: 600, color: 'white',
            background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(79,70,229,0.18)',
          }}
        >
          Conhecer o Easy Feed
        </a>
        <Link
          to="/login"
          style={{ display: 'inline-block', marginTop: '14px', fontSize: '13px', fontWeight: 500, color: '#2563EB', textDecoration: 'none' }}
        >
          Tenho um novo código
        </Link>
      </div>
    </AuthLayout>
  )
}
