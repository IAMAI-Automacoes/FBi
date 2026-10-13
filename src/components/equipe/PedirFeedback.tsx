import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fraseDoPrazo, PERGUNTA_MAX, PERGUNTA_MIN, podeReceber, type Funcionario } from '@/lib/equipe'
import { acaoEquipe, type PreviaConvite } from '@/lib/queries/equipe'

/* Pedir feedback: escreve a pergunta, escolhe quem recebe e vê a mensagem
   como ela chega. Quem monta o texto de verdade é a função equipe (as frases
   fixas vêm de lá, pela ação "previa"). */
export function PedirFeedback({ aberto, funcionarios, onFechar, onCriado }: {
  aberto: boolean
  funcionarios: Funcionario[]
  onFechar: () => void
  onCriado: () => void
}) {
  const [previa, setPrevia] = useState<PreviaConvite | null>(null)
  const [pergunta, setPergunta] = useState('')
  const [modo, setModo] = useState<'todos' | 'alguns'>('todos')
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podem = funcionarios.filter(podeReceber)

  useEffect(() => {
    if (!aberto) return
    setModo('todos')
    setEscolhidos(new Set())
    setErro(null)
    acaoEquipe<PreviaConvite>('previa').then((r) => {
      if (!r.ok || !r.abertura) return setErro(r.error || 'Não foi possível abrir a prévia.')
      setPrevia(r as PreviaConvite)
      setPergunta((atual) => atual || r.pergunta_padrao || '')
    })
  }, [aberto])

  const quantos = modo === 'todos' ? podem.length : podem.filter((f) => escolhidos.has(f.id)).length
  const limpa = pergunta.trim()
  const perguntaOk = limpa.length >= PERGUNTA_MIN && limpa.length <= PERGUNTA_MAX

  const alternar = (id: number) => setEscolhidos((atual) => {
    const novo = new Set(atual)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    return novo
  })

  const enviar = async () => {
    if (!perguntaOk || !quantos) return
    setEnviando(true)
    setErro(null)
    const r = await acaoEquipe<{ convites: number; no_horario: boolean }>('criar_envio', {
      pergunta: limpa, ...(modo === 'alguns' ? { funcionario_ids: [...escolhidos] } : {}),
    })
    setEnviando(false)
    if (!r.ok) return setErro(r.error || 'Não foi possível criar o pedido.')
    toast.success(r.no_horario
      ? `Pedido criado. As mensagens começam a sair agora, para ${r.convites} ${r.convites === 1 ? 'pessoa' : 'pessoas'}.`
      : `Pedido criado para ${r.convites} ${r.convites === 1 ? 'pessoa' : 'pessoas'}. As mensagens saem no próximo horário de envio (seg. a sáb., 9h às 20h).`)
    setPergunta('')
    onCriado()
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !enviando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedir feedback para a equipe</DialogTitle>
          <DialogDescription>Cada pessoa recebe uma mensagem pelo WhatsApp e responde por lá, em texto ou áudio. A resposta aparece em Feedbacks, aqui na Equipe.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="pergunta-equipe" className="mb-1 block text-xs font-semibold text-gray-600">A pergunta</label>
              <Textarea id="pergunta-equipe" value={pergunta} onChange={(e) => setPergunta(e.target.value)} rows={4} maxLength={PERGUNTA_MAX} className="text-sm" />
              <p className={cn('mt-1 text-xs', limpa.length > 0 && !perguntaOk ? 'text-rose-600' : 'text-gray-400')}>
                {limpa.length < PERGUNTA_MIN ? `Pelo menos ${PERGUNTA_MIN} letras.` : `${limpa.length} de ${PERGUNTA_MAX}`}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-600">Quem recebe</p>
              <div className="space-y-1.5 text-sm text-gray-800">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="quem-recebe" checked={modo === 'todos'} onChange={() => setModo('todos')} className="accent-[#1D4ED8]" />
                  Toda a equipe ({podem.length})
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="quem-recebe" checked={modo === 'alguns'} onChange={() => setModo('alguns')} className="accent-[#1D4ED8]" />
                  Escolher
                </label>
              </div>
              {modo === 'alguns' && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {podem.map((f) => (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-gray-50">
                        <Checkbox checked={escolhidos.has(f.id)} onCheckedChange={() => alternar(f.id)} />
                        <span className="min-w-0 truncate">{f.nome}{f.funcao && <span className="text-gray-400"> · {f.funcao}</span>}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {podem.length === 0 && <p className="mt-2 text-sm text-rose-600">Ninguém pode receber. Cadastre a equipe primeiro.</p>}
            </div>

            {previa && !previa.whatsapp_conectado && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                O WhatsApp não está conectado. Conecte em Configurações para o pedido sair.
              </p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-600">Como a mensagem chega</p>
            <div className="rounded-xl bg-[#EFEAE2] p-3">
              {previa ? (
                <div className="ml-auto max-w-[95%] whitespace-pre-line rounded-lg rounded-tr-none bg-white px-3 py-2 text-[13px] leading-relaxed text-gray-900 shadow-sm">
                  {[previa.abertura, limpa || '…', previa.como_responder, previa.parar].join('\n\n')}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">O nome muda para o de cada pessoa. As mensagens saem aos poucos, cerca de uma por minuto, de segunda a sábado, das 9h às 20h.</p>
            <p className="mt-2 text-xs text-gray-500">
              Depois de responder, a pessoa recebe dois botões para escolher se quer <strong className="font-semibold text-gray-700">ficar anônima</strong>. Sem resposta em {fraseDoPrazo(previa?.prazo_horas)}, o nome dela aparece junto do feedback.
            </p>
          </div>
        </div>

        {erro && <p className="text-sm text-rose-600">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={!perguntaOk || !quantos || enviando || !previa} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
            {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {quantos ? `Enviar para ${quantos}` : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
