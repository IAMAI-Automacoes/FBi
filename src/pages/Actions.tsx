import { TaskBoard } from '@/components/actions/TaskBoard'
import { SugestoesSidebar } from '@/components/actions/SugestoesSidebar'
import { useState } from 'react'
import { Info } from 'lucide-react'

export default function Actions() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  return (
    <div className="flex flex-col h-full max-w-[1600px] w-full mx-auto space-y-6 p-6 md:p-8 relative">
      <SugestoesSidebar onActionProcessed={() => setRefreshTrigger((t) => t + 1)} />
      {/* O botão "Arquivadas" fica no cabeçalho da coluna Concluído (TaskBoard),
          junto com "Adicionar Ação" na coluna Pendente. */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ações</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie suas tarefas e acompanhe sugestões da IA.
        </p>
      </div>

      <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-800 items-start shadow-sm animate-fade-in-up">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <span className="font-semibold block mb-0.5">Dica de navegação</span>
          Você pode avançar o status arrastando o card ou clicando no botão dentro dele. O fluxo
          deve seguir a ordem: <strong>Pendente → Em Andamento → Concluído</strong>. Caso avance por
          engano, um botão de "Desfazer" ficará disponível temporariamente no cartão.
        </div>
      </div>

      <TaskBoard refreshTrigger={refreshTrigger} />
    </div>
  )
}
