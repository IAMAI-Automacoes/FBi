import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardList, Loader2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CampoTelefone } from '@/components/CampoTelefone'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { lerListaColada, podeReceber, situacaoDoFuncionario, type Funcionario } from '@/lib/equipe'
import { chaveWhatsapp, formatarExibicaoTelefone, telefoneNacionalValido } from '@/lib/telefone'
import {
  adicionarFuncionarios, buscarGarconsComNumero, ehNumeroRepetido, removerFuncionario, salvarFuncionario, voltarAEnviar,
  type FuncionarioParaSalvar,
} from '@/lib/queries/equipe'
import { CrudTable, Td, Th } from '@/pages/admin/tabela'
import { Cartao } from './pecas'

const campo = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1D4ED8]'

// ── Um funcionário ───────────────────────────────────────────────────────────

function EditarFuncionario({ restauranteId, rascunho, onFechar, onSalvo }: {
  restauranteId: number
  rascunho: FuncionarioParaSalvar | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [f, setF] = useState<FuncionarioParaSalvar | null>(rascunho)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { setF(rascunho); setErro(null) }, [rascunho])

  const valido = !!f && f.nome.trim() !== '' && telefoneNacionalValido(f.telefone)
  const salvar = async () => {
    if (!f || !valido) return
    setSalvando(true)
    setErro(null)
    try {
      await salvarFuncionario(restauranteId, f)
      toast.success(f.id ? 'Funcionário salvo.' : 'Funcionário adicionado.')
      onSalvo()
      onFechar()
    } catch (e) {
      setErro(ehNumeroRepetido(e) ? 'Já tem alguém da equipe com este número.' : 'Não foi possível salvar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={!!rascunho} onOpenChange={(a) => !a && !salvando && onFechar()}>
      <DialogContent className="max-w-md">
        {f && (
          <>
            <DialogHeader>
              <DialogTitle>{f.id ? 'Editar funcionário' : 'Adicionar funcionário'}</DialogTitle>
              <DialogDescription>O número é o do WhatsApp da pessoa. É por ele que chega o pedido de feedback.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label htmlFor="func-nome" className="mb-1 block text-xs font-semibold text-gray-600">Nome</label>
                <input id="func-nome" className={campo} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Ana Paula" autoFocus />
              </div>
              <div>
                <label htmlFor="func-telefone" className="mb-1 block text-xs font-semibold text-gray-600">WhatsApp</label>
                <CampoTelefone id="func-telefone" value={f.telefone} onChange={(v) => setF((atual) => (atual ? { ...atual, telefone: v } : atual))} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} />
              </div>
              <div>
                <label htmlFor="func-funcao" className="mb-1 block text-xs font-semibold text-gray-600">Função (opcional)</label>
                <input id="func-funcao" className={campo} value={f.funcao} onChange={(e) => setF({ ...f, funcao: e.target.value })} placeholder="Ex.: cozinha, salão, caixa" />
              </div>
              {erro && <p className="text-sm text-rose-600">{erro}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvar} disabled={!valido || salvando} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Colar vários de uma vez ──────────────────────────────────────────────────

function ColarVarios({ restauranteId, aberto, jaCadastrados, onFechar, onSalvo }: {
  restauranteId: number
  aberto: boolean
  jaCadastrados: string[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (aberto) setTexto('') }, [aberto])
  const linhas = useMemo(() => lerListaColada(texto, jaCadastrados), [texto, jaCadastrados])
  const boas = linhas.filter((l) => !l.problema)

  const salvar = async () => {
    if (!boas.length) return
    setSalvando(true)
    try {
      const n = await adicionarFuncionarios(restauranteId, boas)
      toast.success(n === 1 ? '1 funcionário adicionado.' : `${n} funcionários adicionados.`)
      onSalvo()
      onFechar()
    } catch {
      toast.error('Não foi possível adicionar todos. Confira a lista e tente de novo.')
      onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !salvando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Colar vários</DialogTitle>
          <DialogDescription>Uma pessoa por linha: nome, número e, se quiser, a função. Dá para colar direto de uma planilha.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={'Ana Paula, 11 98765-4321, cozinha\nBruno Souza, 11 91234-5678, salão'}
          className="font-mono text-[13px]"
        />
        {linhas.length > 0 && (
          <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {linhas.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className={cn('font-medium', l.problema ? 'text-gray-400' : 'text-gray-800')}>{l.nome || '(sem nome)'}</span>
                  {l.telefone && <span className="text-gray-500"> · {formatarExibicaoTelefone(l.telefone)}</span>}
                  {l.funcao && <span className="text-gray-400"> · {l.funcao}</span>}
                </span>
                {l.problema
                  ? <span className="shrink-0 text-xs font-medium text-rose-600">{l.problema}</span>
                  : <span className="shrink-0 text-xs font-medium text-emerald-600">Entra</span>}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!boas.length || salvando} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {boas.length ? `Adicionar ${boas.length}` : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── A aba ────────────────────────────────────────────────────────────────────

const PILULA: Record<ReturnType<typeof situacaoDoFuncionario>, { rotulo: string; cor: string }> = {
  recebe: { rotulo: 'Recebe', cor: 'bg-emerald-50 text-emerald-700' },
  parou: { rotulo: 'Pediu para parar', cor: 'bg-amber-50 text-amber-700' },
  inativo: { rotulo: 'Desativado', cor: 'bg-gray-100 text-gray-500' },
}

export function AbaFuncionarios({ restauranteId, funcionarios, onMudou }: {
  restauranteId: number
  funcionarios: Funcionario[]
  onMudou: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [editando, setEditando] = useState<FuncionarioParaSalvar | null>(null)
  const [colando, setColando] = useState(false)
  const [mexendo, setMexendo] = useState<number | null>(null)
  const [garcons, setGarcons] = useState<{ nome: string; telefone: string }[]>([])
  const [trazendo, setTrazendo] = useState(false)

  useEffect(() => { buscarGarconsComNumero(restauranteId).then(setGarcons).catch(() => setGarcons([])) }, [restauranteId])
  // Os garçons que têm número válido e ainda não estão na equipe.
  const garconsDeFora = useMemo(() => {
    const ja = new Set(funcionarios.map((f) => chaveWhatsapp(f.telefone)))
    const vistos = new Set<string>()
    return garcons.filter((g) => {
      const chave = chaveWhatsapp(g.telefone)
      if (!telefoneNacionalValido(g.telefone) || ja.has(chave) || vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })
  }, [garcons, funcionarios])

  const trazerGarcons = async () => {
    const n = garconsDeFora.length
    if (!(await confirmar({ titulo: n === 1 ? 'Trazer 1 garçom para a equipe?' : `Trazer ${n} garçons para a equipe?`, descricao: 'Entram com o nome e o número que já estão em Garçons.', confirmar: 'Trazer' }))) return
    setTrazendo(true)
    try {
      const entraram = await adicionarFuncionarios(restauranteId, garconsDeFora.map((g) => ({ ...g, funcao: 'Garçom' })))
      toast.success(entraram === 1 ? '1 garçom adicionado.' : `${entraram} garçons adicionados.`)
    } catch {
      toast.error('Não foi possível trazer os garçons.')
    } finally {
      setTrazendo(false)
      onMudou()
    }
  }

  const alternar = async (f: Funcionario) => {
    setMexendo(f.id)
    try {
      await salvarFuncionario(restauranteId, { id: f.id, nome: f.nome, telefone: f.telefone, funcao: f.funcao, ativo: !f.ativo })
      onMudou()
    } catch {
      toast.error('Não foi possível mudar.')
    } finally {
      setMexendo(null)
    }
  }

  const remover = async (f: Funcionario) => {
    if (!(await confirmar({ titulo: `Remover ${f.nome}?`, descricao: 'O que a pessoa já respondeu continua, sem ligação com ela.', confirmar: 'Remover', destrutivo: true }))) return
    try {
      await removerFuncionario(f.id)
      toast.success('Funcionário removido.')
      onMudou()
    } catch {
      toast.error('Não foi possível remover.')
    }
  }

  const voltar = async (f: Funcionario) => {
    if (!(await confirmar({ titulo: `Voltar a enviar para ${f.nome}?`, descricao: 'A pessoa respondeu PARAR. Só volte a enviar se ela mesma pediu.', confirmar: 'Voltar a enviar' }))) return
    try {
      await voltarAEnviar(f.id)
      onMudou()
    } catch {
      toast.error('Não foi possível mudar.')
    }
  }

  const recebem = funcionarios.filter(podeReceber).length

  return (
    <div className="space-y-4">
      {dialogo}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {funcionarios.length === 0 ? 'Ninguém cadastrado ainda.'
            : `${recebem} de ${funcionarios.length} ${funcionarios.length === 1 ? 'recebe' : 'recebem'} os pedidos de feedback.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {garconsDeFora.length > 0 && (
            <Button variant="outline" size="sm" onClick={trazerGarcons} disabled={trazendo}>
              {trazendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
              Trazer {garconsDeFora.length === 1 ? '1 garçom' : `${garconsDeFora.length} garçons`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setColando(true)}><ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Colar vários</Button>
          <Button size="sm" onClick={() => setEditando({ nome: '', telefone: '', funcao: '', ativo: true })} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {funcionarios.length === 0 ? (
        <Cartao className="py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Cadastre quem trabalha no restaurante.</p>
          <p className="mt-1 text-xs text-gray-500">Um por um, colando uma lista inteira ou trazendo os garçons que já têm número.</p>
        </Cartao>
      ) : (
        <CrudTable>
          <thead><tr><Th>Nome</Th><Th>WhatsApp</Th><Th>Função</Th><Th>Situação</Th><Th>Ativo</Th><Th className="text-right">Editar</Th></tr></thead>
          <tbody>
            {funcionarios.map((f) => {
              const s = situacaoDoFuncionario(f)
              return (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <Td className="font-medium text-gray-800">{f.nome}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-gray-600">{formatarExibicaoTelefone(f.telefone)}</Td>
                  <Td className="text-gray-600">{f.funcao || <span className="text-gray-300">—</span>}</Td>
                  <Td>
                    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', PILULA[s].cor)}>{PILULA[s].rotulo}</span>
                    {s === 'parou' && <button type="button" onClick={() => voltar(f)} className="ml-2 text-xs font-medium text-blue-700 hover:underline">Voltar a enviar</button>}
                  </Td>
                  <Td><Switch checked={f.ativo} disabled={mexendo === f.id} onCheckedChange={() => alternar(f)} aria-label={`${f.nome} ativo`} /></Td>
                  <Td className="whitespace-nowrap text-right">
                    <button type="button" onClick={() => setEditando({ id: f.id, nome: f.nome, telefone: f.telefone, funcao: f.funcao, ativo: f.ativo })} title="Editar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => remover(f)} title="Remover" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </CrudTable>
      )}

      <EditarFuncionario restauranteId={restauranteId} rascunho={editando} onFechar={() => setEditando(null)} onSalvo={onMudou} />
      <ColarVarios restauranteId={restauranteId} aberto={colando} jaCadastrados={funcionarios.map((f) => f.telefone)} onFechar={() => setColando(false)} onSalvo={onMudou} />
    </div>
  )
}
