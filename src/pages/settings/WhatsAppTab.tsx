import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, CheckCircle2, RefreshCw, Loader2, Smartphone, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { CampoTelefone } from '@/components/CampoTelefone'

interface EstadoWhats {
  hasInstance: boolean
  connected: boolean
  qrcode: string | null
  numero: string | null
  /** A função desfez a conexão e diz por quê (ex.: era o número do dono). */
  recusado?: string | null
}

function qrSrc(qr: string): string {
  if (qr.startsWith('data:')) return qr
  if (qr.startsWith('<')) return qr // HTML — tratado à parte
  return `data:image/png;base64,${qr}`
}

/** O número dos avisos urgentes, controlado por quem usa o cartão. Em
 *  Configurações ele é salvo pela barra "Salvar alterações" da página, junto
 *  com o resto — o cartão não tem botão próprio. */
export interface CampoNumeroDoDono {
  valor: string
  /** O que está gravado no banco (para o aviso de "sem número"). */
  salvo: string
  aoMudar: (valor: string, temDigitos: boolean) => void
}

export function WhatsAppTab({
  restauranteId,
  embedded = false,
  onConnectedChange,
  numeroDono,
}: {
  restauranteId: number | null
  /** No onboarding renderiza só o conteúdo, sem o Card externo (a etapa já tem cabeçalho). */
  embedded?: boolean
  /** Avisa o pai (ex.: onboarding) quando o estado de conexão muda. */
  onConnectedChange?: (connected: boolean) => void
  /** Sem ele, o cartão dos avisos urgentes não aparece. */
  numeroDono?: CampoNumeroDoDono
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<EstadoWhats | null>(null)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastConnectRef = useRef(0)
  // Motivo da última conexão recusada; fica na tela até tentar de novo.
  const [recusa, setRecusa] = useState<string | null>(null)

  const chamar = useCallback(async (action: string): Promise<EstadoWhats | null> => {
    const { data, error } = await supabase.functions.invoke('whatsapp-instancia', { body: { action } })
    if (error) {
      // Extrai a mensagem real que a função retornou no corpo (ex: secrets ausentes)
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* usa msg padrão */ }
      throw new Error(msg)
    }
    if ((data as any)?.error) throw new Error((data as any).error)
    return data as EstadoWhats
  }, [])

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // Estado inicial
  useEffect(() => {
    let ativo = true
    chamar('status')
      .then((d) => { if (ativo) setEstado(d) })
      .catch(() => { if (ativo) setEstado({ hasInstance: false, connected: false, qrcode: null, numero: null }) })
      .finally(() => { if (ativo) setLoading(false) })
    return () => { ativo = false; pararPolling() }
  }, [chamar, pararPolling])

  // Reporta o estado de conexão pro pai (o onboarding usa pra liberar o "Próximo").
  useEffect(() => {
    onConnectedChange?.(estado?.connected === true)
  }, [estado?.connected, onConnectedChange])

  const iniciarConexao = async () => {
    setRecusa(null)
    setConectando(true)
    const disparar = async () => {
      const d = await chamar('iniciar')
      lastConnectRef.current = Date.now()
      return d
    }
    // Conexão desfeita pela função (o número escaneado é o do dono). Tem que
    // ser checado ANTES do "instância sumiu → recria": senão o polling criaria
    // outra instância e mostraria um QR novo como se nada tivesse acontecido.
    const recusou = (s: EstadoWhats | null): boolean => {
      if (!s?.recusado) return false
      pararPolling()
      setConectando(false)
      setEstado(s)
      setRecusa(s.recusado)
      toast({ title: 'Este número não pode ser conectado', description: s.recusado, variant: 'destructive' })
      return true
    }
    const concluir = (s: EstadoWhats | null) => {
      pararPolling()
      setConectando(false)
      toast({ title: 'WhatsApp conectado!', description: s?.numero ? `Número ${s.numero}` : undefined })
    }
    try {
      const d = await disparar()
      if (recusou(d)) return
      setEstado(d)
      if (d?.connected) { concluir(d); return }
      // Polling: detecta conexão e renova o QR (a uazapi expira o QR em ~2 min)
      pararPolling()
      pollRef.current = setInterval(async () => {
        try {
          // QR perto de expirar → re-dispara o connect para gerar um novo
          if (Date.now() - lastConnectRef.current > 110000) {
            const d2 = await disparar()
            if (recusou(d2)) return
            setEstado(d2)
            if (d2?.connected) concluir(d2)
            return
          }
          const s = await chamar('status')
          if (recusou(s)) return
          // Se a instância sumiu no meio do processo, recria e continua
          if (s && !s.hasInstance) {
            const d3 = await disparar()
            if (recusou(d3)) return
            setEstado(d3)
            if (d3?.connected) concluir(d3)
            return
          }
          setEstado(s)
          if (s?.connected) concluir(s)
        } catch { /* transitório: mantém tentando */ }
      }, 3000)
    } catch (err) {
      pararPolling()
      setConectando(false)
      toast({ title: 'Erro ao conectar', description: (err as Error).message, variant: 'destructive' })
    }
  }

  const reiniciar = async () => {
    setReiniciando(true)
    try {
      await chamar('reset')
      const s = await chamar('status')
      setEstado(s)
      toast({ title: 'Conexão reiniciada' })
    } catch (err) {
      toast({ title: 'Erro ao reiniciar', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setReiniciando(false)
    }
  }

  const desconectar = async () => {
    setDesconectando(true)
    pararPolling()
    setConectando(false)
    try {
      const d = await chamar('desconectar')
      setEstado(d)
      toast({ title: 'WhatsApp desconectado' })
    } catch (err) {
      toast({ title: 'Erro ao desconectar', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setDesconectando(false)
    }
  }

  if (!restauranteId) return null

  const conteudo = (
    estado?.connected ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800">Conectado</p>
                <p className="text-sm text-emerald-700">
                  {estado.numero ? `Número ${estado.numero}` : 'WhatsApp ativo'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={reiniciar} disabled={reiniciando || desconectando}
                title="Reinicia a sessão se o envio/recebimento travar">
                <RefreshCw className={cn('h-4 w-4 mr-1', reiniciando && 'animate-spin')} />
                {reiniciando ? 'Reiniciando…' : 'Reiniciar'}
              </Button>
              <Button variant="destrutivoVazado" onClick={desconectar} disabled={desconectando}>
                {desconectando ? 'Desconectando…' : 'Desconectar'}
              </Button>
            </div>
          </div>
        ) : conectando ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Abra o WhatsApp no celular → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e
              escaneie o QR code abaixo.
            </p>
            <div className="h-56 w-56 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
              {estado?.qrcode && !estado.qrcode.startsWith('<') ? (
                <img src={qrSrc(estado.qrcode)} alt="QR Code do WhatsApp" className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Gerando QR code…</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> O QR é renovado automaticamente enquanto esta tela está aberta.
            </div>
            <Button variant="ghost" size="sm" onClick={desconectar}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Smartphone className="h-7 w-7 text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-800">Nenhum WhatsApp conectado</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Conecte um número para começar a receber feedbacks.
              </p>
            </div>
            {recusa && (
              <p role="alert" className="max-w-sm rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {recusa}
              </p>
            )}
            <Button onClick={iniciarConexao}>
              <MessageCircle className="h-4 w-4 mr-1.5" /> Conectar WhatsApp
            </Button>
            {loading && (
              <span className="text-xs text-muted-foreground">Verificando conexão…</span>
            )}
          </div>
        )
  )

  // No onboarding: só o conteúdo, sem o Card (a etapa já traz título/descrição).
  if (embedded) return conteudo

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-600" />
          <CardTitle>WhatsApp</CardTitle>
        </div>
        <CardDescription>
          Conecte o número de WhatsApp que recebe e responde os feedbacks dos clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {conteudo}
        {numeroDono && (
          <CartaoNumeroDoDono
            numero={numeroDono.valor}
            aoMudar={numeroDono.aoMudar}
            semNumero={!numeroDono.salvo}
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * O cartão do número do dono, para onde vão os avisos urgentes. Sem botão
 * próprio: em Configurações salva pela barra "Salvar alterações" da página; no
 * onboarding ele é a etapa inteira e salva no "Próximo".
 *
 * Separado do número conectado, e a distinção é o ponto: aquele é a linha por
 * onde o CLIENTE manda o feedback; este é o celular de quem precisa largar o
 * que está fazendo quando alguém passa mal no salão. O aviso sai de um e vai
 * para o outro, então nunca podem ser o mesmo (o banco também recusa).
 */
export function CartaoNumeroDoDono({
  numero,
  aoMudar,
  semNumero,
  semTitulo = false,
  children,
}: {
  numero: string
  aoMudar: (valor: string, temDigitos: boolean) => void
  /** Mostra o alerta de que, sem número, nenhum aviso urgente sai. */
  semNumero: boolean
  /** Sem o título "Avisos urgentes" — quando a tela em volta já tem esse título. */
  semTitulo?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          {!semTitulo && <p className="text-sm font-semibold text-gray-800">Avisos urgentes</p>}
          <p className={cn('text-[13px] text-muted-foreground', !semTitulo && 'mt-0.5')}>
            Quando chegar um feedback grave — cliente passou mal, corpo estranho na comida,
            praga no salão — mandamos uma mensagem na hora para este número.
            Use o seu WhatsApp pessoal, diferente do WhatsApp do restaurante.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CampoTelefone
              value={numero}
              onChange={aoMudar}
              className="h-9 w-[210px] rounded-md border-gray-200 bg-white px-2.5 text-sm focus-within:border-amber-300 focus-within:ring-amber-300"
            />
            {children}
          </div>

          {semNumero && (
            <p className="mt-2 text-[12px] font-medium text-amber-700">
              Sem este número, nenhum aviso urgente é enviado.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
