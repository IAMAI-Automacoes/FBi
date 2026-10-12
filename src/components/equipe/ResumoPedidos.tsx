import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send, Users } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeReload } from '@/hooks/use-realtime-reload'
import { fraseDeRespostas, podeReceber, resumoDosPedidos, type ConviteAnonimo, type Envio, type Funcionario } from '@/lib/equipe'
import { buscarConvites, buscarEnvios, buscarFuncionarios } from '@/lib/queries/equipe'

/* A faixa da Visão Geral que só a equipe tem: quem está cadastrado e como
   foram os pedidos de feedback (quantos responderam). Os outros números da
   página (sentimento, temas, tendência) são os mesmos blocos dos clientes. */
export function ResumoPedidos() {
  const { usuario } = useAuth()
  const restauranteId = usuario?.restaurante_id ?? null
  const [dados, setDados] = useState<{ funcionarios: Funcionario[]; envios: Envio[]; convites: ConviteAnonimo[] } | null>(null)

  const carregar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const [funcionarios, envios, convites] = await Promise.all([buscarFuncionarios(restauranteId), buscarEnvios(restauranteId), buscarConvites(restauranteId)])
      setDados({ funcionarios, envios, convites })
    } catch { /* a página segue sem a faixa */ }
  }, [restauranteId])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeReload(['equipe_funcionarios', 'equipe_envios', 'equipe_convites'], restauranteId, carregar)

  if (!dados) return null
  const ativos = dados.funcionarios.filter((f) => f.ativo)
  const recebem = dados.funcionarios.filter(podeReceber).length
  const r = resumoDosPedidos(dados.envios, dados.convites)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-slate-700"><Users className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-bold text-muted-foreground">Funcionários</p>
            <p className="text-2xl font-bold text-foreground">{ativos.length}</p>
            <p className="text-xs text-gray-500">{recebem === ativos.length ? 'todos recebem os pedidos' : `${recebem} ${recebem === 1 ? 'recebe' : 'recebem'} os pedidos`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-slate-700"><Send className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-bold text-muted-foreground">Último pedido de feedback</p>
            {r.ultimo ? (
              <>
                <p className="text-2xl font-bold text-foreground">{r.ultimo.contas.enviados ? `${Math.round(r.ultimo.contas.taxa * 100)}%` : '—'}</p>
                <p className="text-xs text-gray-500">{fraseDeRespostas(r.ultimo.contas)} · {format(parseISO(r.ultimo.criado_em), "d 'de' MMM", { locale: ptBR })}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-300">—</p>
                <p className="text-xs text-gray-500">Nenhum pedido ainda</p>
              </>
            )}
          </div>
        </div>
      </div>
      <Link to="/equipe/funcionarios" className="shrink-0 text-sm font-medium text-[#1D4ED8] underline-offset-2 hover:underline">
        {ativos.length ? 'Pedir feedback →' : 'Cadastrar funcionários →'}
      </Link>
    </div>
  )
}
