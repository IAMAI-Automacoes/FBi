import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

/* Rotas que uma conta sem plano ativo ainda precisa alcançar — é por elas que
   se paga. Barrar tudo deixaria a pessoa sem saída, inclusive quem só atrasou
   a fatura, que é a renovação mais barata de recuperar.

   Valem tanto para o gate de pagamento quanto para o de onboarding: o fluxo é
   criar conta → pagar → onboarding, então empurrar alguém ao /onboarding no
   meio do checkout quebraria a compra. */
const ROTAS_DE_PAGAMENTO = ['/assinatura', '/checkout', '/checkout/sucesso']

/* Rotas de compra propriamente ditas. Quem é barrado indo para cá quase nunca
   tem conta, então o padrão é abrir em "criar conta". */
const ROTAS_DE_COMPRA = ['/checkout', '/checkout/sucesso']

export function RotaProtegida() {
  const { session, usuario, loading, buscandoUsuario, ehAdminPlataforma, logout } = useAuth()
  const location = useLocation()

  // `buscandoUsuario && !usuario` cobre a janela do login: ali `loading` já é
  // false (veio do getSession inicial, que não achou sessão), a sessão acabou
  // de entrar e a busca do cadastro ainda está voando. Sem isso a tela de erro
  // aparecia por um instante. O `!usuario` evita que a renovação de token,
  // que também refaz a busca, pisque o spinner no meio do uso.
  if (loading || (buscandoUsuario && !usuario)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-[#1D4ED8]" />
        <p className="mt-4 text-sm text-gray-500 font-medium">Carregando...</p>
      </div>
    )
  }

  if (!session) {
    const indoAssinar = ROTAS_DE_COMPRA.includes(location.pathname)
    return (
      <Navigate to={indoAssinar ? '/cadastro' : '/login'} state={{ from: location }} replace />
    )
  }

  // Carregamento terminou, há sessão, mas o cadastro do restaurante não veio.
  // `use-auth` tenta criar a linha sozinho quando ela não existe; se aquele
  // insert falhar, esta tela era um spinner sem fim. Agora tem saída.
  if (!usuario) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-base font-semibold text-gray-900">
          Não conseguimos carregar sua conta
        </p>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Costuma ser temporário. Recarregue a página ou entre novamente.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="h-10 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white"
          >
            Recarregar
          </button>
          <button
            onClick={() => logout()}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
          >
            Sair
          </button>
        </div>
      </div>
    )
  }

  // Conta excluída (soft delete): barrada em tudo, inclusive nas rotas de
  // pagamento — não faz sentido deixar pagar uma conta removida. Os dados
  // continuam no banco e o admin pode restaurar.
  if (usuario.excluida_em) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-base font-semibold text-gray-900">Esta conta foi excluída</p>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          O acesso foi removido. Se você acha que isso é um engano, fale com o suporte — seus
          dados continuam guardados.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href="https://wa.me/5511952138636"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white no-underline"
          >
            Falar com o suporte
          </a>
          <button
            onClick={() => logout()}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
          >
            Sair
          </button>
        </div>
      </div>
    )
  }

  // Login por restaurante é único (não existe mais "membro convidado").
  const naRotaDePagamento = ROTAS_DE_PAGAMENTO.includes(location.pathname)
  const semPlanoAtivo = usuario.assinatura_status !== 'ativa'

  // Admin da plataforma não é cliente: não precisa assinar. Mas agora ele TAMBÉM
  // passa pela tela de assinatura (pra ver/testar o fluxo real como qualquer
  // conta sem plano). Lá existe um botão "pular" só para admin, que grava esta
  // marca de sessão; enquanto ele não pular, o gate o manda para /assinatura.
  // Cliente comum nunca tem essa marca, então continua obrigado a pagar — o
  // paywall segue intacto. O valor de `ehAdminPlataforma` vem do AuthProvider e
  // resolve junto com o usuário, então aqui já é confiável (não pisca `false`).
  const adminPulouPagamento =
    ehAdminPlataforma && sessionStorage.getItem('admin_pulou_pagamento') === '1'

  // ── Pagamento antes do onboarding ──
  // Esta ordem é o centro da correção. Antes existia só a checagem de
  // onboarding, então quem criava conta e não pagava caía na configuração
  // inicial e entrava no software. Onboarding é atrito de compra: só depois
  // que o dinheiro entrou (ou, para o admin, depois que ele optou por pular).
  if (semPlanoAtivo && !naRotaDePagamento && !adminPulouPagamento) {
    return <Navigate to="/assinatura" replace />
  }

  // Onboarding vale para todos — inclusive admin. A diferença é que o admin,
  // dentro da tela de onboarding, tem um botão "Pular configuração" (não é
  // obrigado). Se ele não pular, preenche como qualquer pessoa. Só a COBRANÇA
  // é pulada para admin (acima).
  if (
    usuario.onboarding_completo === false &&
    !naRotaDePagamento &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />
  }

  if (usuario.onboarding_completo === true && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
