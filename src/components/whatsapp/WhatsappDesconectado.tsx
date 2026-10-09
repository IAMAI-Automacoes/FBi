import { Link } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { WA } from '@/components/whatsapp/pecas'

/* Tela WhatsApp quando o número não está conectado (nunca conectou, foi
   desconectado ou caiu pelo celular): no lugar das conversas, só o aviso.
   As conversas voltam a aparecer quando o WhatsApp conectar de novo. */
export function WhatsappDesconectado({ modo, className }: { modo: 'dono' | 'admin'; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-4 bg-[#F0F2F5] px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm">
          <WifiOff className="h-9 w-9 text-red-500" />
        </div>
        <div>
          <p className="text-[18px] font-semibold text-gray-800">WhatsApp desconectado</p>
          <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-gray-500">
            {modo === 'dono'
              ? 'Conecte o WhatsApp do restaurante para ver as conversas aqui. Enquanto estiver desconectado, as mensagens novas não chegam.'
              : 'Este restaurante ainda não conectou o WhatsApp, ou ele foi desconectado. As conversas aparecem quando ele conectar.'}
          </p>
        </div>
        {modo === 'dono' && (
          <Link
            to="/configuracoes"
            className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-semibold text-white no-underline transition-opacity hover:opacity-90"
            style={{ background: WA.TEAL }}
          >
            Conectar WhatsApp
          </Link>
        )}
      </div>
    </div>
  )
}
