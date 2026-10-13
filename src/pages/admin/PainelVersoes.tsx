import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Layers, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { cn } from '@/lib/utils'
import { AREAS, areaDe, DEFINICOES, linkDoConvite, type Area } from '@/lib/areas'
import type { ContaAdmin } from '@/lib/queries/admin'
import { buscarConfigDeArea, definirAreaDaConta, salvarConfigDeArea, type ConfigDeArea, type ModoDoRh } from '@/lib/queries/areas'

/* Admin → Contas, em cima: as versões do EasyFeed (Restaurante e RH).
   - O link de convite: por enquanto só quem chega por ele vê a opção RH no
     cadastro (o cadastro comum continua virando Restaurante).
   - Quem pode escolher RH: só por convite, ou todo mundo.
   - Trocar a versão de uma conta: a escolha do dono vale uma vez; depois só aqui. */

/** O endereço público do site: é para lá que o link de convite aponta. */
function siteDoEasyFeed(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin
}

export function PainelVersoes({ contas, aoMudar }: { contas: ContaAdmin[]; aoMudar: () => void }) {
  const { confirmar, dialogo } = useConfirmacao()
  const [config, setConfig] = useState<ConfigDeArea | null>(null)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [contaId, setContaId] = useState('')
  const [novaArea, setNovaArea] = useState<Area>('rh')

  const carregar = useCallback(async () => {
    try {
      setConfig(await buscarConfigDeArea())
      setErro(false)
    } catch {
      setErro(true)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const link = config ? linkDoConvite(siteDoEasyFeed(), config.rh_convite) : ''

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      toast.success('Link copiado.')
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie à mão.')
    }
  }

  const salvar = async (modo: ModoDoRh, novoConvite: boolean) => {
    setOcupado(true)
    try {
      setConfig(await salvarConfigDeArea(modo, novoConvite))
      toast.success(novoConvite ? 'Link novo gerado. O anterior não vale mais.' : modo === 'aberto' ? 'RH aberto para todos os cadastros.' : 'RH só por convite.')
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setOcupado(false)
    }
  }

  const mudarModo = async (modo: ModoDoRh) => {
    if (!config || modo === config.rh_modo) return
    if (modo === 'aberto' && !(await confirmar({
      titulo: 'Abrir o RH para todos?',
      descricao: 'Toda conta nova vai ver a tela "Restaurante ou RH" logo depois do e-mail e senha, e qualquer pessoa vai poder assinar a versão RH.',
      confirmar: 'Abrir para todos',
    }))) return
    await salvar(modo, false)
  }

  const gerarOutro = async () => {
    if (!config) return
    if (!(await confirmar({ titulo: 'Gerar outro link de convite?', descricao: 'O link atual para de valer na hora. Quem já criou a conta por ele não é afetado.', confirmar: 'Gerar outro', destrutivo: true }))) return
    await salvar(config.rh_modo, true)
  }

  const conta = contas.find((c) => String(c.id) === contaId) ?? null
  const areaAtual = areaDe(conta?.area)
  const trocar = async () => {
    if (!conta || novaArea === areaAtual) return
    if (!(await confirmar({
      titulo: `Passar "${conta.nome_restaurante || 'Sem nome'}" para a versão ${DEFINICOES[novaArea].nome}?`,
      descricao: 'O menu e as páginas da conta mudam na próxima vez que ela abrir o sistema. Os dados da outra versão continuam guardados, mas deixam de aparecer.',
      confirmar: 'Trocar a versão',
    }))) return
    setOcupado(true)
    try {
      await definirAreaDaConta(conta.id, novaArea)
      toast.success('Versão trocada.')
      setContaId('')
      aoMudar()
      carregar()
    } catch {
      toast.error('Não foi possível trocar a versão.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      {dialogo}
      <div className="flex items-start gap-2">
        <Layers className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Versões do EasyFeed</h3>
          <p className="mt-0.5 text-[12px] text-gray-500">
            Cada conta usa uma versão: Restaurante (feedback dos clientes) ou RH (feedback dos funcionários, para qualquer empresa).
            {config ? ` Hoje ${config.contas_rh === 1 ? 'há 1 conta RH' : `há ${config.contas_rh} contas RH`}.` : ''}
          </p>
        </div>
      </div>

      {erro ? (
        <p className="mt-4 text-[13px] text-gray-600">
          Não foi possível carregar. <button onClick={carregar} className="font-medium underline">Tentar de novo</button>
        </p>
      ) : !config ? (
        <Loader2 className="mt-4 h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-[12px] font-semibold text-gray-600">Quem pode escolher RH no cadastro</p>
            <div className="mt-1.5 inline-flex rounded-lg bg-gray-100 p-1">
              {([['convite', 'Só por convite'], ['aberto', 'Todo mundo']] as [ModoDoRh, string][]).map(([modo, rotulo]) => (
                <button
                  key={modo}
                  type="button"
                  disabled={ocupado}
                  onClick={() => mudarModo(modo)}
                  aria-pressed={config.rh_modo === modo}
                  className={cn('rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors', config.rh_modo === modo ? 'bg-white text-[#1D4ED8] shadow-sm' : 'text-gray-600 hover:text-gray-900')}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-gray-500">
              {config.rh_modo === 'convite'
                ? 'O cadastro comum continua criando conta de Restaurante direto. A tela de escolha só aparece para quem entra pelo link abaixo.'
                : 'Toda conta nova escolhe a versão logo depois de criar e-mail e senha.'}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-gray-600">Link de convite do RH</p>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={link}
                aria-label="Link de convite da versão RH"
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-[12px] text-gray-800 outline-none focus:border-[#1D4ED8]"
              />
              <Button size="sm" onClick={copiar} className="h-9 shrink-0">
                {copiado ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
              </Button>
              <Button size="sm" variant="outline" onClick={gerarOutro} disabled={ocupado} className="h-9 shrink-0">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Gerar outro
              </Button>
            </div>
            <p className="mt-1.5 text-[12px] text-gray-500">Quem abrir este link cria a conta e escolhe entre Restaurante e RH. Vale para quantas contas você mandar.</p>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-gray-600">Trocar a versão de uma conta</p>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <Select value={contaId} onValueChange={(v) => { setContaId(v); const a = areaDe(contas.find((c) => String(c.id) === v)?.area); setNovaArea(a === 'rh' ? 'restaurante' : 'rh') }}>
                <SelectTrigger className="h-9 min-w-0 flex-1 text-[13px]" aria-label="Conta"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {contas.filter((c) => !c.excluida_em).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome_restaurante || 'Sem nome'}{c.email ? ` · ${c.email}` : ''} ({areaDe(c.area) ? DEFINICOES[areaDe(c.area)!].nome : 'sem versão'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={novaArea} onValueChange={(v) => setNovaArea(v as Area)}>
                <SelectTrigger className="h-9 shrink-0 text-[13px] sm:w-40" aria-label="Nova versão"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => <SelectItem key={a} value={a}>{DEFINICOES[a].nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={trocar} disabled={ocupado || !conta || novaArea === areaAtual} className="h-9 shrink-0">Trocar</Button>
            </div>
            <p className="mt-1.5 text-[12px] text-gray-500">O dono escolhe a versão uma vez só, no cadastro. Depois disso, a troca é feita aqui.</p>
          </div>
        </div>
      )}
    </section>
  )
}
