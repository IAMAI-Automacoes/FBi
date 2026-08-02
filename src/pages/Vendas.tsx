import { useEffect } from 'react'
import { HeaderVendas } from '@/components/vendas/HeaderVendas'
import { Hero } from '@/components/vendas/Hero'
import { ComoFunciona } from '@/components/vendas/ComoFunciona'
import { Beneficios } from '@/components/vendas/Beneficios'
import { Planos } from '@/components/vendas/Planos'
import { Faq } from '@/components/vendas/Faq'
import { CtaFinal, RodapeVendas } from '@/components/vendas/CtaFinal'

/* Landing de vendas — rota pública `/vendas`.
   `/` continua sendo o dashboard autenticado. */
export default function Vendas() {
  // A rolagem suave precisa estar no elemento raiz para valer nas âncoras.
  // Aplicada só enquanto esta página está montada, para não alterar o app todo.
  useEffect(() => {
    const raiz = document.documentElement
    const anterior = raiz.style.scrollBehavior
    raiz.style.scrollBehavior = 'smooth'
    return () => {
      raiz.style.scrollBehavior = anterior
    }
  }, [])

  return (
    <div style={{ background: '#FFFFFF' }}>
      <HeaderVendas />
      <main>
        <Hero />
        <ComoFunciona />
        <Beneficios />
        <Planos />
        <Faq />
        <CtaFinal />
      </main>
      <RodapeVendas />
    </div>
  )
}
