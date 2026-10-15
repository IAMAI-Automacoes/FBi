import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase/client'
import { CATEGORIAS_FEEDBACK, registrarCategoriasDaConta } from '@/lib/categorias-feedback'
import { CATEGORIAS_EQUIPE } from '@/lib/categorias-equipe'
import { lerCategorias, nomesAtivos, type CategoriaDaConta, type PublicoDaCategoria } from '@/lib/categorias-conta'

/**
 * As categorias da conta logada (Configurações → Categorias), carregadas uma
 * vez e guardadas aqui, como o `prompt-store`. Enquanto não chegam (ou sem
 * conta, como na página pública do QR), valem as do padrão.
 *
 * Também alimenta `estiloCategoria()`: a cor e o ícone das categorias
 * renomeadas e criadas pela conta.
 */

interface Estado {
  carregado: boolean
  cliente: CategoriaDaConta[] | null
  equipe: CategoriaDaConta[] | null
  personalizada: Record<PublicoDaCategoria, boolean>
}

const VAZIO: Estado = { carregado: false, cliente: null, equipe: null, personalizada: { cliente: false, equipe: false } }
let estado: Estado = VAZIO
let carregando: Promise<void> | null = null
const ouvintes = new Set<() => void>()
const avisar = () => { for (const o of ouvintes) o() }

const PADRAO: Record<PublicoDaCategoria, readonly string[]> = { cliente: CATEGORIAS_FEEDBACK, equipe: CATEGORIAS_EQUIPE }

/** Busca de novo no banco (depois de salvar nas Configurações, por exemplo). */
export function recarregarCategorias(): Promise<void> {
  carregando = (async () => {
    try {
      const { data: bruto, error } = await supabase.rpc('minhas_categorias')
      const data = bruto as { sem_conta?: boolean; cliente?: { itens?: unknown; personalizada?: boolean }; equipe?: { itens?: unknown; personalizada?: boolean } } | null
      if (error || !data || data.sem_conta) {
        estado = { ...VAZIO, carregado: true }
      } else {
        const cliente = lerCategorias(data.cliente?.itens)
        const equipe = lerCategorias(data.equipe?.itens)
        estado = {
          carregado: true,
          cliente: cliente.length ? cliente : null,
          equipe: equipe.length ? equipe : null,
          personalizada: { cliente: !!data.cliente?.personalizada, equipe: !!data.equipe?.personalizada },
        }
      }
    } catch {
      estado = { ...VAZIO, carregado: true }
    }
    registrarCategoriasDaConta([...(estado.cliente ?? []), ...(estado.equipe ?? [])])
    avisar()
  })()
  return carregando
}

// Trocou de conta (saiu, entrou, admin entrando na conta de um cliente): as
// categorias são de outra conta.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT' || evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
    estado = VAZIO
    carregando = null
    registrarCategoriasDaConta([])
    avisar()
  }
})

/** Os nomes ligados de um público, para quem não é componente (o prompt do chat). Null = ainda não carregou. */
export function categoriasDaContaAgora(publico: PublicoDaCategoria): string[] | null {
  const lista = estado[publico]
  return lista ? nomesAtivos(lista) : null
}

/** As categorias de um público com a descrição, para o prompt do chat. */
export function itensDaContaAgora(publico: PublicoDaCategoria): CategoriaDaConta[] | null {
  return estado[publico]
}

function assinar(o: () => void) {
  ouvintes.add(o)
  return () => { ouvintes.delete(o) }
}

export function useCategoriasDaConta(publico: PublicoDaCategoria): {
  /** As ligadas, na ordem da conta (o que os filtros e a IA usam). */
  nomes: readonly string[]
  /** Todas, inclusive as desligadas (a tela de edição). Null = a conta usa o padrão ou ainda não carregou. */
  itens: CategoriaDaConta[] | null
  personalizada: boolean
  carregado: boolean
} {
  const atual = useSyncExternalStore(assinar, () => estado)
  useEffect(() => {
    if (!atual.carregado && !carregando) void recarregarCategorias()
  }, [atual.carregado])
  const itens = atual[publico]
  // Mesma lista enquanto a conta não muda: quem usa em dependência de efeito não roda à toa.
  const nomes = useMemo(() => (itens ? nomesAtivos(itens) : PADRAO[publico]), [itens, publico])
  return {
    nomes,
    itens,
    personalizada: atual.personalizada[publico],
    carregado: atual.carregado,
  }
}
