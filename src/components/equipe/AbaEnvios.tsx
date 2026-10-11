import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { contasDoEnvio, fraseDeRespostas, ROTULO_ENVIO, type ConviteAnonimo, type Envio, type StatusEnvio } from '@/lib/equipe'
import { acaoEquipe } from '@/lib/queries/equipe'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'
import { Cartao } from './pecas'

const COR: Record<StatusEnvio, string> = {
  na_fila: 'bg-gray-100 text-gray-600',
  enviando: 'bg-blue-50 text-blue-700',
  concluido: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-gray-100 text-gray-500',
}
const quando = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

/* Cada pedido de feedback feito à equipe: para quantos saiu e quantos responderam. */
export function AbaEnvios({ envios, convites, onPedir, onMudou }: {
  envios: Envio[]
  convites: ConviteAnonimo[]
  onPedir: () => void
  onMudou: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [cancelando, setCancelando] = useState<number | null>(null)

  const cancelar = async (e: Envio) => {
    if (!(await confirmar({ titulo: 'Cancelar este pedido?', descricao: 'Quem já recebeu a mensagem pode responder normalmente. O resto não recebe.', confirmar: 'Cancelar pedido', destrutivo: true }))) return
    setCancelando(e.id)
    const r = await acaoEquipe('cancelar_envio', { envio_id: e.id })
    setCancelando(null)
    if (!r.ok) return toast.error(r.error || 'Não foi possível cancelar.')
    toast.success('Pedido cancelado.')
    onMudou()
  }

  if (!envios.length) {
    return (
      <Cartao className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">Nenhum pedido de feedback ainda.</p>
        <Button onClick={onPedir} className="bg-[#1D4ED8] hover:bg-[#1E40AF]"><Send className="mr-1.5 h-4 w-4" /> Pedir feedback</Button>
      </Cartao>
    )
  }

  return (
    <div className="space-y-3">
      {dialogo}
      <p className="text-xs text-gray-500">As mensagens saem aos poucos, cerca de uma por minuto, de segunda a sábado, das 9h às 20h.</p>
      <CrudTable>
        <thead><tr><Th>Quando</Th><Th>Pergunta</Th><Th>Mensagens</Th><Th>Respostas</Th><Th>Situação</Th><Th className="text-right">Ação</Th></tr></thead>
        <tbody>
          {envios.map((e) => {
            const c = contasDoEnvio(convites.filter((x) => x.envio_id === e.id))
            const aberto = e.status === 'na_fila' || e.status === 'enviando'
            return (
              <tr key={e.id} className="border-b border-gray-100 align-top last:border-0">
                <Td className="whitespace-nowrap text-gray-600">{quando(e.criado_em)}</Td>
                <Td className="max-w-xs text-gray-800"><span className="line-clamp-2">{e.pergunta}</span></Td>
                <Td className="whitespace-nowrap tabular-nums text-gray-600">
                  {c.enviados} de {c.total} {c.total === 1 ? 'enviada' : 'enviadas'}
                  {c.falharam > 0 && <span className="block text-xs text-rose-600">{c.falharam} {c.falharam === 1 ? 'não saiu' : 'não saíram'}</span>}
                </Td>
                <Td className="whitespace-nowrap text-gray-600">{c.enviados ? fraseDeRespostas(c) : <span className="text-gray-300">—</span>}</Td>
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
    </div>
  )
}
