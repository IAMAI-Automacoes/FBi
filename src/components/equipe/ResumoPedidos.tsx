import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send, Users } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { fraseDeRespostas, podeReceber, resumoDosPedidos, type ConviteAnonimo, type Envio, type Funcionario } from '@/lib/equipe'
import { buscarConvites, buscarEnvios, buscarFuncionarios } from '@/lib/queries/equipe'

/* O que só a equipe tem na Visão Geral: quem está cadastrado e como foi o
   último pedido de feedback (quantos responderam). Com feedbacks, os dois
   números entram na mesma fileira de "Total de feedbacks" e "Sentimento geral"
   (`ItensDaEquipe`, pedido do Raver em 17/10/2026); antes do primeiro
   feedback, ficam num cartão próprio no topo (`ResumoPedidos`). */

function useResumoDaEquipe() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [dados, setDados] = useState<{ funcionarios: Funcionario[]; envios: Envio[]; convites: ConviteAnonimo[] } | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [funcionarios, envios, convites] = await Promise.all([buscarFuncionarios(restauranteId), buscarEnvios(restauranteId), buscarConvites(restauranteId)])
      setDados({ funcionarios, envios, convites })
    } catch { /* a página segue sem esses números */ }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['equipe_funcionarios', 'equipe_envios', 'equipe_convites'], restauranteId, carregar)

  if (!dados) return null
  const ativos = dados.funcionarios.filter((f) => f.ativo)
  const recebem = dados.funcionarios.filter(podeReceber).length
  return { ativos: ativos.length, recebem, pedidos: resumoDosPedidos(dados.envios, dados.convites) }
}

function Icone({ icon: Icon }: { icon: typeof Users }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-slate-700">
      <Icon className="h-5 w-5" />
    </span>
  )
}

function Itens({ r, tamanho, celula, link }: {
  r: NonNullable<ReturnType<typeof useResumoDaEquipe>>
  tamanho: 'grande' | 'medio'
  /** Classe de cada um dos dois (a célula da grade da fileira). */
  celula?: string
  /** O atalho para pedir feedback, embaixo do último pedido. */
  link?: ReactNode
}) {
  const numero = tamanho === 'grande' ? 'text-4xl mt-0.5' : 'text-2xl'
  const ultimo = r.pedidos.ultimo
  return (
    <>
      <div className={cn('flex items-center gap-3', celula)}>
        <Icone icon={Users} />
        <div>
          <p className="text-sm font-bold text-muted-foreground">Funcionários</p>
          <p className={`${numero} font-bold text-foreground`}>{r.ativos}</p>
          <p className="mt-1 text-xs text-gray-500">{r.recebem === r.ativos ? 'todos recebem os pedidos' : `${r.recebem} ${r.recebem === 1 ? 'recebe' : 'recebem'} os pedidos`}</p>
        </div>
      </div>
      <div className={cn('flex items-center gap-3', celula)}>
        <Icone icon={Send} />
        <div>
          <p className="text-sm font-bold text-muted-foreground">Último pedido de feedback</p>
          {ultimo ? (
            <>
              <p className={`${numero} font-bold text-foreground`}>{ultimo.contas.enviados ? `${Math.round(ultimo.contas.taxa * 100)}%` : '—'}</p>
              <p className="mt-1 text-xs text-gray-500">{fraseDeRespostas(ultimo.contas)} · {format(parseISO(ultimo.criado_em), "d 'de' MMM", { locale: ptBR })}</p>
            </>
          ) : (
            <>
              <p className={`${numero} font-bold text-gray-300`}>—</p>
              <p className="mt-1 text-xs text-gray-500">Nenhum pedido ainda</p>
            </>
          )}
          {link}
        </div>
      </div>
    </>
  )
}

const linkDaEquipe = (ativos: number, className = 'shrink-0 text-sm') => (
  <Link to="/equipe/funcionarios" className={cn('font-medium text-[#1D4ED8] underline-offset-2 hover:underline', className)}>
    {ativos ? 'Pedir feedback →' : 'Cadastrar funcionários →'}
  </Link>
)

/** Antes do primeiro feedback: o cartão próprio, no topo da Visão Geral. */
export function ResumoPedidos() {
  const r = useResumoDaEquipe()
  if (!r) return null
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-wrap gap-x-10 gap-y-4"><Itens r={r} tamanho="medio" /></div>
      {linkDaEquipe(r.ativos)}
    </div>
  )
}

/** Na fileira dos números da Visão Geral (KpiCards), depois do sentimento: duas células da grade. */
export function ItensDaEquipe({ celula }: { celula?: string }) {
  const r = useResumoDaEquipe()
  if (!r) return null
  return <Itens r={r} tamanho="grande" celula={celula} link={linkDaEquipe(r.ativos, 'mt-1.5 inline-block text-xs')} />
}
