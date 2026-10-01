import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BellRing, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { iphoneSemApp, pedirPermissaoEInscrever, pushSuportado } from '@/lib/push'
import { PassoAPassoIphone } from '@/components/InstalarApp'

/**
 * Pergunta, no computador e no celular, se pode mandar notificações. O
 * navegador só deixa pedir a permissão a partir de um clique — por isso um
 * cartão com "Ativar", e não o pedido direto ao abrir.
 *
 * Autorizado, chega notificação de tudo que avisa e não está silenciado no
 * sistema: mensagem no WhatsApp, resposta do suporte (dono) e mensagem de
 * cliente no suporte (admin) — quem decide é a enviar-push.
 *
 * "Agora não" esconde por 7 dias neste aparelho. Permissão negada não
 * insiste (o sino e o aviso da tela WhatsApp explicam como liberar).
 */

const CHAVE = 'easyfeed:pedir-notificacoes-ate'
const SETE_DIAS = 7 * 24 * 3600 * 1000
// Páginas públicas, de entrada ou de compra: ali não faz sentido perguntar.
const FORA = ['/login', '/cadastro', '/recuperar-senha', '/vendas', '/checkout', '/assinatura', '/onboarding', '/f/']

function adiado(): boolean {
  try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now() } catch { return false }
}

export function PedirNotificacoes() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [estado, setEstado] = useState<'pedir' | 'iphone' | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [passoIphone, setPassoIphone] = useState(false)

  useEffect(() => {
    // Sem login (na raiz o visitante vê a página de vendas) ou em página de
    // entrada/compra: não pergunta.
    if (!user || adiado() || FORA.some((r) => pathname.startsWith(r))) { setEstado(null); return }
    if (iphoneSemApp()) { setEstado('iphone'); return }
    if (pushSuportado() && Notification.permission === 'default') { setEstado('pedir'); return }
    setEstado(null)
  }, [user, pathname])

  if (!estado) return null

  const depois = () => {
    try { localStorage.setItem(CHAVE, String(Date.now() + SETE_DIAS)) } catch { /* sem armazenamento: some só nesta visita */ }
    setEstado(null)
  }
  const ativar = async () => {
    if (!user) return
    setPedindo(true)
    await pedirPermissaoEInscrever(user.id)
    setPedindo(false)
    setEstado(null)
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
        role="dialog"
        aria-label="Ativar notificações"
      >
        <div className="flex w-full max-w-md items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:w-[380px]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-gray-900">Receber notificações?</p>
            <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
              {estado === 'iphone'
                ? 'No iPhone, as notificações de mensagens do WhatsApp e do suporte só funcionam com o EasyFeed instalado na tela inicial.'
                : 'Avisamos na hora quando chegar mensagem no WhatsApp ou resposta do suporte. Você pode silenciar o que quiser depois.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={estado === 'iphone' ? () => setPassoIphone(true) : ativar}
                disabled={pedindo}
                className="rounded-full bg-[#128C7E] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#0f7a6e] disabled:opacity-60"
              >
                {estado === 'iphone' ? 'Como instalar' : pedindo ? 'Ativando…' : 'Ativar'}
              </button>
              <button type="button" onClick={depois} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-500 hover:bg-gray-100">
                Agora não
              </button>
            </div>
          </div>
          <button type="button" onClick={depois} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      </div>
      {passoIphone && <PassoAPassoIphone nome="EasyFeed" aoFechar={() => { setPassoIphone(false); depois() }} />}
    </>
  )
}
