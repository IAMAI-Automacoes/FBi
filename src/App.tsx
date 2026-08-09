import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import { RestauranteConfigProvider } from '@/hooks/use-restaurante-config'
import Layout from './components/Layout'
import NotFound from './pages/NotFound'

// Pages
import Index from './pages/Index'
import Feedbacks from './pages/Feedbacks'
import Insights from './pages/Insights'
import Actions from './pages/Actions'
import Reports from './pages/Reports'
import QRCodes from './pages/QRCodes'
import Garcons from './pages/Garcons'
import Settings from './pages/Settings'
import Autenticacao from './pages/auth/Autenticacao'
import RecuperarSenha from './pages/auth/RecuperarSenha'
import Onboarding from './pages/auth/Onboarding'
import MyAccount from './pages/MyAccount'
import Sugestoes from './pages/Sugestoes'
import Admin from './pages/Admin'
import FeedbackLanding from './pages/FeedbackLanding'
import Vendas from './pages/Vendas'
import Checkout from './pages/Checkout'
import Assinatura from './pages/Assinatura'
import CheckoutSucesso from './pages/CheckoutSucesso'
import { RotaProtegida } from './components/RotaProtegida'
import { RotaPermitida } from './components/RotaPermitida'
import { AdminNotificacoes } from './components/AdminNotificacoes'

const App = () => (
  <AuthProvider>
    <RestauranteConfigProvider>
      <BrowserRouter>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* Notificações do navegador p/ o admin da plataforma (mensagens de clientes) */}
        <AdminNotificacoes />
        <Routes>
          {/* Mesma tela; a rota só decide o modo inicial.
              As `key` distintas são obrigatórias: sem elas o React reconcilia as
              duas rotas como o MESMO componente (mesmo tipo, mesma posição) e
              não remonta. Como `modo`, `email` e `aviso` são inicializados via
              useState, eles congelariam nos valores antigos — navegar de
              /cadastro para /login trocaria a URL sem mudar nada na tela. */}
          <Route path="/login" element={<Autenticacao key="entrar" modoInicial="entrar" />} />
          <Route path="/cadastro" element={<Autenticacao key="criar" modoInicial="criar" />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          {/* Página pública que o cliente abre ao escanear o QR */}
          <Route path="/f/:slug" element={<FeedbackLanding />} />
          {/* Landing de vendas — pública. `/` segue sendo o dashboard. */}
          <Route path="/vendas" element={<Vendas />} />

          <Route element={<RotaProtegida />}>
            {/* Assinatura: exige conta, mas roda antes do onboarding */}
            <Route path="/assinatura" element={<Assinatura />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/sucesso" element={<CheckoutSucesso />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/minha-conta" element={<MyAccount />} />
            <Route
              path="/configuracoes"
              element={
                <RotaPermitida modulo="configuracoes">
                  <Settings />
                </RotaPermitida>
              }
            />
            <Route path="/admin" element={<Admin />} />
          <Route element={<Layout />}>
              <Route
                path="/"
                element={
                  <RotaPermitida modulo="visao_geral">
                    <Index />
                  </RotaPermitida>
                }
              />
              <Route
                path="/feedbacks"
                element={
                  <RotaPermitida modulo="feedbacks">
                    <Feedbacks />
                  </RotaPermitida>
                }
              />
              <Route
                path="/insights"
                element={
                  <RotaPermitida modulo="insights">
                    <Insights />
                  </RotaPermitida>
                }
              />
              <Route
                path="/acoes"
                element={
                  <RotaPermitida modulo="acoes">
                    <Actions />
                  </RotaPermitida>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <RotaPermitida modulo="relatorios">
                    <Reports />
                  </RotaPermitida>
                }
              />
              <Route
                path="/qrcode"
                element={
                  <RotaPermitida modulo="qrcodes">
                    <QRCodes />
                  </RotaPermitida>
                }
              />
              <Route
                path="/garcons"
                element={
                  <RotaPermitida modulo="qrcodes">
                    <Garcons />
                  </RotaPermitida>
                }
              />
              <Route path="/sugestoes" element={<Sugestoes />} />
            </Route>
          </Route>

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </RestauranteConfigProvider>
  </AuthProvider>
)

export default App
