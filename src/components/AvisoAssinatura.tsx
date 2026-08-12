import type { ReactNode, ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { WifiOff, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

/**
 * Faixa de aviso no topo do app (só clientes; admin não é cliente). Cobre:
 *  - WhatsApp desconectado (ex.: depois de reassinar, a instância foi derrubada)
 *  - Assinatura cancelada mas com acesso até a data paga
 *  - Assinatura prestes a acabar (cupom/plano vencendo)
 *
 * O aviso de "acabou" de vez não fica aqui: quando a assinatura encerra, o
 * RotaProtegida manda pra /assinatura (que mostra "Sua assinatura foi encerrada").
 */
export function AvisoAssinatura() {
  const { usuario, ehAdminPlataforma } = useAuth()
  if (!usuario || ehAdminPlataforma) return null
  if (usuario.assinatura_status !== 'ativa') return null // não-ativa é barrada antes

  const expira = usuario.assinatura_expira_em ? new Date(usuario.assinatura_expira_em) : null
  const cancelada = !!usuario.assinatura_cancelada_em
  const desconectado = usuario.onboarding_completo === true && !usuario.whatsapp_token
  const dias = expira ? Math.ceil((expira.getTime() - Date.now()) / 86_400_000) : null
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR')

  let Icon: ComponentType<{ className?: string }> | null = null
  let texto: ReactNode = null
  let cta: { to: string; label: string } | null = null

  if (desconectado) {
    Icon = WifiOff
    texto = <>Seu <b>WhatsApp está desconectado</b> — reconecte para voltar a receber os feedbacks dos clientes.</>
    cta = { to: '/configuracoes', label: 'Reconectar' }
  } else if (cancelada && expira && dias !== null && dias >= 0) {
    Icon = Clock
    texto = <>Você cancelou a assinatura. Seu acesso continua até <b>{fmt(expira)}</b>.</>
    cta = { to: '/assinatura', label: 'Reativar' }
  } else if (!cancelada && expira && dias !== null && dias >= 0 && dias <= 7) {
    Icon = Clock
    texto = (
      <>
        Sua assinatura termina{' '}
        <b>{dias === 0 ? 'hoje' : `em ${dias} dia${dias > 1 ? 's' : ''}`}</b> ({fmt(expira)}). Renove
        para não perder o acesso.
      </>
    )
    cta = { to: '/assinatura', label: 'Renovar' }
  }

  if (!Icon || !cta) return null

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-amber-600" />
      <p className="flex-1 min-w-0">{texto}</p>
      <Link
        to={cta.to}
        className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
      >
        {cta.label}
      </Link>
    </div>
  )
}
