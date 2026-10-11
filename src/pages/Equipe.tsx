import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AbaEnvios } from '@/components/equipe/AbaEnvios'
import { AbaFuncionarios } from '@/components/equipe/AbaFuncionarios'
import { AbaRespostas } from '@/components/equipe/AbaRespostas'
import { AbaResumo } from '@/components/equipe/AbaResumo'
import { PedirFeedback } from '@/components/equipe/PedirFeedback'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import type { ConviteAnonimo, Envio, Funcionario, PontoEquipe, RespostaAnonima } from '@/lib/equipe'
import { acaoEquipe, buscarConvites, buscarEnvios, buscarFuncionarios, buscarPontos, buscarRespostas, type EstadoNumero } from '@/lib/queries/equipe'

/* Equipe: o restaurante cadastra os funcionários, pede feedback pelo WhatsApp
   (de um número só do EasyFeed, que o dono não lê) e vê aqui o que a equipe
   respondeu, analisado e sem nome. É separado do feedback dos clientes: outras
   tabelas, outras categorias, e nada daqui entra em Feedbacks, Insights ou
   Ações. Por enquanto só o admin da plataforma vê (menu, rota e a função
   equipe com SO_ADMIN). */

type Aba = 'resumo' | 'respostas' | 'funcionarios' | 'envios'

export default function Equipe() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('resumo')
  const [pedindo, setPedindo] = useState(false)
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [convites, setConvites] = useState<ConviteAnonimo[]>([])
  const [respostas, setRespostas] = useState<RespostaAnonima[]>([])
  const [pontos, setPontos] = useState<PontoEquipe[]>([])
  // null = ainda conferindo.
  const [numeroConectado, setNumeroConectado] = useState<boolean | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [f, e, c, r, p] = await Promise.all([
        buscarFuncionarios(restauranteId), buscarEnvios(restauranteId), buscarConvites(restauranteId), buscarRespostas(restauranteId), buscarPontos(restauranteId),
      ])
      setFuncionarios(f)
      setEnvios(e)
      setConvites(c)
      setRespostas(r)
      setPontos(p)
    } catch {
      toast.error('Não foi possível carregar a equipe.')
    } finally {
      setCarregando(false)
    }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['equipe_funcionarios', 'equipe_envios', 'equipe_convites', 'equipe_respostas'], restauranteId, carregar)
  useEffect(() => {
    acaoEquipe<EstadoNumero>('numero_status').then((r) => setNumeroConectado(r.ok ? r.conectado === true : null))
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
          <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
          <p className="mt-1 text-sm text-gray-500">Peça feedback para quem trabalha no restaurante. As respostas chegam aqui analisadas, sem nome e sem número.</p>
        </div>
        <Button onClick={() => setPedindo(true)} className="shrink-0 bg-[#1D4ED8] hover:bg-[#1E40AF]">
          <Send className="mr-1.5 h-4 w-4" /> Pedir feedback
        </Button>
      </div>

      {numeroConectado === false && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            O número do EasyFeed que fala com a equipe não está conectado. Dá para cadastrar os funcionários, mas os pedidos só saem depois de conectar em{' '}
            <Link to="/admin?aba=equipe" className="font-medium underline underline-offset-2">Admin → Equipe</Link>.
          </span>
        </p>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="respostas">Respostas{respostas.length ? ` (${respostas.length})` : ''}</TabsTrigger>
          <TabsTrigger value="funcionarios">Funcionários{funcionarios.length ? ` (${funcionarios.length})` : ''}</TabsTrigger>
          <TabsTrigger value="envios">Pedidos{envios.length ? ` (${envios.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <AbaResumo
            funcionarios={funcionarios} envios={envios} convites={convites} respostas={respostas} pontos={pontos}
            onMudou={carregar} onPedir={() => setPedindo(true)} onCadastrar={() => setAba('funcionarios')}
          />
        </TabsContent>
        <TabsContent value="respostas">
          <AbaRespostas envios={envios} respostas={respostas} pontos={pontos} onMudou={carregar} />
        </TabsContent>
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
