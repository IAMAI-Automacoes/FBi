import { Clock, EyeOff, ShieldAlert, UserRound } from 'lucide-react'
import { formatarAteQuando, type Autoria } from '@/lib/equipe'
import { cn } from '@/lib/utils'

const BASE = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium'

/**
 * Quem deu o feedback da equipe. O nome só vem do banco quando a pessoa deixou
 * mostrar (ou não respondeu a pergunta do anonimato no prazo); nos outros
 * casos chega só a situação.
 */
export function SeloAutoria({ autoria }: { autoria: Autoria | null | undefined }) {
  if (!autoria) return null
  return (
    <>
      {autoria.situacao === 'identificado' && (
        <span className={cn(BASE, 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]')} title="A pessoa deixou mostrar o nome, ou não respondeu a pergunta no prazo.">
          <UserRound className="h-3 w-3" />
          {autoria.nome || 'Funcionário'}{autoria.funcao ? ` · ${autoria.funcao}` : ''}
        </span>
      )}
      {autoria.situacao === 'pendente' && (
        <span className={cn(BASE, 'border-amber-200 bg-amber-50 text-amber-800')} title="A pessoa ainda pode escolher ficar anônima. Sem resposta até o fim do prazo, o nome aparece.">
          <Clock className="h-3 w-3" />
          {autoria.ate ? `Aguardando escolha até ${formatarAteQuando(autoria.ate)}` : 'Aguardando escolha'}
        </span>
      )}
      {autoria.situacao === 'anonimo' && (
        <span className={cn(BASE, 'border-gray-200 bg-gray-50 text-gray-600')} title="A pessoa pediu para ficar anônima.">
          <EyeOff className="h-3 w-3" /> Anônimo
        </span>
      )}
      {autoria.sensivel && (
        <span className={cn(BASE, 'border-red-200 bg-red-50 text-red-700')} title="Relato de assédio, discriminação, ameaça, risco ou algo ilegal. Trate com cuidado.">
          <ShieldAlert className="h-3 w-3" /> Relato sensível
        </span>
      )}
    </>
  )
}
