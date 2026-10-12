import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  avisoDoDiaDoMes, DIA_COMECO_DO_MES, DIA_ESPECIFICO_SUGERIDO, diaDoMesDe, DIAS_ESPECIFICOS, formatarAteQuando, FREQUENCIAS, MENSAL,
  PERGUNTA_MAX, PERGUNTA_MIN, resumoDaFrequencia, ROTULO_FREQUENCIA, type Frequencia,
} from '@/lib/equipe'
import { acaoEquipe, type PedidoAutomaticoConfig } from '@/lib/queries/equipe'
import { Cartao, Rotulo } from './pecas'

/* Pedido automático: o sistema pede feedback sozinho, de tempos em tempos, para
   toda a equipe que pode receber. Quem guarda e dispara é a função equipe
   (ações "auto_ler" e "auto_salvar"); a rotina do minuto cria o pedido quando
   a data chega. O mensal sai num dia do mês: no começo (dia 1) ou no dia que
   o dono escolher. */
export function PedidoAutomatico({ onMudou }: { onMudou?: () => void }) {
  const [salvo, setSalvo] = useState<PedidoAutomaticoConfig | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [cada, setCada] = useState<Frequencia>(MENSAL)
  const [dia, setDia] = useState(DIA_COMECO_DO_MES)
  // A função equipe publicada sabe o dia do mês? Enquanto a versão antiga
  // estiver no ar (ela conta 30 dias e ignora o dia), a tela não oferece a
  // escolha: não promete uma data que o servidor não vai cumprir.
  const [servidorSabeODia, setServidorSabeODia] = useState(false)
  const [pergunta, setPergunta] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const aplicar = (c: PedidoAutomaticoConfig) => {
    setSalvo(c)
    setAtivo(c.ativo)
    setCada(c.cada_dias)
    setDia(diaDoMesDe(c.dia_do_mes))
    setServidorSabeODia(typeof c.dia_do_mes === 'number')
    setPergunta(c.pergunta)
  }

  useEffect(() => {
    acaoEquipe<PedidoAutomaticoConfig>('auto_ler').then((r) => {
      if (!r.ok || typeof r.pergunta !== 'string') return setErro(r.error || 'Não foi possível ler o pedido automático.')
      aplicar(r as PedidoAutomaticoConfig)
    })
  }, [])

  const mensal = cada === MENSAL && servidorSabeODia
  const noComeco = dia === DIA_COMECO_DO_MES
  const avisoDoDia = mensal ? avisoDoDiaDoMes(dia) : null

  const limpa = pergunta.trim()
  const perguntaOk = limpa.length >= PERGUNTA_MIN && limpa.length <= PERGUNTA_MAX
  const mudou = !!salvo && (ativo !== salvo.ativo || cada !== salvo.cada_dias || limpa !== salvo.pergunta.trim()
    || (mensal && dia !== diaDoMesDe(salvo.dia_do_mes)))

  const salvar = async () => {
    if (!perguntaOk) return
    setSalvando(true)
    setErro(null)
    const r = await acaoEquipe<PedidoAutomaticoConfig>('auto_salvar', { ativo, cada_dias: cada, dia_do_mes: mensal ? dia : null, pergunta: limpa })
    setSalvando(false)
    if (!r.ok || typeof r.pergunta !== 'string') return setErro(r.error || 'Não foi possível salvar.')
    aplicar(r as PedidoAutomaticoConfig)
    toast.success(r.ativo && r.proximo_em ? `Pedido automático ligado. O próximo sai em ${formatarAteQuando(r.proximo_em)}.` : 'Pedido automático desligado.')
    onMudou?.()
  }

  return (
    <Cartao className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1D4ED8]"><CalendarClock className="h-4.5 w-4.5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Pedir sozinho</p>
            <p className="mt-0.5 text-sm text-gray-500">O sistema pede feedback para a equipe toda de tempos em tempos, sem você precisar clicar.</p>
          </div>
        </div>
        {salvo
          ? <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Ligar o pedido automático" />
          : !erro && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {salvo && ativo && (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <Rotulo>Frequência</Rotulo>
            <Select value={String(cada)} onValueChange={(v) => setCada(Number(v) as Frequencia)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIAS.map((f) => <SelectItem key={f} value={String(f)}>{ROTULO_FREQUENCIA[f]}</SelectItem>)}
              </SelectContent>
            </Select>
            {mensal && (
              <>
                <Rotulo className="mt-4">Em que dia</Rotulo>
                <Select value={noComeco ? 'comeco' : 'dia'} onValueChange={(v) => setDia(v === 'comeco' ? DIA_COMECO_DO_MES : noComeco ? DIA_ESPECIFICO_SUGERIDO : dia)}>
                  <SelectTrigger className="mt-1.5" aria-label="Em que dia do mês o pedido sai"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comeco">No começo do mês</SelectItem>
                    <SelectItem value="dia">Em um dia específico</SelectItem>
                  </SelectContent>
                </Select>
                {!noComeco && (
                  <Select value={String(dia)} onValueChange={(v) => setDia(Number(v))}>
                    <SelectTrigger className="mt-2" aria-label="Dia do mês"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {DIAS_ESPECIFICOS.map((d) => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {avisoDoDia && <p className="mt-1.5 text-xs text-gray-500">{avisoDoDia}</p>}
              </>
            )}
          </div>
          <div>
            <Rotulo>A pergunta</Rotulo>
            <Textarea value={pergunta} onChange={(e) => setPergunta(e.target.value)} rows={2} maxLength={PERGUNTA_MAX} className="mt-1.5" />
            {!perguntaOk && <p className="mt-1 text-xs text-rose-600">Escreva a pergunta (de {PERGUNTA_MIN} a {PERGUNTA_MAX} letras).</p>}
          </div>
        </div>
      )}

      {salvo?.ativo && salvo.ultimo_erro && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>O último pedido automático não saiu: {salvo.ultimo_erro}</span>
        </p>
      )}

      {erro && <p className="text-sm text-rose-600">{erro}</p>}

      {salvo && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {salvo.ativo && salvo.proximo_em
              ? `${servidorSabeODia ? resumoDaFrequencia(salvo.cada_dias, salvo.dia_do_mes) : ROTULO_FREQUENCIA[salvo.cada_dias]}. Próximo pedido: ${formatarAteQuando(salvo.proximo_em)}. Sai de manhã, nunca no domingo.`
              : 'Desligado: você pede quando quiser, no botão "Pedir feedback".'}
          </p>
          {mudou && (
            <Button size="sm" onClick={salvar} disabled={salvando || (ativo && !perguntaOk)} className="bg-[#1D4ED8] hover:bg-[#1E40AF]">
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Salvar
            </Button>
          )}
        </div>
      )}
    </Cartao>
  )
}
