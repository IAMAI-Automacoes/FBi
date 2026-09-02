import { useState, useEffect, useRef, useCallback } from 'react'
import type { PeriodInfo, DashboardData } from '@/lib/queries/visao-geral'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { KpiCards } from '@/components/dashboard/KpiCards'
import { TrendChart } from '@/components/dashboard/TrendChart'
import { RecentFeedbacks } from '@/components/dashboard/RecentFeedbacks'
import { TemasFeedback } from '@/components/dashboard/TemasFeedback'
import {
  buscarKpis,
  buscarTendencia,
  buscarCategorias,
  buscarUltimosFeedbacks,
  getPeriodDates,
} from '@/lib/queries/visao-geral'
import { useToast } from '@/hooks/use-toast'
import { useFiltroPersistente } from '@/hooks/use-filtro-persistente'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { MessageSquare, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function Index() {
  const [period, setPeriod] = useFiltroPersistente<PeriodInfo>('visao-geral:periodo', '7d')
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { usuario } = useAuth()
  // Skeleton só aparece no carregamento inicial — troca de período atualiza silenciosamente
  const hasLoadedOnce = useRef(false)

  const carregar = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsLoading(true)
    try {
      const restauranteId = usuario?.restaurante_id ?? null
      const [kpis, chartData, categories, recentFeedbacks] = await Promise.all([
        buscarKpis(restauranteId, period),
        buscarTendencia(restauranteId, period),
        buscarCategorias(restauranteId, period),
        buscarUltimosFeedbacks(restauranteId, 5, period),
      ])
      setData({ kpis, chartData, categories, recentFeedbacks })
      hasLoadedOnce.current = true
    } catch (error) {
      console.error('Erro ao carregar visão geral:', error)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar os dados do dashboard.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [period, usuario, toast])

  useEffect(() => { carregar() }, [carregar])

  // Tempo real: novos feedbacks (originais e separados) recarregam KPIs, gráficos
  // e a lista sozinhos, sem F5.
  useRealtimeReload(
    ['feedbacks_restaurante', 'feedbacks_originais'],
    usuario?.restaurante_id ?? null,
    carregar,
  )

  // isNeverUsed: sem dados em nenhum período → tela de boas-vindas
  // isPeriodEmpty: tem dados históricos mas zero no período atual → mostrar dashboard com aviso
  const isNeverUsed = !isLoading && data?.kpis.totalFeedbacks === 0 && !data?.kpis.hasPrevData
  const isPeriodEmpty = !isLoading && data?.kpis.totalFeedbacks === 0 && data?.kpis.hasPrevData
  // numero_whatsapp preenchido = WhatsApp conectado (o edge function limpa no disconnect).
  const whatsappConectado = !!usuario?.numero_whatsapp

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">

      {isLoading ? (
        <>
          <div className="flex items-center gap-10">
            <Skeleton className="h-14 w-32" />
            <Skeleton className="h-14 w-32" />
          </div>
          <Skeleton className="h-[350px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </>
      ) : isNeverUsed ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 mb-6">
            <MessageSquare className="h-10 w-10 text-[#1D4ED8]" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Você ainda não recebeu nenhum feedback
          </h2>
          <p className="text-gray-500 max-w-md mb-8">
            {whatsappConectado
              ? 'Seu WhatsApp está conectado. Compartilhe o QR Code com seus clientes para começar a coletar feedbacks.'
              : 'Configure o WhatsApp nas configurações do restaurante e compartilhe o QR Code com seus clientes para começar a coletar feedbacks.'}
          </p>
          <Button asChild className="bg-[#1D4ED8] hover:bg-blue-700">
            <Link to="/configuracoes">
              <Settings className="mr-2 h-4 w-4" />
              Ir para Configurações
            </Link>
          </Button>
        </div>
      ) : data ? (
        <>
          {isPeriodEmpty && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nenhum feedback recebido neste período. Altere o intervalo ou aguarde novos feedbacks.
            </div>
          )}
          <KpiCards data={data.kpis} period={period} />
          <TrendChart
            data={data.chartData}
            categories={data.categories}
            period={period}
            onPeriodChange={setPeriod}
          />
          <TemasFeedback
            restauranteId={usuario?.restaurante_id ?? null}
            dias={getPeriodDates(period).days}
          />
          <RecentFeedbacks feedbacks={data.recentFeedbacks} />
        </>
      ) : null}
    </div>
  )
}
