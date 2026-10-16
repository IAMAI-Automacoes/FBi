import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { SUPABASE_URL } from '@/lib/supabase/client'

/* Volta do login com o Google em /google/retorno (o endereço do nosso domínio,
   que a verificação do app pelo Google exige). Quem repassa é o .htaccess; esta
   página é a reserva, se o servidor entregar o app em vez de redirecionar:
   segue para a função que troca o código, com o mesmo ?code&state. */
export default function GoogleRetorno() {
  useEffect(() => {
    window.location.replace(`${SUPABASE_URL}/functions/v1/google-oauth-callback${window.location.search}`)
  }, [])
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 bg-white text-sm text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Voltando do Google…
    </div>
  )
}
