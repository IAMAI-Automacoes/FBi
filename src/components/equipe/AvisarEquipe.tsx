import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AVISO_MAX, AVISO_MIN, formatarAteQuando } from '@/lib/equipe'
import { acaoEquipe, type RascunhoAviso } from '@/lib/queries/equipe'

/* Avisar a equipe: a ação foi concluída, e o restaurante conta para TODOS os
   funcionários o que mudou. A IA só rascunha: quem decide o texto (e se manda)
   é quem está na tela. Nunca diz quem falou. As frases fixas e o rascunho vêm
   da função equipe (ação "rascunho_aviso"). */
export function AvisarEquipe({ acao, onFechar, onEnviado }: {
  /** A ação concluída; null = fechado. */
  acao: { id: number; titulo: string } | null
  onFechar: () => void
  onEnviado?: () => void
}) {
  const [rascunho, setRascunho] = useState<RascunhoAviso | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const acaoId = acao?.id ?? null

  useEffect(() => {
    if (!acaoId) return
    let vivo = true
    setRascunho(null)
    setTexto('')
    setErro(null)
    acaoEquipe<RascunhoAviso>('rascunho_aviso', { acao_id: acaoId }).then((r) => {
      if (!vivo) return
      if (!r.ok || typeof r.texto !== 'string') return setErro(r.error || 'Não foi possível preparar o aviso.')
      setRascunho(r as RascunhoAviso)
      setTexto(r.texto)
    })
    return () => { vivo = false }
  }, [acaoId])

  const limpo = texto.trim()
  const textoOk = limpo.length >= AVISO_MIN && limpo.length <= AVISO_MAX
  const quantos = rascunho?.destinatarios ?? 0
  const jaAvisou = rascunho?.ja_avisou_em ?? null
  const podeEnviar = !!rascunho && textoOk && quantos > 0 && !jaAvisou && rascunho.whatsapp_conectado

  const enviar = async () => {
    if (!acaoId || !podeEnviar) return
    setEnviando(true)
    setErro(null)
    const r = await acaoEquipe<{ convites: number; no_horario: boolean }>('criar_aviso', { acao_id: acaoId, texto: limpo })
    setEnviando(false)
    if (!r.ok) return setErro(r.error || 'Não foi possível criar o aviso.')
    toast.success(r.no_horario
      ? `Aviso criado. As mensagens começam a sair agora, para ${r.convites} ${r.convites === 1 ? 'pessoa' : 'pessoas'}.`
      : `Aviso criado para ${r.convites} ${r.convites === 1 ? 'pessoa' : 'pessoas'}. As mensagens saem no próximo horário de envio (seg. a sáb., 9h às 20h).`)
    onEnviado?.()
    onFechar()
  }

  return (
    <Dialog open={!!acao} onOpenChange={(a) => !a && !enviando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contar para a equipe?</DialogTitle>
          <DialogDescription>
            Ação concluída: <span className="font-medium text-gray-800">{acao?.titulo}</span>. Todos os funcionários recebem uma mensagem contando o que mudou, sem dizer quem comentou.
          </DialogDescription>
        </DialogHeader>

        {!rascunho && !erro && (
          <div className="flex h-40 items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}

        {rascunho && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              {rascunho.sensivel && (
                <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Esta ação nasceu de um relato sensível. Um aviso para todos pode expor quem relatou ou a pessoa envolvida. Na dúvida, não avise.</span>
                </p>
              )}
              {jaAvisou && (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">A equipe já foi avisada desta ação em {formatarAteQuando(jaAvisou)}.</p>
              )}
              {!rascunho.whatsapp_conectado && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">O WhatsApp do restaurante não está conectado. Conecte em Configurações para o aviso sair.</p>
              )}
              {quantos === 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Nenhum funcionário ativo para receber.</p>
              )}

              <div>
                <label htmlFor="texto-aviso" className="text-sm font-medium text-gray-700">O que mudou</label>
                <Textarea
                  id="texto-aviso"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={7}
                  maxLength={AVISO_MAX}
                  disabled={!!jaAvisou}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {limpo.length} de {AVISO_MAX}
                  {rascunho.da_ia ? '. A IA escreveu este rascunho a partir da ação; ajuste como quiser.' : '. Texto-modelo; escreva com as suas palavras.'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Como a mensagem chega</p>
              <div className="mt-1.5 rounded-xl bg-[#EFEAE2] p-3">
                <div className="ml-auto max-w-[95%] whitespace-pre-line rounded-lg rounded-tr-none bg-white px-3 py-2 text-[13px] leading-relaxed text-gray-900 shadow-sm">
                  {[rascunho.abertura, limpo || '…', rascunho.fecho].join('\n\n')}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">O nome muda para o de cada pessoa. Sai aos poucos, cerca de uma por minuto, de segunda a sábado, das 9h às 20h. Quem pediu para parar não recebe.</p>
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-rose-600">{erro}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onFechar} disabled={enviando}>{jaAvisou ? 'Fechar' : 'Não avisar'}</Button>
          {!jaAvisou && (
            <Button onClick={enviar} disabled={!podeEnviar || enviando} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
              {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {quantos > 0 ? `Enviar para ${quantos} ${quantos === 1 ? 'pessoa' : 'pessoas'}` : 'Enviar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
