import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { paginaSobDemanda } from './lib/pagina-sob-demanda'
import { Toaster } from '@/components/ui/sonner'
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
const Index = paginaSobDemanda(() => import('./pages/Index'))
// EasyFeed Influencers: área escondida, com login separado (só carrega em /influencers).
const AreaInfluencers = paginaSobDemanda(() => import('./pages/influencers/AreaInfluencers'))
const Feedbacks = paginaSobDemanda(() => import('./pages/Feedbacks'))
const Insights = paginaSobDemanda(() => import('./pages/Insights'))
const Actions = paginaSobDemanda(() => import('./pages/Actions'))
const AcoesArquivadas = paginaSobDemanda(() => import('./pages/AcoesArquivadas'))
const Reports = paginaSobDemanda(() => import('./pages/Reports'))
const Google = paginaSobDemanda(() => import('./pages/Google'))
const Missoes = paginaSobDemanda(() => import('./pages/Missoes'))
const MissoesHistorico = paginaSobDemanda(() => import('./pages/MissoesHistorico'))
const Indicacoes = paginaSobDemanda(() => import('./pages/Indicacoes'))
const Equipe = paginaSobDemanda(() => import('./pages/Equipe'))
const Privacidade = paginaSobDemanda(() => import('./pages/Privacidade'))
const QRCodes = paginaSobDemanda(() => import('./pages/QRCodes'))
const Garcons = paginaSobDemanda(() => import('./pages/Garcons'))
const Settings = paginaSobDemanda(() => import('./pages/Settings'))
const Onboarding = paginaSobDemanda(() => import('./pages/auth/Onboarding'))
const MyAccount = paginaSobDemanda(() => import('./pages/MyAccount'))
const Sugestoes = paginaSobDemanda(() => import('./pages/Sugestoes'))
const WhatsApp = paginaSobDemanda(() => import('./pages/WhatsApp'))
const Admin = paginaSobDemanda(() => import('./pages/Admin'))
const Checkout = paginaSobDemanda(() => import('./pages/Checkout'))
const Assinatura = paginaSobDemanda(() => import('./pages/Assinatura'))
const EscolherArea = paginaSobDemanda(() => import('./pages/auth/EscolherArea'))
const CheckoutSucesso = paginaSobDemanda(() => import('./pages/CheckoutSucesso'))
import { RotaProtegida } from './components/RotaProtegida'
import { RotaPermitida } from './components/RotaPermitida'
import { AdminNotificacoes } from './components/AdminNotificacoes'
import { SoAdminPlataforma } from './components/SoAdminPlataforma'
import { AreaEquipe } from './components/equipe/AreaEquipe'
import { BarraAcessoAdmin } from './components/BarraAcessoAdmin'
import { AvisosDoPainel } from './components/whatsapp/Notificacoes'
import { PedirNotificacoes } from './components/PedirNotificacoes'
import { ManifestPorRota } from './components/ManifestPorRota'
import { ControleDemo } from './components/demo/ControleDemo'
import { AtualizacaoDoApp } from './components/AtualizacaoDoApp'
import { MODO_DEMO, PREFIXO_DEMO } from './lib/demo'
import { ROTA_DESCONTOS, ROTA_DESCONTOS_HISTORICO, ROTA_INDICACOES } from './lib/descontos'
import { lerCodigoIndicacao } from './lib/indicacao'
import { lerConviteDeArea } from './lib/convite-area'
import DemoLogin from './pages/demo/DemoLogin'
import DemoEncerrada from './pages/demo/DemoEncerrada'

// Link de indicação (`?ref=CODIGO`): guarda o código em qualquer página de
// entrada (vendas, cadastro, login), antes de a navegação tirar o `?ref=` do
// endereço. Quem usa depois é a tela de assinatura.
lerCodigoIndicacao()
// O convite de versão (`?area=rh&convite=CODIGO`) é guardado do mesmo jeito:
// quem usa é a tela de escolha, depois de a conta existir.
lerConviteDeArea()

const App = () => (
  <AuthProvider>
    <RestauranteConfigProvider>
      {/* Na demonstração o app inteiro vive sob /demo: /garcons vira /demo/garcons. */}
      <BrowserRouter basename={MODO_DEMO ? PREFIXO_DEMO : undefined}>
        <TooltipProvider>
        <Toaster />
        {/* Fecha a demonstração na hora e avisa antes; sem demonstração, não faz nada. */}
        <ControleDemo />
        {/* Deploy novo com a aba aberta: recarrega na próxima troca de página. */}
        <AtualizacaoDoApp />
        {/* Notificações do navegador p/ o admin da plataforma (mensagens de clientes) */}
        <AdminNotificacoes />
        {/* Admin dentro da conta de um cliente: de quem é a conta + "Voltar para minha conta" */}
        <BarraAcessoAdmin />
        {/* Dono: inscrição no push e sons de WhatsApp e suporte, em qualquer página logada */}
        <AvisosDoPainel />
        {/* Pergunta (PC e celular) se pode mandar notificações */}
        <PedirNotificacoes />
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
          {MODO_DEMO ? (
            <>
              {/* Demonstração: a entrada é o código, não o login. Não há
                  cadastro, recuperação de senha nem site aqui dentro. */}
              <Route path="/login" element={<DemoLogin />} />
              <Route path="/encerrada" element={<DemoEncerrada />} />
              <Route path="/cadastro" element={<Navigate to="/login" replace />} />
              <Route path="/recuperar-senha" element={<Navigate to="/login" replace />} />
              <Route path="/vendas" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Autenticacao key="entrar" modoInicial="entrar" />} />
              <Route path="/cadastro" element={<Autenticacao key="criar" modoInicial="criar" />} />
              <Route path="/recuperar-senha" element={<RecuperarSenha />} />
              {/* A página pública do QR (/f/:slug) é servida por um bundle leve
                  próprio (f.html), fora do app — ver .htaccess e vite.config. */}
              {/* Landing de vendas — pública. `/` mostra Vendas para visitante
                  (deslogado) e o painel para quem está logado (ver RotaProtegida). */}
              <Route path="/vendas" element={<Vendas />} />
              {/* Política de privacidade — pública; o Google exige o link na tela
                  de permissão do login com Google e na página inicial. */}
              <Route path="/privacidade" element={<Privacidade />} />
              {/* EasyFeed Influencers — fora do RotaProtegida: login próprio, separado do painel dos restaurantes. */}
              <Route path="/influencers/*" element={<AreaInfluencers />} />
            </>
          )}

          <Route element={<RotaProtegida />}>
            {/* Assinatura: exige conta, mas roda antes do onboarding */}
            {/* Qual versão do EasyFeed a conta usa (Restaurante ou RH): logo
                depois de criar e-mail e senha, antes da assinatura. */}
            <Route path="/escolher-versao" element={<EscolherArea />} />
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
                path="/google"
                element={
                  // Só o admin até o Google liberar a API (ver SO_ADMIN em google-perfil).
                  <RotaPermitida modulo="relatorios">
                    <SoAdminPlataforma>
                      <Google />
                    </SoAdminPlataforma>
                  </RotaPermitida>
                }
              />
              {/* Descontos (antes "Missões"): Vídeos e Indicações. Só o admin por
                  enquanto (ver SO_ADMIN em videos-missao e indicacao_liberada no banco). */}
              <Route
                path={ROTA_DESCONTOS}
                element={
                  <RotaPermitida modulo="visao_geral">
                    <SoAdminPlataforma>
                      <Missoes />
                    </SoAdminPlataforma>
                  </RotaPermitida>
                }
              />
              <Route
                path={ROTA_DESCONTOS_HISTORICO}
                element={
                  <RotaPermitida modulo="visao_geral">
                    <SoAdminPlataforma>
                      <MissoesHistorico />
                    </SoAdminPlataforma>
                  </RotaPermitida>
                }
              />
              <Route
                path={ROTA_INDICACOES}
                element={
                  <RotaPermitida modulo="visao_geral">
                    <SoAdminPlataforma>
                      <Indicacoes />
                    </SoAdminPlataforma>
                  </RotaPermitida>
                }
              />
              {/* Endereços antigos, de quando a página se chamava Missões. */}
              <Route path="/missoes" element={<Navigate to={ROTA_DESCONTOS} replace />} />
              <Route path="/missoes/historico" element={<Navigate to={ROTA_DESCONTOS_HISTORICO} replace />} />
              {/* Equipe (feedback dos funcionários): só o admin por enquanto, ver
                  AreaEquipe. Visão Geral, Feedbacks, Insights, Ações e Relatórios são as MESMAS páginas
                  dos clientes: o endereço /equipe é que faz o banco entregar só
                  o que a equipe falou (lib/publico-rota.ts). */}
              <Route path="/equipe" element={<AreaEquipe><Index /></AreaEquipe>} />
              <Route path="/equipe/funcionarios" element={<AreaEquipe><Equipe /></AreaEquipe>} />
              <Route path="/equipe/feedbacks" element={<AreaEquipe><Feedbacks /></AreaEquipe>} />
              <Route path="/equipe/insights" element={<AreaEquipe><Insights /></AreaEquipe>} />
              <Route path="/equipe/acoes" element={<AreaEquipe><Actions /></AreaEquipe>} />
              <Route path="/equipe/acoes/arquivadas" element={<AreaEquipe><AcoesArquivadas /></AreaEquipe>} />
              <Route path="/equipe/relatorios" element={<AreaEquipe><Reports /></AreaEquipe>} />
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
              <Route
                path="/whatsapp"
                element={
                  <RotaPermitida modulo="whatsapp">
                    <WhatsApp />
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
