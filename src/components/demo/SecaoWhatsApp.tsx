import { Lock, MessageCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { WhatsAppTab } from '@/pages/settings/WhatsAppTab'

/** Seção WhatsApp de Configurações. Na demonstração vira um aviso: o número
    conectado e o dos avisos urgentes são da conta de verdade do vendedor. */
export function SecaoWhatsApp({ restauranteId }: { restauranteId: number | null }) {
  const { sessaoDemo } = useAuth()
  if (!sessaoDemo) return <WhatsAppTab restauranteId={restauranteId} />

  return (
    <Card data-secao="whatsapp-bloqueado">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-600" />
          <CardTitle>WhatsApp</CardTitle>
        </div>
        <CardDescription>
          Conecte o número de WhatsApp que recebe e responde os feedbacks dos clientes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
          <div>
            <p className="font-medium text-gray-800">Bloqueado na demonstração</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Aqui o restaurante conecta o próprio WhatsApp com um QR code e escolhe o número que recebe os
              avisos urgentes.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
