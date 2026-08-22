import { TaskBoard } from '@/components/actions/TaskBoard'
import { SugestoesSidebar } from '@/components/actions/SugestoesSidebar'
import { useState } from 'react'

export default function Actions() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  return (
    <div className="flex flex-col h-full w-full -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-4 py-6 md:py-8 relative">
      <SugestoesSidebar onActionProcessed={() => setRefreshTrigger((t) => t + 1)} />
      {/* O botão "Arquivadas" fica no cabeçalho da coluna Concluído (TaskBoard),
          junto com "Adicionar Ação" na coluna Pendente. */}
      <TaskBoard refreshTrigger={refreshTrigger} />
    </div>
  )
}
