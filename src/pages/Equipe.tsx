import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AbaEnvios } from '@/components/equipe/AbaEnvios'
import { AbaFuncionarios } from '@/components/equipe/AbaFuncionarios'
import { PedirFeedback } from '@/components/equipe/PedirFeedback'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import type { ConviteAnonimo, Envio, Funcionario } from '@/lib/equipe'
import { acaoEquipe, buscarConvites, buscarEnvios, buscarFuncionarios, type PreviaConvite } from '@/lib/queries/equipe'

/* Equipe → Funcionários: o restaurante cadastra quem trabalha lá e pede
   feedback pelo WhatsApp dele (o mesmo que fala com os clientes).

   O que a equipe responde aparece nas outras subpáginas (menu no topo):
   Feedbacks, Insights e Ações. São as MESMAS telas dos clientes, com a mesma
   IA; o banco separa os dois públicos (ver `lib/publico-rota.ts`).

   Por enquanto só o admin da plataforma vê (menu, rotas, a função `equipe` com
   SO_ADMIN e `equipe_liberada()` no banco). */

type Aba = 'funcionarios' | 'envios'

export default function Equipe() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('funcionarios')
  const [pedindo, setPedindo] = useState(false)
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [convites, setConvites] = useState<ConviteAnonimo[]>([])
  // null = ainda conferindo.
  const [whatsappConectado, setWhatsappConectado] = useState<boolean | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [f, e, c] = await Promise.all([buscarFuncionarios(restauranteId), buscarEnvios(restauranteId), buscarConvites(restauranteId)])
      setFuncionarios(f)
      setEnvios(e)
      setConvites(c)
    } catch {
      toast.error('Não foi possível carregar a equipe.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['equipe_funcionarios', 'equipe_envios', 'equipe_convites'], restauranteId, carregar)
  useEffect(() => {
    acaoEquipe<PreviaConvite>('previa').then((r) => setWhatsappConectado(r.ok ? r.whatsapp_conectado === true : null))
  }, [])

  if (carregando) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (!restauranteId) return null

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Funcionários</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Cadastre quem trabalha com você e peça feedback pelo WhatsApp. O que a equipe responder aparece em{' '}
            <Link to="/equipe/feedbacks" className="font-medium text-[#1D4ED8] underline-offset-2 hover:underline">Feedbacks</Link>, e a IA monta os{' '}
            <Link to="/equipe/insights" className="font-medium text-[#1D4ED8] underline-offset-2 hover:underline">Insights</Link> e as{' '}
            <Link to="/equipe/acoes" className="font-medium text-[#1D4ED8] underline-offset-2 hover:underline">Ações</Link>.
          </p>
        </div>
        <Button onClick={() => setPedindo(true)} className="shrink-0 bg-[#1D4ED8] hover:bg-[#1E40AF]">
          <Send className="mr-1.5 h-4 w-4" /> Pedir feedback
        </Button>
      </div>

      {whatsappConectado === false && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            O WhatsApp não está conectado. Dá para cadastrar os funcionários, mas os pedidos só saem depois de conectar em{' '}
            <Link to="/configuracoes" className="font-medium underline underline-offset-2">Configurações</Link>.
          </span>
        </p>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="funcionarios">Cadastro{funcionarios.length ? ` (${funcionarios.length})` : ''}</TabsTrigger>
          <TabsTrigger value="envios">Pedidos de feedback{envios.length ? ` (${envios.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="funcionarios">
          <AbaFuncionarios restauranteId={restauranteId} funcionarios={funcionarios} onMudou={carregar} />
        </TabsContent>
        <TabsContent value="envios">
          <AbaEnvios envios={envios} convites={convites} onPedir={() => setPedindo(true)} onMudou={carregar} />
        </TabsContent>
      </Tabs>

      <PedirFeedback aberto={pedindo} funcionarios={funcionarios} onFechar={() => setPedindo(false)} onCriado={() => { carregar(); setAba('envios') }} />
    </div>
  )
}
