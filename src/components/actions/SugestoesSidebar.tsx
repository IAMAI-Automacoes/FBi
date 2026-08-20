import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, Check, X, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  buscarAcoes,
  aprovarSugestao,
  rejeitarSugestao,
  sugerirAcoesManualmente,
} from '@/lib/queries/acoes'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

interface SugestoesSidebarProps {
  onActionProcessed?: () => void
}

export function SugestoesSidebar({ onActionProcessed }: SugestoesSidebarProps) {
  const { usuario } = useAuth()
  const [sugestoes, setSugestoes] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      const data = await buscarAcoes(usuario?.restaurante_id || 0, false)
      setSugestoes(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (usuario?.restaurante_id) load()
  }, [open, usuario?.restaurante_id])

  const handleAprovar = async (id: number) => {
    try {
      await aprovarSugestao(id)
      toast.success('Sugestão aprovada e movida para Pendente')
      setSugestoes((s) => s.filter((sug) => sug.id !== id))
      onActionProcessed?.()
    } catch (err) {
      toast.error('Erro ao aprovar sugestão')
    }
  }

  const handleRejeitar = async (id: number) => {
    if (!confirm('Deseja realmente rejeitar esta sugestão?')) return
    try {
      await rejeitarSugestao(id)
      toast.success('Sugestão rejeitada')
      setSugestoes((s) => s.filter((sug) => sug.id !== id))
    } catch (err) {
      toast.error('Erro ao rejeitar sugestão')
    }
  }

  const handleSugerirAgora = async () => {
    try {
      setLoading(true)
      const res = await sugerirAcoesManualmente(usuario?.restaurante_id || 0)
      if (res?.status === 'aguardando_aprovacao') {
        toast.info('Já existem sugestões aguardando aprovação.')
      } else if (res?.sugestoes_criadas > 0) {
        toast.success(`${res.sugestoes_criadas} novas ações sugeridas com sucesso!`)
        await load()
      } else {
        toast.info('Nenhuma nova sugestão gerada no momento.')
      }
    } catch (err) {
      toast.error('Erro ao processar sugestões automáticas.')
    } finally {
      setLoading(false)
    }
  }

  const count = sugestoes.length

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className={cn(
            'fixed top-20 right-6 z-40 gap-2 shadow-lg transition-all rounded-full px-5',
            count > 0
              ? 'bg-[#F97316] text-white hover:bg-[#EA580C] animate-pulse'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-border',
          )}
          variant={count > 0 ? 'default' : 'outline'}
        >
          <Lightbulb className={cn('w-4 h-4', count > 0 ? 'text-yellow-100' : '')} />
          Sugestões da IA
          {count > 0 && (
            <Badge
              variant="secondary"
              className="bg-white/20 text-white hover:bg-white/30 ml-1 px-1.5 py-0"
            >
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto z-[100]">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-[#F97316]">
            <Lightbulb className="w-5 h-5" />
            Sugestões da IA
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground text-sm animate-pulse">Buscando sugestões...</p>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Lightbulb className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-foreground font-medium">Nenhuma sugestão pendente</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-[250px] mb-6">
                A IA analisará seus feedbacks e sugerirá ações automaticamente aqui.
              </p>
              <Button
                onClick={handleSugerirAgora}
                className="bg-[#F97316] hover:bg-[#EA580C] text-white rounded-full px-6 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sugerir ações agora
              </Button>
            </div>
          ) : (
            sugestoes.map((sug) => (
              <div
                key={sug.id}
                className="border rounded-xl p-4 bg-slate-50/50 space-y-3 shadow-sm hover:shadow transition-shadow"
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-semibold text-sm leading-tight text-foreground">
                    {sug.titulo_acao}
                  </h4>
                  <Badge
                    variant="outline"
                    className="text-[10px] whitespace-nowrap bg-white font-bold"
                  >
                    {sug.prioridade || 'NORMAL'}
                  </Badge>
                </div>
                {sug.categoria && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-50"
                  >
                    {sug.categoria}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground">{sug.plano_detalhado}</p>
                <div className="flex gap-2 pt-2 mt-2 border-t border-border">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-sm"
                    onClick={() => handleAprovar(sug.id)}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                    onClick={() => handleRejeitar(sug.id)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Rejeitar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
