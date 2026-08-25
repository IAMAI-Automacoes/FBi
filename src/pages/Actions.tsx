import { TaskBoard } from '@/components/actions/TaskBoard'

export default function Actions() {
  return (
    <div className="flex flex-col h-full -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-4 py-6 md:py-8 relative">
      {/* O botão "Arquivadas" fica no cabeçalho da coluna Concluído (TaskBoard),
          junto com "Adicionar Ação" na coluna Pendente. */}
      <TaskBoard />
    </div>
  )
}
