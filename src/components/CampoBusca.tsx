import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CampoBuscaProps {
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  className?: string
}

/**
 * Campo de busca da barra de filtros — o mesmo em /feedbacks, /insights e
 * /acoes/arquivadas.
 *
 * Largura FIXA (`w-56`), não `flex-1`. Esticado, ele ficava com o dobro da
 * largura dos outros controles e virava o elemento mais pesado da barra,
 * quando na prática o que se digita ali são duas ou três palavras. Fixo, a
 * barra inteira cabe numa linha só e cada filtro ocupa o espaço do que ele
 * pede.
 *
 * O X de limpar só aparece com texto digitado: apagar palavra por palavra para
 * voltar à lista completa é o tipo de trabalho que um botão resolve, mas um
 * botão parado num campo vazio é só ruído.
 */
export function CampoBusca({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: CampoBuscaProps) {
  return (
    <div className={cn('relative w-56 shrink-0', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        className="h-10 border-gray-200 bg-white pl-9 pr-8 shadow-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
