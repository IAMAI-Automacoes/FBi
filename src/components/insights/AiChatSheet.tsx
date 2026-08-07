import { useState, useEffect, KeyboardEvent, useRef } from 'react'
import { Send, AlertCircle, RefreshCw, PlusCircle, Lightbulb, ArrowDown } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { InsightData } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { FormattedMessage, parseInline, LINK_ESCURO } from '@/lib/chat-utils'
import { useChat } from '@/hooks/use-chat'
import { supabase } from '@/lib/supabase/client'
import { useRestauranteConfig } from '@/hooks/use-restaurante-config'
import { useAuth } from '@/hooks/use-auth'
import { getIniciais } from '@/lib/iniciais'
import { useToast } from '@/hooks/use-toast'

interface AiChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  insight: InsightData | null
}

const SUGGESTIONS = [
  'Quais as principais causas desse problema?',
  'Como resolver isso rapidamente?',
  'Mostrar feedbacks relacionados',
]

export function AiChatSheet({ open, onOpenChange, insight }: AiChatSheetProps) {
  const [message, setMessage] = useState('')
  const [contextoDados, setContextoDados] = useState<any>({ insight })
  const { toast } = useToast()
  const { mascote } = useRestauranteConfig()
  const { usuario } = useAuth()
  const mascoteNome = mascote.nome

  const { messages, loading, error, enviar, setMessages, setError } = useChat(
    'insights',
    contextoDados,
  )

  const viewportRef = useRef<HTMLDivElement>(null)
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const prevMessagesLength = useRef(0)

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (isScrolledUp) {
        setHasNewMessages(true)
      } else {
        setTimeout(() => {
          if (viewportRef.current) {
            viewportRef.current.scrollTo({
              top: viewportRef.current.scrollHeight,
              behavior: 'smooth',
            })
          }
        }, 100)
      }
    }
    prevMessagesLength.current = messages.length
  }, [messages.length, isScrolledUp])

  useEffect(() => {
    if (loading && !isScrolledUp) {
      setTimeout(() => {
        if (viewportRef.current) {
          viewportRef.current.scrollTo({
            top: viewportRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }
      }, 50)
    }
  }, [loading, isScrolledUp])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) <= 50
    setIsScrolledUp(!isAtBottom)
    if (isAtBottom) {
      setHasNewMessages(false)
    }
  }

  const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      })
      setIsScrolledUp(false)
      setHasNewMessages(false)
    }
  }

  useEffect(() => {
    if (open && insight) {
      setMessages([])
      setError(null)

      const fetchContextAndGreet = async () => {
        try {
          const { data: config } = await supabase
            .from('restaurantes')
            .select('mascote_config')
            .limit(1)
            .single()

          let feedbacks = []
          if (insight.category) {
            const { data } = await supabase
              .from('feedbacks_restaurante')
              .select('*')
              .eq('categoria', insight.category)
              .order('created_at', { ascending: false })
              .limit(30)
            if (data) feedbacks = data
          }

          const novoContexto = {
            insight,
            feedbacksRelacionados: feedbacks,
            mascote_config: config?.mascote_config,
          }
          setContextoDados(novoContexto)

          const sysMsg = `Apresente-se e comente sobre o insight atual: "${insight.title}". Sugira abordagens de forma direta.`
          await enviar('', novoContexto, sysMsg)
        } catch (e) {
          console.error('Erro ao configurar chat', e)
        }
      }

      fetchContextAndGreet()
    }
  }, [open, insight])

  const handleSend = (text: string) => {
    if (!text.trim() || loading) return
    setMessage('')
    enviar(text, contextoDados)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(message)
    }
  }

  const handleCriarAcao = async (dados: any) => {
    if (!usuario?.restaurante_id) {
      toast({ title: 'Erro ao criar ação', description: 'Restaurante não identificado.', variant: 'destructive' })
      return
    }
    try {
      const { error: err } = await supabase.from('acoes_operacionais').insert({
        restaurante_id: usuario.restaurante_id,
        titulo_acao: dados?.titulo || insight?.title || 'Nova Ação',
        prioridade: dados?.prioridade || insight?.priority || 'IMPORTANTE',
        status: 'PENDENTE',
        categoria: insight?.category,
        texto: dados?.descricao || insight?.description,
      })
      if (err) throw err
      toast({ title: 'Ação criada', description: 'Plano de ação salvo com sucesso.' })
    } catch (e: any) {
      toast({ title: 'Erro ao criar ação', description: e.message, variant: 'destructive' })
    }
  }

  const handleCriarInsight = async (dados: any) => {
    if (!usuario?.restaurante_id) {
      toast({ title: 'Erro ao criar insight', description: 'Restaurante não identificado.', variant: 'destructive' })
      return
    }
    try {
      const { error: err } = await supabase.from('insights').insert({
        restaurante_id: usuario.restaurante_id,
        titulo: dados?.titulo || 'Novo Insight',
        prioridade: dados?.prioridade || 'OBSERVACAO',
        categoria: insight?.category,
        descricao: dados?.descricao,
        gerado_por: 'manual',
      })
      if (err) throw err
      toast({ title: 'Insight criado', description: 'Insight salvo com sucesso.' })
    } catch (e: any) {
      toast({ title: 'Erro ao criar insight', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[380px] p-0 flex flex-col h-full border-l shadow-2xl">
        <SheetHeader className="p-4 border-b bg-white text-foreground">
          <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
            <Avatar className="h-10 w-10 border border-gray-100 shadow-sm">
              {mascote.fotoUrl && <AvatarImage src={mascote.fotoUrl} alt={mascoteNome} className="object-cover" />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {getIniciais(mascoteNome, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="font-bold text-gray-900">{mascoteNome}</span>
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Online
              </span>
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Converse com IA para planejar ações
          </SheetDescription>
        </SheetHeader>

        {insight && (
          <div className="px-4 py-3 bg-blue-50/50 border-b text-sm text-gray-700">
            <span className="font-semibold text-gray-900 block mb-1 text-xs uppercase tracking-wider text-blue-800">
              Contexto Atual:
            </span>
            <span className="line-clamp-2">{insight.title}</span>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden bg-white">
          <ScrollArea viewportRef={viewportRef} onScroll={handleScroll} className="h-full">
            <div className="p-4 space-y-4 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className="flex flex-col gap-1 w-full">
                  <div
                    className={cn(
                      'flex w-full',
                      msg.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'px-4 py-3 rounded-2xl text-sm max-w-[85%] shadow-sm whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-[#1D4ED8] text-white rounded-tr-none'
                          : 'bg-[#F9FAFB] text-[#1F2937] border border-gray-100 rounded-tl-none',
                      )}
                    >
                      {msg.role === 'user' ? parseInline(msg.text, LINK_ESCURO) : <FormattedMessage content={msg.text} />}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex w-full justify-start">
                  <div className="px-4 py-3 rounded-2xl text-sm bg-[#F9FAFB] border border-gray-100 rounded-tl-none shadow-sm flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex w-full justify-start mt-2">
                  <div className="px-4 py-3 rounded-2xl text-sm max-w-[85%] shadow-sm bg-red-50 text-red-700 border border-red-100 flex flex-col gap-2 rounded-tl-none">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>Desculpe, tive um problema. Tente novamente.</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white hover:bg-gray-50 text-gray-700 h-7 self-start"
                      onClick={() => enviar(message, contextoDados)}
                    >
                      <RefreshCw className="w-3 h-3 mr-2" /> Tentar Novamente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {isScrolledUp && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 transition-all animate-fade-in-up">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full shadow-lg border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-4 h-9 flex items-center gap-2"
                onClick={scrollToBottom}
              >
                {hasNewMessages ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-xs font-medium">Novas mensagens</span>
                    <ArrowDown className="w-3.5 h-3.5 ml-1" />
                  </>
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-white flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {SUGGESTIONS.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSend(suggestion)}
                className="whitespace-nowrap px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-700 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 relative">
            <Textarea
              placeholder={`Pergunte ao ${mascoteNome}...`}
              className="min-h-[60px] max-h-[120px] resize-none pr-12 rounded-xl"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 bg-[#1D4ED8] hover:bg-blue-800 text-white rounded-lg"
              onClick={() => handleSend(message)}
              disabled={!message.trim() || loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
