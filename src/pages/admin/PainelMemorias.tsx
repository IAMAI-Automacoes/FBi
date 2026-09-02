import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  RestauranteRef, FatoMemoriaAdmin, listarRestaurantesRef, listarMemoria,
  adicionarFato, editarFato, apagarFato,
} from '@/lib/queries/memoria-admin'
import { Brain, Plus, Save, Trash2, Loader2, Pencil, X } from 'lucide-react'

function FatoItem({ fato, onSalvar, onApagar }: {
  fato: FatoMemoriaAdmin
  onSalvar: (f: string, c: string) => Promise<void>
  onApagar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(fato.fato)
  const [cat, setCat] = useState(fato.categoria || 'geral')
  const [ocupado, setOcupado] = useState(false)

  const salvar = async () => {
    setOcupado(true)
    try { await onSalvar(texto, cat); setEditando(false) } finally { setOcupado(false) }
  }
  const apagar = async () => { setOcupado(true); try { await onApagar() } finally { setOcupado(false) } }

  if (editando) {
    return (
      <div className="p-3 space-y-2 bg-amber-50/40">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} className="text-sm resize-none" />
        <div className="flex items-center gap-2">
          <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="categoria" className="h-8 text-xs max-w-[160px]" />
          <Button size="sm" className="h-8 gap-1.5 ml-auto" onClick={salvar} disabled={ocupado || !texto.trim()}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setTexto(fato.fato); setEditando(false) }}>Cancelar</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 p-3 group">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800 leading-snug">{fato.fato}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{fato.categoria || 'geral'}</p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={apagar} disabled={ocupado}>
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

export function PainelMemorias() {
  const { toast } = useToast()
  const [restaurantes, setRestaurantes] = useState<RestauranteRef[]>([])
  const [restauranteId, setRestauranteId] = useState<number | null>(null)
  const [fatos, setFatos] = useState<FatoMemoriaAdmin[]>([])
  const [carregando, setCarregando] = useState(false)
  const [novo, setNovo] = useState('')
  const [novoCategoria, setNovoCategoria] = useState('geral')
  const [addOpen, setAddOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarRestaurantesRef().then((r) => {
      setRestaurantes(r)
      if (r.length && restauranteId === null) setRestauranteId(r[0].id)
    }).catch((e) => toast({ title: e.message, variant: 'destructive' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const carregarFatos = async (id: number) => {
    setCarregando(true)
    try { setFatos(await listarMemoria(id)) }
    catch (e: any) { toast({ title: 'Erro ao carregar memória', description: e.message, variant: 'destructive' }) }
    finally { setCarregando(false) }
  }
  useEffect(() => { if (restauranteId != null) carregarFatos(restauranteId) }, [restauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const adicionar = async () => {
    if (restauranteId == null || !novo.trim()) return
    setSalvando(true)
    try {
      await adicionarFato(restauranteId, novo, novoCategoria)
      setNovo(''); setNovoCategoria('geral'); setAddOpen(false)
      await carregarFatos(restauranteId)
    } catch (e: any) { toast({ title: 'Não consegui adicionar', description: e.message, variant: 'destructive' }) }
    finally { setSalvando(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Memória da IA</h2>
        <p className="text-sm text-gray-600 mt-1">
          Os fatos que a IA aprendeu sobre cada restaurante (memória de longo prazo). Você pode
          editar, apagar ou adicionar fatos — a IA passa a usar isso nas próximas conversas.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 shrink-0">Restaurante:</span>
        <Select value={restauranteId != null ? String(restauranteId) : undefined} onValueChange={(v) => setRestauranteId(Number(v))}>
          <SelectTrigger className="max-w-xs"><SelectValue placeholder="Escolha…" /></SelectTrigger>
          <SelectContent>
            {restaurantes.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.nome_restaurante || `Restaurante ${r.id}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1.5 ml-auto" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {addOpen ? 'Fechar' : 'Novo fato'}
        </Button>
      </div>

      {addOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5">
          <Textarea value={novo} onChange={(e) => setNovo(e.target.value)} rows={2} placeholder="Ex.: O dono prefere ser chamado de Gui." className="text-sm resize-none" />
          <div className="flex items-center gap-2">
            <Input value={novoCategoria} onChange={(e) => setNovoCategoria(e.target.value)} placeholder="categoria (pessoa, restaurante, meta…)" className="h-8 text-xs max-w-[220px]" />
            <Button size="sm" className="h-8 gap-1.5 ml-auto" onClick={adicionar} disabled={salvando || !novo.trim()}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white divide-y">
        {carregando ? (
          <p className="p-4 text-sm text-gray-400">Carregando…</p>
        ) : fatos.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Nenhum fato guardado para este restaurante ainda.</p>
        ) : fatos.map((f) => (
          <FatoItem
            key={f.id}
            fato={f}
            onSalvar={async (texto, cat) => {
              await editarFato(f.id, texto, cat)
              setFatos((p) => p.map((x) => (x.id === f.id ? { ...x, fato: texto, categoria: cat } : x)))
              toast({ title: 'Fato atualizado' })
            }}
            onApagar={async () => {
              await apagarFato(f.id)
              setFatos((p) => p.filter((x) => x.id !== f.id))
            }}
          />
        ))}
      </div>
    </div>
  )
}
