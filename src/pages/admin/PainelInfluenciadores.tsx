import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { supabase } from '@/lib/supabase/client'
import { formatarReais, lerValorEmReais } from '@/lib/painel-influencers'
import {
  adicionarInfluenciador, atualizarValorInfluenciador, definirIncluiTestes, lerIncluiTestes, listarInfluenciadores,
  removerInfluenciador, type InfluenciadorAdmin,
} from '@/lib/queries/influencers'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'

const LINK_DA_AREA = 'https://easyfeed.com.br/influencers'

/** Valor na própria linha: clica, digita, Enter (ou sai do campo) salva. */
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
      <button onClick={abrir} title="Mudar o valor" className="-mx-1.5 rounded-md px-1.5 py-0.5 text-left text-[13px] tabular-nums transition-colors hover:bg-gray-100">
        {inf.valor_mensal == null
          ? <span className="text-gray-400">Definir</span>
          : <span className="text-gray-700">{formatarReais(inf.valor_mensal)}</span>}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setInvalido(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
        onBlur={salvar}
        disabled={salvando}
        placeholder="R$"
        inputMode="decimal"
        className={cn('h-8 w-24 rounded-lg border bg-white px-2 text-[13px] tabular-nums outline-none', invalido ? 'border-red-400' : 'border-gray-200 focus:border-[#1D4ED8]')}
      />
      {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
    </div>
  )
}

/* Aba "Influenciadores" do painel do admin, no mesmo molde da aba Vendedores:
   quem entra no EasyFeed Influencers (/influencers) e quanto paga por mês. */
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
    // Atualiza sozinha quando alguém termina o onboarding ou entra.
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
    if (Number.isNaN(v)) return setErro('Confira o valor: só números, como 49,90.')
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
      titulo: `Tirar ${inf.nome || inf.email}?`,
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
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {dialogo}
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Influenciadores</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Entram em easyfeed.com.br/influencers e veem, sem identificar ninguém, o que os clientes de restaurante comentam.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={copiarLink}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Link copiado' : 'Copiar link'}
            </button>
            <a
              href={LINK_DA_AREA}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 no-underline transition-colors hover:bg-gray-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir link
            </a>
          </div>
        </div>

        <form className="mb-2 flex flex-col gap-2 sm:flex-row" onSubmit={adicionar}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email do influenciador"
            disabled={adicionando}
            className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-[#1D4ED8]"
          />
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="R$ por mês (opcional)"
            inputMode="decimal"
            disabled={adicionando}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-[#1D4ED8] sm:w-44"
          />
          <button
            type="submit"
            disabled={!email.trim() || adicionando}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </button>
        </form>
        {erro && <p className="mb-2 text-[12px] text-red-600">{erro}</p>}
        <p className="mb-4 text-[12px] text-gray-500">
          {lista.length} {lista.length === 1 ? 'influenciador' : 'influenciadores'} · {formatarReais(total)} por mês (só anotação: ainda não cobra nada). No primeiro acesso, a pessoa recebe um link no e-mail para criar a senha.
        </p>

        {carregando ? (
          <p className="text-center py-10 text-sm text-gray-400">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-center py-10 text-sm text-gray-400">Nenhum influenciador ainda.</p>
        ) : (
          <CrudTable>
            <thead>
              <tr>
                <Th>Influenciador</Th>
                <Th>Situação</Th>
                <Th>Paga por mês</Th>
                <Th>Último acesso</Th>
                <Th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {lista.map((inf) => {
                const ativo = !!inf.onboarding_em
                return (
                  <tr key={inf.id} className="border-t border-gray-300">
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">
                          {inf.nome || inf.email}
                        </span>
                        {inf.nome && <span className="text-[12px] text-gray-400">{inf.email}</span>}
                      </div>
                    </Td>
                    <Td>
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                        ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-emerald-500' : 'bg-gray-400')} />
                        {ativo ? 'Ativo' : 'Ainda não entrou'}
                      </span>
                    </Td>
                    <Td><CampoValor inf={inf} onSalvo={carregar} /></Td>
                    <Td className="text-[13px] text-gray-600">
                      {inf.ultimo_acesso_em
                        ? format(new Date(inf.ultimo_acesso_em), "dd/MM/yyyy 'às' HH:mm")
                        : <span className="text-gray-400">Nunca</span>}
                    </Td>
                    <Td className="text-right">
                      <button
                        onClick={() => remover(inf)}
                        disabled={removendo === inf.id}
                        title="Tirar o acesso"
                        aria-label={`Tirar o acesso de ${inf.email}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        {removendo === inf.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </CrudTable>
        )}

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[12px] text-gray-500">
          <Switch checked={incluiTestes === true} disabled={incluiTestes === null} onCheckedChange={alternarTestes} />
          Incluir nos dados as contas de teste (as suas, a do Caio e as de demonstração dos vendedores).
        </label>
      </div>
    </div>
  )
}
