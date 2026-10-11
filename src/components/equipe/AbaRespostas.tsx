import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { EyeOff, ShieldAlert, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { CATEGORIAS_EQUIPE } from '@/lib/categorias-equipe'
import { formatarDia, type Envio, type PontoEquipe, type RespostaAnonima } from '@/lib/equipe'
import { tipoSentimento, type TipoSentimento } from '@/lib/sentimento'
import { apagarResposta } from '@/lib/queries/equipe'
import { Cartao, SeloCategoria, SeloSentimento } from './pecas'

const FILTROS_SENTIMENTO: { id: TipoSentimento | 'todos'; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'negativo', rotulo: 'Negativos' },
  { id: 'misto', rotulo: 'Positivo e negativo' },
  { id: 'sugestao', rotulo: 'Sugestões' },
  { id: 'positivo', rotulo: 'Positivos' },
  { id: 'neutro', rotulo: 'Neutros' },
]
const campo = 'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none focus:border-[#1D4ED8]'

/* O que a equipe respondeu, sem nome, sem número e sem hora (só o dia). */
export function AbaRespostas({ envios, respostas, pontos, onMudou }: {
  envios: Envio[]
  respostas: RespostaAnonima[]
  pontos: PontoEquipe[]
  onMudou: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [envio, setEnvio] = useState<string>('todos')
  const [sentimento, setSentimento] = useState<TipoSentimento | 'todos'>('todos')
  const [categoria, setCategoria] = useState<string>('todas')

  const pontosDe = useMemo(() => {
    const m = new Map<string, PontoEquipe[]>()
    for (const p of pontos) m.set(p.resposta_id, [...(m.get(p.resposta_id) ?? []), p])
    return m
  }, [pontos])
  const temEspontanea = respostas.some((r) => r.envio_id == null)

  const visiveis = respostas.filter((r) => {
    if (envio === 'espontaneas' ? r.envio_id != null : envio !== 'todos' && r.envio_id !== Number(envio)) return false
    if (sentimento !== 'todos' && (!r.sentimento || tipoSentimento(r.sentimento) !== sentimento)) return false
    if (categoria !== 'todas' && !(pontosDe.get(r.id) ?? []).some((p) => p.categoria === categoria)) return false
    return true
  })
  const quantos = (s: TipoSentimento | 'todos') => (s === 'todos' ? respostas.length : respostas.filter((r) => r.sentimento && tipoSentimento(r.sentimento) === s).length)

  const apagar = async (r: RespostaAnonima) => {
    if (!(await confirmar({ titulo: 'Apagar esta resposta?', descricao: 'Ela sai dos números e do resumo. Não dá para desfazer.', confirmar: 'Apagar', destrutivo: true }))) return
    try {
      await apagarResposta(r.id)
      toast.success('Resposta apagada.')
      onMudou()
    } catch {
      toast.error('Não foi possível apagar.')
    }
  }

  if (!respostas.length) {
    return (
      <Cartao className="py-10 text-center">
        <p className="text-sm font-medium text-gray-700">Nenhuma resposta ainda.</p>
        <p className="mt-1 text-xs text-gray-500">Quando a equipe responder ao pedido de feedback, as respostas aparecem aqui.</p>
      </Cartao>
    )
  }

  return (
    <div className="space-y-4">
      {dialogo}
      <p className="flex items-center gap-1.5 text-xs text-gray-500"><EyeOff className="h-3.5 w-3.5" /> As respostas aparecem sem nome, sem número e sem a hora.</p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={envio} onChange={(e) => setEnvio(e.target.value)} className={campo} aria-label="Pedido de feedback">
          <option value="todos">Todos os pedidos</option>
          {envios.map((e) => <option key={e.id} value={e.id}>Pedido de {format(parseISO(e.criado_em), "dd 'de' MMM", { locale: ptBR })}</option>)}
          {temEspontanea && <option value="espontaneas">Espontâneas</option>}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo} aria-label="Assunto">
          <option value="todas">Todos os assuntos</option>
          {CATEGORIAS_EQUIPE.filter((c) => pontos.some((p) => p.categoria === c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {/* Só os sentimentos que têm resposta, para não oferecer filtro que dá lista vazia. */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {FILTROS_SENTIMENTO.filter((f) => f.id === 'todos' || quantos(f.id) > 0).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSentimento(f.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
              sentimento === f.id ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {f.rotulo} <span className={cn('tabular-nums', sentimento === f.id ? 'text-blue-100' : 'text-gray-400')}>{quantos(f.id)}</span>
          </button>
        ))}
      </div>

      {!visiveis.length ? (
        <Cartao className="py-8 text-center text-sm text-gray-500">Nenhuma resposta com esses filtros.</Cartao>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((r) => {
            const meus = pontosDe.get(r.id) ?? []
            return (
              <li key={r.id}>
                <Cartao className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">{formatarDia(r.dia)}</span>
                    <SeloSentimento valor={r.sentimento} />
                    {r.sensivel && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        <ShieldAlert className="h-3 w-3" /> Relato sensível
                      </span>
                    )}
                    {r.envio_id == null && <span className="text-xs text-gray-400">espontânea</span>}
                    <button type="button" onClick={() => apagar(r)} title="Apagar resposta" aria-label="Apagar resposta" className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2.5 whitespace-pre-line border-l-2 border-gray-200 pl-3 text-sm leading-relaxed text-gray-800">{r.texto_original}</p>
                  {meus.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {meus.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
                          <SeloCategoria categoria={p.categoria} />
                          <SeloSentimento valor={p.sentimento} />
                          <span className="min-w-0 flex-1 basis-56 text-gray-600">{p.resumo || p.texto_original}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Cartao>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
