import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { contasDoEnvio, fraseDeRespostas, ROTULO_ENVIO, tituloDaRegra, type ConviteAnonimo, type Envio, type Funcionario, type RegraDePedido, type StatusEnvio } from '@/lib/equipe'
import { acaoEquipe, type RegrasDaConta } from '@/lib/queries/equipe'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'
import { Cartao } from './pecas'
import { RegrasDePedido } from './RegrasDePedido'

const COR: Record<StatusEnvio, string> = {
  na_fila: 'bg-gray-100 text-gray-600',
  enviando: 'bg-blue-50 text-blue-700',
  concluido: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}
const quando = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

/** Quantos pedidos a lista mostra antes do "Ver mais". */
const NA_LISTA = 20

/* Aba "Pedidos de feedback": em cima, as regras de pedido automático (pode ter
   várias, com o botão "Nova regra"); embaixo, os últimos pedidos: cada pedido de
   feedback (para quantos saiu e quantos responderam) e cada aviso de ação
   concluída. */
export function AbaEnvios({ envios, convites, funcionarios, onPedir, onMudou }: {
  envios: Envio[]
  convites: ConviteAnonimo[]
  funcionarios: Funcionario[]
  onPedir: () => void
  onMudou: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [cancelando, setCancelando] = useState<number | null>(null)
  const [todos, setTodos] = useState(false)
  // As regras ficam aqui (e não dentro do cartão delas) porque a lista de
  // pedidos também usa: mostra de qual regra veio cada pedido automático.
  const [regras, setRegras] = useState<RegraDePedido[] | null>(null)
  const [maxRegras, setMaxRegras] = useState(20)
  const [perguntaPadrao, setPerguntaPadrao] = useState('')
  const lerRegras = useCallback(async () => {
    const r = await acaoEquipe<RegrasDaConta>('regras_ler')
    if (!r.ok || !Array.isArray(r.regras)) {
      setRegras([])
      return toast.error(r.error || 'Não foi possível ler as regras de pedido.')
    }
    setRegras(r.regras)
    setMaxRegras(Number(r.max) || 20)
    setPerguntaPadrao(String(r.pergunta_padrao || ''))
  }, [])
  useEffect(() => { lerRegras() }, [lerRegras])
  const nomeDaRegra = (id: number | null) => {
    const r = id == null ? null : regras?.find((x) => x.id === id)
    return r ? tituloDaRegra(r) : null
  }
  const regrasDaTela = <RegrasDePedido regras={regras} max={maxRegras} perguntaPadrao={perguntaPadrao} funcionarios={funcionarios} onMudou={() => { lerRegras(); onMudou() }} />
  const naTela = todos ? envios : envios.slice(0, NA_LISTA)

  const cancelar = async (e: Envio) => {
    if (!(await confirmar({ titulo: e.tipo === 'aviso' ? 'Cancelar este aviso?' : 'Cancelar este pedido?', descricao: 'Quem já recebeu a mensagem pode responder normalmente. O resto não recebe.', confirmar: 'Cancelar envio', destrutivo: true }))) return
    setCancelando(e.id)
    const r = await acaoEquipe('cancelar_envio', { envio_id: e.id })
    setCancelando(null)
    if (!r.ok) return toast.error(r.error || 'Não foi possível cancelar.')
    toast.success('Envio cancelado.')
    onMudou()
  }

  if (!envios.length) {
    return (
      <div className="space-y-4">
        {regrasDaTela}
        <Cartao className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Nenhum pedido de feedback ainda.</p>
          <Button onClick={onPedir} className="bg-[#1D4ED8] hover:bg-[#1E40AF]"><Send className="mr-1.5 h-4 w-4" /> Pedir feedback</Button>
        </Cartao>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dialogo}
      {regrasDaTela}
      <div className="flex flex-wrap items-end justify-between gap-2 pt-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Últimos pedidos</h3>
          <p className="text-xs text-gray-500">As mensagens saem aos poucos, cerca de uma por minuto, de segunda a sábado, das 9h às 20h.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onPedir}><Send className="mr-1.5 h-3.5 w-3.5" /> Pedir feedback agora</Button>
      </div>
      <CrudTable>
        <thead><tr><Th>Quando</Th><Th>Mensagem</Th><Th>Enviadas</Th><Th>Respostas</Th><Th>Situação</Th><Th className="text-right">Ação</Th></tr></thead>
        <tbody>
          {naTela.map((e) => {
            const c = contasDoEnvio(convites.filter((x) => x.envio_id === e.id))
            const aberto = e.status === 'na_fila' || e.status === 'enviando'
            return (
              <tr key={e.id} className="border-b border-gray-100 align-top last:border-0">
                <Td className="whitespace-nowrap text-gray-600">{quando(e.criado_em)}</Td>
                <Td className="max-w-xs text-gray-800">
                  {/* Aviso de ação concluída não pede resposta; pedido automático é o que o sistema criou sozinho. */}
                  {e.tipo === 'aviso' && <span className="mb-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Aviso de ação concluída</span>}
                  {e.tipo === 'pedido' && e.criado_por === 'automatico' && <span className="mb-1 inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#1D4ED8]">Pedido automático{nomeDaRegra(e.regra_id) ? ` · ${nomeDaRegra(e.regra_id)}` : ''}</span>}
                  <span className="line-clamp-2">{e.pergunta}</span>
                </Td>
                <Td className="whitespace-nowrap tabular-nums text-gray-600">
                  {c.enviados} de {c.total} {c.total === 1 ? 'enviada' : 'enviadas'}
                  {c.falharam > 0 && <span className="block text-xs text-rose-600">{c.falharam} {c.falharam === 1 ? 'não saiu' : 'não saíram'}</span>}
                </Td>
                <Td className="whitespace-nowrap text-gray-600">{e.tipo === 'pedido' && c.enviados ? fraseDeRespostas(c) : <span className="text-gray-300">—</span>}</Td>
                <Td><span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', COR[e.status])}>{ROTULO_ENVIO[e.status]}</span></Td>
                <Td className="text-right">
                  {aberto && (
                    <Button variant="ghost" size="sm" onClick={() => cancelar(e)} disabled={cancelando === e.id} className="text-rose-700 hover:text-rose-800">
                      {cancelando === e.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Cancelar
                    </Button>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </CrudTable>
      {envios.length > NA_LISTA && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar só os últimos' : `Ver todos os ${envios.length} pedidos`}</Button>
        </div>
      )}
    </div>
  )
}
