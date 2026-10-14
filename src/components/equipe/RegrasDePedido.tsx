import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Loader2, Pencil, Plus, Trash2, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { cn } from '@/lib/utils'
import {
  avisoDoDiaDoMes, DIA_COMECO_DO_MES, DIA_ESPECIFICO_SUGERIDO, DIAS_ESPECIFICOS, formatarAteQuando, FREQUENCIAS, MENSAL, NOME_DA_REGRA_MAX,
  PERGUNTA_MAX, PERGUNTA_MIN, podeReceber, quantasRecebem, resumoDaFrequencia, resumoDasPessoas, ROTULO_FREQUENCIA, situacaoDoFuncionario,
  tituloDaRegra, type Frequencia, type Funcionario, type RegraDePedido,
} from '@/lib/equipe'
import { acaoEquipe } from '@/lib/queries/equipe'
import { Cartao, Rotulo } from './pecas'

/* As regras de pedido automático: o sistema pede feedback sozinho, de tempos
   em tempos. Pode ter várias, cada uma com a sua pergunta, a sua frequência e
   AS PESSOAS que recebem (escolhidas uma a uma: quem for cadastrado depois não
   entra sozinho). Quem guarda e dispara é a função equipe (regras_ler,
   regra_salvar, regra_apagar); a rotina do minuto cria o pedido quando a data
   de uma regra chega. */

interface Rascunho { id: number | null; nome: string; ativo: boolean; cada: Frequencia; dia: number; pergunta: string; pessoas: Set<number> }

export function RegrasDePedido({ regras, max, perguntaPadrao, funcionarios, onMudou }: {
  regras: RegraDePedido[] | null
  max: number
  perguntaPadrao: string
  funcionarios: Funcionario[]
  onMudou: () => void
}) {
  const { confirmar, dialogo } = useConfirmacao()
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [mexendo, setMexendo] = useState<number | null>(null)

  const nova = () => setEditando({
    id: null, nome: '', ativo: true, cada: MENSAL, dia: DIA_COMECO_DO_MES, pergunta: perguntaPadrao,
    // Começa com quem pode receber hoje; o dono tira quem não quiser.
    pessoas: new Set(funcionarios.filter(podeReceber).map((f) => f.id)),
  })
  const editar = (r: RegraDePedido) => setEditando({
    id: r.id, nome: r.nome, ativo: r.ativo, cada: r.cada_dias, dia: r.dia_do_mes, pergunta: r.pergunta, pessoas: new Set(r.funcionarios),
  })

  const salvar = async (r: Rascunho | RegraDePedido, campos: Partial<{ ativo: boolean }> = {}) => {
    const corpo = 'pessoas' in r
      ? { id: r.id, nome: r.nome, ativo: r.ativo, cada_dias: r.cada, dia_do_mes: r.cada === MENSAL ? r.dia : null, pergunta: r.pergunta.trim(), funcionarios: [...r.pessoas] }
      : { id: r.id, nome: r.nome, ativo: r.ativo, cada_dias: r.cada_dias, dia_do_mes: r.cada_dias === MENSAL ? r.dia_do_mes : null, pergunta: r.pergunta, funcionarios: r.funcionarios, ...campos }
    const res = await acaoEquipe<{ regra: RegraDePedido }>('regra_salvar', corpo)
    if (!res.ok || !res.regra) {
      toast.error(res.error || 'Não foi possível salvar a regra.')
      return null
    }
    return res.regra
  }

  const ligar = async (r: RegraDePedido, ativo: boolean) => {
    setMexendo(r.id)
    const salva = await salvar(r, { ativo })
    setMexendo(null)
    if (!salva) return
    toast.success(ativo && salva.proximo_em ? `Regra ligada. O próximo pedido sai em ${formatarAteQuando(salva.proximo_em)}.` : 'Regra desligada.')
    onMudou()
  }

  const apagar = async (r: RegraDePedido) => {
    if (!(await confirmar({ titulo: `Apagar a regra "${tituloDaRegra(r)}"?`, descricao: 'Os pedidos que ela já mandou continuam na lista.', confirmar: 'Apagar', destrutivo: true }))) return
    setMexendo(r.id)
    const res = await acaoEquipe('regra_apagar', { id: r.id })
    setMexendo(null)
    if (!res.ok) return toast.error(res.error || 'Não foi possível apagar a regra.')
    toast.success('Regra apagada.')
    onMudou()
  }

  const cheio = !!regras && regras.length >= max

  return (
    <Cartao className="space-y-4">
      {dialogo}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1D4ED8]"><CalendarClock className="h-4.5 w-4.5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Pedir sozinho</p>
            <p className="mt-0.5 text-sm text-gray-500">Regras para o sistema pedir feedback de tempos em tempos, sem você precisar clicar. Cada regra escolhe quem recebe.</p>
          </div>
        </div>
        <Button size="sm" onClick={nova} disabled={!regras || cheio} title={cheio ? `Dá para ter até ${max} regras.` : undefined} className="shrink-0 bg-[#1D4ED8] hover:bg-[#1E40AF]">
          <Plus className="mr-1.5 h-4 w-4" /> Nova regra
        </Button>
      </div>

      {!regras ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : regras.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">Nenhuma regra ainda. Crie uma para o sistema pedir feedback sozinho, por exemplo todo mês para a equipe toda.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {regras.map((r) => {
            const recebem = quantasRecebem(r.funcionarios, funcionarios)
            return (
              <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className={cn('text-sm font-semibold', r.ativo ? 'text-gray-900' : 'text-gray-400')}>{tituloDaRegra(r)}</p>
                  {r.nome.trim() && <p className="text-xs text-gray-500">{resumoDaFrequencia(r.cada_dias, r.dia_do_mes)}</p>}
                  <p className="line-clamp-2 text-sm text-gray-700">“{r.pergunta}”</p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{resumoDasPessoas(r.funcionarios, funcionarios)}</span>
                    {recebem < r.funcionarios.length && <span className="shrink-0 text-amber-700">({recebem} {recebem === 1 ? 'recebe' : 'recebem'} hoje)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.ativo && r.proximo_em ? `Próximo pedido: ${formatarAteQuando(r.proximo_em)}.` : 'Desligada.'}
                    {r.ultimo_em ? ` Último: ${formatarAteQuando(r.ultimo_em)}.` : ''}
                  </p>
                  {r.ativo && r.ultimo_erro && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-800"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> O último pedido não saiu: {r.ultimo_erro}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {mexendo === r.id
                    ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    : <Switch checked={r.ativo} onCheckedChange={(v) => ligar(r, v)} aria-label={`Ligar a regra ${tituloDaRegra(r)}`} />}
                  <Button variant="ghost" size="sm" onClick={() => editar(r)} disabled={mexendo === r.id} className="h-8 w-8 p-0" title="Editar" aria-label={`Editar a regra ${tituloDaRegra(r)}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => apagar(r)} disabled={mexendo === r.id} className="h-8 w-8 p-0 text-rose-700 hover:text-rose-800" title="Apagar" aria-label={`Apagar a regra ${tituloDaRegra(r)}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-gray-500">Os pedidos saem de manhã, nunca no domingo. Duas regras no mesmo dia saem uma depois da outra.</p>

      {editando && (
        <EditorDaRegra
          rascunho={editando}
          funcionarios={funcionarios}
          onFechar={() => setEditando(null)}
          onSalvar={async (r) => {
            const salva = await salvar(r)
            if (!salva) return
            setEditando(null)
            toast.success(salva.ativo && salva.proximo_em ? `Regra salva. O próximo pedido sai em ${formatarAteQuando(salva.proximo_em)}.` : 'Regra salva.')
            onMudou()
          }}
        />
      )}
    </Cartao>
  )
}

function EditorDaRegra({ rascunho, funcionarios, onFechar, onSalvar }: {
  rascunho: Rascunho
  funcionarios: Funcionario[]
  onFechar: () => void
  onSalvar: (r: Rascunho) => Promise<void>
}) {
  const [r, setR] = useState<Rascunho>(rascunho)
  const [salvando, setSalvando] = useState(false)
  const mensal = r.cada === MENSAL
  const noComeco = r.dia === DIA_COMECO_DO_MES
  const avisoDoDia = mensal ? avisoDoDiaDoMes(r.dia) : null
  const pergunta = r.pergunta.trim()
  const perguntaOk = pergunta.length >= PERGUNTA_MIN && pergunta.length <= PERGUNTA_MAX
  const todosQueRecebem = funcionarios.filter(podeReceber).map((f) => f.id)
  const pode = perguntaOk && r.pessoas.size > 0 && !salvando

  const alternar = (id: number) => setR((x) => {
    const pessoas = new Set(x.pessoas)
    if (pessoas.has(id)) pessoas.delete(id)
    else pessoas.add(id)
    return { ...x, pessoas }
  })

  return (
    <Dialog open onOpenChange={(a) => !a && !salvando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.id == null ? 'Nova regra de pedido' : 'Editar regra'}</DialogTitle>
          <DialogDescription>O sistema manda a pergunta para as pessoas escolhidas, na frequência que você definir.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Rotulo>Nome da regra (opcional)</Rotulo>
            <Input value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value.slice(0, NOME_DA_REGRA_MAX) })} placeholder="Ex: Cozinha, toda semana" className="mt-1.5" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Rotulo>Frequência</Rotulo>
              <Select value={String(r.cada)} onValueChange={(v) => setR({ ...r, cada: Number(v) as Frequencia })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIAS.map((f) => <SelectItem key={f} value={String(f)}>{ROTULO_FREQUENCIA[f]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {mensal && (
              <div>
                <Rotulo>Em que dia</Rotulo>
                <Select value={noComeco ? 'comeco' : 'dia'} onValueChange={(v) => setR({ ...r, dia: v === 'comeco' ? DIA_COMECO_DO_MES : noComeco ? DIA_ESPECIFICO_SUGERIDO : r.dia })}>
                  <SelectTrigger className="mt-1.5" aria-label="Em que dia do mês o pedido sai"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comeco">No começo do mês</SelectItem>
                    <SelectItem value="dia">Em um dia específico</SelectItem>
                  </SelectContent>
                </Select>
                {!noComeco && (
                  <Select value={String(r.dia)} onValueChange={(v) => setR({ ...r, dia: Number(v) })}>
                    <SelectTrigger className="mt-2" aria-label="Dia do mês"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">{DIAS_ESPECIFICOS.map((d) => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {avisoDoDia && <p className="mt-1.5 text-xs text-gray-500">{avisoDoDia}</p>}
              </div>
            )}
          </div>

          <div>
            <Rotulo>A pergunta</Rotulo>
            <Textarea value={r.pergunta} onChange={(e) => setR({ ...r, pergunta: e.target.value })} rows={2} maxLength={PERGUNTA_MAX} className="mt-1.5" />
            {!perguntaOk && <p className="mt-1 text-xs text-rose-600">Escreva a pergunta (de {PERGUNTA_MIN} a {PERGUNTA_MAX} letras).</p>}
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Rotulo>Quem recebe ({r.pessoas.size})</Rotulo>
              <div className="flex gap-3 text-xs">
                <button type="button" className="font-medium text-[#1D4ED8] hover:underline" onClick={() => setR({ ...r, pessoas: new Set(todosQueRecebem) })}>Marcar todos</button>
                <button type="button" className="font-medium text-gray-500 hover:underline" onClick={() => setR({ ...r, pessoas: new Set() })}>Desmarcar</button>
              </div>
            </div>
            {funcionarios.length === 0 ? (
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">Cadastre os funcionários primeiro, na aba Cadastro.</p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {funcionarios.map((f) => {
                  const situacao = situacaoDoFuncionario(f)
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                        <Checkbox checked={r.pessoas.has(f.id)} onCheckedChange={() => alternar(f.id)} />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{f.nome}{f.funcao ? <span className="text-gray-400"> · {f.funcao}</span> : null}</span>
                        {situacao !== 'recebe' && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{situacao === 'inativo' ? 'desativado' : 'pediu PARAR'}</span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-gray-500">Quem for cadastrado depois não entra sozinho: é só editar a regra.</p>
          </div>

          {r.id != null && (
            <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="text-sm text-gray-700">Regra ligada</span>
              <Switch checked={r.ativo} onCheckedChange={(v) => setR({ ...r, ativo: v })} />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={async () => { setSalvando(true); await onSalvar(r); setSalvando(false) }}
            disabled={!pode}
            className="bg-[#1D4ED8] hover:bg-[#1E40AF]"
          >
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} {r.id == null ? 'Criar regra' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
