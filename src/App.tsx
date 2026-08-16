import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import { RestauranteConfigProvider } from '@/hooks/use-restaurante-config'
import Layout from './components/Layout'
import NotFound from './pages/NotFound'

// Páginas de entrada (leves) — carregadas de imediato: login, recuperação,
// vendas (raiz para visitante) e 404.
import Autenticacao from './pages/auth/Autenticacao'
import RecuperarSenha from './pages/auth/RecuperarSenha'
import Vendas from './pages/Vendas'

// Páginas pesadas (painel, admin, relatórios com gráficos/PDF, QR) — carregadas
// sob demanda (code-splitting) para o bundle inicial ficar pequeno e o primeiro
// paint ser rápido, inclusive na página de vendas.
const Index = lazy(() => import('./pages/Index'))
const Feedbacks = lazy(() => import('./pages/Feedbacks'))
const Insights = lazy(() => import('./pages/Insights'))
const Actions = lazy(() => import('./pages/Actions'))
const AcoesArquivadas = lazy(() => import('./pages/AcoesArquivadas'))
const Reports = lazy(() => import('./pages/Reports'))
const QRCodes = lazy(() => import('./pages/QRCodes'))
const Garcons = lazy(() => import('./pages/Garcons'))
const Settings = lazy(() => import('./pages/Settings'))
const Onboarding = lazy(() => import('./pages/auth/Onboarding'))
const MyAccount = lazy(() => import('./pages/MyAccount'))
const Sugestoes = lazy(() => import('./pages/Sugestoes'))
const Admin = lazy(() => import('./pages/Admin'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Assinatura = lazy(() => import('./pages/Assinatura'))
const CheckoutSucesso = lazy(() => import('./pages/CheckoutSucesso'))
import { RotaProtegida } from './components/RotaProtegida'
import { RotaPermitida } from './components/RotaPermitida'
import { AdminNotificacoes } from './components/AdminNotificacoes'
import { ManifestPorRota } from './components/ManifestPorRota'

const App = () => (
  <AuthProvider>
    <RestauranteConfigProvider>
      <BrowserRouter>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* Notificações do navegador p/ o admin da plataforma (mensagens de clientes) */}
        <AdminNotificacoes />
        {/* Troca o manifest/ícone conforme a rota → instala "Easy Feed" ou "Mensagens" */}
        <ManifestPorRota />
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <Loader2 className="h-8 w-8 animate-spin text-[#1D4ED8]" />
            </div>
          }
        >
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
          {/* A página pública do QR (/f/:slug) é servida por um bundle leve
              próprio (f.html), fora do app — ver .htaccess e vite.config. */}
          {/* Landing de vendas — pública. `/` mostra Vendas para visitante
              (deslogado) e o painel para quem está logado (ver RotaProtegida). */}
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
                path="/acoes/arquivadas"
                element={
                  <RotaPermitida modulo="acoes">
                    <AcoesArquivadas />
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
        </Suspense>
        </TooltipProvider>
      </BrowserRouter>
    </RestauranteConfigProvider>
  </AuthProvider>
)

export default App
