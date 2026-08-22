/**
 * Cor PADRÃO de cada status de ação (a coluna do quadro em que ela está —
 * Pendente/Em Andamento/Concluído). Diferente da cor de PRIORIDADE
 * (`@/lib/prioridade`, usada na barrinha lateral do card): esta é sobre o
 * andamento do trabalho, não sobre a importância.
 */
export type StatusAcao = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'

export interface EstiloStatus {
  corTexto: string
  corFundo: string
  label: string
}

const ESTILOS: Record<StatusAcao, EstiloStatus> = {
  PENDENTE: {
    corTexto: 'text-[#6B7280]',
    corFundo: 'bg-gray-200',
    label: 'PENDENTE',
  },
  EM_ANDAMENTO: {
    corTexto: 'text-[#1D4ED8]',
    corFundo: 'bg-blue-100',
    label: 'EM ANDAMENTO',
  },
  CONCLUIDO: {
    corTexto: 'text-[#16A34A]',
    corFundo: 'bg-green-100',
    label: 'CONCLUÍDO',
  },
}

export function estiloStatus(status?: string | null): EstiloStatus {
  const v = (status || '').toUpperCase().trim()
  if (v === 'EM_ANDAMENTO') return ESTILOS.EM_ANDAMENTO
  if (v === 'CONCLUIDO') return ESTILOS.CONCLUIDO
  return ESTILOS.PENDENTE
}

export { ESTILOS as STATUS_ACAO }
