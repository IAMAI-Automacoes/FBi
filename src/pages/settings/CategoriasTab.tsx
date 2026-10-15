import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, Loader2, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmacao } from '@/hooks/use-confirmacao'
import { recarregarCategorias, useCategoriasDaConta } from '@/hooks/use-categorias'
import { useArea } from '@/lib/area'
import { CATEGORIAS_EQUIPE } from '@/lib/categorias-equipe'
import { CATEGORIAS_FEEDBACK, estiloDaCor, ICONES_DE_CATEGORIA, PALETA_EXTRA } from '@/lib/categorias-feedback'
import {
  arrumarCategorias, categoriasMudaram, DESCRICAO_DA_CATEGORIA_MAX, ehOutros, MAX_CATEGORIAS, NOME_DA_CATEGORIA_MAX, problemaDasCategorias,
  RECUSA_DAS_CATEGORIAS, type CategoriaDaConta, type PublicoDaCategoria,
} from '@/lib/categorias-conta'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/* Configurações → Categorias. Pedido do Raver (15/10/2026): cada conta
   renomeia, descreve, muda a cor, desliga e cria categorias. A IA que separa os
   feedbacks (n8n) e a que escreve insights e ações usam esta lista. Na conta RH
   são as categorias da equipe. Salva à parte da barra da página (é uma lista
   inteira, com regras próprias: ver lib/categorias-conta.ts). */

function SeletorDeAparencia({ item, cores, aoMudar, travado }: {
  item: CategoriaDaConta
  cores: { chave: string; nome: string }[]
  aoMudar: (m: Partial<CategoriaDaConta>) => void
  travado?: boolean
}) {
  const estilo = estiloDaCor(item.cor || item.nome, item.icone)
  const Icone = estilo.icon
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={travado}
          aria-label={`Cor e ícone de ${item.nome || 'categoria nova'}`}
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors', estilo.corFundo, estilo.corBorda, !travado && 'hover:brightness-95')}
        >
          <Icone className={cn('h-5 w-5', estilo.corTexto)} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(320px,calc(100vw-2rem))] space-y-3 p-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-600">Cor</p>
          <div className="grid grid-cols-8 gap-1.5">
            {cores.map((c) => {
              const e = estiloDaCor(c.chave)
              const escolhida = (item.cor || item.nome) === c.chave
              return (
                <button
                  key={c.chave}
                  type="button"
                  title={c.nome}
                  aria-label={`Cor ${c.nome}`}
                  aria-pressed={escolhida}
                  onClick={() => aoMudar({ cor: c.chave })}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-full', e.corSolida, escolhida && 'ring-2 ring-offset-2 ring-gray-400')}
                >
                  {escolhida && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-600">Ícone</p>
          <div className="grid grid-cols-7 gap-1">
            <button
              type="button"
              onClick={() => aoMudar({ icone: null })}
              aria-pressed={!item.icone}
              className={cn('h-8 rounded-md text-[10px] font-medium text-gray-500 hover:bg-gray-100', !item.icone && 'bg-gray-100 text-gray-800')}
            >
              Padrão
            </button>
            {ICONES_DE_CATEGORIA.map((i) => (
              <button
                key={i.chave}
                type="button"
                title={i.nome}
                aria-label={`Ícone ${i.nome}`}
                aria-pressed={item.icone === i.chave}
                onClick={() => aoMudar({ icone: i.chave })}
                className={cn('flex h-8 items-center justify-center rounded-md hover:bg-gray-100', item.icone === i.chave && 'bg-gray-100 ring-1 ring-gray-300')}
              >
                <i.icon className="h-4 w-4 text-gray-700" />
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function CategoriasTab() {
  const { ehRh } = useArea()
  const publico: PublicoDaCategoria = ehRh ? 'equipe' : 'cliente'
  const { itens, personalizada, carregado } = useCategoriasDaConta(publico)
  const { confirmar, dialogo } = useConfirmacao()
  const [lista, setLista] = useState<CategoriaDaConta[] | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Chegou (ou mudou no banco): a tela começa do que está salvo.
  useEffect(() => { if (itens) setLista(arrumarCategorias(itens)) }, [itens])

  // As cores que dá para escolher: as oficiais deste público e a paleta extra.
  const cores = useMemo(() => [
    ...(publico === 'equipe' ? CATEGORIAS_EQUIPE : CATEGORIAS_FEEDBACK).map((nome) => ({ chave: nome, nome })),
    ...PALETA_EXTRA,
  ], [publico])

  const salva = useMemo(() => (itens ? arrumarCategorias(itens) : []), [itens])
  const mudou = !!lista && categoriasMudaram(lista, salva)
  const problema = lista ? problemaDasCategorias(lista) : null

  const mudar = (i: number, m: Partial<CategoriaDaConta>) => setLista((l) => l && l.map((c, j) => (j === i ? { ...c, ...m } : c)))
  const mover = (i: number, d: -1 | 1) => setLista((l) => {
    if (!l) return l
    const j = i + d
    // "Outros" fica sempre no fim.
    if (j < 0 || j >= l.length - 1 || ehOutros(l[i].nome)) return l
    const nova = [...l]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    return nova
  })
  const remover = (i: number) => setLista((l) => l && l.filter((_, j) => j !== i))
  const adicionar = () => setLista((l) => {
    if (!l) return l
    // Uma cor da paleta extra que ainda ninguém usa (ou a primeira).
    const usadas = new Set(l.map((c) => c.cor))
    const cor = PALETA_EXTRA.find((p) => !usadas.has(p.chave))?.chave ?? PALETA_EXTRA[0].chave
    const nova: CategoriaDaConta = { nome: '', descricao: '', cor, icone: null, ativa: true }
    return [...l.slice(0, -1), nova, l[l.length - 1]]
  })

  const salvar = async () => {
    if (!lista || problema) return
    setSalvando(true)
    try {
      const { data, error } = await supabase.rpc('salvar_categorias', { p_publico: publico, p_itens: arrumarCategorias(lista) as never })
      const r = data as { ok?: boolean; motivo?: string; nome?: string } | null
      if (error || !r?.ok) {
        toast.error(RECUSA_DAS_CATEGORIAS[r?.motivo ?? ''] ?? 'Não foi possível salvar as categorias.')
        return
      }
      await recarregarCategorias()
      toast.success('Categorias salvas. Valem para os próximos feedbacks.')
    } finally {
      setSalvando(false)
    }
  }

  const voltarAoPadrao = async () => {
    const ok = await confirmar({
      titulo: 'Voltar às categorias padrão?',
      descricao: 'A sua lista some e voltam as categorias de fábrica. Os feedbacks que já chegaram não mudam.',
      confirmar: 'Voltar ao padrão',
    })
    if (!ok) return
    setSalvando(true)
    try {
      const { error } = await supabase.rpc('restaurar_categorias', { p_publico: publico })
      if (error) {
        toast.error('Não foi possível voltar ao padrão.')
        return
      }
      await recarregarCategorias()
      toast.success('Categorias padrão de volta.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card className="shadow-subtle animate-fade-in-up">
      {dialogo}
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
        <CardDescription>
          A IA separa cada feedback {ehRh ? 'da equipe ' : ''}numa destas categorias. Renomeie, explique o que entra em cada uma
          (a IA lê a explicação), mude a cor, desligue as que não servem ou crie novas. Vale para os próximos feedbacks: os que já
          chegaram ficam com a categoria que tinham.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!carregado || !lista ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <>
            <ul className="space-y-2">
              {lista.map((c, i) => {
                const outros = ehOutros(c.nome) && i === lista.length - 1
                return (
                  // No celular os botões descem para uma linha própria: os campos ficam com a largura toda.
                  <li key={i} className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]', !c.ativa && 'bg-gray-50 opacity-70')}>
                    <SeletorDeAparencia item={c} cores={cores} aoMudar={(m) => mudar(i, m)} />
                    <div className="grid min-w-0 gap-1.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                      <div className="relative">
                        <Input
                          value={c.nome}
                          onChange={(e) => mudar(i, { nome: e.target.value })}
                          maxLength={NOME_DA_CATEGORIA_MAX}
                          readOnly={outros}
                          placeholder="Nome da categoria"
                          aria-label="Nome da categoria"
                          className={cn('h-10 font-medium', outros && 'pr-8 text-gray-600')}
                        />
                        {outros && <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />}
                      </div>
                      <Input
                        value={c.descricao}
                        onChange={(e) => mudar(i, { descricao: e.target.value })}
                        maxLength={DESCRICAO_DA_CATEGORIA_MAX}
                        placeholder={ehRh ? 'O que entra aqui (ex.: escala, folgas, horas extras)' : 'O que entra aqui (ex.: pratos, ponto da carne, temperatura)'}
                        aria-label={`O que entra em ${c.nome || 'esta categoria'}`}
                        className="h-10 text-[13px]"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1 sm:self-center">
                      {outros ? (
                        <span className="px-1 text-[11px] text-gray-400" title="O que não se encaixa em nenhuma vai para cá">sempre ligada</span>
                      ) : (
                        <>
                          <Switch checked={c.ativa} onCheckedChange={(v) => mudar(i, { ativa: v })} aria-label={`Usar ${c.nome || 'esta categoria'}`} />
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, 1)} disabled={i >= lista.length - 2} aria-label="Descer">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => remover(i)} aria-label={`Tirar ${c.nome || 'esta categoria'}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {problema && mudou && (
              <p className="text-sm text-rose-600">{RECUSA_DAS_CATEGORIAS[problema.motivo]}{problema.nome ? ` (${problema.nome})` : ''}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={lista.length >= MAX_CATEGORIAS}>
                <Plus className="mr-1.5 h-4 w-4" /> Nova categoria
              </Button>
              {personalizada && (
                <Button type="button" variant="ghost" size="sm" onClick={voltarAoPadrao} disabled={salvando}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Voltar ao padrão
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {mudou && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLista(salva)} disabled={salvando}>Descartar</Button>
                )}
                <Button type="button" size="sm" onClick={salvar} disabled={!mudou || !!problema || salvando}>
                  {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar categorias
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
