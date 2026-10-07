import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { supabase } from '@/lib/supabase/client'
import { BOTAO_PILULA_AZUL } from '@/lib/estilos-botao'
import { formatarReais, lerValorEmReais } from '@/lib/painel-influencers'
import {
  adicionarInfluenciador, atualizarValorInfluenciador, definirIncluiTestes, lerIncluiTestes, listarInfluenciadores,
  removerInfluenciador, type InfluenciadorAdmin,
} from '@/lib/queries/influencers'

const LINK_DA_AREA = 'https://easyfeed.com.br/influencers'

/** Valor editável na própria linha: clica, digita, Enter (ou sai do campo) salva. */
function CampoValor({ inf, onSalvo }: { inf: InfluenciadorAdmin; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [invalido, setInvalido] = useState(false)

  const abrir = () => {
    setTexto(inf.valor_mensal == null ? '' : String(inf.valor_mensal).replace('.', ','))
    setInvalido(false)
    setEditando(true)
  }

  const salvar = async () => {
    const valor = lerValorEmReais(texto)
    if (Number.isNaN(valor)) return setInvalido(true)
    if (valor === inf.valor_mensal) return setEditando(false)
    setSalvando(true)
    try {
      await atualizarValorInfluenciador(inf.id, valor)
      onSalvo()
      setEditando(false)
    } catch {
      setInvalido(true)
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <button
        onClick={abrir}
        title="Mudar o valor"
        className="rounded-md px-1.5 py-0.5 text-left text-[13px] tabular-nums transition-colors hover:bg-gray-100"
      >
        {inf.valor_mensal == null ? <span className="text-gray-400">definir</span> : <span className="font-medium text-gray-800">{formatarReais(inf.valor_mensal)}</span>}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-[12px] text-gray-400">R$</span>
      <input
        autoFocus
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setInvalido(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
        onBlur={salvar}
        disabled={salvando}
        placeholder="vazio"
        inputMode="decimal"
        className={cn('h-7 w-20 rounded-md border px-2 text-[13px] tabular-nums outline-none', invalido ? 'border-red-400' : 'border-gray-300 focus:border-[#1D4ED8]')}
      />
      {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
    </div>
  )
}

/* Aba "Influenciadores" do painel do admin: quem tem acesso ao EasyFeed
   Influencers (/influencers) e quanto paga por mês (opcional). */
export function PainelInfluenciadores() {
  const { confirmar, dialogo } = useConfirmacao()
  const [lista, setLista] = useState<InfluenciadorAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [email, setEmail] = useState('')
  const [valor, setValor] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [incluiTestes, setIncluiTestes] = useState<boolean | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setLista(await listarInfluenciadores())
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    lerIncluiTestes().then(setIncluiTestes).catch(() => setIncluiTestes(null))
    // Atualiza sozinha quando um influenciador termina o onboarding ou entra.
    const canal = supabase
      .channel('admin-influenciadores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'influenciadores' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const total = useMemo(() => lista.reduce((s, i) => s + (i.valor_mensal ?? 0), 0), [lista])

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const v = lerValorEmReais(valor)
    if (Number.isNaN(v)) return setErro('Confira o valor: use só números, como 49,90.')
    setAdicionando(true)
    try {
      await adicionarInfluenciador(email, v)
      setEmail('')
      setValor('')
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível adicionar agora.')
    } finally {
      setAdicionando(false)
    }
  }

  const remover = async (inf: InfluenciadorAdmin) => {
    const ok = await confirmar({
      titulo: `Tirar ${inf.nome || inf.email} da lista?`,
      descricao: 'O acesso ao EasyFeed Influencers acaba na hora. Dá para adicionar o e-mail de novo depois.',
      confirmar: 'Tirar acesso',
      destrutivo: true,
    })
    if (!ok) return
    setRemovendo(inf.id)
    try {
      await removerInfluenciador(inf.id)
      setLista((l) => l.filter((x) => x.id !== inf.id))
    } catch {
      alert('Não foi possível tirar agora. Tente de novo.')
    } finally {
      setRemovendo(null)
    }
  }

  const alternarTestes = async (v: boolean) => {
    const antes = incluiTestes
    setIncluiTestes(v)
    try {
      await definirIncluiTestes(v)
    } catch {
      setIncluiTestes(antes)
      alert('Não foi possível mudar agora.')
    }
  }

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(LINK_DA_AREA)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem permissão */ }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      {dialogo}
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Influenciadores</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Quem está aqui entra no EasyFeed Influencers e vê, de forma anônima, o que os clientes de restaurante estão comentando.
          </p>
        </div>

        {/* Link da área (escondida: só quem recebe o link chega lá) */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-gray-500">Link para mandar ao influenciador</p>
            <p className="truncate font-mono text-[13px] text-gray-800">{LINK_DA_AREA}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copiarLink} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
              {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a href="/influencers" target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[12px] font-medium text-gray-700 no-underline hover:bg-gray-50">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          </div>
        </div>

        {/* Adicionar */}
        <form onSubmit={adicionar} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[13px] font-semibold text-gray-800">Adicionar e-mail</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email" required placeholder="email@do-influenciador.com"
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={adicionando}
              className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-[#1D4ED8]"
            />
            <div className="relative sm:w-40">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">R$</span>
              <input
                inputMode="decimal" placeholder="Paga por mês (opcional)"
                value={valor} onChange={(e) => setValor(e.target.value)} disabled={adicionando}
                className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-[13px] outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <button type="submit" disabled={adicionando || !email} className={cn(BOTAO_PILULA_AZUL, 'inline-flex h-9 items-center justify-center gap-1.5 text-[13px]')}>
              {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </button>
          </div>
          {erro && <p className="text-[12px] text-red-600">{erro}</p>}
          <p className="text-[12px] text-gray-400">No primeiro acesso, a pessoa recebe um link no e-mail para criar a senha.</p>
        </form>

        {/* Lista */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-200 px-4 py-2.5 text-[12px] text-gray-500">
            <span><strong className="font-semibold text-gray-800">{lista.length}</strong> {lista.length === 1 ? 'influenciador' : 'influenciadores'}</span>
            <span>Recebido por mês: <strong className="font-semibold text-gray-800 tabular-nums">{formatarReais(total)}</strong></span>
          </div>
          {carregando ? (
            <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Nenhum influenciador ainda. Adicione o primeiro e-mail acima.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-gray-500">
                  <th className="bg-gray-50 px-4 py-2.5">Influenciador</th>
                  <th className="bg-gray-50 px-4 py-2.5">Situação</th>
                  <th className="bg-gray-50 px-4 py-2.5">Paga por mês</th>
                  <th className="bg-gray-50 px-4 py-2.5">Último acesso</th>
                  <th className="w-12 bg-gray-50 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lista.map((inf) => {
                  const ativo = !!inf.onboarding_em
                  return (
                    <tr key={inf.id} className="border-t border-gray-200">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-800">
                            {inf.nome || <span className="font-normal text-gray-400">Sem nome ainda</span>}
                            {inf.arroba && <span className="font-normal text-gray-400"> · @{inf.arroba}</span>}
                          </span>
                          <span className="text-[12px] text-gray-400">{inf.email}{inf.cidade ? ` · ${inf.cidade}` : ''}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-emerald-500' : 'bg-gray-400')} />
                          {ativo ? 'Ativo' : 'Convidado'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><CampoValor inf={inf} onSalvo={carregar} /></td>
                      <td className="px-4 py-3 text-[12px] text-gray-500">
                        {inf.ultimo_acesso_em ? formatDistanceToNow(new Date(inf.ultimo_acesso_em), { addSuffix: true, locale: ptBR }) : 'nunca entrou'}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() => remover(inf)}
                          disabled={removendo === inf.id}
                          title="Tirar da lista (o acesso acaba na hora)"
                          aria-label={`Tirar ${inf.email} da lista`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          {removendo === inf.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Contas de teste nos dados */}
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <Switch checked={incluiTestes === true} disabled={incluiTestes === null} onCheckedChange={alternarTestes} id="incluir-testes" />
          <label htmlFor="incluir-testes" className="cursor-pointer">
            <span className="block text-[13px] font-semibold text-gray-800">Incluir as contas de teste nos dados</span>
            <span className="block text-[12px] leading-relaxed text-gray-500">
              As suas, a do Caio e as de demonstração dos vendedores. Hoje elas têm a maior parte dos feedbacks. Desligue quando houver clientes reais o bastante.
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
