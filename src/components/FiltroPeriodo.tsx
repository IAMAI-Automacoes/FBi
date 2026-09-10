import { useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { DataSegmentada } from '@/components/DataSegmentada'
import { cn } from '@/lib/utils'

export type PeriodoPreset = '7d' | '30d' | '90d' | 'all'

/** Intervalo escolhido no calendário. `to` ausente = só o dia de `from`. */
export interface IntervaloDatas {
  from: Date
  to?: Date
}

export const PERIODOS: { value: PeriodoPreset; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
]

/** Texto do botão: o intervalo quando há um, senão o nome do atalho ativo.
 *  `presets` deixa reaproveitar isto quando os atalhos não são os 4 padrão
 *  (Ranking usa semana/mês/trimestre em vez de dias corridos). */
export function rotuloPeriodo<P extends string = PeriodoPreset>(
  periodo: P,
  datas?: IntervaloDatas,
  presets?: { value: P; label: string }[],
): string {
  if (datas) {
    const { from, to } = datas
    if (!to || isSameDay(from, to)) return format(from, "d 'de' MMM", { locale: ptBR })
    return `${format(from, 'd MMM', { locale: ptBR })} – ${format(to, 'd MMM', { locale: ptBR })}`
  }
  const lista = presets ?? (PERIODOS as unknown as { value: P; label: string }[])
  return lista.find((p) => p.value === periodo)?.label ?? 'Período'
}

interface FiltroPeriodoProps<P extends string = PeriodoPreset> {
  periodo: P
  datas?: IntervaloDatas
  onPeriodo: (p: P) => void
  onDatas: (d: IntervaloDatas | undefined) => void
  className?: string
  /** Troca os 4 atalhos padrão (7/30/90 dias + todo o período) por outro
   *  conjunto — o Ranking usa semana/mês/trimestre pra combinar com os
   *  mesmos períodos que as regras de bonificação já usam, em vez de dias
   *  corridos sem relação com nada. */
  presets?: { value: P; label: string }[]
}

/**
 * Filtro de período — atalhos de 7/30/90 dias e "todo o período" à esquerda,
 * calendário de intervalo à direita, e os dois campos digitáveis embaixo.
 *
 * Nasceu inteiro dentro de /feedbacks. Virou componente quando /acoes
 * /arquivadas precisou do mesmo filtro: duas cópias do mesmo controle passam a
 * divergir na primeira correção que alguém fizer só de um lado, e o dono
 * aprende o filtro uma vez e espera encontrá-lo igual.
 *
 * ## As três formas de escolher
 *
 * Elas existem porque as perguntas são diferentes. "O que chegou esta semana"
 * é um atalho. "O que houve no feriado" é um arrastar no calendário. "De 12/03
 * a 30/04" é digitar — e sem os campos digitáveis, chegar a uma data de meses
 * atrás custa uma dezena de cliques na seta do mês.
 *
 * Atalho e intervalo se excluem: escolher um atalho limpa as datas, e mexer no
 * calendário tira o destaque do atalho. Deixar os dois ativos daria dois
 * recortes contraditórios sem dizer qual vale.
 */
export function FiltroPeriodo<P extends string = PeriodoPreset>({
  periodo,
  datas,
  onPeriodo,
  onDatas,
  className,
  presets,
}: FiltroPeriodoProps<P>) {
  const [aberto, setAberto] = useState(false)
  const lista = presets ?? (PERIODOS as unknown as { value: P; label: string }[])

  const escolherPreset = (p: P) => {
    onPeriodo(p)
    onDatas(undefined)
    setAberto(false)
  }

  const escolherIntervalo = (range: DateRange | undefined) => {
    onDatas(range?.from ? { from: range.from, to: range.to } : undefined)
  }

  // Digitar só o fim antes do início, ou um fim anterior ao início, são erros
  // comuns de teclado. Em vez de recusar, o intervalo se acomoda: a data que
  // ficaria invertida vira a outra ponta.
  const definirInicio = (data: Date | undefined) => {
    if (!data) return
    onDatas({ from: data, to: datas?.to && datas.to < data ? data : datas?.to })
  }
  const definirFim = (data: Date | undefined) => {
    if (!data) return
    const from = datas?.from ?? data
    onDatas({ from: from > data ? data : from, to: data })
  }

  const limpar = () => onDatas(undefined)

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 shrink-0 justify-start border-gray-200 bg-white font-normal shadow-sm',
            className,
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
          {rotuloPeriodo(periodo, datas, lista)}
          {/* Limpar sem abrir o popover: um X dentro do próprio botão. Não é um
              <button> aninhado — botão dentro de botão é HTML inválido e o
              clique do interno não chega. */}
          {datas && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar intervalo"
              onClick={(e) => {
                e.stopPropagation()
                limpar()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  limpar()
                }
              }}
              className="ml-2 -mr-1 rounded-sm p-0.5 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col">
          <div className="flex flex-col sm:flex-row">
            <div className="flex gap-0.5 border-b p-2 sm:flex-col sm:border-b-0 sm:border-r">
              {lista.map((p) => (
                <button
                  key={p.value}
                  onClick={() => escolherPreset(p.value)}
                  className={cn(
                    'whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100',
                    !datas && periodo === p.value
                      ? 'bg-[#EFF6FF] font-medium text-[#1D4ED8]'
                      : 'text-gray-700',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div>
              <Calendar
                mode="range"
                selected={datas as DateRange | undefined}
                onSelect={escolherIntervalo}
                locale={ptBR}
                disabled={{ after: new Date() }}
                endMonth={new Date()}
              />
            </div>
          </div>

          {/* Fileira só do tamanho do conteúdo — o campo "De" acaba caindo
              do lado esquerdo (embaixo dos atalhos) e o "até" do lado
              direito (embaixo do calendário), sem precisar de duas colunas. */}
          <div className="space-y-2 border-t p-3">
            <p className="text-xs font-medium text-muted-foreground">Datas selecionadas</p>
            <div className="flex w-fit items-center gap-2">
              <DataSegmentada value={datas?.from} onChange={definirInicio} maxDate={new Date()} />
              <span className="shrink-0 text-xs text-muted-foreground">até</span>
              <DataSegmentada value={datas?.to} onChange={definirFim} maxDate={new Date()} />
            </div>
            {datas && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={limpar}>
                  Limpar
                </Button>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
