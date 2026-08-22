import { TaskBoard } from '@/components/actions/TaskBoard'
import { SugestoesSidebar } from '@/components/actions/SugestoesSidebar'
import { useState } from 'react'

export default function Actions() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  return (
    <div className="flex flex-col h-full max-w-[1600px] w-full mx-auto p-6 md:p-8 relative">
      <SugestoesSidebar onActionProcessed={() => setRefreshTrigger((t) => t + 1)} />
      {/* O botão "Arquivadas" fica no cabeçalho da coluna Concluído (TaskBoard),
          junto com "Adicionar Ação" na coluna Pendente. */}
      <TaskBoard refreshTrigger={refreshTrigger} />
    </div>
  )
}
